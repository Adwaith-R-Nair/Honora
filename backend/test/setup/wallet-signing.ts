import request from "supertest";
import { ethers } from "ethers";
import type { Express } from "express";

/**
 * Requests a registration challenge for `walletKey`'s address and signs it,
 * returning what POST /api/auth/register now requires to prove wallet
 * ownership. Plain stateless helper — safe to import from any test file
 * (unlike global-setup.ts's own module-scope constants, this holds no state
 * shared across Vitest's module registries).
 */
export async function signRegistrationChallenge(
  app: Express,
  walletKey: string
): Promise<{ walletAddress: string; signature: string }> {
  const wallet = new ethers.Wallet(walletKey);

  const challengeRes = await request(app)
    .post("/api/auth/challenge")
    .send({ walletAddress: wallet.address });

  if (challengeRes.status !== 200) {
    throw new Error(`Challenge request failed: ${JSON.stringify(challengeRes.body)}`);
  }

  const { domain, types, value } = challengeRes.body.data;
  const signature = await wallet.signTypedData(domain, types, value);

  return { walletAddress: wallet.address, signature };
}
