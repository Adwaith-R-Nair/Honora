// wallet.js — thin wrapper around the browser's injected wallet (MetaMask
// etc.) for the EIP-712 wallet-ownership proof required at signup. No
// ethers/wagmi dependency needed — every injected wallet supports these two
// raw JSON-RPC methods directly.

export function isWalletAvailable() {
  return typeof window !== "undefined" && !!window.ethereum;
}

// Prompts the wallet's account-connection UI and returns the selected address.
export async function connectWallet() {
  if (!isWalletAvailable()) {
    throw new Error(
      "No wallet extension found. Install MetaMask (or another browser wallet) to sign up."
    );
  }

  try {
    // wallet_requestPermissions forces the account-picker UI every time,
    // even on a site MetaMask already trusts — without this, a repeat call
    // (e.g. the "Change" button) silently returns whichever account is
    // currently active instead of letting the user pick a different one.
    await window.ethereum.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch (err) {
    if (err.code === 4001) {
      throw new Error("Wallet connection was rejected.");
    }
    // Some injected wallets don't support wallet_requestPermissions — fall
    // through to the plain connect call below rather than failing outright.
  }

  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  if (!accounts || accounts.length === 0) {
    throw new Error("No wallet account was selected.");
  }
  return accounts[0];
}

// Signs an EIP-712 typed-data payload with the given address. `domain`,
// `types`, and `value` come verbatim from the backend's
// POST /api/auth/challenge response — never constructed independently here,
// so the signed payload always matches exactly what the backend will verify.
export async function signTypedData(fromAddress, domain, types, value) {
  const primaryType = Object.keys(types)[0];

  const payload = JSON.stringify({
    domain,
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      ...types,
    },
    primaryType,
    message: value,
  });

  try {
    return await window.ethereum.request({
      method: "eth_signTypedData_v4",
      params: [fromAddress, payload],
    });
  } catch (err) {
    if (err.code === 4001) {
      throw new Error("Signature request was rejected.");
    }
    throw new Error(err.message || "Failed to sign the wallet-ownership challenge.");
  }
}
