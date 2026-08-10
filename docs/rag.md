# RAG in this codebase

A walkthrough of the retrieval pipeline: what each piece does, why it is built
that way, and where the interesting trade-offs are.

## The problem

A language model knows what was in its training data. It does not know what is
in your contract, your runbook, or the spec you wrote last week. There are three
ways to fix that, and only one of them scales:

| Approach | Cost | When it works |
|---|---|---|
| Fine-tuning | Retraining per update | Teaching *style* or *format*, not facts |
| Whole document in the prompt | Every token, every turn | One small document |
| **Retrieval** | Only the passages that matter | Anything larger |

Retrieval-Augmented Generation is the third: find the few passages likely to
answer the question, put those in the prompt, and let the model write the answer
from them. "Augmented" means the model's own weights are unchanged — the
knowledge arrives as context, at request time.

## Where the code lives

The pipeline is split across two services, along the line where the tooling
stops being comparable:

```
Next.js (TypeScript)                    services/rag (Python, FastAPI)
─────────────────────                   ─────────────────────────────
better-auth sessions                    PDF / DOCX extraction  (PyMuPDF)
AI SDK stream + tool protocol           chunking               (tiktoken)
Drizzle schema + migrations             embeddings
document CRUD                           hybrid search + RRF
search_documents tool                   cross-encoder reranking
        │                                        │
        └────── POST /search, /ingest ───────────┘
                x-service-token
        └────────── shared Postgres ─────────────┘
           Drizzle owns DDL │ Python writes rows only
```

Everything that touches a vector is Python. Everything that touches a user
session or the chat stream is TypeScript. The seam is the `DocumentStore` port
in `src/lib/tools/documents.ts` — the tool, the prompt, and the UI never learned
that retrieval moved out of process.

No cookies cross the boundary. Next.js authenticates the person, then vouches
for them by passing a `user_id` it has already verified; the service token
proves the caller *is* the app, never which user it is acting for, so every
query filters on `user_id` too.

## The pipeline

```
Upload ─→ extract ─→ chunk ─→ embed ─→ store        (ingestion, once per document)
                                          ↓
Question ─→ embed ─→ search ─→ fuse ─→ rerank ─→ prompt ─→ answer   (per question)
```

Ingestion and retrieval must agree on the embedding model. Two models produce
coordinates in unrelated spaces, and the distances between them are meaningless
numbers rather than errors — this fails as bad search results, never as an
exception.

## 1. Extraction — `services/rag/app/extract.py`

Where a RAG pipeline quietly loses. A PDF parsed without regard for layout
yields interleaved column text, and no amount of chunking or reranking recovers
meaning that was scrambled before it was stored. PyMuPDF's block mode with
`sort=True` preserves reading order; each page becomes a `## Page N` heading, so
citations can point at a page.

DOCX gets a smaller version of the same idea: Word's built-in heading styles map
onto Markdown headings, which the chunker then uses as split points. Structure
the author already applied is structure retrieval gets for free.

## 2. Chunking — `services/rag/app/chunk.py`

A chunk is one unit of retrieval: it gets one vector, and it is what lands in
the prompt. Chunking sets the ceiling on everything downstream, and it happens
before any model is involved.

The failure mode in each direction:

- **Too large** — one vector for three unrelated topics is the *average* of
  them. It is close to nothing, so it is retrieved for nothing.
- **Too small** — high similarity, but the passage arrives without the context
  needed to answer.

Splitting is recursive on the strongest boundary available: headings, then
paragraphs, then sentences, hard-cutting only as a last resort. Prose an author
already organised carries its own best split points.

Sizes are measured in **real tokens** via tiktoken. The TypeScript version
approximated four characters per token, which is fine for English prose and
wrong everywhere else — code, CJK, and long identifiers tokenize far denser, so
a "1,200 character" chunk of TypeScript could be double the intended budget.
There is a test for exactly this (`test_token_sizing_is_denser_for_code_than_prose`).

Two details worth stealing:

**Heading trails.** A chunk under `## Refunds` is stored with
`heading = "Billing > Refunds"`, and `embeddable_text()` prepends it before
embedding. "This is capped at 30 days" is meaningless alone and unambiguous
under its heading. The embedded string and the stored string are deliberately
different — conflating them either pollutes the displayed answer with
breadcrumbs or throws the context away.

**Overlap.** The last ~45 tokens of each chunk are repeated at the start of the
next, because the sentence that answers the question is often the one
straddling a boundary.

## 3. Embedding — `services/rag/app/embed.py`

An embedding model maps text to a fixed-length array of floats, arranged so that
similar meaning lands nearby. That is the whole trick: "how do I get my money
back" and a paragraph headed "Refund policy" share almost no words, so keyword
scoring rates them zero — but their vectors are close.

Three constraints the code enforces:

- **Dimensions are schema, not config.** The column is `vector(1536)`. A model
  with a different output width means a Drizzle migration *and* re-embedding
  every stored chunk. `embedding_dimensions` exists to fail loudly on mismatch.
- **Batching, sequentially.** 96 inputs per request, batches one after another.
  Concurrent batches are the fastest way to a 429 storm, which costs more
  wall-clock than the parallelism saves.
- **Order is verified, not assumed.** Results are re-sorted by the `index` the
  API returns. Pairing a chunk with a neighbour's vector is invisible until
  search results stop making sense.

## 4. Storage — `src/lib/db/schema.ts`, migration `0003`

```sql
CREATE EXTENSION IF NOT EXISTS vector;
embedding vector(1536) NOT NULL
CREATE INDEX ... USING hnsw ("embedding" vector_cosine_ops);
```

