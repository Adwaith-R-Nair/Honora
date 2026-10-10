import dotenv from "dotenv";
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const ENV = {
  PINATA_JWT: requireEnv("PINATA_JWT"),
  RPC_URL: requireEnv("RPC_URL"),
  CONTRACT_ADDRESS: requireEnv("CONTRACT_ADDRESS"),
  PRIVATE_KEY: requireEnv("PRIVATE_KEY"),
  MONGODB_URI: requireEnv("MONGODB_URI"),
  JWT_SECRET: requireEnv("JWT_SECRET"),
  JWT_EXPIRES_IN: process.env["JWT_EXPIRES_IN"] ?? "24h",
  PORT: parseInt(process.env["PORT"] ?? "3000", 10),
  AI_SERVICE_URL: process.env["AI_SERVICE_URL"] ?? "http://localhost:8000",
  // Pinata's shared public gateway (gateway.pinata.cloud) is frequently slow
  // or unreachable under load — confirmed independently timing out outside
  // any Honora infra on 2026-10-10. A dedicated gateway (free with any
  // Pinata account, Dashboard -> Gateways) doesn't share that congestion.
  // Falls back to the public gateway if unset, so this stays optional.
  PINATA_GATEWAY_DOMAIN:
    process.env["PINATA_GATEWAY_DOMAIN"] ?? "gateway.pinata.cloud",
  CORS_ORIGINS: process.env["CORS_ORIGINS"]?.split(",") ?? [
    "http://localhost:5173",
    "http://localhost:3001",
  ],
  // Role-specific private keys for on-chain signing (Hardhat test accounts)
  FORENSIC_PRIVATE_KEY: process.env["FORENSIC_PRIVATE_KEY"] ?? "",
  LAWYER_PRIVATE_KEY: process.env["LAWYER_PRIVATE_KEY"] ?? "",
  JUDGE_PRIVATE_KEY: process.env["JUDGE_PRIVATE_KEY"] ?? "",
};