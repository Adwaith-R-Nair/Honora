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

**Status:** Complete — all planned items done (the RBAC audit findings expanded item 3 into
3a/3b/3c along the way).

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
  - [x] 3b. AI layer pytest suite (`preprocessing.py`) + implement real department-scoped
        `_build_rbac_filter()` in `search.py` (Finding #2, properly closed — needs 3a's JWT claim
        to exist first)
  - [x] 3c. Frontend: collect `department` in Police/Forensic signup UI
  - [x] 4. Linting (ESLint × 2, solhint, ruff) + fix violations
  - [x] 5. GitHub Actions CI pipeline (compile, typecheck, lint, run all test suites, build frontend)
- Dockerize backend + AI service, `docker-compose.yml` with local Hardhat node — split into:
  - [x] 6. `backend/Dockerfile`
  - [x] 7. `ailayer-querying/Dockerfile`
  - [x] 8. `docker-compose.yml`

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

### 2026-09-11 — 7dd62b9 — feat: add department to User model, registration, and JWT (commit 3a)
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

### 2026-09-11 — db0cd7e — test: add AI layer pytest suite, implement department-scoped search (commit 3b)
Phase: 8 (commit 3b of planned scope)
What changed: `search.py`'s `_build_rbac_filter()` now actually scopes Qdrant results by
`department` when the caller's JWT carries one (Finding #2, closed — the claim exists for real
now, thanks to 3a). `allowed_case_ids` deliberately left unimplemented — no per-user
case-assignment feature exists anywhere in the data model, so filtering on it would still be
inert; noted in a comment so it doesn't look like an oversight. Added
`ailayer-querying/test_preprocessing.py` (21 tests: `clean_text`, `_cell`, `_serialize_table`,
`chunk_text`, `_is_docx`, and full DOCX/PDF extraction round-trips built entirely in-memory — no
fixture files on disk) and `test_search.py` (15 tests: `_build_rbac_filter`, `_recency_score`,
`_metadata_score`, and `semantic_search()`'s dedup/ranking/threshold behavior, including that the
department filter actually reaches the vector store call). 36/36 passing.
Also bumped `PyMuPDF` from `1.24.5` to `1.28.2` in `requirements.txt` — the old pin has zero wheel
support for Python 3.14 (confirmed in the audit) and failed to build from source; 1.28.2 installs
cleanly and the extraction APIs this project uses (`find_tables`, `get_text`, `Rect`) are unchanged
across that range, confirmed by every extraction test passing. Added `requirements-dev.txt`
(`-r requirements.txt` + `pytest`) — separate from the runtime `requirements.txt` so the eventual
Docker image (Phase 8, still to come) doesn't need test tooling baked in.
Gotchas: `embeddings.py` (`sentence-transformers`/torch) and `vector_store.py` (live Qdrant) are
both imported at module load time by `search.py` — pulling either in for real would need torch
installed (779MB, and this sandbox's Python 3.14 has no wheel for the old pinned torch version
either). Stubbed both out via `sys.modules["embeddings"] = ...` / `sys.modules["vector_store"] =
...` *before* `import search`, so the tests never touch either heavy dependency — this sandbox
still has no torch installed at all and the full suite runs in under a second.
Follow-ups spawned: 3c (frontend signup form needs a department field, otherwise Police/Forensic
signup will now fail against the real backend) is next and is not optional — it's the UI catching
up to a backend contract change already live.

