import { defineConfig } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import * as dotenv from "dotenv";

dotenv.config();

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL;
const SEPOLIA_PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY;

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: "0.8.24",
  networks: {
    localhost: {
      type: "http",
      url: "http://127.0.0.1:8545",
    },
    // Only registered when a real URL is present — an empty-string URL fails
    // Hardhat 3's config validation outright (HHE15) even for commands that
    // never touch Sepolia (compile, local test). Matters anywhere without a
    // root .env: CI, or a fresh clone before Sepolia deploy is set up.
    ...(SEPOLIA_RPC_URL
      ? {
          sepolia: {
            type: "http" as const,
            url: SEPOLIA_RPC_URL,
            accounts: SEPOLIA_PRIVATE_KEY ? [SEPOLIA_PRIVATE_KEY] : [],
          },
        }
      : {}),
  },
});