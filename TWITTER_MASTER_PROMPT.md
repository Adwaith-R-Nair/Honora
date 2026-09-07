# Master Prompt: Twitter/X Thread Campaign — "Honora" Project

> **How to use this file:** This is the brief the Twitter agent (`.claude/agents/twitter-thread-writer.md`)
> reads before drafting any thread. You can also paste it into a fresh Claude conversation yourself if
> you ever want threads drafted outside this repo. It contains the full factual context — nobody
> drafting from this file should need to re-derive facts from the codebase or invent anything.
>
> **Nothing gets posted from this file alone.** It defines the campaign; actual tweet text only gets
> drafted when you ask for a specific thread, and only gets treated as final once you approve it.

---

## MASTER PROMPT (copy from here if using standalone)

I'm running a "build in public" Twitter/X campaign for my most significant project, **Honora — a
Blockchain-Based Evidence Management System**. I want a series of engaging, technically credible
threads that get the project public visibility — aimed at people who'd find the engineering
decisions genuinely interesting: blockchain/Web3 developers, legal-tech people, and AI/backend
engineers. Below is the complete factual brief plus the campaign structure and platform
constraints. Do not invent features, metrics, screenshots, or claims that aren't in this brief.

### My role (attribute credit accurately in every thread)

I am **Adwaith R Nair**. On this project I owned **Blockchain + Backend + Testing**:
- Designed and implemented the Solidity smart contract (`EvidenceRegistry.sol`) end to end —
  role-based access control, custody-chain logic, custom-error-based reverts.
- Built the entire Node.js/Express/TypeScript backend: REST API, JWT auth, MongoDB schemas, IPFS
  integration, the SHA-256 integrity pipeline, and the blockchain-signing layer.
- Deployed and verified the contract on local Hardhat and the public Ethereum Sepolia testnet.
- Led testing efforts across the stack.

This was a 4-person university team project. Teammates: **Diya** (AI layer — FastAPI + Qdrant +
sentence-transformers — + documentation), **Abhijith A** (frontend + testing, also touched the
blockchain layer), **Meghna** (cross-case linkage + frontend + documentation). Threads about the AI
layer or frontend should credit them by name, framed as "my teammate built X" — never claimed as
personal work. Threads about the contract, backend, or RBAC architecture are legitimately "I built
this."

### One-line pitch

A secure, tamper-proof evidence management system for law enforcement: evidence files go to IPFS,
integrity-critical metadata (hash, custody chain, roles) is anchored immutably on Ethereum, and an
AI layer automatically surfaces hidden connections between cases.

### The problem it solves (good hook material)

Traditional evidence handling (paper logs, spreadsheets, centralized databases) has four structural
weaknesses:
1. **Tamperability** — centralized records can be altered after the fact with no independent proof.
2. **Opacity** — chain-of-custody is siloed across police, forensic labs, lawyers, courts.
3. **No independent verification** — nothing proves a file in court is the exact original; today
   that relies on procedural trust, not math.
4. **Disconnected cases** — investigators have no automated way to discover evidence in one case
   relates to another.

### System architecture (4 independent layers)

```
Client:      React 18 + Vite — 4 role-based dashboards (Police, Forensic, Lawyer, Judge)
Backend:     Node.js + Express + TypeScript — REST API, JWT auth, blockchain orchestration [MINE]
AI:          FastAPI + sentence-transformers + Qdrant — semantic search & cross-case linkage
Blockchain:  Solidity contract on Hardhat (local) / Ethereum Sepolia (public testnet) [MINE]
Storage:     IPFS (via Pinata) for files, MongoDB Atlas for off-chain metadata
```

**The single best "engineering maturity" talking point across the whole campaign:** this is a
deliberately layered, service-oriented system where no layer reaches directly into another's
storage, and the AI layer's availability is fully decoupled from core operations (fire-and-forget
indexing) — evidence upload, custody transfer, and integrity verification never depend on a
"nice-to-have" service being up. Lead with this in at least one thread.

### Evidence upload flow (the best "how it actually works" thread material)

