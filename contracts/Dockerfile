# Build context is the repo ROOT, not contracts/ — needs hardhat.config.ts,
# scripts/, and package.json alongside the contract source.
# Build with:  docker build -f contracts/Dockerfile -t honora-hardhat-node .
#
# Single stage, unlike backend/Dockerfile's multi-stage compile-then-slim
# approach — this image is local-dev-only tooling (runs `hardhat node` /
# `hardhat run`), not a production artifact, so there's nothing to slim: it
# needs the full Hardhat toolchain present at runtime, not just a compiled
# output.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json hardhat.config.ts tsconfig.json ./
COPY contracts ./contracts
COPY scripts ./scripts
RUN npm ci
RUN npx hardhat compile

EXPOSE 8545
# --hostname 0.0.0.0 is required — Hardhat's node binds to 127.0.0.1 by
# default, which is unreachable from other containers on the compose network.
CMD ["npx", "hardhat", "node", "--hostname", "0.0.0.0"]
