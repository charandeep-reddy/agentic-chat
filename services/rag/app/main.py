"""FastAPI app: two internal endpoints, plus health.

This service is not public. It sits behind the Next.js app, which authenticates
the person with better-auth and then vouches for them by passing a user id it
has already verified. No cookies cross the boundary, and the service token
proves only that the caller *is* the Next.js app — never which user the request
is for, which is why every query filters on `user_id` as well.
"""

from __future__ import annotations

import hmac
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from .config import settings
from .db import close_pool, open_pool
from .embed import EmbeddingError
from .extract import ExtractionError
from .ingest import IngestError, index_document
from .rerank import is_enabled as rerank_enabled
from .retrieval import search

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Connect on startup so the first real request does not pay for it, and so
    # a bad DATABASE_URL fails the deploy instead of the first search.
    await open_pool()
    yield
    await close_pool()


app = FastAPI(title="Agentic Chat RAG", lifespan=lifespan)


async def require_service_token(x_service_token: str = Header(default="")) -> None:
    """Authenticate the caller, in constant time.

    `hmac.compare_digest` rather than `==`: string comparison short-circuits on
    the first differing byte, which leaks the shared secret one character at a
    time to anyone who can measure the difference.
    """
    expected = settings().service_token
    if not expected:
        # Failing closed. An unset token would otherwise mean an open endpoint
        # that reads and writes any user's documents.
        raise HTTPException(status_code=503, detail="SERVICE_TOKEN is not configured.")
    if not hmac.compare_digest(x_service_token, expected):
        raise HTTPException(status_code=401, detail="Bad service token.")


@app.get("/health")
async def health() -> dict:
    """Liveness, plus the configuration that changes behaviour.

    Reported so the Next.js side can show whether reranking is actually on
    without anyone having to read this service's environment.
    """
    config = settings()
    return {
        "ok": True,
        "embeddings_model": config.embeddings_model,
        "embedding_dimensions": config.embedding_dimensions,
        "rerank_model": config.rerank_model or None,
        "rerank_enabled": rerank_enabled(),
    }


class SearchRequest(BaseModel):
    user_id: str = Field(min_length=1)
    query: str = Field(min_length=1, max_length=400)
    limit: int = Field(default=6, ge=1, le=10)
    # The end user's own model key, when the service has no key of its own.
    api_key: str | None = None


@app.post("/search", dependencies=[Depends(require_service_token)])
async def search_endpoint(request: SearchRequest) -> dict:
    try:
        return await search(
            request.user_id, request.query, request.limit, request.api_key
        )
    except EmbeddingError as error:
        # 502, not 500: the failure is upstream at the embeddings provider, and
        # the message is usually something the user can act on.
        raise HTTPException(status_code=502, detail=str(error)) from error


class IngestRequest(BaseModel):
    document_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    api_key: str | None = None


@app.post("/ingest", dependencies=[Depends(require_service_token)])
async def ingest_endpoint(request: IngestRequest) -> dict:
    """Index text already stored on the document row.

    Used for pasted text and for re-indexing after a chunking or model change —
    the original text is kept precisely so this never needs a re-upload.
    """
    try:
        return await index_document(
            request.document_id, request.user_id, request.api_key
        )
    except IngestError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except EmbeddingError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.post("/ingest/file", dependencies=[Depends(require_service_token)])
async def ingest_file_endpoint(
    document_id: str = Form(...),
    user_id: str = Form(...),
    api_key: str | None = Form(default=None),
    file: UploadFile = File(...),
) -> dict:
    """Index an uploaded file: PDF, DOCX, or anything decodable as text.

    Multipart rather than base64 in JSON — a 20 MB PDF becomes ~27 MB of JSON
    string, and the whole thing has to be parsed into memory before any of it
    can be read.
    """
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    try:
        return await index_document(
            document_id,
            user_id,
            api_key,
            raw=raw,
            filename=file.filename or "",
            mime_type=file.content_type or "",
        )
    except (IngestError, ExtractionError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except EmbeddingError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