### 2026-09-11 — 63be042 — feat: collect department in Police/Forensic signup UI (commit 3c)
Phase: 8 (commit 3c of planned scope — closes out the Finding #2 department feature)
What changed: `LoginModal.jsx` now shows a "Department" text input (only during signup, only for
Police/Forensic — mirrors `DEPARTMENT_REQUIRED_ROLES` from the backend) between Wallet Address
and Password, with client-side required-field validation matching the backend's. Threaded through
`useAuth.jsx`'s `signup()` and `api.js`'s `signup()` (both gained an optional `department` param;
`JSON.stringify` naturally omits it from the request body when `undefined`, which is exactly
correct for Lawyer/Judge).
Verified live end-to-end in the browser (real Hardhat node + disposable Mongo + Vite dev server,
torn down after): registered a Police account against the real on-chain Police wallet
(Hardhat account #1) with department "narcotics" — succeeded, redirected to the Police dashboard
showing "Officer Rajan · Police". Regression-checked Legal Counsel (Lawyer) signup: no Department
field shown at all, form has exactly Email/Name/Wallet/Password as before.
Gotchas: a stale "Fake Judge" session in the browser's localStorage (left over from earlier
manual audit testing, pointing at data that no longer exists post-Mongo-reset) redirected `/role`
straight back to the dashboard — `localStorage.clear()` via the JS console tool was needed before
the role-selection page would actually render; the in-app Logout button click didn't clear it
reliably in this test sequence, worth a look if it recurs for a real user.
Follow-ups spawned: none blocking. This closes out Finding #2 and the department feature (3a+3b+3c)
entirely. Next up: Phase 8 commit 4 — GitHub Actions CI.

### 2026-09-11 — 66e1eea — chore: add linting (ESLint, solhint, ruff) and fix violations (commit 4)
Phase: 8 (commit 4 of planned scope)
What changed: zero linting infrastructure existed anywhere in the project before this. Added:
- `backend/eslint.config.js` — ESLint 10 + typescript-eslint, flat config. One real finding:
  `@typescript-eslint/no-namespace` flagged `declare global { namespace Express }` in
  `auth.middleware.ts` (the standard, required TS pattern for augmenting Express's `Request`
  type) — configured `allowDeclarations: true` rather than rewriting correct code.
- `Honora--Frontend/eslint.config.js` — ESLint 9.x (not 10 — `eslint-plugin-react@7.37.5`'s peer
  range caps at `^9.7`; forcing 10 would risk real incompatibility, not just a version-string
  mismatch) + `eslint-plugin-react`/`react-hooks`/`react-refresh`. Used stable
  `eslint-plugin-react-hooks@5.2.0`, not the v7 canary — v7 bundles new React-Compiler-aligned
  rules (`immutability`, `set-state-in-effect`) that flagged a common, runtime-safe pattern
  (fetch function defined after the `useEffect` that calls it) as a hard error across 8 nearly
  identical dashboard/detail components; this project doesn't use React Compiler, so pulling in
  compiler-era strictness would mean a large speculative refactor with no corresponding runtime
  benefit. Fixed the real findings: 6 unused imports/vars, 1 unescaped JSX apostrophe. Left 7
  `exhaustive-deps` warnings as warnings (not errors, exit 0) — fixing properly means wrapping
  several fetch functions in `useCallback` across files, real but not-blocking follow-up work.
- `.solhint.json` — `solhint:recommended`. 63 warnings surfaced, 0 errors; ~90% were missing
  NatSpec (`@notice`/`@param`) documentation — a legitimate but disproportionately large
  documentation task for a linting commit, left as tracked warnings rather than authoring full
  NatSpec for 11 functions + 6 events under this commit's scope. Applied the cheap/safe wins:
  `++evidenceCount`/`++supportingDocCount` (gas), `calldata` for `isFileHashRegistered`'s param
  (gas), indexed `RoleRevoked.timestamp` and `IntegrityVerified.passed` (within the 3-indexed-arg
  limit; verified no code anywhere parses these events positionally). All 29 contract tests still
  pass after.
- `ailayer-querying/ruff.toml` — extended selection (`I`, `B`, `PIE`, `RUF`) beyond ruff's bare
  defaults. Disabled `BLE001` (blind-except) project-wide with a documented rationale: every one
  of the 8 sites found is a deliberate resilience pattern matching `ARCHITECTURE.md`'s documented
  fire-and-forget design (WebSocket broadcast/send, Qdrant keep-alive ping, cross-case linkage
  check explicitly commented "non-critical", PDF table-detection fallback, batch-reindex per-file
  resilience) — not scattered bugs, so noqa-per-site would just be repetitive noise. Allowlisted
  `fastapi.Depends`/`fastapi.Query` for `B008` (FastAPI's own required DI pattern, not a mutable-
  default-argument bug). Disabled `RUF001-003` (ambiguous-unicode) since en/em dashes are this
  project's consistent, deliberate comment style, not typos. Fixed real findings: unused imports,
  f-strings without placeholders, an unnecessary dict spread in `vector_store.py`, a missing
  `raise ... from exc` in `main.py`'s JWT error handling, and `zip(..., strict=False)` (explicit,
  not `True` — table rows can legitimately have fewer/more cells than headers in messy real-world
  documents; `strict=True` would make extraction less robust, the opposite of what's wanted).
All three test suites re-verified passing after every fix (29 contract + 35 backend + 36 AI
layer = 100/100).
Gotchas: none beyond what's captured above — the theme this commit surfaced repeatedly was
"don't let a linter's generic opinion override this codebase's actual, documented architectural
choices (resilience-over-strictness, FastAPI's DI pattern, TS's namespace-augmentation idiom)."
Follow-ups spawned: full NatSpec documentation pass on the contract (worth doing, not urgent);
wrapping the 7 flagged fetch functions in `useCallback` to close the `exhaustive-deps` warnings
cleanly. Neither blocks anything. Next: commit 5, the GitHub Actions CI pipeline itself.

### 2026-09-11 — ci: add GitHub Actions pipeline (commit 5)
Phase: 8 (commit 5 of planned scope — closes out Phase 8 except Dockerization)
What changed: `.github/workflows/ci.yml`, 4 parallel jobs on push/PR to `main`:
- `contracts` — `npm ci`, `npm run lint` (solhint), `npx hardhat compile`, `npm test` (29 Mocha tests)
- `backend` — installs root deps + compiles the contract independently (jobs run on separate VMs;
  `contract.service.ts` and the test suite's own global-setup both need the compiled artifact at
  import time, so duplicating the compile step is simpler and more reliable than passing build
  artifacts between jobs), then `npm ci`/`npm run build` (typecheck)/`npm run lint`/`npm test`
  (35 Vitest tests) inside `backend/`
- `frontend` — `npm ci`/`npm run lint`/`npm run build` inside `Honora--Frontend/`
- `ai-layer` — Python 3.12, `pip install -r requirements-dev.txt`, `ruff check .`, `pytest`
  (36 tests) inside `ailayer-querying/` — no external services touched, matching how those tests
  were built (in-memory DOCX/PDF fixtures, `embeddings`/`vector_store` stubbed via `sys.modules`)
`concurrency` cancels superseded runs on the same ref; `permissions: contents: read` (minimal).
Verification: installed `act` (local GitHub Actions runner, needs Docker) and ran the `contracts`
job for real — `actions/checkout`, `actions/setup-node`, `npm ci`, and `npm run lint` all executed
inside a real container and solhint's output matched local results exactly (56 warnings, 0
errors). The run stalled downloading the Solidity compiler partway through `hardhat compile`
(nested Docker networking in this sandbox, unrelated to the workflow itself) and was stopped
there rather than fought further. The `backend`/`frontend`/`ai-layer` jobs were not run end-to-end
through `act` — confidence in them instead rests on: (a) they use the same `actions/checkout` +
`actions/setup-node`/`setup-python` pattern just verified working, and (b) every command they run
(`npm run build`, `npm run lint`, `npm test`, `pip install -r requirements-dev.txt`,
`ruff check .`, `pytest`) was already independently verified passing, repeatedly, in commits 1-4
this session. This is a real gap versus a full act run of all 4 jobs — worth a look if the first
real GitHub-hosted run surfaces anything `act`'s partial run didn't.
Gotchas: none in the workflow file itself; the friction was entirely `act`'s local Docker-in-
sandbox environment, not the CI logic.
Follow-ups spawned: watch the first real push/PR run on GitHub's actual runners to confirm the
backend/frontend/ai-layer jobs behave as expected — the local verification is strong but not
exhaustive. Phase 8 now has exactly one item left: Dockerize backend + AI service +
docker-compose.yml.

