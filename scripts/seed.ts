import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, basename } from "path";
import * as dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config({ path: resolve("backend/.env") });

/**
 * seed.ts — Populate the local blockchain + MongoDB with test evidence data
 *
 * Prerequisites:
 * 1. Hardhat node running (npx hardhat node)
 * 2. setup.ts already run (npx hardhat run scripts/setup.ts --network localhost)
 * 3. Backend running (cd backend && npm run dev)
 *
 * Run with:
 *   npx hardhat run scripts/seed.ts --network localhost
 */

const BACKEND_URL = "http://localhost:3000";

// ── Test Users ────────────────────────────────────────────────────────────────
// privateKey is the well-known, deterministic Hardhat test account matching
// each walletAddress (same ones used throughout this project's test
// infrastructure) — needed to sign the login challenge below; never used
// outside this disposable local chain.
const TEST_USERS = [
  {
    name: "Officer Rajan",
    email: "rajan@keralapolice.gov",
    password: "police123",
    role: "Police",
    walletAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  },
  {
    name: "Dr. Priya Forensics",
    email: "priya@forensics.gov",
    password: "forensic123",
    role: "Forensic",
    walletAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    privateKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  },
  {
    name: "Adv. Suresh Lawyer",
    email: "suresh@legalaid.gov",
    password: "lawyer123",
    role: "Lawyer",
    walletAddress: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    privateKey: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  },
  {
    name: "Justice Menon",
    email: "menon@court.gov",
    password: "judge123",
    role: "Judge",
    walletAddress: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    privateKey: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  },
];

// ── Case Definitions ──────────────────────────────────────────────────────────
const CASES = [
  { caseId: 1, caseName: "C.C. No. 088/2025 — Drug Trafficking, Kaloor",               department: "narcotics"       },
  { caseId: 2, caseName: "C.C. No. 234/2025 — Drug Trafficking, Fort Kochi",            department: "narcotics"       },
  { caseId: 3, caseName: "C.C. No. 345/2025 — Jewellery Store Robbery, Panampilly",     department: "robbery"         },
  { caseId: 4, caseName: "C.C. No. 543/2024 — Taxi Stand Murder",                       department: "homicide"        },
  { caseId: 5, caseName: "C.C. No. 670/2024 — Parking Garage Homicide",                 department: "homicide"        },
  { caseId: 6, caseName: "C.C. No. 690/2025 — Assault in College Parking Area",         department: "assault"         },
  { caseId: 7, caseName: "C.C. No. 907/2023 — Hit and Run, Fort Kochi",                 department: "hit-and-run"     },
  { caseId: 8, caseName: "Drug Trafficking — Vypin",                                    department: "narcotics"       },
];

// ── Test Data Folder Mapping ──────────────────────────────────────────────────
const POLICE_FOLDERS: Record<number, string> = {
  1: "case1-drug-trafficking-kaloor",
  2: "case2-drug-trafficking-fortkochi",
  3: "case3-jewellery-robbery-panampilly",
  4: "case4-taxistand-murder",
  5: "case5-parking-garage-homicide",
  6: "case6-assault-college-parking",
  7: "case7-hit-and-run-fortkochi",
  8: "case8-drug-trafficking-vypin",
};

const FORENSIC_FOLDERS: Record<number, string> = {
  1: "case1",
  2: "case2",
  3: "case3",
  4: "case4",
  5: "case5",
  6: "case6",
};

const LAWYER_FOLDERS: Record<number, string> = {
  3: "case3",
  4: "case4",
  5: "case5",
  7: "case7",
};

// ── Helper — Get all files in a folder ───────────────────────────────────────
function getFilesInFolder(folderPath: string): string[] {
  if (!existsSync(folderPath)) return [];
  return readdirSync(folderPath)
    .filter((f) => !f.startsWith("."))
    .map((f) => resolve(folderPath, f));
}

