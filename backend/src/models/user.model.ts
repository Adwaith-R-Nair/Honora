import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

// ── Role type mirroring Solidity enum ────────────────────────────────────────
export type UserRole = "Police" | "Forensic" | "Lawyer" | "Judge";

// Roles operationally tied to a department (case category they work within) —
// required to register with one of these roles. Lawyer/Judge are oversight
// roles that plausibly need cross-department visibility, so department stays
// optional for them; when unset, their AI search results are unrestricted.
export const DEPARTMENT_REQUIRED_ROLES: UserRole[] = ["Police", "Forensic"];

// ── Interface ─────────────────────────────────────────────────────────────────
export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  department?: string;
  walletAddress: string;
  createdAt: Date;
  comparePassword(password: string): Promise<boolean>;
}

// ── Schema ────────────────────────────────────────────────────────────────────
const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: [true, "Password is required"],
    },
    role: {
      type: String,
      enum: ["Police", "Forensic", "Lawyer", "Judge"],
      required: [true, "Role is required"],
    },
    department: {
      type: String,
      trim: true,
      required: [
        function (this: IUser) {
          return DEPARTMENT_REQUIRED_ROLES.includes(this.role);
        },
        "Department is required for Police and Forensic roles",
      ],
    },
    walletAddress: {
      type: String,
      required: [true, "Wallet address is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// ── Method: compare plain password against stored hash ────────────────────────
UserSchema.methods.comparePassword = async function (
  password: string
): Promise<boolean> {
  return bcrypt.compare(password, this.passwordHash);
};

export const User = mongoose.model<IUser>("User", UserSchema);