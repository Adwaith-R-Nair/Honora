"""
Unit tests for search.py — RBAC filter construction and multi-factor ranking.

`embeddings` (needs sentence-transformers/torch) and `vector_store` (needs a
live Qdrant connection) are stubbed out in sys.modules before search.py is
imported, so these tests stay hermetic — no heavy ML dependency, no network.
"""
import sys
import time
import types
from types import SimpleNamespace
from unittest.mock import MagicMock

from qdrant_client.http import models as qmodels

# ── Stub heavy/networked dependencies before search.py imports them ────────
_fake_embeddings = types.ModuleType("embeddings")
_fake_embeddings.embed_text = MagicMock(return_value=[0.0] * 384)
sys.modules["embeddings"] = _fake_embeddings

_fake_vector_store = types.ModuleType("vector_store")
_fake_vector_store.search_similar = MagicMock(return_value=[])
sys.modules["vector_store"] = _fake_vector_store

import search  # noqa: E402  (must import after the sys.modules stubs above)


def _fake_hit(score: float, payload: dict, point_id: str = "id"):
    return SimpleNamespace(score=score, payload=payload, id=point_id)


# ── _build_rbac_filter ───────────────────────────────────────────────────────

def test_build_rbac_filter_returns_none_when_no_department():
    # Lawyer/Judge: department is optional — no claim means unrestricted search
    assert search._build_rbac_filter({"role": "Lawyer"}) is None


def test_build_rbac_filter_returns_none_for_empty_department():
    assert search._build_rbac_filter({"role": "Lawyer", "department": ""}) is None


def test_build_rbac_filter_scopes_by_department_when_present():
    result = search._build_rbac_filter({"role": "Police", "department": "narcotics"})

    assert isinstance(result, qmodels.Filter)
    assert len(result.must) == 1
    condition = result.must[0]
    assert condition.key == "department"
    assert condition.match == qmodels.MatchValue(value="narcotics")


# ── _recency_score ────────────────────────────────────────────────────────────

def test_recency_score_no_timestamp_returns_neutral():
    assert search._recency_score(None) == 0.5


def test_recency_score_recent_upload_scores_near_one():
    assert search._recency_score(time.time()) > 0.99


def test_recency_score_very_old_upload_scores_near_zero():
    two_years_ago = time.time() - (2 * 365 * 24 * 60 * 60)
    assert search._recency_score(two_years_ago) == 0.0


def test_recency_score_invalid_value_returns_neutral():
    assert search._recency_score("not-a-timestamp") == 0.5


# ── _metadata_score ───────────────────────────────────────────────────────────

def test_metadata_score_no_filters_is_full_match():
    assert search._metadata_score({"department": "narcotics"}, {}) == 1.0


def test_metadata_score_all_filters_match():
    payload = {"department": "narcotics", "docType": "police_evidence"}
    filters = {"department": "narcotics", "docType": "police_evidence"}
    assert search._metadata_score(payload, filters) == 1.0


def test_metadata_score_partial_match():
    payload = {"department": "narcotics", "docType": "supporting_doc"}
    filters = {"department": "narcotics", "docType": "police_evidence"}
    assert search._metadata_score(payload, filters) == 0.5


def test_metadata_score_no_match():
    payload = {"department": "homicide"}
    filters = {"department": "narcotics"}
    assert search._metadata_score(payload, filters) == 0.0


# ── semantic_search — RBAC filter actually reaches the vector store ─────────

def test_semantic_search_passes_department_filter_to_vector_store():
    _fake_vector_store.search_similar.reset_mock()
    _fake_vector_store.search_similar.return_value = []

    search.semantic_search(
        query="drug trafficking",
        rbac={"role": "Police", "department": "narcotics"},
        top_k=5,
    )

    _fake_vector_store.search_similar.assert_called_once()
    _, kwargs = _fake_vector_store.search_similar.call_args
    assert kwargs["query_filter"] is not None
    assert kwargs["query_filter"].must[0].key == "department"


def test_semantic_search_passes_no_filter_for_lawyer_without_department():
    _fake_vector_store.search_similar.reset_mock()
    _fake_vector_store.search_similar.return_value = []

    search.semantic_search(query="anything", rbac={"role": "Lawyer"}, top_k=5)

    _, kwargs = _fake_vector_store.search_similar.call_args
    assert kwargs["query_filter"] is None


# ── semantic_search — composite ranking + per-evidence dedup ────────────────

def test_semantic_search_dedupes_chunks_and_keeps_the_best_scoring_one():
    _fake_vector_store.search_similar.reset_mock()
    now = time.time()
    _fake_vector_store.search_similar.return_value = [
        _fake_hit(0.90, {"evidence_id": "1", "caseId": "1", "uploadTimestamp": now}, "1-chunk-0"),
        _fake_hit(0.95, {"evidence_id": "1", "caseId": "1", "uploadTimestamp": now}, "1-chunk-1"),
        _fake_hit(0.50, {"evidence_id": "2", "caseId": "2", "uploadTimestamp": now}, "2"),
    ]

    results = search.semantic_search(query="x", rbac={"role": "Judge"}, top_k=10)

    # Two distinct evidence items even though 3 hits came back (chunked doc
    # collapses to its single best-scoring chunk)
    assert len(results) == 2
    assert results[0]["evidenceId"] == "1"
    assert results[0]["semanticScore"] == 0.95  # kept the higher-scoring chunk


def test_semantic_search_respects_semantic_threshold_env(monkeypatch):
    monkeypatch.setattr(search, "SEMANTIC_THRESHOLD", 0.8)
    _fake_vector_store.search_similar.reset_mock()
    _fake_vector_store.search_similar.return_value = [
        _fake_hit(0.9, {"evidence_id": "1", "caseId": "1"}, "1"),
        _fake_hit(0.3, {"evidence_id": "2", "caseId": "2"}, "2"),
    ]

    results = search.semantic_search(query="x", rbac={"role": "Judge"}, top_k=10)

    assert len(results) == 1
    assert results[0]["evidenceId"] == "1"
