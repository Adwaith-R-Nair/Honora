import type { TypedDataField } from "ethers";
import { ENV } from "../config/env.js";
import { getChainId } from "../services/contract.service.js";

// EIP-712 typed data for proving control of a wallet's private key — used at
// both registration (closes the gap where `role` verification only checked
// that a wallet *held* a role on-chain, a public fact, never that the
// registering person actually controlled it) and login (proves the person
// logging in still controls the exact wallet already on file for that
// account, not just its public address). The `purpose` field is what keeps
// a signature obtained for one from being replayed as the other.
export const WALLET_CHALLENGE_TYPES: Record<string, TypedDataField[]> = {
  WalletChallenge: [
    { name: "walletAddress", type: "address" },
    { name: "nonce", type: "string" },
    { name: "purpose", type: "string" },
  ],
};

export async function getWalletChallengeDomain() {
  const chainId = await getChainId();
  return {
    name: "Honora EMS",
    version: "1",
    chainId: Number(chainId),
    verifyingContract: ENV.CONTRACT_ADDRESS,
  };
}
