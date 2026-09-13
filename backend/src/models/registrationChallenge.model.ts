import mongoose, { Schema, Document } from "mongoose";

// Short-lived nonce a wallet must sign (EIP-712) to prove ownership before
// registration is allowed to complete. One outstanding challenge per wallet —
// requesting a new one replaces the old (findOneAndUpdate upsert), which also
// naturally invalidates any previously-issued nonce for that address.
export interface IRegistrationChallenge extends Document {
  walletAddress: string;
  nonce: string;
  createdAt: Date;
}

const RegistrationChallengeSchema = new Schema<IRegistrationChallenge>({
  walletAddress: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: true,
  },
  nonce: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 300, // TTL index — Mongo auto-deletes 5 minutes after issuance
  },
});

export const RegistrationChallenge = mongoose.model<IRegistrationChallenge>(
  "RegistrationChallenge",
  RegistrationChallengeSchema
);
