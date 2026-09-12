# Build context must be the repo ROOT, not backend/ — this image needs the
# compiled contract artifact from ../artifacts, which contract.service.ts
# reads via a path relative to the backend process's own working directory.
# Build with:  docker build -f backend/Dockerfile -t honora-backend .

# ---- Stage 1: compile the contract ─────────────────────────────────────────
FROM node:22-alpine AS contracts
WORKDIR /app
COPY package.json package-lock.json hardhat.config.ts tsconfig.json ./
COPY contracts ./contracts
RUN npm ci
RUN npx hardhat compile

# ---- Stage 2: build the backend (TypeScript -> dist/) ──────────────────────
FROM node:22-alpine AS backend-build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run build

# ---- Stage 3: runtime — only production deps + compiled output ────────────
FROM node:22-alpine AS runtime
WORKDIR /app/backend
ENV NODE_ENV=production
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=backend-build /app/backend/dist ./dist
# Lands at /app/artifacts — one level above /app/backend, matching the
# "../artifacts/..." path contract.service.ts resolves at runtime.
COPY --from=contracts /app/artifacts /app/artifacts

EXPOSE 3000
CMD ["node", "dist/app.js"]
