# Honora — Product Requirements Document (PRD)

| | |
|---|---|
| **Product** | Honora — Blockchain-Based Evidence Management System |
| **Document type** | Product Requirements Document |
| **Status** | Reflects what is built (Phases 1–7 complete). Future-phase requirements to be appended after next-phase planning. |
| **Team** | Adwaith R Nair (Blockchain + Backend + Testing), Diya (AI Layer + Documentation), Abhi (Frontend + Testing), Meghna (Cross-Case Linkage + Frontend + Documentation) |

---

## 1. Purpose

This document defines what Honora is for, who it is for, and what it must do. It is the reference
point that `ARCHITECTURE.md`, `HLD.md`, and `LLD.md` implement — those documents describe *how*
Honora meets the requirements set out here.

---

## 2. Problem Statement

Physical and digital evidence handling in law enforcement today typically relies on paper logs,
spreadsheets, or centralized databases to track chain of custody. This creates several problems:

- **Tamperability**: Centralized records can be altered after the fact, with no independent way to
  prove they weren't.
- **Opacity**: Chain-of-custody history is often siloed across departments (police, forensic labs,
  legal counsel, courts), making it hard to produce a single, trustworthy timeline for court
  proceedings.
- **No independent verification**: There is no cryptographic guarantee that an evidence file
  presented in court is the exact same file originally collected — verification usually relies on
  procedural trust, not mathematical proof.
- **Disconnected cases**: Investigators have no automated way to discover that evidence in one case
  might be related to another (same method, same suspect pattern, same location type) unless
  someone manually remembers or cross-references.

## 3. Goals & Objectives

1. Make evidence records **immutable** once registered — no silent edits, no deletion.
2. Make the **full chain of custody** independently and publicly verifiable.
3. Make **file tampering mathematically detectable** (not just procedurally discouraged).
4. Enforce **role-based access** so only authorized personnel can perform specific actions,
   provably (not just via application-level trust).
5. Reduce **storage cost and centralization risk** for evidence files themselves.
6. Surface **hidden connections between cases** automatically, without requiring investigators to
   manually search.
7. Give each stakeholder role (Police, Forensic, Lawyer, Judge) a **purpose-built interface** for
   the actions they're actually authorized and likely to perform.

## 4. Scope

### In scope (built, Phases 1–7)
- Smart-contract-backed evidence registration, custody transfer, and integrity-check logging
- Role-based access control enforced both at the application layer and the smart-contract layer
- IPFS-based decentralized file storage with on-chain content-addressing
- SHA-256 based file integrity verification
- JWT-based authentication and MongoDB-backed user/metadata management
- AI-powered semantic search across evidence and supporting documents
- Automatic cross-case linkage detection with real-time notification
- Four role-specific web dashboards (Police, Forensic, Lawyer, Judge)
- Local development environment and a public Ethereum Sepolia testnet deployment

### Out of scope (not built; candidates for future phases, not detailed here)
- Mobile/field-capture applications
- OCR or visual similarity search over image evidence (current AI layer only indexes PDF/DOCX)
- Zero-knowledge selective disclosure
- Permissioned/consortium blockchain deployment
- Multi-signature governance for the owner role
- Automated compliance/court-report generation
- CI/CD pipeline and automated test suite

(Future-phase scope will be documented separately once prioritized.)

---

## 5. Target Users / Personas

### 5.1 Police Officer
- **Goals**: Register newly collected evidence quickly and reliably; keep case status up to date;
  hand off evidence to Forensic teams when needed.
- **Pain points today**: Manual paper trails that are easy to lose, alter, or dispute in court.
- **Honora capability**: Upload evidence (auto-hashed, auto-registered on-chain, auto-stored on
  IPFS); update case status; initiate custody transfers.

### 5.2 Forensic Analyst
- **Goals**: Attach analysis reports to existing evidence; verify that evidence hasn't been
  tampered with before analyzing it; receive custody when handed off.
- **Honora capability**: Upload forensic reports as supporting documents; run integrity
  verification (recompute hash, compare to on-chain record); accept/initiate custody transfers.

### 5.3 Lawyer (Legal Counsel)
- **Goals**: Attach case filings and legal documentation; review evidence and its custody history
  in preparation for court.
- **Honora capability**: Upload court filings as supporting documents; view evidence and full
  custody timelines.

### 5.4 Judge
- **Goals**: Independently verify evidence integrity and review the complete chain of custody
  before ruling on admissibility.
- **Honora capability**: View evidence, full custody history, and all supporting documents; run
  integrity verification independently of the parties involved in the case.

---

## 6. Functional Requirements

Organized by the phases actually delivered.

### Phase 1 — Core Evidence Management
- FR-1.1: System shall generate a SHA-256 hash of every uploaded evidence file.
- FR-1.2: System shall reject any upload whose hash already exists on-chain (duplicate detection).
- FR-1.3: System shall store the evidence file on IPFS and record only the resulting CID and hash
  on-chain.
- FR-1.4: System shall record an immutable custody entry at evidence creation time (`from: none`,
  `to: uploader`).
- FR-1.5: System shall allow transferring custody to a new holder, recorded as a new immutable
  entry, only by the current holder.
- FR-1.6: System shall expose full evidence metadata and full custody history via read APIs.

