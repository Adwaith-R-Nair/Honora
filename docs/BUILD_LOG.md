# Honora — Build Log

Running record of roadmap execution. Updated after every commit is pushed. See `docs/ROADMAP.md`
for the full phase plan this log tracks against, and `CLAUDE.md` for the workflow this log
supports (plan commits per phase → implement one at a time → human pushes → log it here).

---

## Phases 1–7 — Complete (pre-dates this log)

Built and shipped before this tracking process started. Summarized from `README.md` /
`docs/PRD.md` §4 for reference, not re-verified line-by-line here:

| Phase | What shipped |
|---|---|
| 1 | `EvidenceRegistry.sol` + IPFS (Pinata) storage + Express backend API |
| 2 | JWT auth, RBAC (Police/Forensic/Lawyer/Judge), supporting-doc uploads, integrity verification |
| 3 | MongoDB metadata enrichment (caseName, department, status) merged with on-chain reads |
| 4 | Ethereum Sepolia testnet deployment, contract verified via Etherscan |
| 5 | AI layer: semantic search, cross-case linkage, WebSocket alerts (FastAPI + Qdrant) |
| 6 | Full React frontend: 4 role-based dashboards, custody timeline, AI search UI |
| 7 | Final documentation pass (PRD/Architecture/HLD/LLD, this log's companion docs) |

Known pre-existing fix already applied before Phase 8 formally started:
- `23faf5e` — removed hardcoded Sepolia private key + Alchemy API key from `hardhat.config.ts`,
  moved to `SEPOLIA_RPC_URL`/`SEPOLIA_PRIVATE_KEY` env vars.

### 2026-09-10 — Operational: partial credential remediation

Not a commit (no code changed). Done ahead of Phase 8's first commit at Adwaith's request:
- Rotated the leaked Alchemy API key on the Alchemy dashboard; root `.env`'s `SEPOLIA_RPC_URL`
  updated locally.
- Generated a fresh Sepolia deployer wallet (never touched git history); root `.env`'s
  `SEPOLIA_PRIVATE_KEY` updated locally, ready for Phase 9.
- **Explicitly deferred:** redeploying `EvidenceRegistry` to Sepolia with the new wallet.
  `EvidenceRegistry.sol` has no `transferOwnership` function, so the live Sepolia contract
  (`0xf4e1c0179acC2A54C195e8687621ee070be06B3C`) remains permanently owned by the exposed wallet
  (`0x22B02554A3Bc11825B4D2Bbb9AB9C4E694587c70`) until redeployed. Decision: fold the redeploy into
  Phase 9 alongside multi-sig ownership + "Populate Sepolia," rather than doing a throwaway
  redeploy now. **Phase 9 planning must include this** — it's not optional cleanup, the current
  deployment's admin key is public.
- Dependabot alerts + security updates: left for Adwaith to enable manually via GitHub Settings →
  Security → Code security (secret scanning + push protection were already on by default for this
  public repo — nothing needed there).

---

## Phase 8 — DevOps Foundation & Security Hygiene

**Status:** Not started — plan pending.

Goal (from `docs/ROADMAP.md`): a repo that catches its own regressions, zero outstanding known
security debt.

Planned scope (to be broken into individual commits before work starts):
- [x] Rotate leaked Sepolia key / Alchemy API key (operational, not a commit — see 2026-09-10 above)
- [x] GitHub secret scanning + push protection + Dependabot (repo settings, not a commit)
- [x] Hardhat contract test suite (Mocha/Chai)
- [x] Backend integration tests (Vitest + supertest + mongodb-memory-server + disposable Hardhat node)
- Fixing Finding #2 (AI search's RBAC filter is dead code) turned out to need real per-user
  department data, which didn't exist — expanded into 3 commits instead of 1:
  - [x] 3a. Add `department` to User model, registration validation, and JWT (Police/Forensic
        required, Lawyer/Judge optional)
  - [ ] 3b. AI layer pytest suite (`preprocessing.py`) + implement real department-scoped
        `_build_rbac_filter()` in `search.py` (Finding #2, properly closed — needs 3a's JWT claim
        to exist first)
  - [ ] 3c. Frontend: collect `department` in Police/Forensic signup UI
- [ ] GitHub Actions CI (compile, typecheck, lint — ESLint/solhint/ruff, run all test suites, build frontend)
- [ ] Dockerize backend + AI service, `docker-compose.yml` with local Hardhat node

### 2026-09-11 — c9cb304 — test: add Hardhat contract test suite for EvidenceRegistry
Phase: 8 (commit 1 of planned scope)
What changed: Installed `@nomicfoundation/hardhat-toolbox-mocha-ethers` (official Hardhat 3
mocha+chai+ethers bundle, replacing the standalone `hardhat-ethers` plugin registration in
`hardhat.config.ts`) plus `@nomicfoundation/hardhat-ethers-chai-matchers` and `@types/mocha`.
Added `test/EvidenceRegistry.ts` — 29 tests covering all 5 role modifiers, duplicate-hash
rejection (both `addEvidence` and `addSupportingDoc`), custody-transfer current-holder checks,
every event emission, and the owner-only `assignRole`/`revokeRole` guards including zero-address
rejection. Root `npm test` now runs `hardhat test` instead of the placeholder failing script.
Gotchas: `node_modules` didn't exist in this dev environment at all — needed a fresh `npm install`
first. `.to.not.be.reverted` is deprecated in this chai-matchers version; use `.to.not.revert(ethers)`
instead. `hre.network.connect()` (used throughout `scripts/*.ts`) prints a deprecation warning in
favor of `network.create()`/`getOrCreate()` — left as-is for consistency with existing scripts,
non-blocking, candidate cleanup for later.
Follow-ups spawned: none blocking; the `network.connect()` deprecation is worth revisiting
project-wide at some point but doesn't fail anything today.

### 2026-09-11 — db39152 — fix: enforce on-chain role verification at registration, add backend integration tests
Phase: 8 (commit 2 of planned scope)
What changed: Triggered by a full-stack audit requested ahead of continuing Phase 8 — see
`TECHNICAL_AND_SECURITY_AUDIT.md`. Found and fixed a CRITICAL vulnerability (Finding #1): `role`
at `/api/auth/register` was entirely self-declared with zero verification, letting anyone
register as any role (including Judge) and, as Police, have a fabricated file actually written
on-chain. Root cause: `contract.service.ts` already exported `getOnChainRole()` but nothing ever
called it — `auth.service.ts`'s own doc comment claimed the wallet-role check existed; it never
did. Fix: `registerUser()` now validates the wallet address format (`ethers.isAddress`) and
verifies the wallet's actual on-chain role matches the claimed role before allowing registration;
`auth.controller.ts` maps the new rejection to 403. Verified live against a real running backend:
both original exploit payloads now correctly rejected, legitimate registration unaffected.
Added `backend/test/` — 31 Vitest + supertest integration tests against a disposable Hardhat node
+ in-memory MongoDB (spun up fresh per test run, torn down after): `auth.test.ts` (incl. a
permanent regression test for the fix above), `rbac.test.ts` (role-middleware enforcement across
every protected route), `evidence.test.ts` (upload happy path + duplicate-hash rejection, Pinata
mocked). `backend/src/app.ts` refactored so tests can import the Express app directly without
triggering a real DB connection/listen (bootstrap now guarded to only run when the file is
executed directly, not imported).
Gotchas: Hardhat's automine + rapid back-to-back transactions from the same signer raced on
nonce (`ethers` v6's provider briefly caches pending-nonce lookups) — fixed with explicit manual
nonce tracking in the test's global setup, and a short settling delay between sequential
on-chain-writing test requests. A test file's own `ethers.Wallet.createRandom()` at module scope
is NOT safe to share with Vitest's `globalSetup` — `globalSetup` and each test file's `import`
run in separate module registries/processes, so a random value differs between them; must use
static string literals for anything both sides need to agree on. Also: `npx hardhat node`
spawned via `npx` leaves an orphaned node process if only the wrapper PID is killed — fixed by
spawning the hardhat binary directly with `detached: true` and killing the whole process group.
Follow-ups spawned: Finding #2 (AI search's RBAC filter is dead code in `search.py`) explicitly
deferred to the Phase 8 AI-layer test commit (next), not fixed here — flagged in that checklist
item above.

### 2026-09-11 — feat: add department to User model, registration, and JWT (commit 3a)
Phase: 8 (commit 3a of planned scope)
What changed: While designing the Finding #2 fix, found the commented-out `_build_rbac_filter()`
in `search.py` checked JWT claims (`department`, `allowed_case_ids`) that never existed on any
real token — `auth.service.ts`'s JWTPayload never carried them, and User had no department field
at all. Decided (with Adwaith) to build the real feature rather than just deleting dead code:
`User` schema gains `department` (conditionally required via `DEPARTMENT_REQUIRED_ROLES` —
Police/Forensic must provide one, Lawyer/Judge don't since they're cross-department oversight
roles). `auth.service.ts`/`auth.controller.ts` validate and thread it through registration, login,
`/api/auth/me`, and the JWT payload. `README.md`'s register-body example updated to match.
Extended `backend/test/auth.test.ts` with 4 new tests (Police/Forensic require it, Lawyer/Judge
don't); updated all existing Police/Forensic test fixtures across `auth.test.ts`/`evidence.test.ts`/
`rbac.test.ts` to supply one. 35/35 tests passing, stable across repeated runs.
Gotchas: none new beyond commit 2's — the existing test/global-setup infrastructure needed no
changes, just new field values threaded through.
Follow-ups spawned: 3b (AI layer — implement the actual department-scoped filter using this new
claim, pytest suite) and 3c (frontend signup form needs a department field) are next.

---

## Phase 9 — Blockchain Hardening & Identity
**Status:** Not started. **Must include:** redeploying `EvidenceRegistry` to Sepolia with the
fresh deployer wallet generated 2026-09-10 (see above) — the current live contract's owner key was
publicly leaked in git history and can never be transferred, only replaced by redeployment.

## Phase 10 — AI Layer Expansion
**Status:** Not started.

## Phase 11 — Real-World, Scale & Research Narrative
**Status:** Not started.

## Phase 12 — Polish, Benchmarking & Demo Readiness
**Status:** Not started.

---

## Log format for entries below

When a commit is pushed, append here:

```
### <date> — <commit short-sha> — <one-line summary>
Phase: <N>
What changed: ...
Gotchas / deviations from plan: ...
Follow-ups spawned: ...
```
