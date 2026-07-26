# Honora — Low-Level Design (LLD)

| | |
|---|---|
| **Document type** | Low-Level (implementation) Design |
| **Companion docs** | `PRD.md`, `ARCHITECTURE.md`, `HLD.md` |

---

## 1. Smart Contract Specification — `EvidenceRegistry.sol`

### 1.1 Enum

```solidity
enum Role { None, Police, Forensic, Lawyer, Judge }
```
(`None = 0`, `Police = 1`, `Forensic = 2`, `Lawyer = 3`, `Judge = 4`)

### 1.2 State Variables

| Variable | Type | Purpose |
|---|---|---|
| `owner` | `address` | Deployer; only address that can assign/revoke roles |
| `evidenceCount` | `uint256` | Auto-incrementing evidence ID counter |
| `supportingDocCount` | `uint256` | Auto-incrementing supporting-doc ID counter |
| `userRoles` | `mapping(address => Role)` | The authoritative RBAC source |
| `evidences` | `mapping(uint256 => Evidence)` (private) | Evidence records by ID |
| `custodyHistory` | `mapping(uint256 => CustodyRecord[])` (private) | Full custody chain per evidence ID |
| `supportingDocs` | `mapping(uint256 => SupportingDoc[])` (private) | Supporting docs per parent evidence ID |
| `fileHashExists` | `mapping(string => bool)` (private) | Global duplicate-hash registry (shared across evidence and supporting docs) |

### 1.3 Structs

```solidity
struct Evidence {
    uint256 evidenceId;
    uint256 caseId;
    string  ipfsCID;
    string  fileHash;
    address uploadedBy;
    uint256 timestamp;
    address currentHolder;
    bool    exists;
}

struct CustodyRecord {
    address from;
    address to;
    uint256 timestamp;
}

struct SupportingDoc {
    uint256 docId;
    uint256 evidenceId;
    string  ipfsCID;
    string  fileHash;
    address uploadedBy;
    uint256 timestamp;
    string  docType;
}
```

### 1.4 Custom Errors

`NotOwner()`, `NotAuthorized(address caller, Role required)`, `InsufficientRole(address caller)`,
`EvidenceNotFound(uint256 evidenceId)`, `NotCurrentHolder(uint256 evidenceId, address caller)`,
`InvalidAddress()`, `EmptyField(string fieldName)`, `DuplicateFileHash(string fileHash)`

### 1.5 Modifiers

| Modifier | Check |
|---|---|
| `onlyOwner` | `msg.sender == owner` |
| `onlyPolice` | `userRoles[msg.sender] == Role.Police` |
| `onlyForensicOrLawyer` | role is `Forensic` or `Lawyer` |
| `onlyForensicOrJudge` | role is `Forensic` or `Judge` |
| `onlyPoliceOrForensic` | role is `Police` or `Forensic` |
| `evidenceExists(id)` | `evidences[id].exists == true`, else `EvidenceNotFound` |

### 1.6 Function Specification

| Function | Access | Params | Behavior | Emits |
|---|---|---|---|---|
| `assignRole` | `onlyOwner` | `address, Role` | Sets `userRoles[account]` | `RoleAssigned` |
| `revokeRole` | `onlyOwner` | `address` | Sets role to `None` | `RoleRevoked` |
| `getRole` | view | `address` | Returns current role | — |
| `addEvidence` | `onlyPolice` | `caseId, ipfsCID, fileHash` | Validates non-empty CID/hash, rejects duplicate hash, increments `evidenceCount`, stores `Evidence` with `currentHolder = msg.sender`, pushes initial `CustodyRecord(from: 0x0, to: msg.sender)`, marks hash seen | `EvidenceAdded` |
| `addSupportingDoc` | `onlyForensicOrLawyer`, `evidenceExists` | `evidenceId, ipfsCID, fileHash, docType` | Validates non-empty fields, rejects duplicate hash, increments `supportingDocCount`, appends to `supportingDocs[evidenceId]` | `SupportingDocAdded` |
| `transferCustody` | `evidenceExists`, `onlyPoliceOrForensic` | `evidenceId, newHolder` | Requires `evidence.currentHolder == msg.sender`, updates `currentHolder`, appends `CustodyRecord` | `CustodyTransferred` |
| `recordIntegrityCheck` | `evidenceExists`, `onlyForensicOrJudge` | `evidenceId, passed` | No state change beyond the event — the check result is the event itself | `IntegrityVerified` |
| `getEvidence` | view, `evidenceExists` | `evidenceId` | Returns full `Evidence` struct | — |
| `getCustodyHistory` | view, `evidenceExists` | `evidenceId` | Returns `CustodyRecord[]` | — |
| `getSupportingDocs` | view, `evidenceExists` | `evidenceId` | Returns `SupportingDoc[]` | — |
| `isFileHashRegistered` | view | `fileHash` | Returns `bool` | — |

