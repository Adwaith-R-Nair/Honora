# Build context is this directory (ailayer-querying/), not the repo root —
# this service is fully self-contained, no contracts/backend cross-dependency.
# Build with:  docker build -f ailayer-querying/Dockerfile -t honora-ai-layer ailayer-querying

# ---- Stage 1: install dependencies ─────────────────────────────────────────
# python:3.12-slim (glibc, Debian-based), not alpine — torch/PyMuPDF ship
# manylinux wheels that need glibc; alpine's musl libc would force slow/failing
# from-source builds instead of using the prebuilt wheels.
FROM python:3.12-slim AS builder
WORKDIR /install
COPY requirements.txt .
# torch from PyPI bundles CUDA libraries (~700MB+) that go unused here — this
# service only ever runs CPU inference on a small MiniLM model (see
# docs/ARCHITECTURE.md: "fast enough for CPU inference").
#
# This MUST be a single `pip install` call, not two separate ones. Two
# earlier, broken versions of this file tried splitting it:
#   1. CPU-only torch, then plain `pip install -r requirements.txt` — the
#      bare `torch==2.3.1` pin in requirements.txt doesn't reliably match an
#      already-installed `2.3.1+cpu`, so the second call reinstalled the full
#      CUDA torch from the default index on top of the CPU one.
#   2. CPU-only torch pinned as `2.3.1+cpu` + a torch-stripped requirements
#      file — still broken, because `sentence-transformers` itself declares
#      an *unpinned* `torch>=1.11.0` dependency. `pip install --prefix=X`
#      resolves each invocation independently and doesn't see a previous,
#      separate invocation's `--prefix`-installed packages as "already
#      satisfied" — so the second command's resolver didn't know torch was
#      already there, went looking for something satisfying `>=1.11.0` on
#      the *default* index, and pulled in a recent CUDA-toolkit-dependent
#      torch release (visible as `nvidia-cusolver`, `nvidia-cusparse`, etc.
#      being collected) — same bug, different mechanism.
# Both attempts filled a real disk to "no space left on device" mid-build.
# The actual fix: ONE resolution pass that can see the CPU wheel index AND
# PyPI at the same time, so pip's resolver picks the CPU build for every
# place torch is needed (explicit pin AND sentence-transformers' transitive
# dependency) instead of treating them as two different problems.
RUN pip install --no-cache-dir --prefix=/install/deps \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    -r requirements.txt

# ---- Stage 2: runtime ──────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime
WORKDIR /app
COPY --from=builder /install/deps /usr/local
COPY . .

EXPOSE 8000
# No --reload here (that's dev-only, in main.py's own __main__ block) — run
# uvicorn directly for production.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
