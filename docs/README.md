# Honora — Documentation Index

Start here. Read in this order for the full picture, or jump straight to whichever level of
detail you need.

| Document | What it's for | Read this if... |
|---|---|---|
| [PRD.md](PRD.md) | Product requirements — problem statement, goals, personas, functional & non-functional requirements | You want to know *what* Honora is supposed to do and *why*, before any implementation detail |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System-level design — component diagram, tech stack rationale, data storage strategy, deployment topology, key architectural decisions | You want the big picture of *how the system is structured* and *why each technology was chosen* |
| [HLD.md](HLD.md) | Module-level design — responsibility breakdown per module, workflow sequence diagrams (evidence upload, custody transfer, search, cross-case linkage), RBAC design | You want to understand *how data flows* through the system for each major feature |
| [LLD.md](LLD.md) | Implementation-level design — smart contract function specs, database schemas, full REST/WebSocket API contracts, the actual algorithms (chunking, ranking, cross-case logic) | You're implementing, debugging, or need the exact contract/API/algorithm details |
| [ROADMAP.md](ROADMAP.md) | Post-MVP plan — Phase 8 onward (DevOps, blockchain hardening, AI expansion, real-world narrative, demo readiness) | You want to know what's coming next, in what order, and why |

## Outside `docs/`

| Document | What it's for |
|---|---|
| [`../README.md`](../README.md) | Project overview, setup instructions, getting-started guide |
| [`../CODEBASE_WALKTHROUGH.md`](../CODEBASE_WALKTHROUGH.md) | A narrated, file-by-file trace of the actual code for each core flow — useful for explaining the codebase live (e.g. in a viva or code review) |
| [`../PRESENTATION_DEMO_GUIDE.md`](../PRESENTATION_DEMO_GUIDE.md) | Step-by-step setup, verification, and live demo script for presenting Honora |

## Document scope note

`PRD.md`, `ARCHITECTURE.md`, `HLD.md`, and `LLD.md` describe **what has been built** (Phases 1–7,
all complete). `ROADMAP.md` is the exception — it's intentionally forward-looking, covering Phase
8 onward, and will be revised as each phase actually ships rather than staying a frozen prediction.
