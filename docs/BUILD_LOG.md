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
- [ ] Rotate leaked Sepolia key / Alchemy API key (operational, not a commit)
- [ ] GitHub secret scanning + push protection + Dependabot (repo settings, not a commit)
- [ ] Hardhat contract test suite (Mocha/Chai)
- [ ] Backend integration tests (Vitest/Jest + supertest + mongodb-memory-server + local Hardhat node)
- [ ] AI layer unit tests (pytest, `preprocessing.py` extraction/chunking)
- [ ] GitHub Actions CI (compile, typecheck, lint — ESLint/solhint/ruff, run all test suites, build frontend)
- [ ] Dockerize backend + AI service, `docker-compose.yml` with local Hardhat node

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
