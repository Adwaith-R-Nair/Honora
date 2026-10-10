import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { ethers } from "ethers";
import crypto from "crypto";
import { User, DEPARTMENT_REQUIRED_ROLES, type UserRole } from "../models/user.model.js";
import { RegistrationChallenge } from "../models/registrationChallenge.model.js";
import { ENV } from "../config/env.js";
import { getOnChainRole } from "./contract.service.js";
import { WALLET_CHALLENGE_TYPES, getWalletChallengeDomain } from "../utils/eip712.js";

export type ChallengePurpose = "registration" | "login";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  department?: string;
  walletAddress: string;
  signature: string;
}

export interface LoginPayload {
  email: string;
  password: string;
  signature: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  department?: string;
  walletAddress: string;
}

// ── Wallet challenge ──────────────────────────────────────────────────────────
// Issues a one-time EIP-712 nonce a wallet must sign to prove it controls the
// private key for the address in question — used both at registration (does
// this wallet belong to whoever's signing up?) and at login (does the person
// logging in still control the wallet already on file for this account?).
// `purpose` keeps a signature obtained for one from being replayed as the
// other.
export async function createWalletChallenge(walletAddress: string, purpose: ChallengePurpose) {
  if (!ethers.isAddress(walletAddress)) {
    throw new Error("Invalid wallet address");
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  await RegistrationChallenge.findOneAndUpdate(
    { walletAddress: walletAddress.toLowerCase() },
    { nonce, createdAt: new Date() },
    { upsert: true }
  );

  const domain = await getWalletChallengeDomain();
  return {
    domain,
    types: WALLET_CHALLENGE_TYPES,
    value: { walletAddress, nonce, purpose },
  };
}

// ── Register ──────────────────────────────────────────────────────────────────
export async function registerUser(payload: RegisterPayload) {
  const { name, email, password, role, department, walletAddress, signature } = payload;

  if (DEPARTMENT_REQUIRED_ROLES.includes(role) && !department?.trim()) {
    throw new Error(`Department is required for the ${role} role`);
  }

  // Check if email already exists
  const existingEmail = await User.findOne({ email });
  if (existingEmail) {
    throw new Error("Email already registered");
  }

  // Check if wallet address already exists
  const existingWallet = await User.findOne({
    walletAddress: walletAddress.toLowerCase(),
  });
  if (existingWallet) {
    throw new Error("Wallet address already registered");
  }

  if (!ethers.isAddress(walletAddress)) {
    throw new Error("Invalid wallet address");
  }

  // ── Wallet-ownership proof ───────────────────────────────────────────────
  // Verifies the caller controls walletAddress's private key, not just its
  // public string — a signature over the exact one-time nonce issued by
  // createWalletChallenge above. Consumed on both success and failure
  // so a nonce can never be reused (replay protection).
  const challenge = await RegistrationChallenge.findOne({
    walletAddress: walletAddress.toLowerCase(),
  });
  if (!challenge) {
    throw new Error(
      "No active registration challenge for this wallet. Request one from /api/auth/challenge first."
    );
  }
  await RegistrationChallenge.deleteOne({ _id: challenge._id });

  const domain = await getWalletChallengeDomain();
  const value = { walletAddress, nonce: challenge.nonce, purpose: "registration" as const };

  let recoveredAddress: string;
  try {
    recoveredAddress = ethers.verifyTypedData(domain, WALLET_CHALLENGE_TYPES, value, signature);
  } catch {
    throw new Error("Invalid signature — could not verify wallet ownership");
  }
  if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error("Signature does not match wallet address — wallet ownership not proven");
  }

  // ── On-chain role verification ────────────────────────────────────────────
  // A user may only register with the role their wallet actually holds
  // on-chain (assigned via the contract owner's assignRole). Without this,
  // `role` would be a free-text claim the client could set to anything.
  const onChainRole = await getOnChainRole(walletAddress);
  if (onChainRole !== role) {
    throw new Error(
      onChainRole === "None"
        ? "This wallet has not been assigned a role on-chain. Contact the system administrator."
        : `This wallet is assigned the '${onChainRole}' role on-chain, not '${role}'.`
    );
  }

  // Hash password
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(password, salt);

  // Create user
  const user = await User.create({
    name,
    email,
    passwordHash,
    role,
    department: department?.trim() || undefined,
    walletAddress: walletAddress.toLowerCase(),
  });

  // Generate JWT
  const token = generateToken({
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    department: user.department,
    walletAddress: user.walletAddress,
  });

  return {
    token,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      walletAddress: user.walletAddress,
    },
  };
}

// ── Login ─────────────────────────────────────────────────────────────────────
export async function loginUser(payload: LoginPayload) {
  const { email, password, signature } = payload;

  // Find user by email
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error("Invalid email or password");
  }

  // Compare password
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new Error("Invalid email or password");
  }

  // ── Wallet-ownership proof ───────────────────────────────────────────────
  // Beyond knowing the password, the caller must also currently control the
  // wallet already on file for this account — a signature over a one-time
  // nonce issued by createWalletChallenge(walletAddress, "login"). The
  // wallet checked is always the account's own stored address, never one the
  // client supplies, so there's no way to point this check at a different
  // wallet than the one actually on record.
  const challenge = await RegistrationChallenge.findOne({
    walletAddress: user.walletAddress,
  });
  if (!challenge) {
    throw new Error(
      "No active wallet challenge for this account. Connect your wallet and request one from /api/auth/challenge first."
    );
  }
  await RegistrationChallenge.deleteOne({ _id: challenge._id });

  const domain = await getWalletChallengeDomain();
  const value = {
    walletAddress: user.walletAddress,
    nonce: challenge.nonce,
    purpose: "login" as const,
  };

  let recoveredAddress: string;
  try {
    recoveredAddress = ethers.verifyTypedData(domain, WALLET_CHALLENGE_TYPES, value, signature);
  } catch {
    throw new Error("Invalid signature — could not verify wallet ownership");
  }
  if (recoveredAddress.toLowerCase() !== user.walletAddress.toLowerCase()) {
    throw new Error(
      "Connected wallet does not match this account's registered wallet — wallet ownership not proven"
    );
  }

  // Generate JWT
  const token = generateToken({
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    department: user.department,
    walletAddress: user.walletAddress,
  });

  return {
    token,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      walletAddress: user.walletAddress,
    },
  };
}

// ── JWT Helper ────────────────────────────────────────────────────────────────
function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, ENV.JWT_SECRET, {
    expiresIn: ENV.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}