### 1.7 Events

`EvidenceAdded(evidenceId, caseId, ipfsCID, fileHash, uploadedBy, timestamp)` ·
`CustodyTransferred(evidenceId, previousHolder, newHolder, timestamp)` ·
`SupportingDocAdded(docId, evidenceId, ipfsCID, fileHash, uploadedBy, docType, timestamp)` ·
`RoleAssigned(account, role, timestamp)` · `RoleRevoked(account, timestamp)` ·
`IntegrityVerified(evidenceId, verifiedBy, passed, timestamp)`

---

## 2. Backend — Signer Wallet Selection Logic

Because contract modifiers check `msg.sender`, the backend must sign each transaction with a
private key matching the caller's *actual on-chain role*, not one shared admin key.

```
addEvidence            -> always ENV.PRIVATE_KEY (Police — the default signer)
addSupportingDoc        -> getSignerKeyForRole(req.user.role): Forensic -> FORENSIC_PRIVATE_KEY
                                                                Lawyer   -> LAWYER_PRIVATE_KEY
transferCustody         -> Forensic -> FORENSIC_PRIVATE_KEY, else default (Police)
recordIntegrityCheck    -> getSignerKeyForRole(req.user.role): Forensic or Judge key
```
If no signing key is configured for the caller's role, the endpoint returns `403` before
attempting any transaction.

---

## 3. MongoDB Schemas (Mongoose)

### 3.1 `User`
| Field | Type | Constraints |
|---|---|---|
| `name` | String | required |
| `email` | String | required, unique, lowercase |
| `passwordHash` | String | required (bcrypt, 12 rounds) |
| `role` | String enum | `Police \| Forensic \| Lawyer \| Judge`, required |
| `walletAddress` | String | required, unique, lowercase |
| `createdAt` / `updatedAt` | Date | via `timestamps: true` |

Method: `comparePassword(password): Promise<boolean>` — bcrypt compare against `passwordHash`.

### 3.2 `Evidence`
| Field | Type | Constraints |
|---|---|---|
| `evidenceId` | Number | required, unique — mirrors on-chain ID |
| `caseId` | Number | required |
| `caseName` | String | required |
| `department` | String | required |
| `filename` | String | required |
| `ipfsCID` | String | required |
| `ipfsUrl` | String | required |
| `fileHash` | String | required, unique |
| `uploadedBy` | String | required, lowercase (wallet address) |
| `timestamp` | Number | required (unix seconds) |
| `status` | String enum | `Open \| Under Investigation \| Closed`, default `Under Investigation` |

### 3.3 `SupportingDoc`
| Field | Type | Constraints |
|---|---|---|
| `docId` | Number | required, unique |
| `evidenceId` | Number | required (parent link) |
| `docType` | String | required (e.g. `forensic_report`, `court_filing`) |
| `filename`, `ipfsCID`, `ipfsUrl`, `fileHash` | String | required (`fileHash` unique) |
| `uploadedBy` | String | required, lowercase |
| `timestamp` | Number | required |

---

## 4. REST API — Backend (Express, port 3000)

All endpoints except `/api/auth/*` require `Authorization: Bearer <JWT>`.

### Auth
| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| POST | `/api/auth/register` | none | `name, email, password, role, walletAddress` | `{ token, user }` |
| POST | `/api/auth/login` | none | `email, password` | `{ token, user }` |
| GET | `/api/auth/me` | any | — | `{ user }` |

### Evidence
| Method | Path | Role | Body/Params | Response |
|---|---|---|---|---|
| POST | `/api/evidence/upload` | Police | form-data: `file, caseId, caseName, department` | `{ evidenceId, ipfsCID, fileHash, txHash, ... }` |
| GET | `/api/evidence` | any | query: `page, limit` | paginated evidence list |
| GET | `/api/evidence/:id` | any | — | merged on-chain + Mongo record |
| GET | `/api/evidence/:id/history` | any | — | `CustodyRecord[]` |
| PATCH | `/api/evidence/:id/status` | Police | `{ status }` | updates status for every evidence sharing that `caseId` |

