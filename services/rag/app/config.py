"""Service configuration.

Everything comes from the environment. The one value worth arguing about is
`embedding_dimensions`: it is not really configuration, it is a fact about the
`vector(1536)` column that Drizzle owns in the Next.js app. It lives here so a
mismatch fails loudly at ingest time instead of silently poisoning search.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # The same Postgres the Next.js app uses. Drizzle owns the schema and the
    # migrations; this service only reads and writes rows.
    database_url: str = "postgresql://localhost:5432/agentic_chat_dev"
    db_pool_min: int = 1
    db_pool_max: int = 8

    # Shared secret between the Next.js app and this service. No user cookies
    # ever cross the boundary: Next.js authenticates the person, then vouches
    # for them by passing a user id it has already verified.
    service_token: str = ""

    # Any endpoint speaking the OpenAI /embeddings shape.
    embeddings_base_url: str = "https://api.openai.com/v1"
    embeddings_model: str = "text-embedding-3-small"
    embeddings_api_key: str = ""
    # Must match the `vector(...)` width in the Drizzle schema.
    embedding_dimensions: int = 1536

    # Chunking, in tokens now that a real tokenizer is available.
    chunk_tokens: int = 300
    chunk_overlap_tokens: int = 45
    # Encoding used to count them. cl100k_base is close enough for any modern
    # model; chunk sizing does not need to be exact, only stable.
    tokenizer_encoding: str = "cl100k_base"

    # Cross-encoder reranking. Off unless a model is named, and it also needs
    # the `rerank` extra installed.
    rerank_model: str = ""
    # Candidates fetched per retriever before fusion. Higher than the returned
    # count on purpose — reranking can only reorder what retrieval found.
    candidates_per_retriever: int = 30

    max_document_chars: int = 600_000


@lru_cache
def settings() -> Settings:
    return Settings()
