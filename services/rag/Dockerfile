# Ingestion and retrieval service.
#
# The base image is slim and the extras are opt-in: `extract` pulls PyMuPDF (a
# large native wheel) and `rerank` pulls torch (gigabytes). Build with only what
# the deployment actually uses.
#
#   docker build -t agentic-rag .
#   docker build --build-arg EXTRAS='[extract]' -t agentic-rag .
#   docker build --build-arg EXTRAS='[extract,rerank]' -t agentic-rag .

FROM python:3.12-slim

ARG EXTRAS="[extract]"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv

COPY pyproject.toml ./
COPY app ./app

RUN pip install --no-cache-dir ".${EXTRAS}"

# Reranker weights are hundreds of MB and download on first use. Baking them
# into the image keeps the first request after a deploy from paying for it.
ARG PRELOAD_RERANK_MODEL=""
RUN if [ -n "$PRELOAD_RERANK_MODEL" ]; then \
      python -c "from sentence_transformers import CrossEncoder; CrossEncoder('$PRELOAD_RERANK_MODEL')"; \
    fi

EXPOSE 8000

# One worker per container: the process is I/O-bound on the embeddings provider
# and Postgres, and a loaded reranker would otherwise be duplicated in memory
# per worker. Scale with replicas instead.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
