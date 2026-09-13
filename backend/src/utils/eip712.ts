import type { TypedDataField } from "ethers";
import { ENV } from "../config/env.js";
import { getChainId } from "../services/contract.service.js";

// EIP-712 typed data for proving control of a wallet's private key at
// registration time — closes the gap where `role` verification only checked
// that a wallet *held* a role on-chain (a public fact, visible in any block
// explorer), never that the registering person actually controlled it.
export const REGISTRATION_TYPES: Record<string, TypedDataField[]> = {
  Registration: [
    { name: "walletAddress", type: "address" },
    { name: "nonce", type: "string" },
    { name: "purpose", type: "string" },
  ],
};

export async function getRegistrationDomain() {
  const chainId = await getChainId();
  return {
    name: "Honora EMS",
    version: "1",
    chainId: Number(chainId),
    verifyingContract: ENV.CONTRACT_ADDRESS,
  };
}