1. Police officer uploads a file via the dashboard.
2. Backend (Express, multer) receives it.
3. Generates a SHA-256 hash of the file.
4. Checks the on-chain hash registry for duplicates — rejects if it already exists.
5. Uploads the file to IPFS via Pinata → gets a content identifier (CID).
6. Registers evidence on-chain (evidence ID, case ID, CID, hash, uploader) → gets a tx hash.
7. Saves enriched metadata (case name, department, filename, status) to MongoDB.
8. Fires an async, non-blocking indexing call to the AI service.
9. Returns evidence ID, IPFS CID, file hash, and tx hash to the client.

Only the hash and CID ever go on-chain — raw file bytes never touch the blockchain, keeping gas
cost low and constant regardless of file size.

### Smart contract design (`EvidenceRegistry.sol`)

- Solidity 0.8.24, deployed via Hardhat v3, interacted with via ethers.js v6.
- `Role` enum: `None, Police, Forensic, Lawyer, Judge` — an on-chain mapping (`userRoles`) is the
  *authoritative* source of access control, not just an app-layer concept.
- Key functions: `addEvidence` (Police-only), `addSupportingDoc` (Forensic/Lawyer),
  `transferCustody` (current holder only), `recordIntegrityCheck` (Forensic/Judge),
  `assignRole`/`revokeRole` (owner-only), plus views (`getEvidence`, `getCustodyHistory`,
  `getSupportingDocs`, `isFileHashRegistered`).
- Custom errors (gas-efficient reverts): `NotOwner`, `NotAuthorized`, `InsufficientRole`,
  `EvidenceNotFound`, `NotCurrentHolder`, `InvalidAddress`, `EmptyField`, `DuplicateFileHash`.
- Immutable custody chain — every transfer *appends* a record (`from`, `to`, `timestamp`); nothing
  is ever edited or deleted.
- Duplicate detection via a global `fileHashExists` mapping shared across evidence and supporting
  docs.
- Full event emission for every state change (`EvidenceAdded`, `CustodyTransferred`,
  `SupportingDocAdded`, `RoleAssigned`, `RoleRevoked`, `IntegrityVerified`) — publicly and
  independently auditable on Etherscan, not just internally consistent.

### Backend design (Node.js/Express/TypeScript)

- **Two-layer RBAC** — role checked fast in Express middleware (friendly 403, no gas spent), and
  again authoritatively by Solidity modifiers. The API can never be the sole point of enforcement;
  a bypassed frontend still can't get an unauthorized wallet to act on-chain. This is the single
  most interview-worthy / thread-worthy decision in the backend.
- **Role-specific signer wallets** — because contract access control keys off `msg.sender`, the
  backend signs each tx with a key matching the *caller's actual on-chain role*. No signing key
  configured for a role → the endpoint fails closed with a 403 before any tx is attempted.
- JWT (HS256) auth + bcrypt (12 rounds); stateless, no session store.
- MongoDB (Mongoose) holds off-chain metadata only — every read merges MongoDB fields onto
  on-chain data, which is always the source of truth for anything security- or integrity-related.
- IPFS via Pinata — no self-hosted node needed.
- SHA-256 integrity verification — any file's hash can be recomputed any time and compared against
  the immutable on-chain record. This is the actual tamper-detection mechanism, demonstrable live
  (see capture list below).
- Clean layered structure: `config/ → models/ → middleware/ → services/ → controllers/ → routes/`.

### AI layer (teammate Diya's work — credit her)

FastAPI + `sentence-transformers` (`all-MiniLM-L6-v2`) + Qdrant Cloud, 384-dim cosine similarity:
- Semantic search with multi-factor ranking (semantic similarity 0.85 + recency 0.10 + metadata
  match 0.05).
- Automatic cross-case linkage detection (similarity threshold 0.72) with real-time WebSocket
  alerts when new evidence matches an existing, *different* case — nobody has to ask it to look.

### Frontend (teammates Abhijith & Meghna's work — credit them)

React 18 + Vite + React Router 6, four role-based dashboards, dark theme with gold accents and
glassmorphism, chain-of-custody timeline visualization, global AI semantic search bar.

### Live deployment

Verified on **Ethereum Sepolia testnet**: `0xf4e1c0179acC2A54C195e8687621ee070be06B3C` (chain ID
11155111) — publicly viewable on Etherscan:
`https://sepolia.etherscan.io/address/0xf4e1c0179acC2A54C195e8687621ee070be06B3C`
This is genuinely public information and is exactly the point of a public-testnet demo — post it
freely once the security note below is resolved.

