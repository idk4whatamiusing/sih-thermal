"""bge-base-en-v1.5 embeddings for the RAG case-history store.

768 dims, matching db/migrations/0002_rag.sql's `documents.embedding vector(768)`
column exactly. Loaded lazily and cached in-process - the sidecar's first
/embed call pays the model load cost, every call after is fast.
"""

from sentence_transformers import SentenceTransformer

_model: SentenceTransformer | None = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer("BAAI/bge-base-en-v1.5")
    return _model


def embed(text: str) -> list[float]:
    return get_model().encode(text, normalize_embeddings=True).tolist()
