# Master Prompt: Portfolio/Resume Feature — "Honora" Project

> **How to use this file:** Copy everything below the line into Claude CoWork as your prompt/brief
> for building the "Honora" project entry on your resume and portfolio website. It contains the
> full factual context Claude CoWork needs — you should not need to re-explain the project.

---

## MASTER PROMPT (copy from here)

I'm building my personal resume/portfolio website and need your help writing and designing the
project showcase for my most significant project, **Honora — a Blockchain-Based Evidence
Management System**. Below is the complete factual brief. Use it to write portfolio copy (project
summary, bullet points for different lengths, a resume-ready one-liner, and a detailed case-study
page), and to help design how this project should be presented visually and structurally on the
site. Do not invent features, metrics, or claims that aren't in this brief — ask me if something
is unclear rather than guessing.

### My role

I am **Adwaith R Nair**, and on this project I owned **Blockchain + Backend + Testing**:
- Designed and implemented the Solidity smart contract (`EvidenceRegistry.sol`) end to end,
  including its role-based access control, custody-chain logic, and custom-error-based reverts.
- Built the entire Node.js/Express/TypeScript backend: REST API, JWT authentication, MongoDB
  schemas, IPFS integration, the SHA-256 integrity pipeline, and the blockchain-signing layer
  (including the role-specific signer wallet selection logic).
- Deployed and verified the contract on both a local Hardhat chain and the public Ethereum Sepolia
  testnet.
- Led testing efforts across the stack.

This was a 4-person team project (university-level, aimed as a portfolio/conference-caliber
build): I did Blockchain + Backend + Testing; a teammate (Diya) did the AI layer (FastAPI + Qdrant
+ sentence-transformers) + documentation; another teammate (Abhijith A) did frontend + testing; a
third teammate (Meghna) did cross-case linkage + frontend + documentation. **When writing my
portfolio copy, attribute credit accurately — describe the system as a whole where useful for
context, but be explicit that my personal contribution was the blockchain and backend layers, not
the AI layer or frontend.**

### One-line pitch

A secure, tamper-proof evidence management system for law enforcement: evidence files are stored
on IPFS, integrity-critical metadata (hash, custody chain, roles) is anchored immutably on the
Ethereum blockchain, and an AI-powered semantic search layer automatically surfaces hidden
connections between cases.

### The problem it solves

Traditional evidence handling (paper logs, spreadsheets, centralized databases) has four
structural weaknesses:
1. **Tamperability** — centralized records can be altered after the fact with no independent proof.
2. **Opacity** — chain-of-custody is siloed across police, forensic labs, lawyers, and courts.
3. **No independent verification** — no cryptographic guarantee a file in court is the exact
   original; verification today relies on procedural trust, not mathematical proof.
4. **Disconnected cases** — investigators have no automated way to discover that evidence in one
   case is related to another.

Honora addresses all four using blockchain immutability, cryptographic hashing, and AI-driven
semantic similarity search.

### System architecture (4 independent layers)

```
Client Layer:      React 18 + Vite frontend — 4 role-based dashboards (Police, Forensic, Lawyer, Judge)
Backend Layer:     Node.js + Express + TypeScript — REST API, JWT auth, blockchain orchestration  [MY WORK]
AI Layer:          FastAPI + sentence-transformers + Qdrant — semantic search & cross-case linkage
Blockchain:        Solidity smart contract on Hardhat (local) / Ethereum Sepolia (public testnet)  [MY WORK]
Storage:           IPFS (via Pinata) for files, MongoDB Atlas for off-chain metadata
```

**Design principle worth highlighting in a case study:** this is a deliberately *layered,
service-oriented* system — no layer reaches directly into another layer's storage. The AI layer's
availability is decoupled from core operations entirely (fire-and-forget indexing), so evidence
upload, custody transfer, and integrity verification never depend on a "nice-to-have" service being
up. This is a genuine engineering decision I made, not an accident of the stack.

### Core evidence upload flow (my end of the system)

1. Police officer uploads a file via the dashboard.
2. Backend (Express, multer) receives it.
3. Generates a SHA-256 hash of the file.
4. Checks the on-chain hash registry for duplicates — rejects if the hash already exists.
5. Uploads the file to IPFS via Pinata → gets back a content identifier (CID).
6. Registers the evidence on-chain (evidence ID, case ID, CID, hash, uploader) → gets a transaction
   hash.
