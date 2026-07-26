# Honora — Codebase Walkthrough Script

A presentation script for explaining the codebase end-to-end: what each file does and the exact
call path data takes through the system. Organized as a live narration — read it in order.

---

## 1. The 30-second pitch

"Honora has four layers. A **Solidity smart contract** is the single source of truth for evidence
existence, chain of custody, and roles — it's deployed on Ethereum Sepolia and can't be altered.
The actual evidence *files* never touch the blockchain — they go to **IPFS** (via Pinata), and only
the file's SHA-256 hash and IPFS CID (content address) get written on-chain. A **Node/Express
backend** sits between the frontend and both the chain and IPFS, and also owns a MongoDB database
for rich metadata that would be too expensive to store on-chain. A separate **FastAPI AI service**
independently indexes every uploaded document into a vector database (Qdrant) so investigators can
search evidence by meaning, not just keywords, and get notified when new evidence looks similar to
an existing case."

---

## 2. The four layers and their one job each

| Layer | Tech | Job | Talks to |
|---|---|---|---|
| Smart contract | Solidity 0.8.24 | Immutable ledger: evidence existence, custody chain, roles | Backend only (via ethers.js) |
| Backend | Express + TypeScript (ESM) | Auth, RBAC gate, orchestrates chain+IPFS+Mongo, exposes REST API | Frontend, blockchain, IPFS, MongoDB, AI service |
| AI service | FastAPI (Python) | Extract text, embed, semantic search, cross-case linkage, WebSocket alerts | Backend (pulls files via backend API), Qdrant Cloud |
| Frontend | React + Vite | Role-based dashboards, calls backend + AI service directly | Backend (3000), AI service (8000) |

---

## 3. Flow #1 — Evidence Upload (the flagship flow, touches every layer)

This is the flow to demo live. Walk through it file-by-file in this exact order.

**Trigger:** Police user fills the upload form in
[`UploadEvidenceModal.jsx`](Honora--Frontend/src/components/police/UploadEvidenceModal.jsx) and submits.

