# Honora — Presentation Day Guide

Everything needed for tomorrow: setup, verification, the live demo script in order, and what to do
if something breaks mid-presentation. Do the setup section well **before** you present — seeding
takes several minutes and should never happen live in front of anyone.

---

## ⚠️ The one rule that matters most

**Once you're set up, do not close Terminal 1 (the Hardhat node), restart your laptop, or let it
sleep/hibernate before you present.** Hardhat's local blockchain is entirely in-memory — killing
that process wipes every evidence record, role assignment, and custody entry. If that happens,
you're redoing the full setup + reseed from scratch, which costs several minutes you won't have
mid-presentation. Everything else (backend, AI service, frontend) can be safely restarted if
needed; that terminal cannot.

Turn off sleep/screen-lock on your laptop for the duration.

---

## Part 1 — Setup (do this 45–60 minutes before presenting)

### Terminal 1 — Local blockchain
```bash
npx hardhat node
```
Leave running. Do not touch again until after your presentation.

### Terminal 2 — Deploy contract + assign roles
```bash
npx hardhat run scripts/setup.ts --network localhost
```
Copy the printed `CONTRACT_ADDRESS`.

### Update `backend/.env`
Paste the new address into `CONTRACT_ADDRESS=`.

### Terminal 3 — Backend
```bash
cd backend
npm run dev
```
Wait for `MongoDB connected successfully` and the port 3000 listening message.

### Terminal 4 — AI service (needs the venv) — start this before reseeding
```bash
cd ailayer-querying
.\venv\Scripts\Activate.ps1
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Confirm `(venv)` shows in the prompt before running uvicorn. Watch for clean startup — no NumPy
warning, no `ModuleNotFoundError`.

### Reseed test data (reuse Terminal 2)
```bash
npx hardhat run scripts/seed.ts --network localhost
```
This registers your 4 test users and uploads every file in `test-data/` — 8 cases, forensic
reports, court filings. Takes a few minutes (real on-chain txs + IPFS uploads for every file).
Since the AI service is already running (previous step) and the indexing bugs are fixed, every
upload auto-indexes into Qdrant live as it goes. Let it fully finish before moving on.

**Important — MongoDB and Qdrant are cloud-hosted and do NOT reset when your laptop restarts, only
the local Hardhat chain does.** That means every time you start fresh from a laptop restart, Mongo/
Qdrant still hold data pointing at the *previous* contract's evidence IDs, which no longer exist on
the new one. Reseeding isn't just habit — it's required to bring Mongo back in sync with the fresh
chain.

### Terminal 6 (one-time use) — rebuild Qdrant to match the fresh reseed
```bash
cd ailayer-querying
.\venv\Scripts\Activate.ps1
python reindex.py
```
This wipes and rebuilds the entire Qdrant collection from the current MongoDB state — clearing out
any stale vectors left over from a previous session (test uploads, old evidence IDs, etc.) and
guaranteeing Qdrant matches exactly what's in Mongo/chain right now. Run this every time you reseed
after a fresh restart. You can close this terminal once it prints its summary.

### Terminal 5 — Frontend
```bash
cd Honora--Frontend
npm run dev
```
Open **http://localhost:5173**.

---

## Part 2 — Verification checklist (do this before anyone arrives)

Run these and confirm each one:

1. `http://localhost:3000/health` → `{"status":"ok", ...}`
2. `http://localhost:8000/health` → `{"status":"ok","connectedClients":0}` (0 until frontend connects)
3. Log into the frontend as Police (see credentials below) — dashboard loads with 8 seeded cases
4. Try one AI search query (e.g. `"drug trafficking"`) — ranked results come back
5. Confirm Qdrant has vectors — ask me to check `points_count` if you want a second opinion before you start

### Test user credentials (all seeded by `scripts/seed.ts`)

| Role | Email | Password |
|---|---|---|
| Police | rajan@keralapolice.gov | police123 |
| Forensic | priya@forensics.gov | forensic123 |
| Lawyer | suresh@legalaid.gov | lawyer123 |
| Judge | menon@court.gov | judge123 |

---

## Part 3 — Prepare the cross-case demo file (do this once, in advance)

The cross-case popup only fires for clients connected via WebSocket **at the moment** the matching
upload happens — it won't replay missed alerts. So don't rely on something naturally triggering
during seeding; prepare a guaranteed trigger you control live.

Create one ready-to-upload file that's a near-duplicate of an existing narcotics case (reusing real
seeded content guarantees it crosses the 0.72 similarity threshold):

```bash
cd ailayer-querying
.\venv\Scripts\Activate.ps1
python -c "
from docx import Document
doc = Document('../test-data/police/case2-drug-trafficking-fortkochi/FIR_KRP-2025-0615-DT07.docx')
doc.add_paragraph('Supplementary field note: new tip received, possible link to related narcotics case.')
doc.save('../demo_crosscase_file.docx')
print('ready: demo_crosscase_file.docx')
"
```
This creates `demo_crosscase_file.docx` in the project root — keep it handy. During the live demo
you'll upload this file **tagged to case 1 (Kaloor)**, and it should link back to case 2 (Fort
Kochi) at roughly 75–80% similarity, since it's genuinely near-duplicate content from a real
narcotics FIR.

