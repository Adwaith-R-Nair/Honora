import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { ethers } from "ethers";
import { User, DEPARTMENT_REQUIRED_ROLES, type UserRole } from "../models/user.model.js";
import { ENV } from "../config/env.js";
import { getOnChainRole } from "./contract.service.js";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  department?: string;
  walletAddress: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  department?: string;
  walletAddress: string;
}

// ── Register ──────────────────────────────────────────────────────────────────
export async function registerUser(payload: RegisterPayload) {
  const { name, email, password, role, department, walletAddress } = payload;

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

  // ── On-chain role verification ────────────────────────────────────────────
  // A user may only register with the role their wallet actually holds
  // on-chain (assigned via the contract owner's assignRole). Without this,
  // `role` would be a free-text claim the client could set to anything.
  if (!ethers.isAddress(walletAddress)) {
    throw new Error("Invalid wallet address");
  }

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
  const { email, password } = payload;

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