// ── Helper — Sign a wallet challenge for login or registration ───────────────
async function getWalletSignature(
  privateKey: string,
  purpose: "registration" | "login"
): Promise<string> {
  const wallet = new ethers.Wallet(privateKey);
  const challengeRes = await fetch(`${BACKEND_URL}/api/auth/challenge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: wallet.address, purpose }),
  });
  const challengeData = (await challengeRes.json()) as any;
  if (!challengeRes.ok) {
    throw new Error(`Challenge request failed for ${wallet.address}: ${challengeData.error}`);
  }
  const { domain, types, value } = challengeData.data;
  return wallet.signTypedData(domain, types, value);
}

// ── Helper — Register or login user ──────────────────────────────────────────
async function ensureUser(user: typeof TEST_USERS[0]): Promise<string> {
  // Try login first — proves both password knowledge and current control of
  // the wallet already on file for this account.
  const loginSignature = await getWalletSignature(user.privateKey, "login");
  const loginRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      signature: loginSignature,
    }),
  });

  if (loginRes.ok) {
    const data = (await loginRes.json()) as any;
    return data.data.token;
  }

  // If login fails, register (first-time setup). privateKey never leaves
  // this script — only the resulting signature is sent over the wire.
  const { privateKey, ...registerBody } = user;
  const registerSignature = await getWalletSignature(privateKey, "registration");
  const registerRes = await fetch(`${BACKEND_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...registerBody, signature: registerSignature }),
  });

  if (!registerRes.ok) {
    const err = (await registerRes.json()) as any;
    throw new Error(`Failed to register ${user.email}: ${err.error}`);
  }

  const data = (await registerRes.json()) as any;
  return data.data.token;
}