7. Saves enriched metadata (case name, department, filename, status) to MongoDB.
8. Fires an async, non-blocking indexing call to the AI service for semantic search.
9. Returns the evidence ID, IPFS CID, file hash, and transaction hash to the client.

Only the hash and CID are ever written on-chain — raw file bytes never touch the blockchain, which
keeps gas costs low and predictable regardless of file size.

### Smart contract design (`EvidenceRegistry.sol` — my work)

- **Solidity 0.8.24**, deployed via **Hardhat v3**, interacted with via **ethers.js v6**.
- **Role enum**: `None, Police, Forensic, Lawyer, Judge` — an on-chain mapping (`userRoles`) is the
  *authoritative* source of access control, not just an application-layer concept.
- **Key functions**: `addEvidence` (Police-only), `addSupportingDoc` (Forensic/Lawyer),
  `transferCustody` (current holder only, Police/Forensic), `recordIntegrityCheck`
  (Forensic/Judge), `assignRole`/`revokeRole` (contract owner only), plus view functions
  (`getEvidence`, `getCustodyHistory`, `getSupportingDocs`, `isFileHashRegistered`).
- **Custom errors** (gas-efficient reverts): `NotOwner`, `NotAuthorized`, `InsufficientRole`,
  `EvidenceNotFound`, `NotCurrentHolder`, `InvalidAddress`, `EmptyField`, `DuplicateFileHash`.
- **Immutable custody chain**: every custody transfer appends a new record (`from`, `to`,
  `timestamp`) — nothing is ever edited or deleted, only appended.
- **Duplicate detection**: a global `fileHashExists` mapping shared across evidence and supporting
  documents prevents the same file from being registered twice.
- **Full event emission** for every state change (`EvidenceAdded`, `CustodyTransferred`,
  `SupportingDocAdded`, `RoleAssigned`, `RoleRevoked`, `IntegrityVerified`) — this is what makes the
  chain-of-custody publicly and independently auditable on Etherscan, not just internally
  consistent.

### Backend design (Node.js/Express/TypeScript — my work)

- **Two-layer RBAC**: role is checked once fast in Express middleware (friendly 403, no gas spent),
  and again authoritatively by Solidity modifiers — the API layer can never be the sole point of
  enforcement. A bug or bypass at the API layer still cannot let an unauthorized wallet act
  on-chain. This dual-layer design is one of the most interview-worthy decisions in the whole
  project.
- **Role-specific signer wallets**: because the contract's access control is based on
  `msg.sender`, the backend must sign each transaction using a private key matching the *caller's
  actual on-chain role* (Police/Forensic/Lawyer/Judge each have their own configured signing key),
  not one shared admin key. If no signing key is configured for a role, the endpoint fails closed
  with a 403 before any transaction is attempted.
- **JWT (HS256) authentication + bcrypt (12 rounds)** password hashing; stateless auth, no session
  store.
- **MongoDB (Mongoose)** for off-chain metadata — case name, department, filename, status, user
  accounts. Every read endpoint treats on-chain data as the source of truth and merges MongoDB
  fields on top; MongoDB is never authoritative for anything security- or integrity-related.
- **IPFS integration via Pinata** for decentralized file storage — no self-hosted IPFS node needed.
- **SHA-256 integrity verification**: any evidence file's hash can be independently recomputed at
  any time and compared against the immutable on-chain record — this is the actual tamper-detection
  mechanism, not just a procedural claim.
- Clean layered structure: `config/ → models/ → middleware/ → services/ → controllers/ → routes/`.

### Deployment

- Contract deployed and **verified on Ethereum Sepolia testnet** (public, independently auditable),
  in addition to a local Hardhat network used for fast, zero-cost local development/demo.
