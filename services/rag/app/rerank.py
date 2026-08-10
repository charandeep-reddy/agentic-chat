"""Cross-encoder reranking — the accuracy upgrade the split was for.

Retrieval so far compares *pre-computed* vectors: the chunk was embedded weeks
ago without knowing the question, the question is embedded without knowing the
chunk, and the score is the angle between them. That is what makes it fast
enough to search millions of rows, and also what caps its accuracy — the model
never sees the two texts together.

A cross-encoder does the opposite. It takes `(query, chunk)` as one input and
scores the pair jointly, so it can judge whether the passage actually answers
*this* question rather than whether it is broadly on-topic. Far more accurate,
and far too slow to run over a corpus: cost is one model pass per candidate,
which is why it reranks 30 rows instead of searching 30,000.

The usual shape, and the one here: retrieve broadly, rerank, keep the best few.

Two guards worth noting:

- The model is loaded lazily and once. It is hundreds of MB and several seconds
  to initialise; doing that inside a request would put the latency on whichever
  user happened to arrive first after a deploy.
- Everything degrades to fusion order. No model configured, extra not
  installed, model fails to load — retrieval still returns results, just
  ordered by RRF. Reranking makes good results better; it is not load-bearing.
"""

from __future__ import annotations

import asyncio
import logging

from .config import settings

logger = logging.getLogger(__name__)

_model = None
_load_failed = False
# Loading is not thread-safe and several requests can arrive at once on a cold
# start; without this they would each build their own copy of the model.
_load_lock = asyncio.Lock()


def is_enabled() -> bool:
    return bool(settings().rerank_model) and not _load_failed


async def _get_model():
    global _model, _load_failed

    if _model is not None or _load_failed:
        return _model

    async with _load_lock:
        if _model is not None or _load_failed:
            return _model
        try:
            from sentence_transformers import CrossEncoder
        except ImportError:
            logger.warning(
                "rerank_model is set but sentence-transformers is not installed; "
                "install the 'rerank' extra. Falling back to fusion order."
            )
            _load_failed = True
            return None

        name = settings().rerank_model
        try:
            # Loading is CPU-bound and blocking, so it goes to a thread rather
            # than stalling the event loop for every other in-flight request.
            _model = await asyncio.to_thread(CrossEncoder, name)
            logger.info("Loaded reranker %s", name)
        except Exception:
            logger.exception("Could not load reranker %s", name)
            _load_failed = True
    return _model


async def rerank(
    query: str, passages: list[dict], limit: int
) -> tuple[list[dict], bool]:
    """Reorder passages by cross-encoder relevance.

    Returns the passages and whether reranking actually ran, so the caller can
    tell the difference between "reranked" and "fusion order" instead of
    guessing from the results.
    """
    if not passages or not settings().rerank_model:
        return passages[:limit], False

    model = await _get_model()
    if model is None:
        return passages[:limit], False

    pairs = [(query, p["content"]) for p in passages]
    try:
        scores = await asyncio.to_thread(model.predict, pairs)
    except Exception:
        logger.exception("Reranking failed; falling back to fusion order")
        return passages[:limit], False

    ranked = sorted(
        zip(passages, scores), key=lambda pair: float(pair[1]), reverse=True
    )
    out = []
    for passage, score in ranked[:limit]:
        # The fused score is kept alongside so a surprising result can be traced
        # back to whether retrieval or reranking put it there.
        out.append({**passage, "rerank_score": float(score)})
    return out, True
