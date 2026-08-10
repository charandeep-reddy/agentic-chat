# RAG service

Ingestion and retrieval for Agentic Chat. FastAPI, sharing the app's Postgres.

## What lives here, and why

The Next.js app kept everything that would have cost more to move than it was
worth — better-auth sessions, the AI SDK stream protocol, the Drizzle schema.
This service took the parts where Python is straightforwardly better:

| Capability | Why not in Node |
|---|---|
| PDF / DOCX extraction | PyMuPDF and python-docx have no real JS equivalent |
| Token-accurate chunking | tiktoken counts real tokens; the TS version approximated 4 chars each |
| Cross-encoder reranking | sentence-transformers; the biggest accuracy win available |
| Long-running ingestion | No serverless freeze after the response returns |

## Boundary

```
Next.js  ──POST /ingest, /ingest/file, /search──▶  this service
   │            x-service-token                        │
   └────────────────── Postgres ◀─────────────────────┘
        Drizzle owns migrations      rows only, never DDL
```

No user cookies cross the boundary. Next.js authenticates the person with
better-auth, then vouches for them by passing a `user_id` it has already
verified. The service token proves the *caller* is the app — never which user
the request is for — so every query filters on `user_id` as well.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness, plus the embedding and rerank config in effect |
| `POST` | `/search` | Hybrid retrieval: vector + keyword, RRF fusion, optional rerank |
| `POST` | `/ingest` | Index text already on the document row (pasted text, re-index) |
| `POST` | `/ingest/file` | Multipart upload: PDF, DOCX, or anything decodable as text |

## Running it

```bash
cd services/rag
cp .env.example .env          # set SERVICE_TOKEN and your embeddings key
uv venv && uv pip install -e ".[dev,extract]"
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Then in the app's `.env.local`:

```bash
RAG_SERVICE_URL="http://localhost:8000"
RAG_SERVICE_TOKEN="…the same value as SERVICE_TOKEN…"
```

Migrations still run from the repo root — `bun run db:migrate`. This service
never creates or alters a table.

### Extras

- `[extract]` — PyMuPDF + python-docx. Needed for PDF and DOCX uploads.
- `[rerank]` — sentence-transformers, and therefore torch (~2 GB). Only needed
  when `RERANK_MODEL` is set.
- `[dev]` — pytest.

Everything degrades rather than failing: without `extract`, binary uploads
return a clear error and text still ingests; without `rerank` (or with a model
that fails to load), search returns results in fusion order.

## Tests

```bash
.venv/bin/python -m pytest
```

Covers chunking boundaries, heading trails, token sizing, overlap, cosine
similarity, and RRF fusion — all the pure logic, no database needed.
