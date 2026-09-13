import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { ethers } from "ethers";
import app from "../src/app.js";
import { connectDB } from "../src/config/db.js";
import { POLICE_KEY, FORENSIC_KEY, LAWYER_KEY, JUDGE_KEY } from "./setup/global-setup.js";
import { signRegistrationChallenge } from "./setup/wallet-signing.js";

const policeWallet = new ethers.Wallet(POLICE_KEY).address;
const forensicWallet = new ethers.Wallet(FORENSIC_KEY).address;
const lawyerWallet = new ethers.Wallet(LAWYER_KEY).address;
const judgeWallet = new ethers.Wallet(JUDGE_KEY).address;

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe("POST /api/auth/challenge", () => {
  it("issues an EIP-712 challenge for a valid wallet address", async () => {
    const res = await request(app)
      .post("/api/auth/challenge")
      .send({ walletAddress: policeWallet });

    expect(res.status).toBe(200);
    expect(res.body.data.domain.name).toBe("Honora EMS");
    expect(res.body.data.value.walletAddress).toBe(policeWallet);
    expect(res.body.data.value.nonce).toBeTruthy();
  });

  it("rejects a malformed wallet address", async () => {
    const res = await request(app)
      .post("/api/auth/challenge")
      .send({ walletAddress: "not-a-wallet-address" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid wallet address/i);
  });
});

describe("POST /api/auth/register", () => {
  it("registers successfully when the wallet's on-chain role matches the claimed role", async () => {
    const { signature } = await signRegistrationChallenge(app, POLICE_KEY);

    const res = await request(app).post("/api/auth/register").send({
      name: "Officer Test",
      email: "police-ok@test.local",
      password: "password123",
      role: "Police",
      department: "narcotics",
      walletAddress: policeWallet,
      signature,
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.role).toBe("Police");
    expect(res.body.data.user.department).toBe("narcotics");
  });

  it("rejects registration with no signature", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "No Signature",
      email: "no-signature@test.local",
      password: "password123",
      role: "Police",
      department: "narcotics",
      walletAddress: policeWallet,
    });

    expect(res.status).toBe(400);
  });

  it("rejects registration when no challenge was ever requested for the wallet", async () => {
    const unchallenged = ethers.Wallet.createRandom();

    const res = await request(app).post("/api/auth/register").send({
      name: "Skipped Challenge",
      email: "skipped-challenge@test.local",
      password: "password123",
      role: "Police",
      department: "narcotics",
      walletAddress: unchallenged.address,
      signature: "0x00",
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/no active registration challenge/i);
  });

  it("rejects registration when the signature doesn't match the claimed wallet", async () => {
    // Sign a real challenge, but for a *different* wallet than the one claimed
    const { signature } = await signRegistrationChallenge(app, FORENSIC_KEY);
    const otherWallet = ethers.Wallet.createRandom();

    // Request a challenge for otherWallet too, so the "no active challenge"
    // check passes and the signature mismatch itself is what's exercised
    await request(app).post("/api/auth/challenge").send({ walletAddress: otherWallet.address });

    const res = await request(app).post("/api/auth/register").send({
      name: "Mismatched Signature",
      email: "mismatched-signature@test.local",
      password: "password123",
      role: "Police",
      department: "narcotics",
      walletAddress: otherWallet.address,
      signature, // valid signature, but for forensicWallet's challenge, not otherWallet's
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/wallet ownership not proven/i);
  });

  // Regression test for the fix in auth.service.ts: role used to be a free-text
  // claim with zero verification against the wallet's actual on-chain role —
  // this is what let anyone self-register as "Judge" and successfully upload
  // evidence on-chain as an impostor "Police" account (see
  // TECHNICAL_AND_SECURITY_AUDIT.md, Finding #1). This must stay a 403.
  it("rejects registration when the wallet's on-chain role does not match the claimed role", async () => {
    const { signature } = await signRegistrationChallenge(app, FORENSIC_KEY);

    const res = await request(app).post("/api/auth/register").send({
      name: "Impostor",
      email: "impostor@test.local",
      password: "password123",
      role: "Judge", // forensicWallet is actually assigned Forensic on-chain, not Judge
      walletAddress: forensicWallet,
      signature,
    });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/on-chain/i);
  });

  it("rejects registration for a wallet with no on-chain role assigned at all", async () => {
    // Full wallet, not just .address — it needs to sign its own challenge to
    // prove ownership, so the test isolates "no on-chain role" as the actual
    // failure reason rather than failing earlier on signature verification.
    const unassignedWallet = ethers.Wallet.createRandom();
    const { signature } = await signRegistrationChallenge(app, unassignedWallet.privateKey);

    const res = await request(app).post("/api/auth/register").send({
      name: "Nobody",
      email: "nobody@test.local",
      password: "password123",
      role: "Police",
      department: "narcotics",
      walletAddress: unassignedWallet.address,
      signature,
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not been assigned a role/i);
  });

  it("rejects a malformed wallet address", async () => {
    // Can't request a real challenge for an invalid address at all — this
    // exercises registerUser's own address-format check, which still runs
    // before signature verification, so a placeholder signature is enough.
    const res = await request(app).post("/api/auth/register").send({
      name: "Malformed",
      email: "malformed@test.local",
      password: "password123",
      role: "Police",
      department: "narcotics",
      walletAddress: "not-a-wallet-address",
      signature: "0x00",
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/invalid wallet address/i);
  });

  it("rejects a duplicate email", async () => {
    // Fails at the duplicate-email check, before signature verification —
    // placeholder signature is enough.
    const res = await request(app).post("/api/auth/register").send({
      name: "Officer Test Again",
      email: "police-ok@test.local", // already registered above
      password: "password123",
      role: "Forensic",
      department: "narcotics",
      walletAddress: forensicWallet,
      signature: "0x00",
    });

    expect(res.status).toBe(409);
  });

  it("rejects a duplicate wallet address", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Someone Else",
      email: "someone-else@test.local",
      password: "password123",
      role: "Police",
      department: "narcotics",
      walletAddress: policeWallet, // already registered above
      signature: "0x00",
    });

    expect(res.status).toBe(409);
  });

  it("rejects missing required fields", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: "incomplete@test.local",
      password: "password123",
    });

    expect(res.status).toBe(400);
  });

  it("rejects a role outside the known enum", async () => {
    // Fails the controller's role-enum check before registerUser is even
    // called — placeholder signature is enough.
    const res = await request(app).post("/api/auth/register").send({
      name: "Bad Role",
      email: "badrole@test.local",
      password: "password123",
      role: "Admin",
      walletAddress: ethers.Wallet.createRandom().address,
      signature: "0x00",
    });

    expect(res.status).toBe(400);
  });

  it("rejects Police registration with no department", async () => {
    // Fails registerUser's department check, which runs before signature
    // verification — placeholder signature is enough.
    const res = await request(app).post("/api/auth/register").send({
      name: "No Department",
      email: "no-department-police@test.local",
      password: "password123",
      role: "Police",
      walletAddress: policeWallet,
      signature: "0x00",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/department is required/i);
  });

  it("rejects Forensic registration with no department", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "No Department",
      email: "no-department-forensic@test.local",
      password: "password123",
      role: "Forensic",
      walletAddress: forensicWallet,
      signature: "0x00",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/department is required/i);
  });

  it("allows Lawyer registration with no department (optional for oversight roles)", async () => {
    const { signature } = await signRegistrationChallenge(app, LAWYER_KEY);

    const res = await request(app).post("/api/auth/register").send({
      name: "Adv. Test",
      email: "lawyer-no-department@test.local",
      password: "password123",
      role: "Lawyer",
      walletAddress: lawyerWallet,
      signature,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.user.department).toBeFalsy();
  });

  it("allows Judge registration with no department (optional for oversight roles)", async () => {
    const { signature } = await signRegistrationChallenge(app, JUDGE_KEY);

    const res = await request(app).post("/api/auth/register").send({
      name: "Justice Test",
      email: "judge-no-department@test.local",
      password: "password123",
      role: "Judge",
      walletAddress: judgeWallet,
      signature,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.user.department).toBeFalsy();
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "police-ok@test.local",
      password: "password123",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
  });

  it("rejects an incorrect password", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "police-ok@test.local",
      password: "wrong-password",
    });

    expect(res.status).toBe(401);
  });

  it("rejects a nonexistent email", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "nobody-registered@test.local",
      password: "password123",
    });

    expect(res.status).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the authenticated user's profile with a valid token", async () => {
    const login = await request(app).post("/api/auth/login").send({
      email: "police-ok@test.local",
      password: "password123",
    });
    const token = login.body.data.token;

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("police-ok@test.local");
    expect(res.body.user.role).toBe("Police");
  });

  it("rejects a request with no token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects a request with an invalid token", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer not-a-real-token");

    expect(res.status).toBe(401);
  });
});