// ── Helper — Upload evidence file ─────────────────────────────────────────────
async function uploadEvidence(
  filePath: string,
  caseId: number,
  caseName: string,
  department: string,
  token: string
): Promise<number | null> {
  const fileBuffer = readFileSync(filePath);
  const fileName = basename(filePath);

  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), fileName);
  formData.append("caseId", caseId.toString());
  formData.append("caseName", caseName);
  formData.append("department", department);

  const res = await fetch(`${BACKEND_URL}/api/evidence/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json() as any;
    // Skip duplicates silently
    if (err.error?.includes("already been registered")) {
      console.log(`      ⚠️  Duplicate skipped: ${fileName}`);
      return null;
    }
    console.error(`      ❌ Failed to upload ${fileName}: ${err.error}`);
    return null;
  }

  const data = await res.json() as any;
  return data.data.evidenceId;
}

// ── Helper — Upload supporting doc ────────────────────────────────────────────
async function uploadSupportingDoc(
  filePath: string,
  evidenceId: number,
  docType: string,
  token: string
): Promise<void> {
  const fileBuffer = readFileSync(filePath);
  const fileName = basename(filePath);

  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), fileName);
  formData.append("evidenceId", evidenceId.toString());
  formData.append("docType", docType);

  const res = await fetch(`${BACKEND_URL}/api/supporting-docs/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json() as any;
    if (err.error?.includes("already been registered")) {
      console.log(`      ⚠️  Duplicate skipped: ${fileName}`);
      return;
    }
    console.error(`      ❌ Failed to upload ${fileName}: ${err.error}`);
    return;
  }

  console.log(`      ✅ Supporting doc uploaded: ${fileName}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n╔════════════════════════════════════════════════╗");
  console.log("║          EMS — Test Data Seed Script           ║");
  console.log("╚════════════════════════════════════════════════╝\n");

  const testDataRoot = resolve("test-data");
  if (!existsSync(testDataRoot)) {
    throw new Error("test-data/ folder not found. Please create it first.");
  }

  // ── Clear existing evidence data ──────────────────────────────────────────────
  console.log("🧹 Clearing existing evidence data...\n");
  const clearRes = await fetch(`${BACKEND_URL}/api/seed/clear`, {
    method: "DELETE",
  });
  if (clearRes.ok) {
    console.log("   ✅ Evidence and supporting docs cleared\n");
  } else {
    console.log("   ⚠️  Clear failed — continuing anyway\n");
  }

  // ── Step 1: Register/Login all users ───────────────────────────────────────
  console.log("👤 Step 1 — Setting up test users...\n");
  const tokens: Record<string, string> = {};

  for (const user of TEST_USERS) {
    const token = await ensureUser(user);
    tokens[user.role] = token;
    console.log(`   ✅ ${user.role.padEnd(10)} — ${user.email}`);
  }

  // ── Step 2: Upload Police evidence ─────────────────────────────────────────
  console.log("\n📦 Step 2 — Uploading Police evidence...\n");

  // Track evidenceIds per case for supporting docs
  const caseEvidenceIds: Record<number, number[]> = {};

  for (const caseInfo of CASES) {
    const folderName = POLICE_FOLDERS[caseInfo.caseId];
    if (!folderName) continue;

    const folderPath = resolve(testDataRoot, "police", folderName);
    const files = getFilesInFolder(folderPath);

    if (files.length === 0) {
      console.log(`   ⚠️  No files found for Case ${caseInfo.caseId} — skipping`);
      continue;
    }

    console.log(`   📁 Case ${caseInfo.caseId} — ${caseInfo.caseName}`);
    caseEvidenceIds[caseInfo.caseId] = [];

    for (const filePath of files) {
      const evidenceId = await uploadEvidence(
        filePath,
        caseInfo.caseId,
        caseInfo.caseName,
        caseInfo.department,
        tokens["Police"]
      );

      if (evidenceId !== null) {
        caseEvidenceIds[caseInfo.caseId].push(evidenceId);
        console.log(`      ✅ evidenceId ${evidenceId} — ${basename(filePath)}`);
      }

      // Small delay to avoid overwhelming the local node
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // ── Step 3: Upload Forensic supporting docs ─────────────────────────────────
  console.log("\n🔬 Step 3 — Uploading Forensic supporting docs...\n");

  for (const [caseIdStr, folderName] of Object.entries(FORENSIC_FOLDERS)) {
    const caseId = parseInt(caseIdStr);
    const evidenceIds = caseEvidenceIds[caseId];

    if (!evidenceIds || evidenceIds.length === 0) {
      console.log(`   ⚠️  No evidence uploaded for Case ${caseId} — skipping forensic docs`);
      continue;
    }

    const folderPath = resolve(testDataRoot, "forensic", folderName);
    const files = getFilesInFolder(folderPath);

    if (files.length === 0) continue;

    // Link forensic docs to the first evidence of this case
    const targetEvidenceId = evidenceIds[0];
    console.log(`   📁 Case ${caseId} — linking to evidenceId ${targetEvidenceId}`);

    for (const filePath of files) {
      await uploadSupportingDoc(
        filePath,
        targetEvidenceId,
        "forensic_report",
        tokens["Forensic"]
      );
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // ── Step 4: Upload Lawyer supporting docs ──────────────────────────────────
  console.log("\n⚖️  Step 4 — Uploading Lawyer supporting docs...\n");

  for (const [caseIdStr, folderName] of Object.entries(LAWYER_FOLDERS)) {
    const caseId = parseInt(caseIdStr);
    const evidenceIds = caseEvidenceIds[caseId];

    if (!evidenceIds || evidenceIds.length === 0) {
      console.log(`   ⚠️  No evidence uploaded for Case ${caseId} — skipping lawyer docs`);
      continue;
    }

    const folderPath = resolve(testDataRoot, "lawyer", folderName);
    const files = getFilesInFolder(folderPath);

    if (files.length === 0) continue;

    const targetEvidenceId = evidenceIds[0];
    console.log(`   📁 Case ${caseId} — linking to evidenceId ${targetEvidenceId}`);

    for (const filePath of files) {
      await uploadSupportingDoc(
        filePath,
        targetEvidenceId,
        "court_filing",
        tokens["Lawyer"]
      );
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // ── Step 5: Print summary ──────────────────────────────────────────────────
  console.log("\n╔════════════════════════════════════════════════╗");
  console.log("║                   Summary                      ║");
  console.log("╚════════════════════════════════════════════════╝\n");

  for (const caseInfo of CASES) {
    const ids = caseEvidenceIds[caseInfo.caseId] ?? [];
    if (ids.length > 0) {
      console.log(`   Case ${caseInfo.caseId} — ${caseInfo.caseName}`);
      console.log(`   Department : ${caseInfo.department}`);
      console.log(`   Evidence IDs: ${ids.join(", ")}`);
      console.log();
    }
  }

  console.log("✅ Seed complete! Diya can now call:");
  console.log(`   GET http://localhost:3000/api/evidence/1`);
  console.log(`   GET http://localhost:3000/api/evidence/2`);
  console.log(`   ... and so on\n`);
}

main().catch((error) => {
  console.error("❌ Seed failed:", error);
  process.exit(1);
});