### Tech stack (for a "stack" style tweet)

Solidity 0.8.24 · Hardhat v3 · ethers.js v6 · Node.js v22 · Express · TypeScript (ESM) · JWT
(HS256) · bcrypt · MongoDB Atlas · IPFS (Pinata) · SHA-256 · FastAPI · sentence-transformers ·
Qdrant Cloud · React 18.2 · Vite 5 · React Router 6 · WebSocket

### Honest scope boundaries — do not overstate these in any thread

- University/portfolio-caliber project, not a production law-enforcement deployment. Position as a
  well-engineered proof of concept with real architectural rigor — never claim real-world adoption.
- Openly acknowledge if asked/relevant: single deployer wallet currently has unilateral
  role-assignment power (no multi-sig yet, on the roadmap); role-signer wallets are shared per-role
  rather than per-individual-user on-chain; the AI layer only indexes text-extractable formats
  (PDF/DOCX), not images yet; no CI/CD or automated test suite yet (also on the roadmap).
- All 7 originally planned phases are complete and demonstrated end-to-end.
- A forward-looking ~3-month roadmap exists (`docs/ROADMAP.md`): DevOps/CI + security hygiene,
  blockchain hardening (multi-sig, Etherscan verification, per-user on-chain identity), AI
  expansion (OCR, explainable linkage), legal-framework mapping, and a benchmarking/polish pass
  aimed at a conference submission. Great material for a "what's next" thread — frame as roadmap,
  never as already shipped.

### ⚠️ Security note — resolve before wide public posting

A Sepolia private key was previously hardcoded in `hardhat.config.ts` (fixed in commit
`23faf5e`, removed from the tracked file). **Removing it from the current file does not rotate a
key that was ever committed to git history** — if that key was pushed to a public remote, treat it
as compromised and generate + fund a fresh deployer key before this campaign drives meaningful
traffic to the public repo/Etherscan link. This is a one-time chore, not a blocker to drafting
threads now, but check it before the first thread goes live publicly. Never let this specific key
value appear in any screenshot or recording.

Separately: the demo uses seeded test-user credentials (e.g. `rajan@keralapolice.gov` /
`police123`, listed in `PRESENTATION_DEMO_GUIDE.md`). They're fake/local-only, but don't display
them on-screen in recordings anyway — log in before you hit record, or crop the login step out in
editing. Habit, not a real leak, but no reason to invite copy-paste attempts either.

---

## Platform constraints (X/Twitter free tier)

- **280 characters per tweet**, hard limit on a free-tier account (no exceptions from Premium/Blue
  long-form posts — assume free tier throughout this campaign). Count characters, not words, for
  every drafted tweet — this includes the tweet number prefix and any trailing link/hashtags.
- A URL always counts as ~23 characters against the limit regardless of actual length (X's t.co
  wrapping) — budget for it, don't try to save characters by using a URL shortener.
- Images: up to 4 per tweet. GIFs/video: 1 per tweet, free-tier video length limits are generous
  enough for a 30–60s demo clip but keep clips under ~45s so they hold attention.
- No hard limit on thread length, but engagement drops off past ~10-12 tweets per thread — prefer
  splitting a big topic into two threads over one bloated one.
- First tweet of a thread carries all the weight — it's the only one that shows in feeds/search
  before a "Show this thread" click. It must work as a standalone hook.

## Voice and style

- Engineering-honest, first-person, "build in public" tone — like explaining a real decision to
  another engineer over coffee, not marketing copy. This matches the register already used in
  `docs/LINKEDIN_POST.txt` — reuse that voice, not a hype-y startup voice.
- Concrete over abstract: "the API layer can never be the sole point of enforcement" beats "secure
  by design."
- One idea per tweet. If a sentence needs a semicolon to fit an idea in 280 characters, it's
  probably two tweets.
- Short lines with line breaks read better than dense paragraphs in a tweet.
- Numbering: `1/`, `2/`, `3/` prefixes (not `1/9` — don't commit to a total count that might change
  while drafting; end the thread with a clear closing tweet instead of a countdown).
