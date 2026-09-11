import os
import uuid
from typing import Any

from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels

from embeddings import VECTOR_SIZE

load_dotenv()

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", "")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "evidence_vectors")

_client: QdrantClient | None = None


def get_client() -> QdrantClient:
    global _client
    if _client is None:
        _client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY or None)
    return _client


def ensure_collection() -> None:
    """Create the evidence_vectors collection if it does not already exist."""
    client = get_client()
    existing = {c.name for c in client.get_collections().collections}
    if COLLECTION_NAME not in existing:
        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=qmodels.VectorParams(
                size=VECTOR_SIZE,
                distance=qmodels.Distance.COSINE,
            ),
        )


def upsert_evidence(
    evidence_id: str,
    vector: list[float],
    payload: dict[str, Any],
) -> str:
    """
    Upsert a single evidence vector.
    Returns the point ID used in Qdrant.
    """
    client = get_client()
    point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, evidence_id))
    client.upsert(
        collection_name=COLLECTION_NAME,
        points=[
            qmodels.PointStruct(
                id=point_id,
                vector=vector,
                payload={"evidence_id": evidence_id, **payload},
            )
        ],
    )
    return point_id


def search_similar(
    query_vector: list[float],
    top_k: int = 10,
    score_threshold: float = 0.0,
    query_filter: qmodels.Filter | None = None,
) -> list[qmodels.ScoredPoint]:
    """Return top-k scored points above `score_threshold`."""
    client = get_client()
    return client.search(
        collection_name=COLLECTION_NAME,
        query_vector=query_vector,
        limit=top_k,
        score_threshold=score_threshold,
        query_filter=query_filter,
        with_payload=True,
    )
