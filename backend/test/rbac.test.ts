import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import { ethers } from "ethers";
import app from "../src/app.js";
import { connectDB } from "../src/config/db.js";
import {
  RBAC_TEST_POLICE_KEY,
  RBAC_TEST_FORENSIC_KEY,
  RBAC_TEST_LAWYER_KEY,
  RBAC_TEST_JUDGE_KEY,
} from "./setup/global-setup.js";

async function registerAndLogin(role: string, key: string, emailPrefix: string) {
  const walletAddress = new ethers.Wallet(key).address;
  const email = `${emailPrefix}@rbac.test.local`;
  const register = await request(app).post("/api/auth/register").send({
    name: `${role} Tester`,
    email,
    password: "password123",
    role,
    walletAddress,
  });
  if (register.status !== 201) {
    throw new Error(`Test setup registration failed for ${role}: ${JSON.stringify(register.body)}`);
  }
  const login = await request(app).post("/api/auth/login").send({ email, password: "password123" });
  return login.body.data.token as string;
}

let policeToken: string;
let forensicToken: string;
let lawyerToken: string;
let judgeToken: string;

beforeAll(async () => {
  await connectDB();
  policeToken = await registerAndLogin("Police", RBAC_TEST_POLICE_KEY, "rbac-police");
  forensicToken = await registerAndLogin("Forensic", RBAC_TEST_FORENSIC_KEY, "rbac-forensic");
  lawyerToken = await registerAndLogin("Lawyer", RBAC_TEST_LAWYER_KEY, "rbac-lawyer");
  judgeToken = await registerAndLogin("Judge", RBAC_TEST_JUDGE_KEY, "rbac-judge");
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe("Role enforcement — POST /api/evidence/upload (Police only)", () => {
  it("rejects Forensic with 403", async () => {
    const res = await request(app)
      .post("/api/evidence/upload")
      .set("Authorization", `Bearer ${forensicToken}`)
      .field("caseId", "1")
      .field("caseName", "Test")
      .field("department", "test");

    expect(res.status).toBe(403);
  });

  it("rejects Lawyer with 403", async () => {
    const res = await request(app)
      .post("/api/evidence/upload")
      .set("Authorization", `Bearer ${lawyerToken}`)
      .field("caseId", "1")
      .field("caseName", "Test")
      .field("department", "test");

    expect(res.status).toBe(403);
  });

  it("rejects Judge with 403", async () => {
    const res = await request(app)
      .post("/api/evidence/upload")
      .set("Authorization", `Bearer ${judgeToken}`)
      .field("caseId", "1")
      .field("caseName", "Test")
      .field("department", "test");

    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app)
      .post("/api/evidence/upload")
      .field("caseId", "1")
      .field("caseName", "Test")
      .field("department", "test");

    expect(res.status).toBe(401);
  });
});

describe("Role enforcement — PATCH /api/evidence/:id/status (Police only)", () => {
  it("rejects Forensic with 403", async () => {
    const res = await request(app)
      .patch("/api/evidence/1/status")
      .set("Authorization", `Bearer ${forensicToken}`)
      .send({ status: "Closed" });

    expect(res.status).toBe(403);
  });
});

describe("Role enforcement — POST /api/custody/transfer (Police or Forensic)", () => {
  it("rejects Lawyer with 403", async () => {
    const res = await request(app)
      .post("/api/custody/transfer")
      .set("Authorization", `Bearer ${lawyerToken}`)
      .send({ evidenceId: 1, newHolder: ethers.Wallet.createRandom().address });

    expect(res.status).toBe(403);
  });

  it("rejects Judge with 403", async () => {
    const res = await request(app)
      .post("/api/custody/transfer")
      .set("Authorization", `Bearer ${judgeToken}`)
      .send({ evidenceId: 1, newHolder: ethers.Wallet.createRandom().address });

    expect(res.status).toBe(403);
  });
});

describe("GET /api/evidence — all authenticated roles allowed", () => {
  it.each([
    ["Police", () => policeToken],
    ["Forensic", () => forensicToken],
    ["Lawyer", () => lawyerToken],
    ["Judge", () => judgeToken],
  ])("allows %s", async (_role, getToken) => {
    const res = await request(app)
      .get("/api/evidence")
      .set("Authorization", `Bearer ${getToken()}`);

    expect(res.status).toBe(200);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).get("/api/evidence");
    expect(res.status).toBe(401);
  });
});
