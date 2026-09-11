#!/usr/bin/env python3
"""
reindex.py — Honora EMS
Clears the Qdrant collection and re-indexes all evidence and supporting
documents from scratch using the chunking pipeline.

Usage:
    cd ailayer-querying
    python reindex.py

Optional — set in .env to skip interactive prompts:
    LOGIN_EMAIL=your@email.com
    LOGIN_PASSWORD=yourpassword
"""
from __future__ import annotations

import getpass
import os
import sys
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv()

# ── Import local AI-layer modules directly ────────────────────────────────────
from embeddings import embed_text
from preprocessing import chunk_text, extract_full
from vector_store import COLLECTION_NAME, ensure_collection, get_client, upsert_evidence

# ── Config ─────────────────────────────────────────────────────────────────────
BACKEND_URL: str = os.getenv("EMS_BACKEND_URL", "http://localhost:3000")
IPFS_TIMEOUT: int = 60
SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".doc"]


# ── Auth ───────────────────────────────────────────────────────────────────────

def login(email: str, password: str) -> str:
    resp = httpx.post(
        f"{BACKEND_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    if resp.status_code != 200:
        print(f"  ✗ Login failed ({resp.status_code}): {resp.text}")
        sys.exit(1)
    token = resp.json().get("data", {}).get("token", "")
    if not token:
        print("  ✗ No token in login response. Check your credentials.")
        sys.exit(1)
    return token


# ── Data fetching ──────────────────────────────────────────────────────────────

def fetch_all_evidence(token: str) -> list[dict[str, Any]]:
    """Paginate through GET /api/evidence and return every record."""
    headers = {"Authorization": f"Bearer {token}"}
    all_items: list[dict[str, Any]] = []
    page = 1
    while True:
        resp = httpx.get(
            f"{BACKEND_URL}/api/evidence",
            params={"page": page, "limit": 50},
            headers=headers,
            timeout=30,
        )
        if resp.status_code != 200:
            print(f"  ✗ Failed to fetch evidence page {page}: {resp.status_code}")
            break
        batch = resp.json().get("data", [])
        if not batch:
            break
        all_items.extend(batch)
        if len(batch) < 50:
            break
        page += 1
    return all_items


def fetch_supporting_docs(evidence_id: str, token: str) -> list[dict[str, Any]]:
    headers = {"Authorization": f"Bearer {token}"}
    resp = httpx.get(
        f"{BACKEND_URL}/api/supporting-docs/{evidence_id}",
        headers=headers,
        timeout=15,
    )
    if resp.status_code != 200:
        return []
    return resp.json().get("data", [])


# ── Indexing ───────────────────────────────────────────────────────────────────

def index_file(
    point_id: str,
    ipfs_url: str,
    filename: str,
    payload: dict[str, Any],
) -> int:
    """
    Download file from IPFS, split into chunks, embed each chunk,
    upsert to Qdrant. Returns number of chunks indexed (0 = skipped).
    """
    if not ipfs_url:
        return 0
    if not any(filename.lower().endswith(ext) for ext in SUPPORTED_EXTENSIONS):
        return 0

    try:
        resp = httpx.get(ipfs_url, timeout=IPFS_TIMEOUT, follow_redirects=True)
        if resp.status_code != 200:
            print(f"      ✗ IPFS download failed ({resp.status_code}): {filename}")
            return 0
        file_bytes = resp.content
    except Exception as exc:
        print(f"      ✗ IPFS download error: {exc}")
        return 0

    try:
        extraction = extract_full(file_bytes, filename=filename)
    except Exception as exc:
        print(f"      ✗ Extraction error: {exc}")
        return 0

    chunks = chunk_text(extraction.combined)
    if not chunks:
        chunks = [extraction.combined] if extraction.combined.strip() else []
    if not chunks:
        print(f"      ✗ No text extracted from: {filename}")
        return 0

    payload["tableCount"] = len(extraction.tables)
    payload["totalChunks"] = len(chunks)

    for i, chunk in enumerate(chunks):
        chunk_point_id = f"{point_id}-chunk-{i}" if len(chunks) > 1 else point_id
        upsert_evidence(chunk_point_id, embed_text(chunk), {**payload, "chunkIndex": i})

    return len(chunks)


# ── Collection management ──────────────────────────────────────────────────────

def clear_and_recreate() -> None:
    client = get_client()
    existing = {c.name for c in client.get_collections().collections}
    if COLLECTION_NAME in existing:
        client.delete_collection(COLLECTION_NAME)
        print(f"  ✓ Deleted collection '{COLLECTION_NAME}'")
    ensure_collection()
    print(f"  ✓ Recreated collection '{COLLECTION_NAME}' (384-dim, cosine)")


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    print()
    print("══════════════════════════════════════════════")
    print("  Honora EMS — Full Re-index")
    print("  Chunked pipeline  ·  Qdrant Cloud")
    print("══════════════════════════════════════════════")
    print()

    # Credentials
    email    = os.getenv("LOGIN_EMAIL")    or input("Backend login email: ").strip()
    password = os.getenv("LOGIN_PASSWORD") or getpass.getpass("Backend login password: ")

    # Step 1 — Login
    print("\n[1/4] Authenticating with backend...")
    token = login(email, password)
    print(f"  ✓ Logged in as {email}")

    # Step 2 — Clear Qdrant
    print("\n[2/4] Clearing Qdrant collection...")
    clear_and_recreate()

    # Step 3 — Fetch all evidence
    print("\n[3/4] Fetching evidence list from backend...")
    evidence_list = fetch_all_evidence(token)
    print(f"  ✓ {len(evidence_list)} evidence record(s) found")

    if not evidence_list:
        print("\n  Nothing to index. Exiting.")
        return

    # Step 4 — Index
    print("\n[4/4] Indexing evidence + supporting documents...\n")

    ev_indexed   = 0
    ev_skipped   = 0
    doc_indexed  = 0
    doc_skipped  = 0
    total_chunks = 0

    for idx, ev in enumerate(evidence_list, 1):
        evidence_id = str(ev.get("evidenceId", ""))
        filename    = ev.get("filename", "")
        ipfs_url    = ev.get("ipfsUrl", "")
        case_id     = str(ev.get("caseId", ""))
        case_name   = ev.get("caseName", "")
        department  = ev.get("department", "")

        print(f"  [{idx:>3}/{len(evidence_list)}] Evidence {evidence_id}  —  {filename}")

        # Primary evidence
        ev_payload = {
            "evidence_id":     evidence_id,
            "docType":         "police_evidence",
            "caseId":          case_id,
            "caseName":        case_name,
            "evidenceName":    filename,
            "uploadTimestamp": ev.get("timestamp"),
            "department":      department,
            "uploader":        ev.get("uploadedBy"),
            "fileUrl":         ipfs_url,
        }

        n = index_file(
            point_id=f"evidence-{evidence_id}",
            ipfs_url=ipfs_url,
            filename=filename,
            payload=ev_payload,
        )
        if n:
            print(f"         ✓ {n} chunk(s) indexed")
            total_chunks += n
            ev_indexed += 1
        else:
            print("         ⚠ Skipped (unsupported type or empty text)")
            ev_skipped += 1

        # Supporting docs
        docs = fetch_supporting_docs(evidence_id, token)
        if not docs:
            continue

        print(f"         Supporting docs: {len(docs)}")
        for doc in docs:
            doc_id       = str(doc.get("docId", ""))
            doc_filename = doc.get("filename") or ""
            doc_url      = doc.get("ipfsUrl", "")

            doc_payload = {
                "evidence_id":      f"doc-{doc_id}",
                "docType":          doc.get("docType", "supporting_doc"),
                "docId":            doc_id,
                "linkedEvidenceId": evidence_id,
                "caseId":           case_id,
                "caseName":         case_name,
                "evidenceName":     doc_filename,
                "uploadTimestamp":  doc.get("timestamp"),
                "department":       department,
                "uploader":         doc.get("uploadedBy"),
                "fileUrl":          doc_url,
            }

            dn = index_file(
                point_id=f"supporting-{evidence_id}-{doc_id}",
                ipfs_url=doc_url,
                filename=doc_filename,
                payload=doc_payload,
            )
            if dn:
                print(f"           ✓ Doc {doc_id} ({doc_filename}): {dn} chunk(s)")
                total_chunks += dn
                doc_indexed  += dn
            else:
                print(f"           ⚠ Doc {doc_id} ({doc_filename}): skipped")
                doc_skipped += 1

    # Summary
    print()
    print("══════════════════════════════════════════════")
    print("  Re-index Complete")
    print("══════════════════════════════════════════════")
    print(f"  Evidence indexed  :  {ev_indexed} / {len(evidence_list)}")
    print(f"  Evidence skipped  :  {ev_skipped}")
    print(f"  Doc chunks        :  {doc_indexed}")
    print(f"  Doc skipped       :  {doc_skipped}")
    print(f"  Total vectors     :  {total_chunks}")
    print()


if __name__ == "__main__":
    main()