1. **Frontend → Backend.** The modal builds a `FormData` (`file`, `caseId`, `caseName`,
   `department`) and calls `createCase()` / `uploadEvidence()` in
   [`api.js`](Honora--Frontend/src/services/api.js#L78). The API client attaches the JWT from
   `localStorage` (`honora_token`) as `Authorization: Bearer <token>` and POSTs to
   `/api/evidence/upload`.

2. **Route + middleware chain.**
   [`evidence.routes.ts`](backend/src/routes/evidence.routes.ts#L16) wires the request through
   three middlewares in order before it ever reaches business logic:
   - `authenticateJWT` ([`auth.middleware.ts`](backend/src/middleware/auth.middleware.ts)) — verifies
     the JWT signature against `JWT_SECRET`, decodes it, attaches the payload to `req.user`.
   - `requireRole("Police")` ([`role.middleware.ts`](backend/src/middleware/role.middleware.ts)) —
     checks `req.user.role === "Police"`, else 403.
   - `handleUpload` ([`upload.middleware.ts`](backend/src/middleware/upload.middleware.ts)) — Multer
     parses the multipart form into memory (never touches disk), gives the controller
     `req.file.buffer`.

3. **Controller orchestrates everything** —
   [`uploadEvidence()` in evidence.controller.ts](backend/src/controllers/evidence.controller.ts#L24):
   - **Hash**: `generateFileHash(buffer)` in
     [`hash.service.ts`](backend/src/services/hash.service.ts) — SHA-256 over the raw bytes.
   - **Dedup check**: `isFileHashRegistered(fileHash)` calls the contract's view function of the
     same name — if the hash already exists on-chain, reject with 409 before spending any gas or
     IPFS storage.
   - **IPFS upload**: `uploadToIPFS(buffer, filename)` in
     [`pinata.service.ts`](backend/src/services/pinata.service.ts) — wraps the buffer in a `File`
     object, calls Pinata's SDK, returns a CID. The file now lives at
     `https://gateway.pinata.cloud/ipfs/<CID>`.
   - **On-chain registration**: `addEvidence(caseId, ipfsCID, fileHash)` in
     [`contract.service.ts`](backend/src/services/contract.service.ts#L75) — signs and sends the
     `addEvidence` transaction using the backend's default signer wallet (`PRIVATE_KEY` env, which
     is provisioned as the "Police" role on-chain), awaits the receipt.
   - **Solidity side** ([`EvidenceRegistry.sol`](contracts/EvidenceRegistry.sol#L199)): the
     `onlyPolice` modifier checks `userRoles[msg.sender] == Role.Police`; increments
     `evidenceCount`; writes the `Evidence` struct (id, caseId, CID, hash, uploader, timestamp,
     currentHolder = uploader); pushes the first `CustodyRecord` (`from: address(0)`, `to:
     msg.sender`); marks the hash as seen in `fileHashExists`; emits `EvidenceAdded`.
   - **Mongo enrichment**: back in the controller, `Evidence.create({...})` in
     [`evidence.model.ts`](backend/src/models/evidence.model.ts) stores `caseName`, `department`,
     `filename`, `status` — everything the Solidity struct deliberately *doesn't* store, because
     writing strings to chain storage is expensive. This is why every "get evidence" read later has
     to **merge** on-chain + Mongo data.
   - **Fire-and-forget AI indexing**: a `fetch()` to `${AI_SERVICE_URL}/api/index` with the new
     `evidenceId`, wrapped in try/catch so a down AI service never fails the upload.

4. **AI service takes over** —
   [`index_evidence()` in main.py](ailayer-querying/main.py#L236):
   - Calls back into the **backend's own** `/api/evidence/:id` endpoint to fetch the merged
     record (this is why the AI service needs `EMS_BACKEND_URL` and a bearer token — it's a client
     of the backend, not a peer with direct DB access).
   - Downloads the file bytes straight from the `ipfsUrl`.
   - **Extraction**: `extract_full()` in
     [`preprocessing.py`](ailayer-querying/preprocessing.py#L253) auto-detects PDF vs DOCX (by
     extension or the `PK` zip magic bytes), pulls body text and tables separately (PyMuPDF
     `find_tables()` for PDF, `python-docx` table objects for DOCX), serializes tables into a
     readable `"Row 1: Header=Value, ..."` text block, and returns `.combined` — text + serialized
     tables, ready to embed.
   - **Chunking**: `chunk_text()` splits `.combined` into 200-word windows with 32-word overlap —
     long forensic reports don't get squashed into one lossy embedding.
   - **Embedding**: `embed_text()` in
     [`embeddings.py`](ailayer-querying/embeddings.py) runs each chunk through
     `all-MiniLM-L6-v2` → 384-dim vector.
   - **Storage**: `upsert_evidence()` in
     [`vector_store.py`](ailayer-querying/vector_store.py#L41) writes each chunk's vector + payload
     (caseId, caseName, department, evidenceName, fileUrl, uploader, timestamp...) into Qdrant, one
     point per chunk (`evidence-{id}-chunk-{i}`).

5. **Automatic cross-case check** — still inside `index_evidence()`: once indexed, it immediately
   calls `find_linked_cases()` in
   [`cross_case.py`](ailayer-querying/cross_case.py#L22) using the newly extracted text as the
   query. This embeds the text again, searches Qdrant for anything above the 0.72 cosine
   similarity threshold, excludes the source case/evidence itself, and dedupes to one hit per
   case. If anything comes back, `main.py`'s `ConnectionManager.broadcast()` pushes a
   `CROSS_CASE_ALERT` JSON message to every open WebSocket connection.

6. **Frontend receives the alert live** —
   [`CrossCasePopup.jsx`](Honora--Frontend/src/components/common/CrossCasePopup.jsx) holds a
   persistent WebSocket to `ws://localhost:8000/ws` (opened once on login, auto-reconnects on
   drop). It's mounted once at the top of the app in
   [`App.jsx`](Honora--Frontend/App.jsx#L41) so it's alive on every page, for every role. On
   `CROSS_CASE_ALERT` it renders a dismissible gold popup with the linked cases and their
   similarity scores; clicking one navigates straight to that case's detail page.

7. **Response back to the uploader**: the controller returns `evidenceId`, `caseId`, `ipfsCID`,
   `fileHash`, `txHash`, `ipfsUrl` — `PoliceDashboard.jsx` uses this to prepend the new case to its
   local state without a full refetch.

---

## 4. Flow #2 — Auth (register / login)

1. `LoginModal.jsx` (or the sign-up form) calls `login()`/`signup()` in `api.js` →
   `/api/auth/login` or `/api/auth/register`.
2. [`auth.controller.ts`](backend/src/controllers/auth.controller.ts) validates required fields
   and role enum, then delegates to
   [`auth.service.ts`](backend/src/services/auth.service.ts):
   - **Register**: checks email + wallet address aren't already taken, hashes the password with
     bcrypt (12 salt rounds), creates the `User` document, signs a JWT (`userId`, `email`, `role`,
     `walletAddress`) with `JWT_SECRET`.
   - **Login**: looks up by email, `user.comparePassword()` (a method on the Mongoose schema in
     [`user.model.ts`](backend/src/models/user.model.ts#L56)) does the bcrypt compare, signs the
     same JWT shape.
3. Frontend's [`useAuth.jsx`](Honora--Frontend/src/components/common/useAuth.jsx) — a React
   context — stores the token + user object in both React state and `localStorage`
   (`honora_token`, `honora_user`), so a page refresh doesn't log you out.
4. [`ProtectedRoute.jsx`](Honora--Frontend/src/components/common/ProtectedRoute.jsx) wraps every
   dashboard route in `App.jsx`: no token → redirect to `/role`; token but wrong role → redirect to
   *that user's own* dashboard (not a blank error page).

**Important nuance to call out**: role lives in **two independent places** — the JWT/MongoDB role
(used purely for backend route gating and pretty 403 messages) and the on-chain `userRoles` mapping
(the actual authority — enforced by Solidity modifiers like `onlyPolice`). They're kept in sync
manually: `scripts/setup.ts` assigns on-chain roles to specific wallet addresses, and whoever
registers in MongoDB with that same `walletAddress` gets the matching JWT role. If they ever
disagree (e.g. someone registers with the wrong wallet address), the backend would accept the
request past its own role check but the transaction would revert on-chain with `NotAuthorized`.
This two-layer design is deliberate defense-in-depth: the backend layer returns a fast, friendly
403 without spending gas; the contract layer is the actual immutable source of truth.

---

## 5. Flow #3 — Supporting docs + integrity verification

- **Upload** (Forensic/Lawyer): same shape as evidence upload but hits
  `/api/supporting-docs/upload` →
  [`supportingDoc.controller.ts`](backend/src/controllers/supportingDoc.controller.ts#L28). One
  key difference: `addSupportingDoc()` in `contract.service.ts` must sign the transaction with a
  **role-specific wallet** (`FORENSIC_PRIVATE_KEY` / `LAWYER_PRIVATE_KEY`), not the default one,
  because the Solidity `onlyForensicOrLawyer` modifier checks `msg.sender`'s on-chain role — the
  backend can't forge that, so it keeps one signer per role in `.env` and picks the right one via
  `getSignerKeyForRole(req.user.role)`.
- **Integrity check** (Forensic/Judge): `verifyEvidenceIntegrity()` — user re-uploads a file, the
  controller recomputes its SHA-256 and compares it to the hash already on-chain
  (`getEvidence(evidenceId).fileHash`). Match or mismatch, it calls `recordIntegrityCheck()` which
  emits an `IntegrityVerified` event on-chain either way — even a *failed* check is permanently
  logged, which is the point (tamper evidence is itself evidence).

---

## 6. Flow #4 — Custody transfer

[`custody.controller.ts`](backend/src/controllers/custody.controller.ts) → `transferCustody()` in
`contract.service.ts`. The contract enforces `evidence.currentHolder == msg.sender` — you can only
hand off evidence you currently hold. The backend again picks the signer wallet matching
`req.user.role` (Police default, or the Forensic key) so `msg.sender` on-chain actually matches
whoever the record says currently holds it. Every transfer appends a new `CustodyRecord` — this
array, read via `getCustodyHistory()`, is what renders the chain-of-custody timeline in
`CaseDetails.jsx`/the Judge dashboard.

---

## 7. Flow #5 — Semantic search (user-initiated)

1. [`SearchBar.jsx`](Honora--Frontend/src/components/common/SearchBar.jsx) — any role, top nav —
   calls `searchEvidence(query, topK)` in `api.js` → POST `/api/search` on the **AI service**
   directly (not through the Express backend at all — port 8000).
2. [`semantic_search()` in search.py](ailayer-querying/search.py#L81): embeds the query, over-fetches
   `top_k * 3` raw hits from Qdrant, then re-ranks with a weighted composite score:
   `0.85 × semantic similarity + 0.10 × recency + 0.05 × metadata filter match`. Recency decays
   linearly over a 1-year window; metadata score is 1.0 only if every filter key you passed matches
   the payload. Results are deduped to one (best) chunk per evidence, then sliced to `top_k`.
3. Frontend renders each hit as a card with composite score, case name, department, doc type, and a
   direct link to the IPFS file; clicking navigates to that case in the *current user's* role
   dashboard.

---

## 8. File reference glossary

### Smart contract
| File | What it holds |
|---|---|
| `contracts/EvidenceRegistry.sol` | `Evidence`, `CustodyRecord`, `SupportingDoc` structs; `Role` enum; all RBAC modifiers; every state-changing + view function |

### Backend (`backend/src/`)
| File | Responsibility |
|---|---|
| `app.ts` | Express app assembly, CORS, route mounting, Mongo connect + listen |
| `config/env.ts` | Loads and validates every required env var once at boot (fails fast if missing) |
| `config/db.ts` | Mongoose connection to MongoDB Atlas |
| `models/user.model.ts` | User schema + bcrypt password compare method |
| `models/evidence.model.ts` | `Evidence` + `SupportingDoc` Mongoose schemas (the off-chain metadata half) |
| `middleware/auth.middleware.ts` | JWT verify, attaches `req.user` |
| `middleware/role.middleware.ts` | `requireRole(...)` factory — 403 if role not allowed |
| `middleware/upload.middleware.ts` | Multer in-memory file parsing |
| `services/contract.service.ts` | Every ethers.js call to the contract; owns the ABI load, role-signer selection |
| `services/hash.service.ts` | SHA-256 of a buffer |
| `services/pinata.service.ts` | IPFS upload via Pinata SDK |
| `services/auth.service.ts` | Register/login business logic + JWT signing |
| `controllers/*.controller.ts` | Request handlers — validation, orchestration, response shaping |
| `routes/*.routes.ts` | Wires URL + method + middleware chain + controller together |
| `routes/seed.routes.ts` | Dev-only `DELETE /api/seed/clear` (disabled in production) |

### AI service (`ailayer-querying/`)
| File | Responsibility |
|---|---|
| `main.py` | FastAPI app, all HTTP + WebSocket routes, JWT decode for RBAC context, ties everything else together |
| `embeddings.py` | Loads `all-MiniLM-L6-v2` once (module-level singleton), exposes `embed_text`/`embed_batch` |
| `vector_store.py` | Qdrant client singleton, collection creation, upsert, similarity search |
| `search.py` | Multi-factor re-ranking for user-facing semantic search |
| `cross_case.py` | Similarity search restricted to *other* cases, above a stricter threshold, for linkage alerts |
| `preprocessing.py` | PDF/DOCX text + table extraction, cleaning, chunking |
| `reindex.py` | Standalone script: wipes + rebuilds the entire Qdrant collection from whatever's currently in the backend/Mongo |

### Frontend (`Honora--Frontend/`)
| File | Responsibility |
|---|---|
| `App.jsx` | Router, global providers (`AuthProvider`), routes per role, mounts `CrossCasePopup` + `Navbar` globally |
| `src/services/api.js` | Single fetch wrapper for both backend (3000) and AI service (8000); attaches JWT automatically |
| `src/components/common/useAuth.jsx` | Auth React context — login/signup/logout, localStorage persistence |
| `src/components/common/ProtectedRoute.jsx` | Route guard — auth + role check with smart redirects |
| `src/components/common/SearchBar.jsx` | Semantic search UI |
| `src/components/common/CrossCasePopup.jsx` | Persistent WebSocket listener + alert UI |
| `src/components/{police,forensic,lawyer,judge}/*` | One dashboard + case-detail + upload-modal set per role, each calling the same `api.js` functions but gating which actions are shown per RBAC table |

### Scripts (`scripts/`)
| File | Responsibility |
|---|---|
| `setup.ts` | One-shot local dev bootstrap: deploy contract + assign all 4 roles to Hardhat accounts #1–4 |
| `deploy.ts` / `deploy-sepolia.ts` | Plain deploy, local vs. testnet |
| `assignRole.ts` / `authorize.ts` | Standalone role assignment outside of `setup.ts` |
| `seed.ts` | Registers test users + bulk-uploads everything under `test-data/` through the real HTTP API (not direct DB writes — it exercises the full stack, same as a real user would) |

---

## 9. Likely questions and short answers

- **"Why isn't the file itself on the blockchain?"** — Gas cost. Storing bytes on-chain is
  extremely expensive; IPFS is built for content-addressed file storage, and a CID is just a short
  string, cheap to store on-chain as the tamper-proof pointer.
- **"What actually makes this tamper-proof?"** — The SHA-256 hash written on-chain at upload time.
  Anyone can recompute the hash of a file and compare it to the immutable on-chain value — if
  they differ, the file was altered. That's the entire integrity-verification feature.
- **"What happens if the AI service is down during upload?"** — Nothing breaks. The indexing call
  is wrapped in try/catch in `evidence.controller.ts` and only logged, never thrown — evidence
  upload (the legally important part) is fully independent of the AI layer (the convenience
  layer).
- **"Why two RBAC systems (JWT role + on-chain role)?"** — See section 4's nuance above: backend
  role is UX (fast 403s), contract role is the actual enforcement layer.
- **"How does cross-case linkage differ from search?"** — Same underlying vector search, different
  question and threshold: search asks "what matches this **user's typed query**" (weighted,
  0.0 default threshold, ranked by composite score); cross-case linkage asks "what matches **this
  specific document's full text**, excluding its own case" (raw cosine only, hard 0.72 threshold,
  automatic — not user-initiated).
