import type { Request, Response } from "express";
import { generateFileHash } from "../services/hash.service.js";
import { uploadToIPFS } from "../services/pinata.service.js";
import {
  addSupportingDoc,
  getSupportingDocs,
  getEvidence,
  isFileHashRegistered,
  recordIntegrityCheck,
  getSupportingDocCount,
} from "../services/contract.service.js";
import { SupportingDoc } from "../models/evidence.model.js";
import { ENV } from "../config/env.js";

function getSignerKeyForRole(role: string): string | undefined {
  switch (role) {
    case "Forensic": return ENV.FORENSIC_PRIVATE_KEY || undefined;
    case "Lawyer":   return ENV.LAWYER_PRIVATE_KEY || undefined;
    case "Judge":    return ENV.JUDGE_PRIVATE_KEY || undefined;
    default:         return undefined;
  }
}

/**
 * POST /api/supporting-docs/upload
 * Role: Forensic or Lawyer
 */
export async function uploadSupportingDoc(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: "No file uploaded" });
      return;
    }

    const evidenceId = parseInt(req.body.evidenceId, 10);
    if (isNaN(evidenceId) || evidenceId <= 0) {
      res.status(400).json({
        success: false,
        error: "evidenceId must be a positive integer",
      });
      return;
    }

    const { docType } = req.body;
    if (!docType) {
      res.status(400).json({
        success: false,
        error: "docType is required (e.g. forensic_report, court_filing)",
      });
      return;
    }

    // Verify parent evidence exists
    await getEvidence(evidenceId);

    const { buffer, originalname } = req.file;

    // Step 1: Hash
    const fileHash = generateFileHash(buffer);
    console.log(`[SupportingDoc] SHA-256: ${fileHash}`);

    // Step 2: Duplicate check
    const isDuplicate = await isFileHashRegistered(fileHash);
    if (isDuplicate) {
      res.status(409).json({
        success: false,
        error: "This file has already been registered on-chain",
        fileHash,
      });
      return;
    }

    // Step 3: Upload to IPFS
    console.log(`[SupportingDoc] Uploading to IPFS: ${originalname}`);
    const ipfsCID = await uploadToIPFS(buffer, originalname);
    const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${ipfsCID}`;
    console.log(`[SupportingDoc] CID: ${ipfsCID}`);

    // Step 4: Get signer private key based on user role
    const signerPrivateKey = getSignerKeyForRole(req.user?.role ?? "");
    if (!signerPrivateKey) {
      res.status(403).json({
        success: false,
        error: "No signing key configured for your role",
      });
      return;
    }

    // Step 5: Register on-chain
    console.log(`[SupportingDoc] Registering on-chain for evidenceId: ${evidenceId}`);
    const txHash = await addSupportingDoc(
      evidenceId,
      ipfsCID,
      fileHash,
      docType,
      signerPrivateKey
    );
    console.log(`[SupportingDoc] TX: ${txHash}`);

    // Step 6: Get docId + save to MongoDB
    // Must happen BEFORE notifying the AI service — /api/index-supporting reads
    // this record back from the backend, and needs it to already exist.
    const docId = await getSupportingDocCount();
    const timestamp = Math.floor(Date.now() / 1000);

    await SupportingDoc.create({
      docId,
      evidenceId,
      docType,
      filename:   originalname,
      ipfsCID,
      ipfsUrl,
      fileHash,
      uploadedBy: req.user?.walletAddress ?? "",
      timestamp,
    });

    // ── Notify AI service for supporting doc indexing (non-blocking) ─────────
    try {
      await fetch(`${ENV.AI_SERVICE_URL}/api/index-supporting`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": req.headers.authorization ?? "",
        },
        body: JSON.stringify({ evidenceId: evidenceId.toString() }),
      });
      console.log(`[AI] Indexed supporting docs for evidenceId ${evidenceId}`);
    } catch {
      console.log(`[AI] Service unavailable — skipping supporting doc indexing`);
    }
// ─────────────────────────────────────────────────────────────────────────

    console.log(`[SupportingDoc] Saved to MongoDB: docId ${docId}`);

    res.status(201).json({
      success: true,
      message: "Supporting document uploaded and registered on-chain",
      data: {
        docId,
        evidenceId,
        docType,
        ipfsCID,
        fileHash,
        txHash,
        filename:   originalname,
        uploadedBy: req.user?.walletAddress,
        ipfsUrl,
        timestamp,
      },
    });
  } catch (error) {
    console.error("[SupportingDoc] Upload failed:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

/**
 * GET /api/supporting-docs/:evidenceId
 * Role: All authenticated users
 *
 * Returns merged on-chain + MongoDB metadata
 */
export async function getSupportingDocsByEvidence(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const evidenceId = parseInt(req.params.evidenceId, 10);
    if (isNaN(evidenceId) || evidenceId <= 0) {
      res.status(400).json({
        success: false,
        error: "evidenceId must be a positive integer",
      });
      return;
    }

    // Fetch from blockchain + MongoDB in parallel
    const [onChainDocs, mongoDocs] = await Promise.all([
      getSupportingDocs(evidenceId),
      SupportingDoc.find({ evidenceId }),
    ]);

    // Merge on-chain with MongoDB metadata
    const merged = onChainDocs.map((doc) => {
      const meta = mongoDocs.find((m) => m.docId === Number(doc.docId));
      return {
        docId:      doc.docId.toString(),
        evidenceId: doc.evidenceId.toString(),
        docType:    doc.docType,
        filename:   meta?.filename ?? null,
        ipfsCID:    doc.ipfsCID,
        fileHash:   doc.fileHash,
        uploadedBy: doc.uploadedBy,
        timestamp:  doc.timestamp.toString(),
        ipfsUrl:    `https://gateway.pinata.cloud/ipfs/${doc.ipfsCID}`,
      };
    });

    res.status(200).json({ success: true, data: merged });
  } catch (error) {
    console.error("[SupportingDoc] Fetch failed:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

/**
 * POST /api/supporting-docs/verify/:evidenceId
 * Role: Forensic or Judge
 *
 * Verifies the integrity of an original evidence file by comparing
 * its SHA-256 hash against the on-chain record.
 */
export async function verifyEvidenceIntegrity(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: "No file uploaded" });
      return;
    }

    const evidenceId = parseInt(req.params.evidenceId, 10);
    if (isNaN(evidenceId) || evidenceId <= 0) {
      res.status(400).json({
        success: false,
        error: "evidenceId must be a positive integer",
      });
      return;
    }

    const evidence = await getEvidence(evidenceId);
    const computedHash = generateFileHash(req.file.buffer);
    const passed = computedHash === evidence.fileHash;

    const signerPrivateKey = getSignerKeyForRole(req.user?.role ?? "");
    if (!signerPrivateKey) {
      res.status(403).json({
        success: false,
        error: "No signing key configured for your role",
      });
      return;
    }

    const txHash = await recordIntegrityCheck(evidenceId, passed, signerPrivateKey);

    console.log(
      `[Integrity] evidenceId ${evidenceId} — ${passed ? "PASSED ✅" : "FAILED ❌"} — TX: ${txHash}`
    );

    res.status(200).json({
      success: true,
      data: {
        evidenceId,
        passed,
        computedHash,
        onChainHash: evidence.fileHash,
        verifiedBy:  req.user?.walletAddress,
        txHash,
        message: passed
          ? "Integrity verified — file matches on-chain hash"
          : "Integrity check FAILED — file does not match on-chain hash",
      },
    });
  } catch (error) {
    console.error("[Integrity] Verification failed:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

/**
 * POST /api/supporting-docs/verify-doc/:docId
 * Role: Forensic or Judge
 *
 * Verifies the integrity of a supporting document by comparing
 * its SHA-256 hash against the on-chain record for that specific doc.
 */
export async function verifySupportingDocIntegrity(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: "No file uploaded" });
      return;
    }

    const docId = parseInt(req.params.docId, 10);
    if (isNaN(docId) || docId <= 0) {
      res.status(400).json({
        success: false,
        error: "docId must be a positive integer",
      });
      return;
    }

    // Find the supporting doc in MongoDB to get its parent evidenceId
    const mongoDoc = await SupportingDoc.findOne({ docId });
    if (!mongoDoc) {
      res.status(404).json({
        success: false,
        error: `Supporting document with docId ${docId} not found`,
      });
      return;
    }

    const parentEvidenceId = mongoDoc.evidenceId;

    // Fetch all on-chain supporting docs for the parent evidence
    const onChainDocs = await getSupportingDocs(parentEvidenceId);
    const onChainDoc = onChainDocs.find(
      (d) => Number(d.docId) === docId
    );

    if (!onChainDoc) {
      res.status(404).json({
        success: false,
        error: `Supporting document docId ${docId} not found on-chain`,
      });
      return;
    }

    const computedHash = generateFileHash(req.file.buffer);
    const passed = computedHash === onChainDoc.fileHash;

    // Record integrity check on-chain (against the parent evidence)
    const signerPrivateKey = getSignerKeyForRole(req.user?.role ?? "");
    if (!signerPrivateKey) {
      res.status(403).json({
        success: false,
        error: "No signing key configured for your role",
      });
      return;
    }

    const txHash = await recordIntegrityCheck(parentEvidenceId, passed, signerPrivateKey);

    console.log(
      `[Integrity] docId ${docId} (evidenceId ${parentEvidenceId}) — ${passed ? "PASSED ✅" : "FAILED ❌"} — TX: ${txHash}`
    );

    res.status(200).json({
      success: true,
      data: {
        docId,
        evidenceId: parentEvidenceId,
        passed,
        computedHash,
        onChainHash: onChainDoc.fileHash,
        verifiedBy:  req.user?.walletAddress,
        txHash,
        message: passed
          ? "Integrity verified — supporting document matches on-chain hash"
          : "Integrity check FAILED — supporting document does not match on-chain hash",
      },
    });
  } catch (error) {
    console.error("[Integrity] Supporting doc verification failed:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}