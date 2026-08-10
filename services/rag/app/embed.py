"""Turning text into vectors.

An embedding model maps a string to a fixed-length array of floats chosen so
that texts with similar meaning land close together. That is the whole trick
behind semantic retrieval: "how do I get my money back" and a paragraph titled
"Refund policy" share almost no words, but their vectors sit close.

Two properties matter downstream and are easy to get wrong:

1. The query and the documents must be embedded by the same model. Two models
   produce coordinates in unrelated spaces; distances between them are
   meaningless numbers rather than errors, so this fails silently as bad search
   results rather than loudly as an exception.
2. The dimension count is fixed in the database schema — the column is
   `vector(1536)`. Switching to a model with a different output size is a
   migration plus a re-embed of every stored chunk, not a config change.
   `embedding_dimensions` exists to check that, not to reconfigure it.
"""

from __future__ import annotations

import asyncio

import httpx

from .config import settings

# Inputs per HTTP request. Providers accept far more (OpenAI allows 2,048), but
# a batch is all-or-nothing: one oversized request that trips a payload or token
# limit fails every chunk in it. 96 keeps a retry cheap.
BATCH_SIZE = 96
TIMEOUT_SECONDS = 30.0
MAX_ATTEMPTS = 3


class EmbeddingError(Exception):
    """Raised when the embeddings provider cannot be used."""


def _resolve_key(caller_key: str | None) -> str:
    """A server-side key wins; the caller's key is the fallback.

    The Next.js app is bring-your-own-key, so most requests arrive carrying the
    user's own key. Background work — re-indexing, say — has no request to read
    a header from, which is what the configured key is for.
    """
    key = (settings().embeddings_api_key or "").strip() or (caller_key or "").strip()
    if not key:
        raise EmbeddingError(
            "No embeddings API key. Set EMBEDDINGS_API_KEY on the service, "
            "or pass the user's model key with the request."
        )
    return key


async def _backoff(attempt: int, retry_after: str | None) -> None:
    delay = 0.5 * (2 ** (attempt - 1))
    if retry_after:
        try:
            hinted = float(retry_after)
            if hinted > 0:
                delay = hinted
        except ValueError:
            pass
    await asyncio.sleep(min(delay, 8.0))


async def _embed_batch(
    client: httpx.AsyncClient, texts: list[str], api_key: str
) -> list[list[float]]:
    config = settings()
    url = f"{config.embeddings_base_url.rstrip('/')}/embeddings"

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            response = await client.post(
                url,
                headers={"authorization": f"Bearer {api_key}"},
                json={"model": config.embeddings_model, "input": texts},
                timeout=TIMEOUT_SECONDS,
            )
        except httpx.HTTPError as error:
            # A timeout or socket error is worth retrying; a bad request is not,
            # which is why this only covers the transport.
            if attempt >= MAX_ATTEMPTS:
                raise EmbeddingError(f"Embeddings request failed: {error}") from error
            await _backoff(attempt, None)
            continue

        # 429 and 5xx are the provider asking to be called again later.
        # Everything else (401, 400, unknown model) fails identically on retry.
        if (
            response.status_code == 429 or response.status_code >= 500
        ) and attempt < MAX_ATTEMPTS:
            await _backoff(attempt, response.headers.get("retry-after"))
            continue

        if response.status_code >= 400:
            detail = ""
            try:
                detail = response.json().get("error", {}).get("message", "")
            except Exception:
                detail = response.text[:200]
            raise EmbeddingError(
                f"Embeddings request failed ({response.status_code}): {detail}"
            )

        rows = response.json().get("data") or []
        if len(rows) != len(texts):
            raise EmbeddingError(
                f"Provider returned {len(rows)} vectors for {len(texts)} inputs."
            )

        # The API is documented to return results in input order, but it also
        # carries an explicit index. Sorting by it costs nothing and removes the
        # chance of silently pairing a chunk with another chunk's vector, which
        # stays invisible until search results stop making sense.
        vectors: list[list[float]] = []
        for row in sorted(rows, key=lambda r: r.get("index", 0)):
            vector = row.get("embedding")
            if not vector:
                raise EmbeddingError("Provider returned an empty vector.")
            if len(vector) != config.embedding_dimensions:
                raise EmbeddingError(
                    f"Model '{config.embeddings_model}' returns {len(vector)}-dimension "
                    f"vectors but the database column is "
                    f"vector({config.embedding_dimensions}). Change EMBEDDINGS_MODEL, "
                    f"or migrate the column and re-embed every stored chunk."
                )
            vectors.append(vector)
        return vectors

    raise EmbeddingError("Embeddings request failed after retries.")


async def embed_texts(
    texts: list[str], api_key: str | None = None
) -> list[list[float]]:
    """Embed many texts, in input order.

    Batches run sequentially rather than concurrently: embedding a large
    document is the easiest way to hit a provider's rate limit, and a 429 storm
    costs more wall-clock time than the parallel requests save.
    """
    if not texts:
        return []
    key = _resolve_key(api_key)

    vectors: list[list[float]] = []
    async with httpx.AsyncClient() as client:
        for start in range(0, len(texts), BATCH_SIZE):
            batch = texts[start : start + BATCH_SIZE]
            vectors.extend(await _embed_batch(client, batch, key))
    return vectors


async def embed_query(query: str, api_key: str | None = None) -> list[float]:
    """Embed a search query.

    Separate from `embed_texts` because asymmetric models (Voyage, E5, BGE)
    score noticeably better when queries and documents are prefixed
    differently, and this is the one place that would change to adopt one.
    """
    vectors = await embed_texts([query], api_key)
    return vectors[0]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity, in Python.

    Postgres does this for real search with the `<=>` operator. Keeping it here
    makes the maths concrete and testable without a database: the cosine of the
    angle between two vectors, 1 when they point the same way, 0 when unrelated.
    Magnitude divides out, so a long chunk is not scored higher for being long.
    """
    if len(a) != len(b):
        raise EmbeddingError(
            f"Cannot compare a {len(a)}-d vector with a {len(b)}-d one."
        )
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    denominator = norm_a * norm_b
    return dot / denominator if denominator else 0.0