- Hashtags: 2–4 maximum, only on the **last** tweet of a thread, never mid-thread. Suggested pool:
  `#Blockchain #Solidity #Web3 #Ethereum #LegalTech #BuildInPublic #AI #Node #100DaysOfCode` — pick
  ones matching that specific thread's topic, don't reuse the whole pool every time.
- Every thread ends with a clear CTA: link to the GitHub repo and/or the Etherscan contract page,
  and an invitation to reply/DM (matches the LinkedIn post's closing line — "if you work in
  blockchain, legal-tech, or applied AI... I'd like to talk").
- Never fabricate engagement bait ("this blew my mind," "you won't believe") — the real engineering
  decisions here are interesting enough without inflation.

---

## Campaign structure — threads "phase by phase"

Each thread stands alone (someone should be able to follow just one and get value) but they build a
complete picture across the campaign. Draft and post them in this order; don't skip ahead to later
threads before earlier ones establish context, since later threads reference "as I covered before."

| # | Thread topic | Angle / hook | Primary source material |
|---|---|---|---|
| 1 | **The problem** | Chain-of-custody trust is broken today — open with the courtroom question ("how do you know this hasn't been altered?") | Problem section above, `docs/LINKEDIN_POST.txt` opening |
| 2 | **Architecture overview** | Four independent layers, why they're decoupled, the fire-and-forget AI design decision | Architecture section, `docs/ARCHITECTURE.md` |
| 3 | **The smart contract** | `EvidenceRegistry.sol` — on-chain RBAC, immutable append-only custody chain, custom errors | Smart contract section, `contracts/` source |
| 4 | **Dual-layer RBAC** | The single best engineering-decision thread: role-specific signer wallets + two-layer enforcement | Backend design section |
| 5 | **Tamper detection, live** | SHA-256 recompute vs. on-chain hash — show a PASS and a FAILED integrity check | Evidence upload flow + demo guide step 8 |
| 6 | **AI layer & cross-case linkage** | Semantic search + automatic cross-case alerts nobody asked for — credit Diya | AI layer section |
| 7 | **It's live on Sepolia** | Not a localhost toy — verifiable on a public chain right now, walk through Etherscan | Live deployment section |
| 8 | **The team + what's next** | Accurate credit to all 4 teammates, then the roadmap as forward-thinking close | Team credit + roadmap section |

Threads 3–6 are the technical core and can be reordered based on what's getting engagement after
thread 1–2 post; threads 1, 2, 7, 8 work best fixed at the start/end.

---

## Capture list — what to screenshot/record for each thread

General rules that apply to every capture:
- Prefer a **short screen recording (15–30s, no audio needed)** over a static screenshot whenever
  something changes on screen (a popup appearing, a status flipping, a page navigating) — it's far
  more convincing than a still image for exactly the kind of "trust but verify" claims this project
  makes.
- Record at a clean browser zoom (100–110%) with dev tools closed unless a capture specifically
  needs the Network tab.
- Never record over a visible password field, private key, or `.env` file content.
- Save everything into one folder (e.g. `twitter-media/thread-N-topic/`) as you go so drafting and
  posting don't get blocked waiting on capture.

| Thread | Capture | How (reuses `PRESENTATION_DEMO_GUIDE.md` where noted) |
|---|---|---|
| 1 — Problem | No capture needed — this is a text-only hook thread. Optional: a plain photo/graphic of a paper evidence log or generic courtroom stock concept (not required). | — |
| 2 — Architecture | Screenshot of the architecture diagram in `README.md`; a terminal screenshot showing the 4 services running (Hardhat node, backend, AI service, frontend each in their own terminal, per demo guide Part 1) to visualize "4 independent layers" concretely. | Recreate demo guide **Part 1**, screenshot all 4 terminals side by side once each shows its "ready" line. |
| 3 — Smart contract | Code screenshot of the `Role` enum + one custom error block in `EvidenceRegistry.sol`; a screenshot of a transaction on Etherscan showing an emitted event (e.g. `EvidenceAdded`) with decoded logs. | Pull the tx from Sepolia Etherscan directly, or from a local Hardhat run — click "Logs" tab on the tx page. |
| 4 — Dual-layer RBAC | Split-screen/two-screenshot pairing: the Express middleware role check next to the Solidity `modifier`/custom error it backs up (e.g. `InsufficientRole`) — visually make the "two layers" claim self-evident. Optional: a screen recording of an unauthorized-role API call returning `403` in Postman/curl. | `curl` a protected endpoint with a wrong-role JWT and record the terminal showing the 403 body. |
| 5 — Tamper detection | Screen recording covering demo guide **Part 4, step 8**: upload the *original* file → show integrity check **PASSED**; then upload a *modified* file → show it **FAILED**. This is the single highest-impact clip in the whole campaign — it's a live "we caught tampering" moment. | Follow `PRESENTATION_DEMO_GUIDE.md` Part 4 §8 exactly; do the PASS case first, then the FAIL case, as two clips or one continuous one. |
| 6 — AI layer | Screen recording of the semantic search bar returning ranked results for a query like `"drug trafficking evidence"`; separately, a recording of the **gold CROSS-CASE LINK popup** firing after uploading a near-duplicate file, then clicking through to the linked case. | Demo guide Part 3 (prepare `demo_crosscase_file.docx`) + Part 4 §6 and §11. |
| 7 — Live on Sepolia | Screenshot of the verified contract page on Sepolia Etherscan (`https://sepolia.etherscan.io/address/0xf4e1c0179acC2A54C195e8687621ee070be06B3C`) showing the contract address, transaction history, and emitted events tab. | Demo guide Part 4 §2 — just the Etherscan tab, no local setup needed. |
| 8 — Team + roadmap | A simple 4-role dashboard collage (one screenshot per role: Police/Forensic/Lawyer/Judge home view) to visually represent "4 people, 4 roles, one system"; optionally a screenshot of `docs/ROADMAP.md`'s phase table for the "what's next" close. | Log in as each of the 4 seeded test users (credentials in demo guide) and screenshot each dashboard landing view. |

### Terminal commands worth showing verbatim in a tweet (as text or in a screenshot)

These read well as monospace-formatted tweet content or screenshot captions because they show real,
copy-pasteable proof rather than a claim:

```bash
# Thread 2/4 — spinning up all 4 layers
npx hardhat node
npx hardhat run scripts/setup.ts --network localhost
cd backend && npm run dev
cd ailayer-querying && uvicorn main:app --port 8000 --reload
cd Honora--Frontend && npm run dev
```

```bash
# Thread 4 — proving the API-layer check isn't the only gate (expect 403)
curl -X POST http://localhost:3000/api/evidence \
  -H "Authorization: Bearer <a non-Police JWT>" \
  -F "file=@evidence.pdf"
```

```solidity
// Thread 3 — the on-chain gate curl can't get around
error InsufficientRole(Role required, Role actual);

modifier onlyRole(Role required) {
    if (userRoles[msg.sender] != required) {
        revert InsufficientRole(required, userRoles[msg.sender]);
    }
    _;
}
```

Redact/replace any real JWT, private key, or `.env` value before it appears in a tweet or
screenshot — use an obviously fake placeholder like `<a non-Police JWT>` above.

---

## What I'd like help with, per thread

When I ask for a specific thread by number or topic, draft:
1. The full tweet-by-tweet text, each tweet under its character count (show the count next to each
   tweet so I can verify at a glance).
2. The exact capture(s) needed for that thread, pointing at the capture-list row above, plus which
   tweet(s) each capture attaches to.
3. Suggested hashtags for the closing tweet only (2–4, from the pool above or thread-specific ones).
4. Flag anything in the draft that risks overstating scope per the honest-boundaries section, or
   that would expose a secret/credential if posted as-is.

Ask me clarifying questions only if something in this brief is genuinely ambiguous for the
requested thread — otherwise draft directly from this file.

---

## END MASTER PROMPT

## Notes for you (not part of the prompt itself)

- Every fact above was pulled from this repo's own `README.md`, `docs/PRD.md`,
  `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `PRESENTATION_DEMO_GUIDE.md`, and
  `PORTFOLIO_MASTER_PROMPT.md` — nothing here is invented, kept consistent with the LinkedIn post
  and portfolio copy so the campaign doesn't contradict itself across platforms.
- Threads are deliberately sequenced so each one can be posted independently over days/weeks for
  sustained visibility rather than all at once — pace them out.
- The Twitter agent (`.claude/agents/twitter-thread-writer.md`) reads this file automatically; you
  shouldn't need to paste it manually unless working outside this repo.
