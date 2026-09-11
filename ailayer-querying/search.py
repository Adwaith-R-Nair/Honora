"""
Multi-factor ranking: Semantic Similarity + Recency + Metadata match.
"""
from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()

import time
from typing import Any

from qdrant_client.http import models as qmodels

from embeddings import embed_text
from vector_store import search_similar

# ── Weights ────────────────────────────────────────────────────────────────
W_SEMANTIC = 0.85
W_RECENCY = 0.10
W_METADATA = 0.05

SEMANTIC_THRESHOLD = float(os.getenv("SEMANTIC_THRESHOLD", "0.0"))
MAX_AGE_SECONDS = 60 * 60 * 24 * 365  # 1 year baseline for recency decay


def _recency_score(upload_timestamp: float | str | None) -> float:
    if not upload_timestamp:
        return 0.5
    try:
        age = max(0.0, time.time() - float(upload_timestamp))
        return max(0.0, 1.0 - age / MAX_AGE_SECONDS)
    except (TypeError, ValueError):
        return 0.5

def _metadata_score(payload: dict[str, Any], filters: dict[str, Any]) -> float:
    """1.0 if all filter keys match payload, 0.0 if none match."""
    if not filters:
        return 1.0
    matches = sum(1 for k, v in filters.items() if payload.get(k) == v)
    return matches / len(filters)


def _build_rbac_filter(rbac: dict[str, Any]) -> qmodels.Filter | None:
    """
    Build a Qdrant filter from the JWT RBAC payload, scoping results to the
    caller's department when they have one.

    `department` is required at registration for Police/Forensic accounts
    (see backend/src/models/user.model.ts's DEPARTMENT_REQUIRED_ROLES) and
    optional for Lawyer/Judge — those are cross-department oversight roles,
    so an absent department intentionally means unrestricted search, not a
    bug. `allowed_case_ids` is not implemented: no per-user case-assignment
    feature exists in the current data model (nothing ever populates that
    JWT claim), so a filter on it would silently do nothing — not built
    until that feature actually exists.
    """
    department = rbac.get("department")
    if not department:
        return None

    return qmodels.Filter(
        must=[
            qmodels.FieldCondition(
                key="department",
                match=qmodels.MatchValue(value=department),
            )
        ]
    )

def semantic_search(
    query: str,
    rbac: dict[str, Any],
    top_k: int = 10,
    metadata_filters: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """
    Perform multi-factor ranked search.
    Returns a list of result dicts sorted by composite score descending.
    """
    query_vector = embed_text(query)
    qdrant_filter = _build_rbac_filter(rbac)

    raw_results = search_similar(
        query_vector=query_vector,
        top_k=top_k * 3,          # over-fetch before re-ranking
        score_threshold=0.0,       # we apply threshold after re-ranking
        query_filter=qdrant_filter,
    )

    ranked: list[dict[str, Any]] = []
    for hit in raw_results:
        semantic = hit.score  # cosine similarity [0, 1]
        payload = hit.payload or {}

        recency = _recency_score(payload.get("uploadTimestamp"))
        meta = _metadata_score(payload, metadata_filters or {})

        composite = W_SEMANTIC * semantic + W_RECENCY * recency + W_METADATA * meta

        ranked.append(
            {
                "evidenceId": payload.get("evidence_id", hit.id),
                "caseId": payload.get("caseId"),
                "caseName": payload.get("caseName"),
                "evidenceName": payload.get("evidenceName"),
                "semanticScore": round(semantic, 4),
                "recencyScore": round(recency, 4),
                "metadataScore": round(meta, 4),
                "compositeScore": round(composite, 4),
                "payload": payload,
            }
        )

    # Sort by composite score descending
    ranked.sort(key=lambda x: x["compositeScore"], reverse=True)

    # Deduplicate: chunking stores multiple vectors per document — keep only
    # the highest-scoring chunk per evidence (first hit after sort = best chunk)
    seen_ids: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for r in ranked:
        eid = str(r.get("evidenceId", ""))
        if eid in seen_ids:
            continue
        seen_ids.add(eid)
        deduped.append(r)

    return [r for r in deduped[:top_k] if r["semanticScore"] >= SEMANTIC_THRESHOLD]
