import type { Request, Response } from "express";
import { registerUser, loginUser, createRegistrationChallenge } from "../services/auth.service.js";
import { User, DEPARTMENT_REQUIRED_ROLES } from "../models/user.model.js";

/**
 * POST /api/auth/challenge
 *
 * Step 1 of registration: issues a one-time EIP-712 nonce for a wallet
 * address. The client must sign it with that wallet (proving key ownership)
 * and pass the resulting signature to POST /api/auth/register.
 *
 * Request body: { "walletAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" }
 */
export async function challenge(req: Request, res: Response): Promise<void> {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress) {
      res.status(400).json({ success: false, error: "walletAddress is required" });
      return;
    }

    const result = await createRegistrationChallenge(walletAddress);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create challenge";
    res.status(400).json({ success: false, error: message });
  }
}

/**
 * POST /api/auth/register
 *
 * Registers a new user in MongoDB. Requires a signature (from
 * POST /api/auth/challenge) proving ownership of walletAddress, and the
 * wallet's on-chain role must match the claimed role.
 * `department` is required for Police/Forensic (scopes their AI search
 * results), optional for Lawyer/Judge (unset = unrestricted search).
 *
 * Request body:
 * {
 *   "name": "John Doe",
 *   "email": "john@police.gov",
 *   "password": "securepassword",
 *   "role": "Police",
 *   "department": "narcotics",
 *   "walletAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
 *   "signature": "0x..."
 * }
 */
export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { name, email, password, role, department, walletAddress, signature } = req.body;

    // ── Input validation ──────────────────────────────────────────────────────
    if (!name || !email || !password || !role || !walletAddress || !signature) {
      res.status(400).json({
        success: false,
        error: "All fields are required: name, email, password, role, walletAddress, signature",
      });
      return;
    }

    if (!["Police", "Forensic", "Lawyer", "Judge"].includes(role)) {
      res.status(400).json({
        success: false,
        error: "Role must be one of: Police, Forensic, Lawyer, Judge",
      });
      return;
    }

    if (DEPARTMENT_REQUIRED_ROLES.includes(role) && !department?.trim()) {
      res.status(400).json({
        success: false,
        error: `Department is required for the ${role} role`,
      });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({
        success: false,
        error: "Password must be at least 6 characters",
      });
      return;
    }

    const result = await registerUser({
      name,
      email,
      password,
      role,
      department,
      walletAddress,
      signature,
    });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed";
    const status = message.includes("already")
      ? 409
      : message.includes("on-chain") ||
          message.includes("Invalid wallet address") ||
          message.includes("signature") ||
          message.includes("wallet ownership") ||
          message.includes("registration challenge")
        ? 403
        : 500;
    res.status(status).json({ success: false, error: message });
  }
}

/**
 * POST /api/auth/login
 *
 * Logs in a user and returns a JWT token.
 *
 * Request body:
 * {
 *   "email": "john@police.gov",
 *   "password": "securepassword"
 * }
 */
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    // ── Input validation ──────────────────────────────────────────────────────
    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: "Email and password are required",
      });
      return;
    }

    const result = await loginUser({ email, password });

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    const status = message.includes("Invalid") ? 401 : 500;
    res.status(status).json({ success: false, error: message });
  }
}

/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user's profile.
 * Requires valid JWT in Authorization header.
 */
export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    const user = await User.findById(req.user?.userId).select("-passwordHash");
    if (!user) {
      res.status(404).json({ success: false, error: "User not found" });
      return;
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        walletAddress: user.walletAddress,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to fetch user",
    });
  }
}