### Supporting Documents
| Method | Path | Role | Body/Params | Response |
|---|---|---|---|---|
| POST | `/api/supporting-docs/upload` | Forensic, Lawyer | form-data: `file, evidenceId, docType` | `{ docId, ipfsCID, fileHash, txHash, ... }` |
| GET | `/api/supporting-docs/:evidenceId` | any | — | merged on-chain + Mongo docs list |
| POST | `/api/supporting-docs/verify/:evidenceId` | Forensic, Judge | form-data: `file` | `{ passed, computedHash, onChainHash, txHash }` |
| POST | `/api/supporting-docs/verify-doc/:docId` | Forensic, Judge | form-data: `file` | `{ passed, computedHash, onChainHash, txHash }` |

### Custody
| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| POST | `/api/custody/transfer` | Police, Forensic | `{ evidenceId, newHolder }` | `{ txHash, newHolder }` |

### Seed (dev only)
| Method | Path | Notes |
|---|---|---|
| DELETE | `/api/seed/clear` | Clears `Evidence`/`SupportingDoc` collections; disabled when `NODE_ENV=production` |

---

## 5. REST + WebSocket API — AI Service (FastAPI, port 8000)

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/health` | none | — | `{ status, connectedClients }` |
| WS | `/ws` | none | — | Receives `{"type": "CONNECTED", ...}` on connect, then `{"type": "CROSS_CASE_ALERT", ...}` pushed on detection |
| POST | `/api/index` | Bearer | `{ evidenceId: string }` | `{ status, pointId, chunksIndexed }` |
| POST | `/api/index-supporting` | Bearer | `{ evidenceId: string }` | `{ indexed[], skipped[], totalIndexed, totalSkipped }` |
| POST | `/api/search` | Bearer | `{ query, top_k?, metadata_filters? }` | `{ results[], count }` |
| POST | `/api/cross-case-linkage` | Bearer | `{ evidenceId, top_k? }` | `{ sourceEvidenceId, threshold, linkedCases[], totalLinked }` |

### WebSocket message shape — `CROSS_CASE_ALERT`
```json
{
  "type": "CROSS_CASE_ALERT",
  "evidenceId": "27",
  "sourceCaseName": "C.C. No. 088/2025 — Drug Trafficking, Kaloor",
  "department": "narcotics",
  "linkedCases": [ { "evidenceId": "2", "caseId": "2", "caseName": "...", "similarityScore": 0.7952, "..." : "..." } ],
  "totalLinked": 1,
  "threshold": 0.72,
  "message": "Cross-case linkage detected! ..."
}
```

---

## 6. Algorithms

### 6.1 File Hashing
`SHA-256(fileBuffer) -> hex string`. Used identically at upload time and at every subsequent
integrity check — a match proves byte-for-byte identity with the originally registered file.

### 6.2 Document Extraction + Chunking
1. Detect format: `.docx` by extension or `PK` zip magic bytes; else assume PDF.
2. Extract body text separately from tables:
   - **PDF**: PyMuPDF `find_tables()` locates table bounding boxes; body text extraction excludes
     text blocks overlapping those boxes to avoid double-counting.
   - **DOCX**: `python-docx` paragraphs (excluding paragraphs inside table cells) for body text;
     `doc.tables` for structured table data, with merged-cell deduplication.
3. Serialize tables into a readable text block: `"[Table N, page P]\nHeaders: ...\nRow 1: k=v, ...`.
4. `combined = body_text + "\n\n" + serialized_tables` — this is what gets embedded, not raw text.
5. **Chunking**: split `combined` into windows of **200 words** with **32-word overlap**:
   ```
   start = 0
   while start < len(words):
       end = min(start + 200, len(words))
       chunk = words[start:end]
       if end == len(words): break
       start += 200 - 32   # i.e. advance by 168 words
   ```
   Overlap prevents losing context at chunk boundaries; each chunk is embedded and stored as a
   separate Qdrant point (`{point_id}-chunk-{i}`).

