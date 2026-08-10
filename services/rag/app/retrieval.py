"""Hybrid retrieval: vector search, keyword search, rank fusion, reranking.

Vector search alone is weakest exactly where being wrong is most obvious.
`ERR_4021` carries almost no semantic weight, so the chunk containing it does
not stand out from its neighbours — while Postgres full-text search matches it
exactly. Keyword search, in turn, misses every paraphrase. Each covers the
other's blind spot, which is why production systems rarely ship either alone.
"""

from __future__ import annotations

import asyncio
import logging

from .config import settings
from .db import connection
from .embed import embed_query
from .rerank import rerank

logger = logging.getLogger(__name__)

# Reciprocal Rank Fusion constant. Scores each result as 1 / (K + rank) and sums
# across retrievers.
#
# RRF combines *ranks*, never raw scores, which is the entire point: cosine
# similarity (0–1, clustered near 0.7–0.9 for real text) and ts_rank_cd
# (unbounded, corpus-dependent) are not comparable scales, and normalising them
# against each other needs constants that require retuning whenever the corpus
# changes. Ranks are always comparable. K = 60 is the value from the original
# paper; it damps the difference between the top few positions so one
# retriever's confident first place cannot dominate the other's whole list.
RRF_K = 60

_SELECT = """
    select
        c.id           as chunk_id,
        c.document_id  as document_id,
        d.title        as document_title,
        d.source       as source,
        c.heading      as heading,
        c.content      as content,
        c.ordinal      as ordinal
    from document_chunk c
    join document d on d.id = c.document_id
"""


async def _vector_candidates(user_id: str, query_vector: list[float], limit: int):
    """Nearest neighbours by cosine distance.

    `<=>` returns *distance*, so smaller is closer and the ordering is
    ascending. The HNSW index is only used when the ORDER BY is exactly this
    operator against the indexed column — wrapping it in arithmetic first
    silently downgrades the query to a sequential scan.
    """
    async with connection() as conn:
        return await conn.fetch(
            f"""
            {_SELECT}
            where c.user_id = $1 and d.enabled = true
            order by c.embedding <=> $2
            limit $3
            """,
            user_id,
            query_vector,
            limit,
        )


async def _keyword_candidates(user_id: str, query: str, limit: int):
    """Postgres full-text search over the same chunks.

    `websearch_to_tsquery` is the parser that accepts what people actually type
    — bare words, "quoted phrases", `or`, leading `-` to exclude — and never
    throws on malformed input, unlike `to_tsquery`. `ts_rank_cd` is
    cover-density ranking: it rewards passages where the query terms appear
    close together, which for chunk-sized text beats raw term frequency.
    """
    async with connection() as conn:
        return await conn.fetch(
            f"""
            {_SELECT}
            where c.user_id = $1
              and d.enabled = true
              and to_tsvector('english', c.content)
                  @@ websearch_to_tsquery('english', $2)
            order by ts_rank_cd(
                to_tsvector('english', c.content),
                websearch_to_tsquery('english', $2)
            ) desc
            limit $3
            """,
            user_id,
            query,
            limit,
        )


def fuse_by_rank(lists: list[tuple[str, list]], limit: int) -> list[dict]:
    """Fuse ranked lists by Reciprocal Rank Fusion.

    Pure, and separate from the queries so the ranking logic is testable without
    a database — fusion is where retrieval quality is won or lost.
    """
    scores: dict[str, dict] = {}

    for retriever, rows in lists:
        for index, row in enumerate(rows):
            contribution = 1 / (RRF_K + index + 1)
            existing = scores.get(row["chunk_id"])
            if existing:
                existing["score"] += contribution
                existing["matched_by"].add(retriever)
            else:
                scores[row["chunk_id"]] = {
                    "chunk_id": row["chunk_id"],
                    "document_id": row["document_id"],
                    "document_title": row["document_title"],
                    "source": row["source"],
                    "heading": row["heading"],
                    "content": row["content"],
                    "ordinal": row["ordinal"],
                    "score": contribution,
                    "matched_by": {retriever},
                }

    ranked = sorted(scores.values(), key=lambda r: r["score"], reverse=True)
    return [
        {**row, "matched_by": sorted(row["matched_by"])} for row in ranked[:limit]
    ]


async def search(
    user_id: str,
    query: str,
    limit: int = 6,
    api_key: str | None = None,
) -> dict:
    """Retrieve the passages most likely to answer a query."""
    query = query.strip()
    if not query:
        return {"passages": [], "reranked": False}

    config = settings()
    candidates = config.candidates_per_retriever

    async def vector_leg():
        vector = await embed_query(query, api_key)
        return await _vector_candidates(user_id, vector, candidates)

    async def keyword_leg():
        # Keyword search is the cheap half and must not take the request down
        # with it: a query that upsets the parser should degrade to
        # vector-only results, not fail the search.
        try:
            return await _keyword_candidates(user_id, query, candidates)
        except Exception:
            logger.exception("Keyword search failed; continuing vector-only")
            return []

    # Independent, and the embedding round trip dominates — running them
    # concurrently hides the keyword query underneath it entirely.
    vectors, keywords = await asyncio.gather(vector_leg(), keyword_leg())

    # Fusion keeps more than the caller asked for so the reranker has something
    # to reorder. Without the wider window, reranking can only shuffle the
    # results retrieval already ranked highest, which is most of its value gone.
    fused = fuse_by_rank(
        [("vector", vectors), ("keyword", keywords)],
        limit * 4 if settings().rerank_model else limit,
    )

    passages, reranked = await rerank(query, fused, limit)
    return {"passages": passages, "reranked": reranked}
