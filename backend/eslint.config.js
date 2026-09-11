import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Backend's existing convention: errors cross the HTTP boundary as
      // `{ success: false, error: string }` JSON, not thrown exceptions —
      // `any` shows up legitimately at that boundary (req.body, caught
      // errors). Warn instead of error so it stays visible without blocking.
      "@typescript-eslint/no-explicit-any": "warn",
      // `declare global { namespace Express { ... } }` in auth.middleware.ts
      // augments Express's Request type — the standard, required TS syntax
      // for this. Only flag non-`declare` namespaces (the real code smell).
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  }
);