- Live contract address: `0xf4e1c0179acC2A54C195e8687621ee070be06B3C` (chain ID 11155111) —
  publicly viewable on Etherscan. *(Only mention the address itself if the portfolio format calls
  for it — e.g. a "View on Etherscan" link — since it's already public information.)*

### The other layers (built by teammates — context only, not my personal work to claim)

- **AI layer** (FastAPI + `sentence-transformers` `all-MiniLM-L6-v2` + Qdrant Cloud, 384-dim cosine
  similarity): semantic search across evidence, multi-factor ranking (semantic similarity 0.85 +
  recency 0.10 + metadata match 0.05), and automatic cross-case linkage detection (configurable
  similarity threshold, default 0.72) with real-time WebSocket alerts when new evidence matches an
  existing, different case.
- **Frontend** (React 18 + Vite + React Router 6): four distinct role-based dashboards, a dark
  theme with gold accents and glassmorphism, chain-of-custody timeline visualization, and a global
  AI semantic search bar.

### Tech stack (full list, for a skills/stack summary)

Solidity 0.8.24 · Hardhat v3 · ethers.js v6 · Node.js v22 · Express · TypeScript (ESM) · JWT
(HS256) · bcrypt · MongoDB Atlas (Mongoose) · IPFS (Pinata) · SHA-256 · FastAPI ·
sentence-transformers · Qdrant Cloud · PyMuPDF · python-docx · React 18.2 · Vite 5 · React Router 6
· WebSocket

### Honest scope boundaries (do not overstate these in copy)

- This is a **university/portfolio-caliber project**, not a production law-enforcement deployment
  — position it as a well-engineered proof of concept with genuine architectural rigor, not a
  claim of real-world adoption.
- Known, openly-documented limitations: a single deployer wallet currently has unilateral
  role-assignment power (no multi-sig yet — this is on the project's own forward roadmap, not
  hidden); role-specific signer wallets are shared per-role rather than per-individual-user
  on-chain; the AI layer only indexes text-extractable formats (PDF/DOCX), not images; there is no
  CI/CD pipeline or automated test suite yet (also on the roadmap).
- All 7 originally planned phases (core evidence management, RBAC/auth, metadata enrichment,
  testnet deployment, AI layer, frontend, documentation) are complete and demonstrated end-to-end.
- There is a forward-looking ~3-month roadmap (DevOps/CI, blockchain hardening with multi-sig
  ownership and Etherscan verification, AI layer expansion with OCR, legal-framework mapping, and a
  benchmarking/demo-polish pass) — mention this only if the portfolio format wants to show
  forward-thinking/roadmap planning, not as something already built.

### What I'd like your help with

1. **A resume bullet set** (3–4 lines, action-verb-led, quantify where the facts above allow it —
   e.g. "designed and deployed," "implemented dual-layer RBAC spanning application and smart
   contract layers") sized for a one-page resume's project/experience section.
2. **A portfolio card summary** (2–3 sentences) for a project grid/list view.
3. **A detailed case-study page** structured as: Problem → My Role & Approach → Architecture →
   Key Technical Decisions (lead with the dual-layer RBAC and fire-and-forget AI decoupling — these
   are the most senior-engineer-signaling choices) → Tech Stack → Outcome/Status → (optional) What
   I'd Do Next, drawing on the roadmap above.
4. Suggestions for what visuals would strengthen this project's page (e.g. an architecture diagram,
   the evidence-upload sequence, a screenshot of a role dashboard) — I can supply screenshots or a
   diagram separately if you tell me what would help most.

Ask me clarifying questions if you need to know more about the resume's overall format, the
portfolio site's tech stack, or my target audience (e.g. blockchain-focused roles vs. general
backend/full-stack roles) before writing final copy.

---

## END MASTER PROMPT

## Notes for you (not part of the prompt to paste)

- I pulled every fact above directly from this repo's own `README.md`, `docs/PRD.md`,
  `docs/ARCHITECTURE.md`, and `docs/LLD.md` — nothing here is invented.
- I deliberately kept teammates' work (AI layer, frontend) described as system context rather than
  something to claim as your personal contribution, per the team-responsibility table in the
  README/PRD. Adjust this framing only if you want to intentionally claim broader scope.
- I left the live Sepolia contract address in as optional context (it's already public on
  Etherscan) — drop it from the prompt if you'd rather keep the portfolio copy address-free.
- Not included here on purpose: the leaked Sepolia private key mentioned in `docs/ARCHITECTURE.md`
  §7 / `docs/ROADMAP.md` Phase 8. That's an internal security note for this codebase, not portfolio
  material — make sure it's rotated before this project is publicly showcased with a live demo
  link, but it doesn't belong in resume copy either way.
