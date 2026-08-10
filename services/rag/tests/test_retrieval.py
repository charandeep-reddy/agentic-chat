import pytest

from app.embed import EmbeddingError, cosine_similarity
from app.retrieval import fuse_by_rank


def candidate(chunk_id: str) -> dict:
    return {
        "chunk_id": chunk_id,
        "document_id": "doc1",
        "document_title": "Handbook",
        "source": "handbook.md",
        "heading": None,
        "content": f"content {chunk_id}",
        "ordinal": 0,
    }


def test_cosine_is_one_for_same_direction_and_zero_for_orthogonal():
    assert cosine_similarity([1, 0], [1, 0]) == pytest.approx(1)
    assert cosine_similarity([1, 0], [0, 1]) == pytest.approx(0)


def test_cosine_ignores_magnitude():
    # A long chunk is not scored higher for being long.
    assert cosine_similarity([1, 1], [10, 10]) == pytest.approx(1)


def test_cosine_refuses_vectors_from_different_models():
    with pytest.raises(EmbeddingError, match="3-d"):
        cosine_similarity([1, 0], [1, 0, 0])


def test_cosine_treats_a_zero_vector_as_unrelated():
    assert cosine_similarity([0, 0], [1, 1]) == 0.0


def test_chunk_found_by_both_retrievers_outranks_one_found_by_either():
    fused = fuse_by_rank(
        [
            ("vector", [candidate("a"), candidate("b")]),
            ("keyword", [candidate("c"), candidate("b")]),
        ],
        10,
    )
    assert fused[0]["chunk_id"] == "b"
    assert fused[0]["matched_by"] == ["keyword", "vector"]


def test_keyword_only_exact_match_survives_fusion():
    # The error-code case: embeddings do not distinguish ERR_4021 from its
    # neighbours, so this chunk exists in one list only and must survive.
    fused = fuse_by_rank(
        [
            ("vector", [candidate("a"), candidate("b"), candidate("c")]),
            ("keyword", [candidate("err")]),
        ],
        10,
    )
    assert "err" in [row["chunk_id"] for row in fused]
    assert next(r for r in fused if r["chunk_id"] == "err")["matched_by"] == ["keyword"]


def test_a_chunk_is_never_returned_twice():
    fused = fuse_by_rank(
        [("vector", [candidate("a")]), ("keyword", [candidate("a")])], 10
    )
    assert len(fused) == 1


def test_rank_gaps_are_damped_so_one_retriever_cannot_dominate():
    fused = fuse_by_rank(
        [
            ("vector", [candidate("top"), candidate("second")]),
            ("keyword", [candidate("second")]),
        ],
        10,
    )
    assert fused[0]["chunk_id"] == "second"


def test_limit_is_honoured():
    many = [candidate(f"c{i}") for i in range(30)]
    assert len(fuse_by_rank([("vector", many)], 6)) == 6


def test_empty_retrievers_produce_no_results():
    assert fuse_by_rank([("vector", []), ("keyword", [])], 6) == []
