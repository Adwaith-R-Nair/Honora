import type { Request, Response } from "express";
import { generateFileHash } from "../services/hash.service.js";
import { uploadToIPFS } from "../services/pinata.service.js";
import {
  addEvidence,
  getEvidence,
  getCustodyHistory,
  isFileHashRegistered,
  getEvidenceCount,
} from "../services/contract.service.js";
import { Evidence } from "../models/evidence.model.js";
import { ENV } from "../config/env.js";

/**
 * POST /api/evidence/upload
 * Role: Police only
 *
 * Body (form-data):
 * - file:       File
 * - caseId:     number
 * - caseName:   string  (e.g. "State v. Richardson")
 * - department: string  (e.g. "financial-crimes")
 */
export async function uploadEvidence(
  req: Request,
  res: Response
): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: "No file uploaded" });
      return;
    }

    const caseId = parseInt(req.body.caseId, 10);
    if (isNaN(caseId) || caseId <= 0) {
      res.status(400).json({
        success: false,
        error: "caseId must be a positive integer",
      });
      return;
    }

    const { caseName, department } = req.body;
    if (!caseName) {
      res.status(400).json({ success: false, error: "caseName is required" });
      return;
    }
    if (!department) {
      res.status(400).json({ success: false, error: "department is required" });
      return;
    }

    const { buffer, originalname } = req.file;

    // Step 1: Generate SHA-256 hash
    const fileHash = generateFileHash(buffer);
    console.log(`[Evidence] SHA-256: ${fileHash}`);

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
    console.log(`[Evidence] Uploading to IPFS: ${originalname}`);
    const ipfsCID = await uploadToIPFS(buffer, originalname);
    const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${ipfsCID}`;
    console.log(`[Evidence] CID: ${ipfsCID}`);

    // Step 4: Register on-chain
    console.log(`[Evidence] Registering on-chain for caseId: ${caseId}`);
    const txHash = await addEvidence(caseId, ipfsCID, fileHash);
    console.log(`[Evidence] TX: ${txHash}`);

    // Step 5: Get the new evidenceId (contract increments count on each upload)
    const evidenceId = await getEvidenceCount();
    const timestamp = Math.floor(Date.now() / 1000);

    // Step 6: Save enriched metadata to MongoDB
    await Evidence.create({
      evidenceId,
      caseId,
      caseName,
      department,
      filename:   originalname,
      ipfsCID,
      ipfsUrl,
      fileHash,
      uploadedBy: req.user?.walletAddress ?? "",
      timestamp,
    });

    console.log(`[Evidence] Saved to MongoDB: evidenceId ${evidenceId}`);

    // ── Notify AI service for Qdrant indexing (non-blocking) ────────────────
    try {
      await fetch(`${ENV.AI_SERVICE_URL}/api/index`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": req.headers.authorization ?? "",
        },
        body: JSON.stringify({ evidenceId: evidenceId.toString() }),
      });
      console.log(`[AI] Indexed evidenceId ${evidenceId} in Qdrant`);
    } catch {
      // AI service not running — silently skip, don't fail the upload
      console.log(`[AI] Service unavailable — skipping Qdrant indexing`);
    }
    // ────────────────────────────────────────────────────────────────────────

    res.status(201).json({
      success: true,
      message: "Evidence uploaded and registered on-chain",
      data: {
        evidenceId,
        caseId,
        caseName,
        department,
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
    console.error("[Evidence] Upload failed:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

/**
 * GET /api/evidence/:id
 * Role: All authenticated users
 *
 * Returns merged on-chain + MongoDB metadata
 */
export async function getEvidenceById(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const evidenceId = parseInt(req.params.id, 10);
    if (isNaN(evidenceId) || evidenceId <= 0) {
      res.status(400).json({
        success: false,
        error: "evidenceId must be a positive integer",
      });
      return;
    }

    // Fetch from blockchain + MongoDB in parallel
    const [onChain, meta] = await Promise.all([
      getEvidence(evidenceId),
      Evidence.findOne({ evidenceId }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        evidenceId:    onChain.evidenceId.toString(),
        caseId:        onChain.caseId.toString(),
        caseName:      meta?.caseName ?? null,
        department:    meta?.department ?? null,
        filename:      meta?.filename ?? null,
        ipfsCID:       onChain.ipfsCID,
        fileHash:      onChain.fileHash,
        uploadedBy:    onChain.uploadedBy,
        timestamp:     onChain.timestamp.toString(),
        currentHolder: onChain.currentHolder,
        ipfsUrl:       `https://gateway.pinata.cloud/ipfs/${onChain.ipfsCID}`,
        status:        meta?.status ?? "Under Investigation",
      },
    });
  } catch (error) {
    console.error("[Evidence] Fetch failed:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

/**
 * GET /api/evidence/:id/history
 * Role: All authenticated users
 */
export async function getEvidenceHistory(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const evidenceId = parseInt(req.params.id, 10);
    if (isNaN(evidenceId) || evidenceId <= 0) {
      res.status(400).json({
        success: false,
        error: "evidenceId must be a positive integer",
      });
      return;
    }

    const history = await getCustodyHistory(evidenceId);

    res.status(200).json({
      success: true,
      data: history.map((record) => ({
        from:      record.from,
        to:        record.to,
        timestamp: record.timestamp.toString(),
      })),
    });
  } catch (error) {
    console.error("[Evidence] History fetch failed:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

/**
 * PATCH /api/evidence/:id/status
 * Role: Police only
 *
 * Body: { status: "Open" | "Under Investigation" | "Closed" }
 * Updates the status of ALL evidence items sharing the same caseId.
 */
export async function updateEvidenceStatus(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const evidenceId = parseInt(req.params.id, 10);
    if (isNaN(evidenceId) || evidenceId <= 0) {
      res.status(400).json({
        success: false,
        error: "evidenceId must be a positive integer",
      });
      return;
    }

    const { status } = req.body;
    const validStatuses = ["Open", "Under Investigation", "Closed"];
    if (!status || !validStatuses.includes(status)) {
      res.status(400).json({
        success: false,
        error: `status must be one of: ${validStatuses.join(", ")}`,
      });
      return;
    }

    // Find the evidence to get its caseId
    const evidence = await Evidence.findOne({ evidenceId });
    if (!evidence) {
      res.status(404).json({ success: false, error: "Evidence not found" });
      return;
    }

    // Update ALL evidence items with the same caseId
    const result = await Evidence.updateMany(
      { caseId: evidence.caseId },
      { $set: { status } }
    );

    console.log(`[Evidence] Status updated: caseId ${evidence.caseId} → ${status} (${result.modifiedCount} items)`);

    res.status(200).json({
      success: true,
      message: `Status updated to "${status}" for case ${evidence.caseId}`,
      data: {
        caseId: evidence.caseId,
        status,
        updatedCount: result.modifiedCount,
      },
    });
  } catch (error) {
    console.error("[Evidence] Status update failed:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

/**
 * GET /api/evidence
 * Role: All authenticated users
 * Returns all evidence metadata from MongoDB for the dashboard
 */
export async function getAllEvidence(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const page  = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const skip  = (page - 1) * limit;

    const [allEvidence, total] = await Promise.all([
      Evidence.find().sort({ timestamp: -1 }).skip(skip).limit(limit),
      Evidence.countDocuments(),
    ]);

    res.status(200).json({
      success: true,
      count: allEvidence.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: allEvidence,
    });
  } catch (error) {
    console.error("[Evidence] Fetch all failed:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}