### Phase 2 — RBAC + Authentication
- FR-2.1: System shall support registration and login via email/password, issuing a signed JWT.
- FR-2.2: System shall enforce one of four roles (Police, Forensic, Lawyer, Judge) per user, both
  at the API layer (fast rejection) and the smart-contract layer (authoritative enforcement).
- FR-2.3: System shall allow Forensic and Lawyer roles to attach supporting documents to existing
  evidence.
- FR-2.4: System shall allow Forensic and Judge roles to trigger an integrity check that compares
  a freshly computed hash against the on-chain record and immutably logs the result (pass or fail).

### Phase 3 — Metadata Enrichment
- FR-3.1: System shall store case name, department, filename, and status in an off-chain database,
  merged with on-chain data in API responses (to avoid costly on-chain string storage).
- FR-3.2: System shall support case status transitions: Open → Under Investigation → Closed.

### Phase 4 — Testnet Deployment
- FR-4.1: System shall be deployable to a public Ethereum testnet, with the deployed contract
  publicly viewable and auditable via a block explorer.

### Phase 5 — AI Layer
- FR-5.1: System shall generate semantic embeddings for all indexable (PDF/DOCX) evidence and
  supporting documents.
- FR-5.2: System shall support natural-language semantic search across all indexed content,
  ranked by a composite of semantic similarity, recency, and metadata match.
- FR-5.3: System shall automatically detect when newly indexed evidence is semantically similar to
  evidence in a *different* case, above a defined confidence threshold.
- FR-5.4: System shall notify connected clients in real time (WebSocket) when a cross-case link is
  detected.

### Phase 6 — Frontend
- FR-6.1: System shall provide a distinct dashboard per role, showing only the actions that role is
  authorized to perform.
- FR-6.2: System shall provide a global semantic search interface accessible from any role.
- FR-6.3: System shall visually display the full custody timeline for a given evidence item.
- FR-6.4: System shall display real-time cross-case linkage alerts to any authenticated,
  currently-connected user.

### Phase 7 — Documentation & Submission
- FR-7.1: System shall be accompanied by documentation sufficient for a new reader (or evaluator)
  to understand its architecture, design, and implementation without reading all source code.

---

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Security** | Passwords hashed with bcrypt (12 rounds); JWT (HS256) for session auth; role enforcement duplicated at the immutable contract layer so the API layer is never the sole gatekeeper. |
| **Integrity** | Every evidence file's SHA-256 hash must be independently recomputable and compared against an immutable on-chain record at any time. |
| **Availability** | The AI layer (search, cross-case linkage) must be non-blocking — its unavailability must never prevent evidence upload, custody transfer, or any core blockchain operation. |
| **Auditability** | Every state-changing action (evidence add, custody transfer, integrity check, role assignment/revocation) must emit an on-chain event, permanently and publicly inspectable. |
| **Usability** | Each role must see only the actions relevant to it; unauthorized actions must be hidden from the UI, not merely blocked server-side. |
| **Data cost efficiency** | Bulk file data must never be written on-chain; only hashes and content-addresses (CIDs), to keep gas costs low and predictable regardless of file size. |
| **Data durability** | Evidence files (IPFS/Pinata) and metadata (MongoDB Atlas) must persist independently of the blockchain node's own uptime (relevant for local/dev chains that reset). |

---

## 8. Assumptions & Constraints

- The current implementation assumes a **trusted deployer/owner** for on-chain role assignment
  (single EOA) — this is a known centralization point, not yet addressed (see `ARCHITECTURE.md` §7
  for current mitigations and known gaps).
- Off-chain role-signing wallets (Forensic/Lawyer/Judge private keys held by the backend) are a
  **local-development convenience** — using Hardhat's deterministic test accounts locally is safe;
  production use would require a proper per-user signing/custody model.
- The AI layer's semantic search and cross-case linkage are limited to text-extractable formats
  (PDF, DOCX) — image evidence is currently not searchable by content.
- Qdrant Cloud's free tier is used for the vector database, which can suspend clusters after
  prolonged inactivity — a keep-alive mechanism is implemented to mitigate this.

## 9. Success Criteria

- All 7 planned phases implemented and functioning end-to-end, verified via manual and scripted
  testing (see `test-data/` and `scripts/seed.ts`).
- A file can be uploaded, its hash independently verified later, and any tampering (even a
  single-byte change) reliably detected.
- Two documents in different cases with genuinely similar content are automatically linked and
  surfaced to a connected user within seconds of upload.
- Each of the four roles can complete their full intended workflow (upload → verify → transfer →
  review) without needing access to another role's dashboard.

---

## 10. Glossary

| Term | Meaning |
|---|---|
| **Evidence** | A primary file registered on-chain by Police, identified by an incrementing `evidenceId`. |
| **Supporting document** | A file (forensic report, court filing) linked to a parent evidence item, uploaded by Forensic or Lawyer. |
| **Custody record** | An immutable on-chain entry recording a transfer of holder responsibility for an evidence item. |
| **CID** | Content Identifier — IPFS's content-addressed hash pointing to where a file's bytes are stored. |
| **Cross-case linkage** | Automatic detection that evidence in one case is semantically similar to evidence in a different case. |
| **Composite score** | The weighted combination of semantic similarity, recency, and metadata match used to rank search results. |

---

*Companion documents: `ARCHITECTURE.md` (system design), `HLD.md` (module & workflow design),
`LLD.md` (implementation-level specification).*