`drizzle-kit` does not emit the `CREATE EXTENSION` line — it was added to the
migration by hand, and without it every statement after it fails.

The HNSW index is what makes this a vector *database* rather than a table of
floats. Without it, each search is a sequential scan computing distance to every
row. With it, Postgres walks a navigable small-world graph and touches a
fraction of them. It is an **approximate** index: a small chance of missing a
true nearest neighbour, for orders of magnitude less work.

The operator class has to match the query. This index is built for cosine
distance (`vector_cosine_ops` / `<=>`); a search written with `<->` would
silently ignore it and scan. Ordering by anything other than the bare operator
expression does the same.

The extracted text is stored on the document row alongside the chunks.
Re-chunking and re-embedding are routine — a better chunk size, a better model —
and this makes a re-index one request instead of a re-upload and another PDF
parse.

## 5. Retrieval — `services/rag/app/retrieval.py`

### Hybrid search

Vector search alone is weakest exactly where being wrong is most obvious.
`ERR_4021` carries almost no semantic weight, so the chunk containing it does
not stand out from its neighbours — while Postgres full-text search matches it
exactly. Conversely, keyword search misses every paraphrase. Both run, over the
same chunks:

- **Vector**: `ORDER BY embedding <=> $query` — nearest neighbours by meaning.
- **Keyword**: `websearch_to_tsquery` + `ts_rank_cd`. That parser accepts what
  people actually type (bare words, `"quoted phrases"`, `or`, leading `-`) and
  never throws on malformed input, unlike `to_tsquery`. `ts_rank_cd` is
  cover-density ranking: it rewards passages where query terms appear close
  together.

Keyword search is wrapped so a failure degrades to vector-only results rather
than failing the search.

### Fusing with RRF

`fuse_by_rank()` combines the two lists by Reciprocal Rank Fusion:

```
score(chunk) = Σ  1 / (60 + rank_in_that_list)
```

The key property: it uses **ranks, never raw scores**. Cosine similarity (0–1,
clustered around 0.7–0.9 for real text) and `ts_rank_cd` (unbounded,
corpus-dependent) are not comparable scales, and normalising them requires
constants that need retuning whenever the corpus changes. Ranks are always
comparable. `K = 60` comes from the original paper; it damps the gap between top
positions so one retriever's confident first place cannot dominate the other's
entire list.

### Reranking — `services/rag/app/rerank.py`

Everything above compares *pre-computed* vectors: the chunk was embedded weeks
ago without knowing the question, the question is embedded without knowing the
chunk, and the score is the angle between them. That is what makes it fast
enough to search millions of rows, and also what caps its accuracy — the model
never sees the two texts together.

A cross-encoder does the opposite: it scores `(query, chunk)` as one input, so
it can judge whether the passage answers *this* question rather than whether it
is broadly on-topic. Far more accurate, far too slow to run over a corpus — one
model pass per candidate. Hence the standard shape, and the one here: retrieve
30 per retriever, fuse, rerank, keep 6.

Two guards: the model loads lazily and exactly once behind a lock (hundreds of
MB, seconds to initialise — not something to do inside a request), and every
failure path falls back to fusion order. Reranking makes good results better; it
is not load-bearing.

## 6. Generation — `src/lib/tools/documents.ts`

Retrieval is a **tool call**, not an automatic prefix on every request.

The automatic approach — embed the user's message, staple the top chunks onto
the system prompt, every turn — is simpler, but it pays an embedding round trip
on "thanks, that worked" and floods the context with passages unrelated to the
question. As a tool, it costs one extra step when retrieval is needed and
nothing when it is not, and the model can rewrite a vague question into a better
query before searching.

Two design decisions in the tool:

**Empty results are a success, not an error.** A `ToolError` invites the model to
retry with different arguments. "The corpus does not cover this" *is* the
answer, and the model should say so rather than fill the gap from its weights.

**Citations need visible labels.** `formatPassages()` numbers each passage
`[1]`, `[2]` in the text the model reads. Ask for citations without them and the
model still cites — it just invents the numbers.

The system prompt gets document **titles only** (`documentsSection()` in
`src/lib/prompts.ts`), the same progressive disclosure as skills. Titles are
enough to decide whether to search, and they teach the model the user's own
vocabulary to search with.

## Running it

1. **Postgres with pgvector.** Managed providers (Neon, Supabase, RDS) already
   have it. Locally: `brew install pgvector`, or the `pgvector/pgvector:pg17`
   image.
2. **Migrate** from the repo root: `bun run db:migrate`.
3. **Start the service** — see `services/rag/README.md`. It needs
   `DATABASE_URL` (the same database), `SERVICE_TOKEN`, and embeddings config.
4. **Point the app at it**: `RAG_SERVICE_URL` and a matching
   `RAG_SERVICE_TOKEN` in `.env.local`.
5. **Upload** at `/documents`, then ask a question in a chat. The
   `search_documents` chip shows which passages came back and whether each was
   found by vector, keyword, or both.

## What is deliberately not here

- **Query rewriting** — expanding one question into several searches. The model
  approximates this already by choosing its own query text.
- **MMR / diversity** — penalising candidates near-identical to ones already
  selected, so six chunks are not six paraphrases of one paragraph.
- **Sentence-window retrieval** — embed small, return the surrounding window.
  Overlap is the cheap approximation of it.
- **A real job queue.** Ingestion is synchronous inside the request. FastAPI has
  no serverless freeze, so long PDFs now work — but a 500-page upload still
  holds a connection, and arq or Celery is the honest fix.
