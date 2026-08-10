"""Endpoint contract: the auth boundary, and what /health reports.

The TestClient is deliberately *not* used as a context manager — that would run
the lifespan and open a real connection pool. These tests are about the HTTP
layer, so they never reach the database.
"""

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("SERVICE_TOKEN", "correct-token")
    settings.cache_clear()
    yield TestClient(app)
    settings.cache_clear()


def test_health_reports_the_config_that_changes_behaviour(client):
    body = client.get("/health").json()
    assert body["ok"] is True
    assert body["embedding_dimensions"] == 1536
    # Reported so the Next.js side can tell whether reranking is actually on
    # without reading this service's environment.
    assert "rerank_enabled" in body


def test_search_rejects_a_missing_token(client):
    response = client.post("/search", json={"user_id": "u1", "query": "refunds"})
    assert response.status_code == 401


def test_search_rejects_a_wrong_token(client):
    response = client.post(
        "/search",
        json={"user_id": "u1", "query": "refunds"},
        headers={"x-service-token": "guessed"},
    )
    assert response.status_code == 401


def test_ingest_rejects_a_wrong_token(client):
    response = client.post(
        "/ingest",
        json={"document_id": "d1", "user_id": "u1"},
        headers={"x-service-token": "guessed"},
    )
    assert response.status_code == 401


def test_service_fails_closed_when_no_token_is_configured(monkeypatch):
    # An unset token must not mean an open endpoint that reads and writes any
    # user's documents.
    monkeypatch.setenv("SERVICE_TOKEN", "")
    settings.cache_clear()
    unconfigured = TestClient(app)
    response = unconfigured.post(
        "/search",
        json={"user_id": "u1", "query": "refunds"},
        headers={"x-service-token": ""},
    )
    assert response.status_code == 503
    settings.cache_clear()


def test_search_validates_its_input(client):
    headers = {"x-service-token": "correct-token"}
    assert client.post("/search", json={"user_id": "u1"}, headers=headers).status_code == 422
    assert (
        client.post(
            "/search",
            json={"user_id": "u1", "query": "refunds", "limit": 99},
            headers=headers,
        ).status_code
        == 422
    )


def test_user_id_is_required_so_a_search_can_never_be_unscoped(client):
    # The service token proves the caller is the Next.js app; it says nothing
    # about which user the request is for.
    response = client.post(
        "/search",
        json={"query": "refunds"},
        headers={"x-service-token": "correct-token"},
    )
    assert response.status_code == 422