**Test this once before presenting** to build confidence — upload it, confirm the popup fires, then
you can either leave that test evidence in (it's a legitimate case now) or reseed again afterward
if you want a clean case count. If you reseed again, regenerate this file's upload as the very
first live action of your actual demo instead of testing it beforehand, so it's fresh.

---

## Part 4 — The live demo script (presentation order)

### 1. Open with the pitch (30 seconds)
"Honora is a blockchain-based evidence management system. Evidence files go to IPFS, only the
SHA-256 hash and IPFS pointer go on-chain — immutable, tamper-evident, and publicly verifiable.
On top of that we built an AI layer for semantic search and automatic cross-case linkage detection."

### 2. Show the live Sepolia deployment (credibility, no live interaction needed)
Have this tab pre-opened:
```
https://sepolia.etherscan.io/address/0xf4e1c0179acC2A54C195e8687621ee070be06B3C
```
Point out: verified contract, real testnet, publicly auditable. Then switch to your local setup for
the actual live demo — faster and network-independent.

### 3. Login flow
Go to `/role` → pick **Police** → log in with `rajan@keralapolice.gov` / `police123`.

### 4. Police dashboard — browse seeded cases
Show the case repository, stats (open/under investigation/closed), search-filter box.

### 5. Upload new evidence live
Click **New Case** (or upload into an existing case) — pick any real file (or the prepared
`demo_crosscase_file.docx` if you're doing the cross-case trigger here). Narrate what's happening
underneath as it processes: SHA-256 hash generated → duplicate check → IPFS upload → on-chain
registration → MongoDB metadata save → AI indexing. Point out the returned `txHash`, `ipfsCID`,
`fileHash` in the response/UI.

### 6. Cross-case popup (the highlight moment)
If you used `demo_crosscase_file.docx` tagged to case 1, the gold **CROSS-CASE LINK** popup should
appear within a few seconds, showing the Fort Kochi case with a similarity score. Click the linked
case to show it navigating straight there.

### 7. Custody transfer
Still as Police, open a case and transfer custody to the Forensic wallet
(`0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`). Show the custody history timeline updating with the
new entry.

### 8. Switch to Forensic
Log out, log in as `priya@forensics.gov` / `forensic123`.
- Open the case just transferred to Forensic.
- Upload a forensic report as a supporting document.
- **Integrity check — passing case**: re-upload the *original* evidence file → should show
  **PASSED**, hash matches on-chain.
- **Integrity check — failing case (great tamper-detection demo)**: modify any file slightly (open
  in Notepad, add a character, save) and upload *that* instead → should show **FAILED**, proving
  the system catches tampering. This is worth doing live — it's the clearest illustration of why
  the hash-on-chain design matters.

### 9. Switch to Lawyer
Log in as `suresh@legalaid.gov` / `lawyer123`, upload a court filing as a supporting document on
one of the existing robbery/homicide cases.

### 10. Switch to Judge
Log in as `menon@court.gov` / `judge123`. Show:
- Full custody chain timeline for a case (from upload → transfer → present holder)
- All supporting documents attached (forensic reports + lawyer filings)
- Run an integrity verification from this role too

### 11. AI semantic search (any role)
Use the search bar in the nav — try:
- `"drug trafficking evidence"`
- `"jewellery robbery"`
- `"parking garage homicide"`

Point out the composite score (semantic + recency + metadata weighting) and that clicking a result
navigates straight to that case.

### 12. Close with the RBAC table
Recap who can do what — Police uploads/transfers, Forensic verifies/reports, Lawyer files, Judge
verifies/reviews — all enforced twice: a friendly 403 at the API layer, and immutably by the smart
contract's role modifiers underneath.

---

## Part 5 — Anticipated questions (quick answers)

- **"Why isn't the file itself on the blockchain?"** — Gas cost. IPFS handles file storage; the
  chain only stores the SHA-256 hash and CID, both cheap and sufficient for tamper-proofing.
- **"What makes this tamper-proof?"** — The on-chain hash. Any modification to the file changes its
  SHA-256, which no longer matches the immutable on-chain record — exactly what you just
  demonstrated in step 8.
- **"What if the AI service goes down?"** — Evidence upload and all blockchain operations are
  completely independent of it; the indexing call is fire-and-forget and only affects search/
  cross-case features, never the legally important parts.
- **"Two RBAC systems?"** — JWT role check in Express gives fast, friendly 403s; the Solidity
  modifiers are the actual immutable enforcement layer. Defense in depth.
- **"How does cross-case linkage differ from search?"** — Search ranks against a typed query with
  recency/metadata weighting; cross-case linkage compares a specific document's full text against
  everything else, automatically, right after upload, with a stricter fixed threshold (0.72) and
  no user query involved.

(Full glossary and more Q&A backup is in `CODEBASE_WALKTHROUGH.md` if you want to go deeper on any
file or flow during questions.)

---

## Part 6 — If something breaks mid-demo

| Symptom | Fix |
|---|---|
| Backend crashed / acting weird | `Ctrl+C` in Terminal 3, `npm run dev` again — safe, no data lost |
| AI service crashed / NumPy or import error reappears | Confirm `(venv)` is active before restarting `uvicorn` — if you forgot to activate it, that's the whole problem |
| Search/cross-case returns nothing | Check `http://localhost:8000/health` is reachable; if AI service is down, evidence upload/custody/RBAC all still work fine for the rest of the demo |
| Frontend blank/error | `Ctrl+C` in Terminal 5, `npm run dev` again |
| **Anything involving Terminal 1 (Hardhat node)** | Do not touch it. If it actually crashed, you must redeploy (`setup.ts`) + update `.env` + restart backend + reseed — budget several minutes, so only do this if truly necessary |
| Cross-case popup doesn't fire | Confirm the browser tab was open and logged in *before* the trigger upload — the alert doesn't replay for late connections. Re-upload a fresh near-duplicate file if needed |

Good luck tomorrow.