### 2026-09-12 — 4566b60 — fix: only register Sepolia network config when credentials are present
Phase: 8 (unplanned hotfix — commit 5's first real GitHub Actions run went red)
What changed: the first real CI run failed `contracts` and `backend` at `npx hardhat compile` with
`Error HHE15: config.networks.sepolia.url: Expected a URL`. Root cause: CI has no `.env` (correctly
— gitignored), so `SEPOLIA_RPC_URL` resolved to `""`, and Hardhat 3's config validator rejects an
empty-string network URL outright, even for commands that never touch Sepolia at all (compile,
local-network test). `hardhat.config.ts` now only registers the `sepolia` network entry when a real
URL is present. Verified by wiping `SEPOLIA_RPC_URL`/`SEPOLIA_PRIVATE_KEY` entirely and running a
genuinely clean `hardhat compile` + `hardhat test` locally (29/29 passing) before pushing, then
confirmed all 4 CI jobs green on the next run.
Gotchas: this also fixes the same failure for anyone cloning the repo fresh with no `.env` at all
yet — not CI-specific.
Follow-ups spawned: none.

### 2026-09-12 — Dependabot: merged 8 PRs, held back 2
Phase: 8 (operational, not a planned commit)
What changed: reviewed all Dependabot version-update PRs that had accumulated. Merged 6 patch-level
security-fix bumps (#2 multer, #3 body-parser, #4 qs, #5 undici, #6 pyjwt, #8 python-multipart) —
all were exactly the `npm audit`-flagged issues from `TECHNICAL_AND_SECURITY_AUDIT.md`'s Finding #6,
Dependabot just beat me to opening the PRs. Two more appeared afterward (#10 python-dotenv 1.0.1→
1.2.2, #11 pytest 8.3.3→9.0.3) — tested both against the real AI-layer test suite before merging
(36/36 passing unchanged), then merged.
**Deliberately held back:** #7 (torch 2.3.1→2.13.0) and #9 (transformers 4.41.2→5.10.1) — both major
version jumps. `sentence-transformers==3.0.1` was built against `transformers` 4.x; bumping
`transformers` independently to 5.x risks breaking embedding generation via API changes, and this
sandbox can't fully exercise the live embedding pipeline to confirm (Python 3.14 has no wheel for
either the old *or* very new torch). Treat as its own dedicated task later: bump both together, then
actually run the AI service and re-index a real document before trusting it.
CI reconfirmed green after each batch of merges (verified via `gh run view`).
Follow-ups spawned: the torch/transformers bump, whenever there's a real environment to test it in.

### 2026-09-12 — 589a1de — chore: dockerize backend (commit 6)
Phase: 8 (commit 6 of planned scope)
What changed: `backend/Dockerfile` — 3-stage build. Stage 1 compiles the contract (needs root-level
`contracts/`, `hardhat.config.ts`); stage 2 builds the backend TypeScript; stage 3 is the runtime
image, combining compiled `dist/` with the contract artifact at `/app/artifacts` — one level above
`/app/backend`, matching the relative path `contract.service.ts` already resolves
(`../artifacts/contracts/...`) so nothing in the app code needed to change. Build context is the
repo root (`docker build -f backend/Dockerfile .`), not `backend/`, specifically so stage 1 can see
the contract source. Added root `.dockerignore` (secrets, node_modules, build output, docs — none
of it belongs in any image).
Verified for real, not just "it builds": ran the actual image against a disposable Mongo container
and a real Hardhat node (host networking), hit `/health`, registered a real on-chain Police wallet
successfully, and confirmed the on-chain role-verification fix (commit 2) still rejects an
unassigned wallet with 403 — all from inside the running container. Everything torn down after.
Gotchas: `hardhat compile`'s native solc binary download failed inside the Alpine container and
silently fell back to the WASM build — this is normal Hardhat behavior (same fallback happens
sometimes on bare metal too), not a Docker-specific problem, and compile still succeeded correctly.
Follow-ups spawned: commit 7 (AI service Dockerfile) next, then commit 8 (docker-compose.yml) to
wire this together with a local Hardhat node.

### 2026-09-12 — 7c5e715 — chore: dependency hygiene cleanup (unplanned, triggered by GitHub's push warning)
Phase: 8 (operational cleanup, not part of the original planned commit sequence)
What changed: pushing commit 6 surfaced GitHub's "134 vulnerabilities (2 critical, 41 high, 72
moderate, 19 low)" banner — investigated properly rather than dismissing it:
- Found and removed `Honora--Frontend/src/package.json` + `.../src/package-lock.json` — an exact,
  stale duplicate of the real `Honora--Frontend/package.json`, dating back to before this session's
  work, with no `node_modules` and nothing referencing it. Confirmed dead before deleting. This was
  inflating the alert count by scanning a second, independent (and outdated) dependency tree that
  nothing actually uses.
- Found that PR #2 (merged earlier) had only fixed `multer` in the **root** `package.json` — the
  Dependabot PR title didn't disambiguate, and `backend/`'s own separate `multer` dependency
  (2.1.1, still vulnerable) was never touched by any PR. Bumped it to `^2.3.0` directly.
- Ran `npm audit fix` (non-forcing) in root, `backend/`, and `Honora--Frontend/` — cleared
  everything auto-fixable without breaking changes.
Verified after every change: 29 contract tests, 35 backend tests, frontend lint (still 0
errors/7 tracked warnings) and build all still pass.
**Deliberately left unfixed** (same "don't force a major-version bump without dedicated testing
time" judgment as torch/transformers):
- Backend: `esbuild` (transitive via vitest, dev-only) and `qs` (deep transitive) — need `--force`
- Root: 16 issues deep inside Hardhat's own toolbox dependency tree (`hardhat-ignition`,
  `hardhat-verify`, etc.) and `serialize-javascript` — dev-tooling only, never exposed at runtime,
  forcing risks breaking Hardhat itself
- Frontend: `vite` (transitive via esbuild, dev-only) and `react-router` 6.x→7.x — explicitly
  flagged as a breaking change by npm, and this app's routing depends on it directly
- Confirmed via the GitHub API that all pip-ecosystem alerts are exactly torch + transformers
  (already tracked as PRs #7/#9) — nothing new on that side.
Gotchas: none. This is exactly the kind of drive-by hygiene pass that's easy to skip when a big
scary vulnerability count shows up — worth actually reading the list instead of either ignoring it
or panic-force-fixing everything.
Follow-ups spawned: none new — same held-back items (torch/transformers major bumps,
esbuild/qs/serialize-javascript/react-router major bumps) as already tracked. Back to commit 7
(AI service Dockerfile).

### 2026-09-12 — chore: dockerize AI service (commit 7)
Phase: 8 (commit 7 of planned scope)
What changed: `ailayer-querying/Dockerfile` — 2-stage build on `python:3.12-slim` (glibc, not
alpine — torch/PyMuPDF ship manylinux wheels needing glibc; alpine's musl would force slow/failing
from-source builds). Stage 1 installs dependencies; stage 2 is the runtime image. CMD runs
`uvicorn` directly, not via `main.py`'s own `__main__` block (which hardcodes `reload=True`,
dev-only). Added `ailayer-querying/.dockerignore` (test files, `venv/`, `.env`, `reindex.py`,
`ruff.toml` — none of it belongs in the runtime image).

**This took three build attempts to get right, and it's worth recording why — the root cause was
subtle and cost Adwaith a real "no space left on device" crash on his own machine.** The service
only ever runs CPU inference on a small MiniLM model, but plain PyPI `torch` bundles full CUDA
runtime libraries (~700MB+ vs ~190MB CPU-only) that go completely unused here.

- *Attempt 1*: CPU-only torch installed via `--index-url` in one `pip install` call, then a
  second plain `pip install -r requirements.txt`. Looked fine in an initial build log, but
  silently reinstalled the full CUDA-bundled torch **on top of** the CPU one — the bare
  `torch==2.3.1` pin in `requirements.txt` doesn't reliably match an already-installed
  `2.3.1+cpu`. This is the version that reached Adwaith's machine and crashed with
  `no space left on device` writing `libtorch_cuda.so` after a 1388s build.
- *Attempt 2*: Pinned `torch==2.3.1+cpu` exactly for the first install, stripped `torch` out of
  `requirements.txt` for the second. Still broken: `sentence-transformers` itself declares an
  *unpinned* `torch>=1.11.0` dependency, and `pip install --prefix=X` resolves each invocation
  independently — the second command's resolver had no visibility into the first invocation's
  `--prefix`-installed packages, so it went looking for something satisfying `>=1.11.0` on the
  default index and pulled in a fresh CUDA-toolkit-dependent torch release (`nvidia-cusolver`,
  `nvidia-cusparse`, etc. visible in the log). Killed mid-build before it could fill the disk
  again.
- *Attempt 3 (the fix, now committed)*: **One single `pip install` call** with
  `--extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt` — not
  `--index-url`, which would drop PyPI entirely and break every other dependency. One unified
  resolution pass that can see both indexes at once means pip's resolver picks the CPU build for
  *every* place torch is needed — the explicit `requirements.txt` pin and
  `sentence-transformers`'s transitive `torch>=1.11.0` — instead of treating them as two separate
  problems across two invocations.

Verified end-to-end this session (build run directly on Adwaith's machine, confirmed to be the
same machine this session's tools operate on): `docker build --no-cache -f
ailayer-querying/Dockerfile -t honora-ai-layer:fixed2 ailayer-querying` completed in ~360s total.
Confirmed zero `nvidia-*` packages installed (`python -c "import pkgutil; ...".` returned `[]`),
zero actual CUDA `.so` binaries anywhere under `site-packages/torch` (only harmless CUDA-codepath
`.py`/`.pyc` source files remain, which every torch install ships regardless of build), and
`torch.__version__` reports `2.3.1+cpu` with `torch.cuda.is_available()` → `False`. Final image
content size: 464MB (vs. multiple GB for the CUDA-poisoned attempts). Ran the container with
`--env-file ailayer-querying/.env` against real Qdrant Cloud credentials and hit `GET /health` →
`200 {"status":"ok","connectedClients":0}`. Test container and temp image tag removed after
verification; also ran `docker builder prune -f` to reclaim 3.4GB of stale BuildKit cache left
over from the earlier failed attempts, since that cache was itself eating into the disk headroom
that caused the original crash.
Gotchas: `pip install --prefix=X` not seeing a prior separate invocation's installed packages is
the real lesson here — it's not specific to torch, it'll bite any multi-`pip install`-call
Dockerfile pattern where a later call has an unpinned transitive dependency on something the
earlier call already installed. Single resolution pass with all needed indexes is the fix, not
splitting installs "for clarity."
Follow-ups spawned: none — this is now fully verified and closed. Commit 8 (`docker-compose.yml`)
is next.

### 2026-09-13 — chore: add docker-compose for local dev (commit 8)
Phase: 8 (commit 8 of planned scope — closes the Dockerize item)
What changed: `docker-compose.yml` orchestrates 4 of the 5 local dev terminals —
`hardhat-node`, a one-shot `contract-deploy`, `backend`, `ai-service` — into a single
`docker compose up`. Frontend deliberately stays out (static Vite dev server, no startup-order
dependency on anything here — containerizing Vite dev mode risks musl/glibc native-binary
mismatches for esbuild/Rollup, for zero orchestration benefit; still runs via `npm run dev`).
Added `contracts/Dockerfile` — single-stage (unlike backend's multi-stage compile-then-slim),
since this image is dev-only tooling that needs the full Hardhat toolchain present at runtime to
actually run `hardhat node`/`hardhat run`, not just a compiled artifact. `CMD` binds
`--hostname 0.0.0.0` (Hardhat defaults to `127.0.0.1`, unreachable from other containers).
Small change to `hardhat.config.ts`: the `localhost` network URL is now overridable via
`HARDHAT_LOCALHOST_RPC_URL`, defaulting to the same `http://127.0.0.1:8545` as before — needed so
the `contract-deploy` container can reach `hardhat-node` by its compose service name instead of
loopback. Verified via `npx hardhat compile` + full 29-test contract suite still passing.
`backend`/`ai-service` still read real secrets (`PINATA_JWT`, `MONGODB_URI`, `JWT_SECRET`,
`QDRANT_URL`, `QDRANT_API_KEY`) from `backend/.env`/`ailayer-querying/.env` via `env_file:` —
untouched by compose. Only compose-networking-specific values (service-to-service URLs, the local
chain's well-known test-account keys, matching the convention already in
`backend/test/setup/global-setup.ts`) are set inline in `docker-compose.yml`.
Gotcha worth recording: `CONTRACT_ADDRESS` is hardcoded in the backend service's environment
rather than wired up dynamically. This works because it's deterministic — on a fresh ephemeral
chain (the `hardhat-node` container has no volume for chain state, so every `docker compose up`
starts a brand-new chain), `setup.ts`'s `contract.deploy()` is always the very first transaction
ever sent from account #0 (nonce 0), so the CREATE address is always the same. Verified
empirically against this exact codebase (not assumed from memory — an earlier guess at the
"well-known" address was one hex digit off) by running a throwaway `hardhat node` + `setup.ts`
locally before writing the compose file, and confirmed twice more by running the full compose
stack up/down/up: both runs deployed to the identical `0x5FbDB2315678afecb367f032d93F642f64180aa3`.
This breaks only if `setup.ts` is changed to send an earlier transaction from account #0 before
the deploy — if the hardcoded address ever seems wrong, check `docker compose logs contract-deploy`
for the real one.
Verified end-to-end: `docker compose up --build` — all 4 services start in correct dependency
order (`hardhat-node` healthy → `contract-deploy` runs and exits 0 → `backend`/`ai-service`
start). Hit `GET /health` on both backend (200) and AI service (200, real Qdrant credentials).
Exercised a real contract-reading code path via `POST /api/auth/register` (hit MongoDB Atlas's
uniqueness check against a wallet registered in an earlier session — proof the request pipeline,
Mongo connection, and on-chain role check are all live). Tore the whole stack down and brought it
back up fresh to confirm reproducibility — identical deploy address both times. Reclaimed build
cache after verification (`docker builder prune -f`) — the 4 working images themselves
(~2.9GB total) are kept, since removing those would defeat the point of building them.
Follow-ups spawned: frontend-in-compose deliberately deferred, not forgotten — if it's ever
wanted, add it behind a compose `profiles: ["full"]` entry so the default `docker compose up`
stays at 4 services. No other open items for Phase 8's Dockerize scope; Phase 8's remaining items
(from the top of this section) are already checked off — Phase 8 is now complete pending final
review.

---

## Phase 9 — Blockchain Hardening & Identity

**Status:** In progress — 1 of 6 planned items done.

Goal (from `docs/ROADMAP.md`): the Sepolia deployment looks and behaves like a real, audited,
properly-governed product, not just a bare contract address.

Planned scope, ordered so anything that could touch the Solidity source happens before the
(expensive-to-redo) Sepolia redeploy:
- [x] 1. Slither static analysis on `EvidenceRegistry.sol` — document + fix findings
- [x] 2. Gas reporting — real per-operation cost numbers
- [x] 3. Wallet-ownership proof at registration (EIP-712 signed challenge)
- [ ] 4. Multi-sig ownership (Safe, 2-of-3) + Sepolia redeployment — **must include** redeploying
      `EvidenceRegistry` with the fresh deployer wallet generated 2026-09-10 (see Phase 8 section
      above) — the current live contract's owner key was publicly leaked in git history and can
      never be transferred, only replaced by redeployment
- [ ] 5. Etherscan verification of the new contract
- [ ] 6. Populate Sepolia — assign roles via Safe multi-sig approval

### 2026-09-13 — fix: harden EvidenceRegistry per Slither findings (commit 1)
Phase: 9 (commit 1 of planned scope)
What changed: Ran Slither (Trail of Bits' static analyzer, free/open-source) against
`EvidenceRegistry.sol` via its Hardhat integration. First pass: 20 findings, all Informational/
Optimization severity — **zero High or Medium findings**, a genuinely clean result worth stating
plainly in the security narrative. The 20 broke down as:
- 1 real, worthwhile fix: `owner` flagged as `immutable`-eligible. It's assigned once in the
  constructor and never reassigned anywhere in the contract (no `transferOwnership` exists) — so
  marking it `immutable` removes it from storage entirely (moved into the contract's bytecode
  instead), saving a persistent SLOAD on every `onlyOwner`-gated call (`assignRole`, `revokeRole`)
  and cutting deployment gas too. Zero behavior change.
- 19 `naming-convention` findings: every function parameter used a leading-underscore prefix
  (`_account`, `_evidenceId`, etc.), which Slither's convention checker flags as not mixedCase.
  Purely cosmetic — confirmed via `grep` across `test/`, `scripts/`, and
  `backend/src/services/contract.service.ts` that every caller passes positional arguments, never
  named-parameter object syntax, so renaming parameters inside the `.sol` file has zero blast
  radius outside that one file. Renamed all of them (`_account` → `account`,
  `_evidenceId` → `evidenceId`, etc.) rather than writing a suppression config — the fix was
  genuinely as cheap as the finding suggested, unlike the AI service's gotchas earlier in this log.
Verified: `npx hardhat compile` clean, full 29-test Hardhat suite still passing unchanged (rename
only, no logic touched), and a second Slither run after the fix reports **0 findings across all
102 detectors** (not just the 2 already known — the full battery: reentrancy, unchecked calls,
access control, arithmetic issues, etc.).
Gotcha: Slither is a separate Python toolchain (`pip install slither-analyzer`), not an npm
package — installed it into a throwaway venv rather than committing it to the repo, since it's a
run-when-needed audit tool, not a runtime or build dependency. No `requirements.txt`/lockfile
entry added; anyone re-running this needs `pip install slither-analyzer` in their own venv (Python
3.14 tested clean, no compatibility issue despite Slither being a somewhat conservative-support
tool historically).
Follow-ups spawned: Slither is not wired into CI — the roadmap only asked for "document and fix
findings," not continuous enforcement. Worth reconsidering once Phase 9's other Solidity-adjacent
work (commit 4's redeploy) is done, so CI catches regressions on the final contract, not an
interim one. Commit 2 (gas reporting) is next.

### 2026-09-13 — docs: record EvidenceRegistry gas usage baseline (commit 2)
Phase: 9 (commit 2 of planned scope)
What changed: the roadmap's original plan called for adding `hardhat-gas-reporter`. Checked its
peer dependency (`npm view hardhat-gas-reporter peerDependencies` → `{ hardhat: "^2.16.0" }`) — a
real, hard incompatibility, this project runs Hardhat `^3.1.10`, and that package hasn't been
updated for Hardhat 3's rewritten (ESM-native) plugin architecture. Rather than assume a fix or
downgrade anything, checked Hardhat 3's own current docs directly: gas statistics are now
**built into Hardhat 3 core**, no third-party plugin needed at all — `hardhat test --gas-stats`
prints a per-function/per-deployment gas table straight from the same test run, and
`--gas-stats-json <path>` can export it as JSON if ever needed for tooling. Net result: **zero
code changes** for this commit — no new dependency, no `hardhat.config.ts` edit. Just ran it and
recorded the real numbers below for Phase 11 (scale conversation) and Phase 12 (performance
write-up) to reference later, from the existing 29-test suite:

| Function | Avg gas | #calls in suite |
|---|---|---|
| Deployment | 2,622,461 | 29 |
| `addEvidence` | 302,417 | 14 |
| `addSupportingDoc` | 260,826 | 3 |
| `transferCustody` | 104,535 | 1 |
| `assignRole` | 46,580 | 109 |
| `getSupportingDocs` | 45,770 | 1 |
| `getEvidence` | 40,549 | 2 |
| `getCustodyHistory` | 37,539 | 2 |
| `recordIntegrityCheck` | 28,951 | 2 |
| `isFileHashRegistered` | 24,727 | 2 |
| `getRole` | 24,414 | 2 |
| `evidenceCount` / `supportingDocCount` | 23,577 / 23,512 | 1 each |
| `revokeRole` | 23,927 | 1 |
| `owner` | 21,482 | 1 |

Bytecode size: 11,928 bytes. Contract deployment (~2.6M gas) is by far the most expensive single
operation, as expected — it only happens once per redeploy, not per-transaction. Among regular
operations, `addEvidence` and `addSupportingDoc` are the priciest (string storage for IPFS
CIDs/hashes), `assignRole` and view-adjacent calls are cheap — useful context for Phase 11's scale
conversation about cost-per-case-file.
Verified: this is purely an extra reporting layer over the exact same test run — same 29/29
passing, no behavior touched.
Follow-ups spawned: none. Commit 3 (wallet-ownership proof via EIP-712) is next — the first commit
in this phase that actually changes application logic.

### 2026-09-13 — feat: prove wallet ownership at registration via EIP-712 (commit 3)
Phase: 9 (commit 3 of planned scope)
What changed: closes a real gap in `auth.service.ts` — registration verified a wallet *held* a
role on-chain (`getOnChainRole`) but never that the registering person actually *controlled* that
wallet's private key. Role-holding addresses are public (visible in any block explorer / in
`assignRole` event logs), so anyone who knew a Police wallet's address could previously register
claiming to be its owner. Registration is now two steps:
- `POST /api/auth/challenge` (new) — takes `{ walletAddress }`, generates a random nonce, stores it
  in a new `RegistrationChallenge` Mongo collection (TTL index, auto-expires after 5 minutes;
  `findOneAndUpdate` upsert means requesting a new challenge invalidates any prior one for that
  wallet), returns an EIP-712 typed-data payload to sign.
- `POST /api/auth/register` — now also requires `signature`. Backend re-fetches the still-valid
  challenge, rebuilds the exact same typed-data value, and calls `ethers.verifyTypedData(...)` —
  rejects if the recovered address doesn't match `walletAddress`. The challenge is deleted whether
  verification succeeds or fails, so a nonce can never be replayed.
- EIP-712 domain (`backend/src/utils/eip712.ts`) binds `chainId` (new `getChainId()` export on
  `contract.service.ts`) and `verifyingContract` (`ENV.CONTRACT_ADDRESS`) into the signed message,
  so a signature can't be replayed against a different network or a different contract deployment.
No contract changes, no redeploy — this is verified entirely off-chain via signature recovery.

Frontend: the signup form's "Wallet Address" field was a **plain text box** — typing in an
address proves nothing about controlling it, so proving ownership required actually replacing it.
Added `Honora--Frontend/src/utils/wallet.js` — a dependency-free wrapper around the browser's
injected wallet (`window.ethereum`, no ethers/wagmi needed on the frontend at all; every wallet
supports `eth_requestAccounts` and `eth_signTypedData_v4` as raw JSON-RPC methods). `LoginModal.jsx`
now shows a "Connect Wallet" button instead of a text input; on submit, it requests a challenge,
signs it with the connected wallet, and only then submits. The domain/types/value signed are
always exactly what the backend's `/challenge` response returned — the frontend never constructs
them independently, so there's no way for the two sides to drift out of sync.

Verified: full backend Vitest suite (40/40 passing) — rewrote all register-flow tests in
`auth.test.ts`, plus the registration-setup helpers in `rbac.test.ts` and `evidence.test.ts`, to
go through a real challenge→sign round trip (new shared test helper,
`backend/test/setup/wallet-signing.ts`, using `ethers.Wallet.signTypedData` — genuine, valid
cryptographic signing, just not through a browser). Added new tests specifically for the new
logic: challenge issuance, missing signature, missing/expired challenge, and signature-doesn't-
match-wallet (all correctly return 403/400 without touching the on-chain role check). `tsc --noEmit`
clean, ESLint clean on both backend and frontend. Frontend: `npm run build` clean, and manually
loaded the real signup modal in a browser — confirmed the new "Connect Wallet" button renders
correctly and, when clicked, correctly triggers a **real MetaMask connection request** (this
machine's Chrome profile has MetaMask installed) — proof the wiring is correct. Did not click
through MetaMask's own approval popup myself; approving a connection on a real wallet extension is
something Adwaith should do himself, not something to automate on his behalf, even for a local dev
flow. Backend crypto logic is fully verified regardless (scripted-signer tests above) — this was
purely a check that the button correctly reaches a real wallet, which it does.
Gotcha: registerUser's check ordering matters and is deliberate — department check → duplicate
email/wallet checks → address-format check → **signature verification** → on-chain role check.
Keeping signature verification before the on-chain role check means a bad signature never reaches
an RPC call; keeping the cheap duplicate/format checks before it means those failure paths don't
need a real signature to test.
Follow-ups spawned: Adwaith should click through the actual "Connect Wallet" → MetaMask approval →
sign flow himself once he's ready, to confirm the real-wallet UX end-to-end (see verification
commands below). Commit 4 (multi-sig ownership + Sepolia redeployment) is next — needs 3 signer
wallet addresses from Adwaith first (2-of-3 Safe, decided earlier in this phase).

---

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