### 6.3 Semantic Search Ranking (`search.py`)
```
composite_score = 0.85 * semantic_similarity      # cosine, from Qdrant
                 + 0.10 * recency_score            # linear decay over 1 year
                 + 0.05 * metadata_match_score      # fraction of filter keys matching payload
```
- `recency_score = max(0, 1 - age_seconds / (365 * 24 * 3600))`, defaults to `0.5` if no timestamp.
- Query over-fetches `top_k * 3` raw hits before re-ranking, then deduplicates to the
  highest-scoring chunk per `evidenceId`, then truncates to `top_k`.
- Results below `SEMANTIC_THRESHOLD` (env-configurable, default `0.0`) are dropped after ranking.

### 6.4 Cross-Case Linkage (`cross_case.py`)
```
query_vector = embed(newly_extracted_text)
raw_hits = qdrant.search(query_vector, top_k * 5, score_threshold = SIMILARITY_THRESHOLD [0.72])
for hit in raw_hits (already sorted by score desc):
    skip if hit belongs to the same evidenceId as the source
    skip if hit belongs to the same caseId as the source
    skip if this caseId was already added (keep only the best-scoring chunk per case)
    else: add to linked[]
    stop once len(linked) == top_k
```
This is a stricter, threshold-gated, no-user-query variant of search — it compares one document's
full extracted text against everything else, automatically, right after indexing.

### 6.5 Qdrant Point ID Generation
```python
point_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, evidence_id_string))
```
Deterministic — re-indexing the same `evidence_id` (e.g. `"evidence-3"`, `"evidence-3-chunk-1"`)
always produces the same point ID, making re-indexing an idempotent **upsert**, not a duplicate
insert.

---

## 7. Operational Note — Cross-Store Consistency

Three data stores participate in Honora's state: the blockchain (evidence/custody/roles), MongoDB
(metadata/users), and Qdrant (vectors). Only the blockchain is ephemeral in local development
(Hardhat's in-memory chain resets on restart); MongoDB Atlas and Qdrant Cloud persist independently.

This means: after any local chain reset, MongoDB will contain evidence records referencing
`evidenceId`s that **no longer exist** on the fresh contract, and Qdrant will contain vectors for
evidence that no longer resolves via the backend. The corrective sequence is:
1. Redeploy the contract + reassign roles (`setup.ts`)
2. Reseed MongoDB against the fresh contract (`seed.ts` — clears and re-populates, live-indexing
   into Qdrant as it goes)
3. Run `reindex.py` as a consistency guarantee — it wipes and rebuilds the entire Qdrant collection
   from whatever is currently in MongoDB/chain, eliminating any stale points from a prior session

---

## 8. Environment Variables Reference

### `backend/.env`
| Variable | Purpose |
|---|---|
| `PINATA_JWT` | Pinata API auth for IPFS uploads |
| `RPC_URL` | Ethereum JSON-RPC endpoint (local Hardhat or Sepolia) |
| `CONTRACT_ADDRESS` | Deployed `EvidenceRegistry` address |
| `PRIVATE_KEY` | Default (Police) signer wallet |
| `FORENSIC_PRIVATE_KEY` / `LAWYER_PRIVATE_KEY` / `JUDGE_PRIVATE_KEY` | Role-specific signer wallets |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | JWT signing config — **must match the AI service's `JWT_SECRET`** |
| `AI_SERVICE_URL` | Where the backend sends indexing notifications |
| `CORS_ORIGINS` | Allowed frontend origins |

### `ailayer-querying/.env`
| Variable | Purpose |
|---|---|
| `EMS_BACKEND_URL` | Where the AI service fetches merged evidence/doc data |
| `JWT_SECRET` / `JWT_ALGORITHM` | Must match backend's `JWT_SECRET` for token validation |
| `QDRANT_URL` / `QDRANT_API_KEY` | Qdrant Cloud connection |
| `COLLECTION_NAME` | Qdrant collection name (`evidence_vectors`) |
| `SIMILARITY_THRESHOLD` | Cross-case linkage cutoff (default `0.72`) |
| `SEMANTIC_THRESHOLD` | Search result cutoff (default `0.0`) |
| `CROSS_CASE_MAX_RESULTS` | Max linked cases returned |
| `LOGIN_EMAIL` / `LOGIN_PASSWORD` | Optional — lets `reindex.py` skip interactive login prompts |

### Root `.env` (Sepolia deployment only)
| Variable | Purpose |
|---|---|
| `SEPOLIA_RPC_URL` | Alchemy (or similar) Sepolia RPC endpoint |
| `SEPOLIA_PRIVATE_KEY` | Deployer wallet for Sepolia deployment |
