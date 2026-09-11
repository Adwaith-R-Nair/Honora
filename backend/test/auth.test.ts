import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { ethers } from "ethers";
import app from "../src/app.js";
import { connectDB } from "../src/config/db.js";
import { POLICE_KEY, FORENSIC_KEY } from "./setup/global-setup.js";

const policeWallet = new ethers.Wallet(POLICE_KEY).address;
const forensicWallet = new ethers.Wallet(FORENSIC_KEY).address;

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe("POST /api/auth/register", () => {
  it("registers successfully when the wallet's on-chain role matches the claimed role", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Officer Test",
      email: "police-ok@test.local",
      password: "password123",
      role: "Police",
      walletAddress: policeWallet,
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.role).toBe("Police");
  });

  // Regression test for the fix in auth.service.ts: role used to be a free-text
  // claim with zero verification against the wallet's actual on-chain role —
  // this is what let anyone self-register as "Judge" and successfully upload
  // evidence on-chain as an impostor "Police" account (see
  // TECHNICAL_AND_SECURITY_AUDIT.md, Finding #1). This must stay a 403.
  it("rejects registration when the wallet's on-chain role does not match the claimed role", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Impostor",
      email: "impostor@test.local",
      password: "password123",
      role: "Judge", // forensicWallet is actually assigned Forensic on-chain, not Judge
      walletAddress: forensicWallet,
    });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/on-chain/i);
  });

  it("rejects registration for a wallet with no on-chain role assigned at all", async () => {
    const unassignedWallet = ethers.Wallet.createRandom().address;

    const res = await request(app).post("/api/auth/register").send({
      name: "Nobody",
      email: "nobody@test.local",
      password: "password123",
      role: "Police",
      walletAddress: unassignedWallet,
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not been assigned a role/i);
  });

  it("rejects a malformed wallet address", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Malformed",
      email: "malformed@test.local",
      password: "password123",
      role: "Police",
      walletAddress: "not-a-wallet-address",
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/invalid wallet address/i);
  });

  it("rejects a duplicate email", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Officer Test Again",
      email: "police-ok@test.local", // already registered above
      password: "password123",
      role: "Forensic",
      walletAddress: forensicWallet,
    });

    expect(res.status).toBe(409);
  });

  it("rejects a duplicate wallet address", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "Someone Else",
      email: "someone-else@test.local",
      password: "password123",
      role: "Police",
      walletAddress: policeWallet, // already registered above
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
    const res = await request(app).post("/api/auth/register").send({
      name: "Bad Role",
      email: "badrole@test.local",
      password: "password123",
      role: "Admin",
      walletAddress: ethers.Wallet.createRandom().address,
    });

    expect(res.status).toBe(400);
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
