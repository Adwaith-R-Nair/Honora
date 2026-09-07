# Honora — Phase 8+ Roadmap (Post-MVP Scale-Up)

| | |
|---|---|
| **Status of Phases 1–7** | Complete (see `PRD.md` §4, `README.md` roadmap table) — this document starts from there |
| **Horizon** | ~3 months, targeting an international conference presentation |
| **Constraint** | Every tool/service used must be genuinely free — no paid infra, no time-limited trial credits being relied on as permanent |
| **Companion docs** | `PRD.md`, `ARCHITECTURE.md`, `HLD.md`, `LLD.md` describe what's built through Phase 7. This document is intentionally forward-looking and will be revised as phases complete — treat it as a living plan, not a frozen spec. |

---

## Guiding Principles

1. **Foundation before features.** CI/CD and a real test suite come first — every phase after
   this needs to be able to trust that new work doesn't silently break old work.
2. **Fix known security debt immediately, don't let it wait its turn.** The leaked Sepolia key is
   older than this roadmap and shouldn't wait for a "security phase" to get fixed.
3. **Match tool sophistication to actual scale.** Kubernetes, for example, is deliberately excluded
   — it solves problems this project doesn't have, at a cost (operational complexity, and paid
   control planes on every major cloud) this project shouldn't pay. Docker + Compose is the right
   altitude here.
4. **Free-tier only, always.** Every recommendation below either has a genuinely perpetual free
   tier or runs entirely on your own machine. Nothing here should turn into a surprise bill.
5. **Some ideas are bigger than 3 months allow alongside everything else.** They're listed
   honestly as stretch goals at the end, not quietly folded into a core phase where they'd blow
   the timeline.

---

## Phase 8 — DevOps Foundation & Security Hygiene (Weeks 1–3)

**Goal**: a repo that catches its own regressions, and a codebase with no outstanding known
security debt.

