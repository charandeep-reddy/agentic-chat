"""Postgres access.

This service shares one database with the Next.js app, and **Drizzle owns the
schema**. Nothing here creates or alters a table: migrations live in
`drizzle/` and are applied by `bun run db:migrate`. Two services writing DDL to
one database is how schemas drift, so the rule is that one of them writes rows
and the other writes structure.

The queries are hand-written SQL rather than an ORM for the same reason. There
is no second model of the schema to keep in sync — just the column names, which
fail loudly the moment they are wrong.
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

import asyncpg
from pgvector.asyncpg import register_vector

from .config import settings

_pool: asyncpg.Pool | None = None


async def _init_connection(connection: asyncpg.Connection) -> None:
    # Teaches asyncpg the `vector` type so embeddings pass as Python lists in
    # both directions. Without it, every insert has to build a '[1,2,3]' string
    # by hand and every read parses one back.
    await register_vector(connection)


async def open_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        config = settings()
        _pool = await asyncpg.create_pool(
            dsn=config.database_url,
            min_size=config.db_pool_min,
            max_size=config.db_pool_max,
            init=_init_connection,
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def connection():
    pool = await open_pool()
    async with pool.acquire() as conn:
        yield conn


def new_id(prefix: str) -> str:
    """Matches `newId` in the Next.js app, so ids look the same either side."""
    return f"{prefix}_{uuid.uuid4().hex[:24]}"


async def get_document(document_id: str, user_id: str) -> asyncpg.Record | None:
    """Fetch a document, scoped to its owner.

    Every query in this service takes a `user_id` and filters on it. The service
    token proves the *caller* is the Next.js app; it says nothing about which
    user the request is for, so ownership is enforced on every row touched.
    """
    async with connection() as conn:
        return await conn.fetchrow(
            """
            select id, user_id, title, source, mime_type, content, status
            from document
            where id = $1 and user_id = $2
            """,
            document_id,
            user_id,
        )


async def replace_chunks(
    document_id: str,
    user_id: str,
    rows: list[tuple[int, str | None, str, list[float]]],
    embedding_model: str,
) -> int:
    """Swap in a document's chunks and mark it ready, in one transaction.

    Delete-then-insert rather than an incremental update makes re-indexing
    idempotent and safe to retry. A partially embedded document is worse than no
    document: it answers confidently from the half of the text that made it in,
    with nothing to signal that the rest is missing.
    """
    async with connection() as conn:
        async with conn.transaction():
            await conn.execute(
                "delete from document_chunk where document_id = $1", document_id
            )
            await conn.executemany(
                """
                insert into document_chunk
                    (id, document_id, user_id, ordinal, heading, content, embedding)
                values ($1, $2, $3, $4, $5, $6, $7)
                """,
                [
                    (
                        new_id("chunk"),
                        document_id,
                        user_id,
                        ordinal,
                        heading,
                        content,
                        embedding,
                    )
                    for ordinal, heading, content, embedding in rows
                ],
            )
            await conn.execute(
                """
                update document
                set status = 'ready',
                    error = null,
                    chunk_count = $2,
                    embedding_model = $3,
                    content = coalesce(nullif(content, ''), content),
                    updated_at = now()
                where id = $1
                """,
                document_id,
                len(rows),
                embedding_model,
            )
    return len(rows)


async def set_document_content(document_id: str, content: str) -> None:
    """Store extracted text back on the row.

    A PDF arrives as bytes and is only readable after extraction. Writing the
    text back means re-indexing later — a better chunk size, a different
    embedding model — never has to re-parse the original, and the Next.js app
    can show what was actually indexed rather than a filename.
    """
    async with connection() as conn:
        await conn.execute(
            "update document set content = $2, updated_at = now() where id = $1",
            document_id,
            content,
        )


async def mark_failed(document_id: str, message: str) -> None:
    """Record the failure on the row rather than only in the logs.

    The user is the one who has to act on "your embeddings key is wrong", and
    they are looking at the document list, not at the service logs.
    """
    async with connection() as conn:
        await conn.execute(
            """
            update document
            set status = 'failed', error = $2, updated_at = now()
            where id = $1
            """,
            document_id,
            message[:500],
        )
