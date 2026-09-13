import { ethers } from "ethers";
import { readFileSync } from "fs";
import { resolve } from "path";
import { ENV } from "../config/env.js";

// ── Load ABI from compiled artifact ──────────────────────────────────────────
const artifactPath = resolve(
  process.cwd(),
  "../artifacts/contracts/EvidenceRegistry.sol/EvidenceRegistry.json"
);

const artifact = JSON.parse(readFileSync(artifactPath, "utf-8"));

// ── Role enum mirroring Solidity ──────────────────────────────────────────────
export const RoleEnum: Record<string, number> = {
  None: 0,
  Police: 1,
  Forensic: 2,
  Lawyer: 3,
  Judge: 4,
};

export const RoleNames: Record<number, string> = {
  0: "None",
  1: "Police",
  2: "Forensic",
  3: "Lawyer",
  4: "Judge",
};

// ── Provider + Signer ─────────────────────────────────────────────────────────
const provider = new ethers.JsonRpcProvider(ENV.RPC_URL);
const signer = new ethers.Wallet(ENV.PRIVATE_KEY, provider);

// ── Contract instance ─────────────────────────────────────────────────────────
const contract = new ethers.Contract(
  ENV.CONTRACT_ADDRESS,
  artifact.abi,
  signer
);

// ── Types mirroring Solidity structs ──────────────────────────────────────────
export interface EvidenceRecord {
  evidenceId: bigint;
  caseId: bigint;
  ipfsCID: string;
  fileHash: string;
  uploadedBy: string;
  timestamp: bigint;
  currentHolder: string;
  exists: boolean;
}

export interface CustodyRecord {
  from: string;
  to: string;
  timestamp: bigint;
}

export interface SupportingDocRecord {
  docId: bigint;
  evidenceId: bigint;
  ipfsCID: string;
  fileHash: string;
  uploadedBy: string;
  timestamp: bigint;
  docType: string;
}

// ── Evidence Functions ────────────────────────────────────────────────────────

/**
 * Registers new evidence on-chain (Police only — enforced by contract).
 */
export async function addEvidence(
  caseId: number,
  ipfsCID: string,
  fileHash: string
): Promise<string> {
  const tx = await contract.addEvidence(caseId, ipfsCID, fileHash);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("addEvidence transaction failed on-chain");
  }
  return tx.hash;
}

/**
 * Adds a supporting document linked to existing evidence
 * (Forensic or Lawyer only — enforced by contract).
 */
export async function addSupportingDoc(
  evidenceId: number,
  ipfsCID: string,
  fileHash: string,
  docType: string,
  signerWallet: string
): Promise<string> {
  // Use the role-specific signer wallet for this transaction
  const roleSigner = new ethers.Wallet(signerWallet, provider);
  const roleContract = new ethers.Contract(
    ENV.CONTRACT_ADDRESS,
    artifact.abi,
    roleSigner
  );

  const tx = await roleContract.addSupportingDoc(
    evidenceId,
    ipfsCID,
    fileHash,
    docType
  );
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("addSupportingDoc transaction failed on-chain");
  }
  return tx.hash;
}

/**
 * Transfers custody of evidence to a new holder
 * (Police or Forensic only — enforced by contract).
 * Uses the role-specific signer so msg.sender matches the currentHolder on-chain.
 */
export async function transferCustody(
  evidenceId: number,
  newHolder: string,
  callerRole: string
): Promise<string> {
  let signerWallet: string;
  if (callerRole === "Forensic" && ENV.FORENSIC_PRIVATE_KEY) {
    signerWallet = ENV.FORENSIC_PRIVATE_KEY;
  } else {
    signerWallet = ENV.PRIVATE_KEY; // default: Police
  }

  const roleSigner = new ethers.Wallet(signerWallet, provider);
  const roleContract = new ethers.Contract(
    ENV.CONTRACT_ADDRESS,
    artifact.abi,
    roleSigner
  );

  const tx = await roleContract.transferCustody(evidenceId, newHolder);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("transferCustody transaction failed on-chain");
  }
  return tx.hash;
}

/**
 * Records an integrity check event on-chain
 * (Forensic or Judge only — enforced by contract).
 */
export async function recordIntegrityCheck(
  evidenceId: number,
  passed: boolean,
  signerWallet: string
): Promise<string> {
  const roleSigner = new ethers.Wallet(signerWallet, provider);
  const roleContract = new ethers.Contract(
    ENV.CONTRACT_ADDRESS,
    artifact.abi,
    roleSigner
  );

  const tx = await roleContract.recordIntegrityCheck(evidenceId, passed);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("recordIntegrityCheck transaction failed on-chain");
  }
  return tx.hash;
}

// ── View Functions ────────────────────────────────────────────────────────────

export async function getEvidence(
  evidenceId: number
): Promise<EvidenceRecord> {
  const result = await contract.getEvidence(evidenceId);
  return {
    evidenceId: result.evidenceId,
    caseId: result.caseId,
    ipfsCID: result.ipfsCID,
    fileHash: result.fileHash,
    uploadedBy: result.uploadedBy,
    timestamp: result.timestamp,
    currentHolder: result.currentHolder,
    exists: result.exists,
  };
}

export async function getCustodyHistory(
  evidenceId: number
): Promise<CustodyRecord[]> {
  const results = await contract.getCustodyHistory(evidenceId);
  return results.map((r: CustodyRecord) => ({
    from: r.from,
    to: r.to,
    timestamp: r.timestamp,
  }));
}

export async function getSupportingDocs(
  evidenceId: number
): Promise<SupportingDocRecord[]> {
  const results = await contract.getSupportingDocs(evidenceId);
  return results.map((r: SupportingDocRecord) => ({
    docId: r.docId,
    evidenceId: r.evidenceId,
    ipfsCID: r.ipfsCID,
    fileHash: r.fileHash,
    uploadedBy: r.uploadedBy,
    timestamp: r.timestamp,
    docType: r.docType,
  }));
}

export async function isFileHashRegistered(
  fileHash: string
): Promise<boolean> {
  return await contract.isFileHashRegistered(fileHash);
}

export async function getOnChainRole(address: string): Promise<string> {
  const role = await contract.getRole(address);
  return RoleNames[Number(role)] ?? "None";
}

export async function getEvidenceCount(): Promise<number> {
  const count = await contract.evidenceCount();
  return Number(count);
}

export async function getSupportingDocCount(): Promise<number> {
  const count = await contract.supportingDocCount();
  return Number(count);
}

export async function getChainId(): Promise<bigint> {
  const network = await provider.getNetwork();
  return network.chainId;
}