- Rotate the Sepolia private key and Alchemy API key hardcoded in `hardhat.config.ts`; move to
  `process.env.SEPOLIA_PRIVATE_KEY` / `SEPOLIA_RPC_URL` (the pattern already documented in the
  README's root `.env` section, just not yet applied to the config file itself).
- Enable **GitHub secret scanning + push protection** and **Dependabot** (both free, ~5 minutes to
  turn on) — secret scanning specifically would have caught the leaked key the moment it was
  committed.
- **Smart contract test suite** (Hardhat's built-in Mocha/Chai, free): cover role enforcement,
  duplicate-hash rejection, custody-transfer holder checks, event emission, and the owner-only
  guards on `assignRole`/`revokeRole`.
- **Backend integration tests** (Vitest or Jest + supertest, free): exercise the Express app
  directly, using `mongodb-memory-server` (free, in-process) and a local Hardhat node spun up in
  CI, so tests don't depend on any external service.
- **AI layer tests** (pytest, free): at minimum, deterministic unit tests for `preprocessing.py`'s
  extraction/chunking logic (pure functions, easy to test without hitting Qdrant or downloading
  real files).
- **GitHub Actions CI pipeline** (free — 2000 min/month even on a private repo): on every push/PR,
  compile contracts, typecheck the backend, lint (ESLint + `solhint` for Solidity + `ruff` for
  Python), run all three test suites above, build the frontend.
- **Dockerize** the backend and AI service (`Dockerfile` each) plus a `docker-compose.yml` that
  also runs a local Hardhat node — collapses the current "5 terminals, remember the exact order"
  setup into `docker-compose up`. This alone is worth doing regardless of where anything ends up
  hosted.

---

## Phase 9 — Blockchain Hardening & Identity (Weeks 3–6)

**Goal**: the Sepolia deployment looks and behaves like a real, audited, properly-governed
product — not just a bare contract address.

- **Etherscan verification** — free Etherscan API key + `@nomicfoundation/hardhat-verify`, one
  `npx hardhat verify` command.
- **Populate Sepolia** — assign roles and run the seed flow against the Sepolia-configured backend
  (funded via free faucet ETH for all 5 wallets: deployer + 4 role signers).
- **Multi-sig ownership** via Safe (free to deploy on Sepolia, gas-only) — replaces the single-EOA
  `owner` with a multi-signer requirement for `assignRole`/`revokeRole`, removing a single point of
  compromise for who can grant roles.
- **Slither static analysis** (free, open-source, Trail of Bits) on `EvidenceRegistry.sol` —
  document and fix findings. Directly supports an "evidence integrity" pitch with actual security
  tooling, not just a claim.
- **Gas reporting** (`hardhat-gas-reporter`, free) — concrete per-operation cost numbers, useful
  both for the eventual performance write-up (Phase 12) and for the scale conversation (Phase 11).
- **Wallet-ownership proof + individual on-chain identity.** Currently every user of a given role
  shares one signer wallet (e.g. all Forensic users sign through the same
  `FORENSIC_PRIVATE_KEY`) — on-chain, "Forensic" is one identity, not one per person; individual
  attribution only exists in MongoDB/JWT. This phase adds a signed-challenge (EIP-712 style) proof
  of wallet ownership at registration, and moves toward each user having their own on-chain
  identity rather than sharing a role-wide key. This is the single most technically meaningful
  security upgrade on this roadmap.

---

## Phase 10 — AI Layer Expansion (Weeks 6–9)

**Goal**: close the biggest functional gap (images are invisible to the AI layer) and make
existing AI features more trustworthy and useful.

- **OCR for image evidence** (Tesseract, free/open-source) — extracts text from crime-scene
  photos, scanned documents, etc., feeding into the same embedding/chunking pipeline that PDFs and
  DOCX already use. Closes the gap flagged back in `LLD.md` §6.2 / the original reindex testing,
  where 15 of 23 seeded evidence items were skipped as unsupported image types.
- **Explainable cross-case linkage** — alongside the similarity score, surface *why* two documents
  matched (overlapping keyphrases/named entities), so an investigator sees evidence, not just a
  number. Layers on top of the existing embedding pipeline; no new infrastructure needed.
- **AI-driven custody risk scoring** — flag unusual custody patterns (too many handoffs, atypical
  holding times, sequences that don't match typical case-department norms) as a tampering/fraud
  risk signal, using the custody history data that's already fully on-chain and queryable.
- **(Stretch within this phase)** Visual similarity search (CLIP-style embeddings) for genuinely
  visual matching (e.g. similar-looking weapons/vehicles across cases) — attempt only if OCR and
  explainability land comfortably within schedule.

---

## Phase 11 — Real-World, Scale & Research Narrative (Weeks 9–11)

**Goal**: prove this isn't just a tech demo — it understands the legal and operational problem,
and has a credible answer for "how would this actually get adopted."

- **Legal framework mapping** — explicitly document how Honora's design (hash-based integrity,
  immutable custody chain) satisfies real admissibility requirements (e.g. India's IT Act Section
  65B certification requirements for electronic evidence). Pure documentation/design work, highest
  differentiation-per-effort item on this whole roadmap.
- **Permissioned/consortium chain design note** — a public testnet is a fine proof-of-concept, but
  a real deployment likely wants a permissioned network (validator nodes run by law-enforcement
  agencies themselves) for cost and data-governance reasons. Written as a design document with
  a migration path, not built — shows systems maturity without the build cost.
- **Merkle-batch anchoring exploration** — instead of one on-chain transaction per evidence item,
  batch hashes into a Merkle tree and anchor only the root periodically. Answers the inevitable
  "how does this scale to thousands of items a day" question concretely. **Tradeoff to design
  around explicitly**: batching means an evidence hash isn't immediately, individually anchored —
  there's a window before the next batch root is committed. Worth prototyping carefully, and worth
  presenting as "here's the tradeoff and how we resolved it," not glossing over it.
- **Compliance/audit certificate export** — generate a court-ready PDF (chain-of-custody summary,
  hash, integrity check history) with an embedded QR code linking to on-chain verification.
- **Public read-only verifier portal** — no-login page where anyone can paste an `evidenceId` or
  scan the QR from the certificate above and see the on-chain proof (hash, timestamps, custody
  chain) without exposing the underlying file. Strong "transparency without compromising security"
  talking point.
- **Field-capture flow, scoped down** — rather than a full native mobile app (too large for this
  timeline alongside everything else), a mobile-responsive web upload view (camera access via the
  browser, works on a phone) gets most of the "evidence collected in the field" story at a fraction
  of the cost. Full native app listed as a stretch goal below.

---

## Phase 12 — Polish, Benchmarking & Demo Readiness (Weeks 11–12)

**Goal**: walk into the conference with real numbers, a polished UI, and a rehearsed story.

- **Performance & cost benchmarking** — measure and publish: gas cost per operation (from Phase
  9's gas reporter), embedding latency, search latency, cross-case detection latency. Concrete
  numbers for slides, not adjectives.
- **Analytics dashboard** — cases by department, evidence volume over time, integrity pass/fail
  rates. Visual, moderate effort, plays well on a projector.
- **UI/UX polish pass** across all four dashboards.
- **Documentation refresh** — update `PRD.md`/`ARCHITECTURE.md`/`HLD.md`/`LLD.md` to reflect
  everything built in Phases 8–11 (this roadmap becomes historical once each phase actually
  ships).
- **Final rehearsal** — update `PRESENTATION_DEMO_GUIDE.md` for the new feature set.

---

## Stretch Goals (only if time remains — not core-committed)

These are genuinely exciting but carry real risk of eating disproportionate time for their payoff
within a shared 3-month window. Listed honestly as optional, not silently assumed into a phase
above.

- **Zero-knowledge selective disclosure** — proving a fact about evidence (e.g. "custody was never
  broken," "collected within a time window") without revealing the full file. Highest research
  novelty on the entire list, but real ZK circuit development (circom/snarkjs) has a steep learning
  curve; even a narrow proof-of-concept is a meaningful undertaking on its own.
- **Full native mobile app** — beyond the scoped-down mobile-web capture flow in Phase 11, a real
  native app (offline queuing, GPS metadata, camera integration) is closer to its own project.
- **Actual Kubernetes deployment** — deliberately not part of this roadmap (see Guiding Principle
  3); revisit only if there's a genuine multi-node scaling need, which nothing here currently has.

---

## Suggested Timeline at a Glance

| Weeks | Phase |
|---|---|
| 1–3 | Phase 8 — DevOps Foundation & Security Hygiene |
| 3–6 | Phase 9 — Blockchain Hardening & Identity |
| 6–9 | Phase 10 — AI Layer Expansion |
| 9–11 | Phase 11 — Real-World, Scale & Research Narrative |
| 11–12 | Phase 12 — Polish, Benchmarking & Demo Readiness |

Phases overlap slightly by design (e.g. Phase 9's blockchain work can start before every Phase 8
test is written) — treat week numbers as a guide for sequencing dependencies, not a rigid
Gantt chart.
