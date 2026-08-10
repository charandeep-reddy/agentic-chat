"""Ingestion: extract, chunk, embed, store."""

from __future__ import annotations

import logging

from .chunk import chunk_text, embeddable_text
from .config import settings
from .db import get_document, mark_failed, replace_chunks, set_document_content
from .embed import embed_texts
from .extract import extract_text

logger = logging.getLogger(__name__)


class IngestError(Exception):
    """Raised when a document cannot be indexed."""


async def index_document(
    document_id: str,
    user_id: str,
    api_key: str | None = None,
    raw: bytes | None = None,
    filename: str = "",
    mime_type: str = "",
) -> dict:
    """Chunk, embed and store one document's passages.

    Rebuilding from scratch on every call — delete the chunks, then re-insert —
    makes this idempotent and safe to retry. `raw` is passed when a binary file
    was uploaded; otherwise the text already on the row is re-indexed, which is
    what makes a chunk-size or model change a one-request operation rather than
    a re-upload.
    """
    row = await get_document(document_id, user_id)
    if row is None:
        raise IngestError(f"No document {document_id} for this user.")

    try:
        if raw is not None:
            content = extract_text(raw, filename=filename, mime_type=mime_type)
            # Written back before embedding: extraction is the expensive,
            # failure-prone step, and losing it to a provider timeout would mean
            # parsing the PDF again on every retry.
            await set_document_content(document_id, content)
        else:
            content = row["content"] or ""

        content = content.strip()
        if not content:
            raise IngestError("The document has no readable text.")
        if len(content) > settings().max_document_chars:
            raise IngestError(
                f"Document is {len(content):,} characters; the limit is "
                f"{settings().max_document_chars:,}."
            )

        chunks = chunk_text(content)
        if not chunks:
            raise IngestError("The document produced no chunks.")

        # One call per chunk would be one HTTP round trip per chunk; embed_texts
        # batches them and preserves order, so vectors[i] belongs to chunks[i].
        vectors = await embed_texts([embeddable_text(c) for c in chunks], api_key)

        count = await replace_chunks(
            document_id,
            user_id,
            [
                (chunk.index, chunk.heading, chunk.text, vector)
                for chunk, vector in zip(chunks, vectors)
            ],
            settings().embeddings_model,
        )
        return {"chunk_count": count, "characters": len(content)}

    except Exception as error:
        await mark_failed(document_id, str(error))
        raise
