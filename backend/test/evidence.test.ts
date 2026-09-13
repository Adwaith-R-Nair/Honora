import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { ethers } from "ethers";

// Evidence upload calls out to the real Pinata IPFS API — mocked here so
// these tests stay hermetic (no external service, no real uploads, matches
// the same "no external dependencies in tests" intent as the in-memory Mongo
// and disposable Hardhat node used elsewhere in this suite).
vi.mock("../src/services/pinata.service.js", () => ({
  uploadToIPFS: vi.fn(async (_buffer: Buffer, filename: string) => `fake-cid-${filename}`),
}));

const app = (await import("../src/app.js")).default;
const { connectDB } = await import("../src/config/db.js");
const { EVIDENCE_TEST_POLICE_KEY, POLICE_KEY } = await import("./setup/global-setup.js");
const { signRegistrationChallenge } = await import("./setup/wallet-signing.js");

const policeWallet = new ethers.Wallet(EVIDENCE_TEST_POLICE_KEY).address;
// The backend always signs on-chain evidence registration with its own fixed
// PRIVATE_KEY (set to POLICE_KEY in global-setup) regardless of which app-user
// account triggered the upload — so on-chain uploadedBy/currentHolder is always
// this address, never the logged-in app-user's own wallet.
const onChainSignerAddress = new ethers.Wallet(POLICE_KEY).address;
let policeToken: string;

// Hardhat's automine mines each tx near-instantly, but ethers v6's JSON-RPC
// provider briefly caches read results (including pending-nonce lookups) —
// back-to-back on-chain-writing requests from the same signer, fired as fast
// as supertest can send them, can occasionally reuse a just-used nonce. A
// short pause between such requests avoids that without touching any
// production signing/nonce logic.
const settleNonce = () => new Promise((r) => setTimeout(r, 300));

beforeAll(async () => {
  await connectDB();

  const { signature } = await signRegistrationChallenge(app, EVIDENCE_TEST_POLICE_KEY);
  const register = await request(app).post("/api/auth/register").send({
    name: "Evidence Tester",
    email: "evidence-police@test.local",
    password: "password123",
    role: "Police",
    department: "narcotics",
    walletAddress: policeWallet,
    signature,
  });
  if (register.status !== 201) {
    throw new Error(`Test setup registration failed: ${JSON.stringify(register.body)}`);
  }
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: "evidence-police@test.local", password: "password123" });
  policeToken = login.body.data.token;
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe("POST /api/evidence/upload", () => {
  it("registers evidence on-chain and enriches it in MongoDB", async () => {
    const res = await request(app)
      .post("/api/evidence/upload")
      .set("Authorization", `Bearer ${policeToken}`)
      .field("caseId", "1")
      .field("caseName", "State v. Test Case")
      .field("department", "test-department")
      .attach("file", Buffer.from("test evidence content"), "evidence.txt");

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.txHash).toMatch(/^0x[a-f0-9]{64}$/);
    expect(res.body.data.ipfsCID).toBe("fake-cid-evidence.txt");
    expect(res.body.data.caseName).toBe("State v. Test Case");
  });

  it("rejects a re-upload of the exact same file content with 409", async () => {
    await settleNonce();
    const buffer = Buffer.from("duplicate content for hash test");

    const first = await request(app)
      .post("/api/evidence/upload")
      .set("Authorization", `Bearer ${policeToken}`)
      .field("caseId", "2")
      .field("caseName", "Duplicate Test")
      .field("department", "test-department")
      .attach("file", buffer, "dup.txt");
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/evidence/upload")
      .set("Authorization", `Bearer ${policeToken}`)
      .field("caseId", "3")
      .field("caseName", "Duplicate Test Again")
      .field("department", "test-department")
      .attach("file", buffer, "dup-again.txt");

    expect(second.status).toBe(409);
    expect(second.body.error).toMatch(/already been registered/i);
  });

  it("rejects an upload with no file attached", async () => {
    const res = await request(app)
      .post("/api/evidence/upload")
      .set("Authorization", `Bearer ${policeToken}`)
      .field("caseId", "4")
      .field("caseName", "No File")
      .field("department", "test-department");

    expect(res.status).toBe(400);
  });
});

describe("GET /api/evidence/:id", () => {
  it("returns merged on-chain + MongoDB data for an uploaded evidence item", async () => {
    await settleNonce();
    const upload = await request(app)
      .post("/api/evidence/upload")
      .set("Authorization", `Bearer ${policeToken}`)
      .field("caseId", "5")
      .field("caseName", "Fetch Test Case")
      .field("department", "fetch-department")
      .attach("file", Buffer.from("fetch test content"), "fetch.txt");

    const evidenceId = upload.body.data.evidenceId;

    const res = await request(app)
      .get(`/api/evidence/${evidenceId}`)
      .set("Authorization", `Bearer ${policeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.caseName).toBe("Fetch Test Case");
    expect(res.body.data.department).toBe("fetch-department");
    expect(res.body.data.currentHolder).toBe(onChainSignerAddress);
  });

  it("returns 500 for a nonexistent evidenceId (contract reverts EvidenceNotFound)", async () => {
    const res = await request(app)
      .get("/api/evidence/999999")
      .set("Authorization", `Bearer ${policeToken}`);

    expect(res.status).toBe(500);
  });
});
