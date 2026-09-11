import { spawn, type ChildProcess, execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ethers } from "ethers";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Vitest globalSetup for backend integration tests.
 *
 * Stands up a disposable Hardhat node + freshly-deployed EvidenceRegistry
 * (roles assigned to Hardhat's well-known deterministic test accounts —
 * the same addresses/keys already documented in the project README) and an
 * in-memory MongoDB, then points the test process's env vars at them so
 * `src/app.ts` (imported directly by test files, never via `npm run dev`)
 * behaves exactly as it would against a real deployment — no external
 * services (Sepolia, Atlas, Pinata) are touched.
 */

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const TEST_RPC_PORT = 8555;
const RPC_URL = `http://127.0.0.1:${TEST_RPC_PORT}`;

// Hardhat's well-known deterministic default accounts (same ones printed by
// `npx hardhat node`, and the same values already documented in README.md's
// local-dev .env example — safe to hardcode, they're test-only by design).
// These four are the backend's *default signer* wallets (RPC_URL / PRIVATE_KEY /
// FORENSIC_PRIVATE_KEY / etc.) — the ones the app itself signs transactions
// with, exactly like a real deployment.
const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const POLICE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
export const FORENSIC_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
export const LAWYER_KEY = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";
export const JUDGE_KEY = "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a";

// Additional wallets, one set per test file, purely so each file can register
// its own distinct users without colliding with another file's users on
// MongoDB's unique walletAddress constraint (all files share one in-memory
// Mongo instance for the whole run). Also Hardhat's well-known deterministic
// accounts (#11-#15) — must be static string literals, not
// `ethers.Wallet.createRandom()`: this module gets re-evaluated fresh in each
// test file's own `await import(...)`, a separate module registry from the
// one this globalSetup function itself runs in, so a freshly-random value
// would differ from the one actually assigned a role on-chain below.
export const EVIDENCE_TEST_POLICE_KEY = "0x701b615bbdfb9de65240bc28bd21bbc0d996645a3dd57e7b12bc2bdf6f192c82";
export const RBAC_TEST_POLICE_KEY = "0xa267530f49f8280200edf313ee7af6b827f2a8bce2897751d06a843f644967b1";
export const RBAC_TEST_FORENSIC_KEY = "0x47c99abed3324a2707c28affff1267e45918ec8c3f20b8aa892e8b065d2942dd";
export const RBAC_TEST_LAWYER_KEY = "0xc526ee95bf44d8fc405a158bb884d9d1238d99f0612e9f33d006bb0789009aaa";
export const RBAC_TEST_JUDGE_KEY = "0x8166f546bab6da521a8369cab06c5d2b9e46670292d85c875ee9ec20e84ffb61";

async function waitForRpc(url: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Hardhat node at ${url} did not become ready in time`);
}

export default async function globalSetup() {
  const artifactPath = resolve(
    REPO_ROOT,
    "artifacts/contracts/EvidenceRegistry.sol/EvidenceRegistry.json"
  );
  if (!existsSync(artifactPath)) {
    execSync("npx hardhat compile", { cwd: REPO_ROOT, stdio: "inherit" });
  }
  const artifact = JSON.parse(readFileSync(artifactPath, "utf-8"));

  // Spawn the hardhat binary directly (not via `npx hardhat`) and detached, so
  // `teardown()` can reliably kill the whole process group — `npx` itself
  // spawns hardhat as its own child, and killing just the `npx` wrapper PID
  // doesn't always propagate down and can leave an orphaned node listening.
  const hardhatBin = resolve(REPO_ROOT, "node_modules/.bin/hardhat");
  const hardhatNode: ChildProcess = spawn(
    hardhatBin,
    ["node", "--port", String(TEST_RPC_PORT)],
    { cwd: REPO_ROOT, stdio: "ignore", detached: true }
  );

  await waitForRpc(RPC_URL);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const deployer = new ethers.Wallet(DEPLOYER_KEY, provider);

  // Explicit, manually-incremented nonces for every transaction below. Hardhat's
  // automine mines each tx almost instantly, but relying on ethers/the provider
  // to always see the freshly-mined nonce in time for the *next* send (rather
  // than a briefly-stale cached "pending" count) is a real race in practice —
  // tracking it ourselves removes that race entirely.
  let nonce = await provider.getTransactionCount(deployer.address);

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  const contract = await factory.deploy({ nonce: nonce++ });
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  const roleOf = (key: string) => new ethers.Wallet(key).address;
  const rolesToAssign: [string, number][] = [
    [POLICE_KEY, 1],
    [FORENSIC_KEY, 2],
    [LAWYER_KEY, 3],
    [JUDGE_KEY, 4],
    [EVIDENCE_TEST_POLICE_KEY, 1],
    [RBAC_TEST_POLICE_KEY, 1],
    [RBAC_TEST_FORENSIC_KEY, 2],
    [RBAC_TEST_LAWYER_KEY, 3],
    [RBAC_TEST_JUDGE_KEY, 4],
  ];
  for (const [key, role] of rolesToAssign) {
    await (await contract.assignRole(roleOf(key), role, { nonce: nonce++ })).wait();
  }

  const mongod = await MongoMemoryServer.create();

  process.env.RPC_URL = RPC_URL;
  process.env.CONTRACT_ADDRESS = contractAddress;
  process.env.PRIVATE_KEY = POLICE_KEY;
  process.env.FORENSIC_PRIVATE_KEY = FORENSIC_KEY;
  process.env.LAWYER_PRIVATE_KEY = LAWYER_KEY;
  process.env.JUDGE_PRIVATE_KEY = JUDGE_KEY;
  process.env.MONGODB_URI = mongod.getUri("honora_test");
  process.env.JWT_SECRET = "test-jwt-secret-do-not-use-in-production";
  process.env.JWT_EXPIRES_IN = "1h";
  process.env.PINATA_JWT = "test-pinata-jwt-unused-mocked-in-tests";
  process.env.PORT = "3999";

  return async function teardown() {
    await mongod.stop();
    if (hardhatNode.pid) {
      try {
        process.kill(-hardhatNode.pid, "SIGKILL"); // negative pid = whole process group
      } catch {
        hardhatNode.kill("SIGKILL"); // fall back if the group is already gone
      }
    }
  };
}
