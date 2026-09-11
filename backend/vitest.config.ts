import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/setup/global-setup.ts"],
    fileParallelism: false, // integration tests share one Hardhat node + one Mongo instance
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
