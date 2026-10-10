import request from "supertest";
import { ethers } from "ethers";
import type { Express } from "express";

/**
 * Requests a wallet challenge for `walletKey`'s address and signs it,
 * returning what POST /api/auth/register (purpose "registration") or
 * POST /api/auth/login (purpose "login") requires to prove wallet
 * ownership. Plain stateless helper — safe to import from any test file
 * (unlike global-setup.ts's own module-scope constants, this holds no state
 * shared across Vitest's module registries).
 */
export async function signWalletChallenge(
  app: Express,
  walletKey: string,
  purpose: "registration" | "login" = "registration"
): Promise<{ walletAddress: string; signature: string }> {
  const wallet = new ethers.Wallet(walletKey);

  const challengeRes = await request(app)
    .post("/api/auth/challenge")
    .send({ walletAddress: wallet.address, purpose });

  if (challengeRes.status !== 200) {
    throw new Error(`Challenge request failed: ${JSON.stringify(challengeRes.body)}`);
  }

  const { domain, types, value } = challengeRes.body.data;
  const signature = await wallet.signTypedData(domain, types, value);

  return { walletAddress: wallet.address, signature };
}

// Back-compat alias — existing callers all use this for registration.
export const signRegistrationChallenge = signWalletChallenge;
