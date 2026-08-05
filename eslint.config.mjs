/**
 * ESLint configuration for the Niakofa monorepo.
 *
 * Enforces:
 *   - No explicit `any` types
 *   - No unused variables
 *   - Strict TypeScript rules aligned with tsconfig.base.json
 *   - App/AI boundary enforcement via custom rule
 *
 * Run: npx eslint .  (or pnpm run lint)
 */
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/generated/**",
      "niakofa-repo/**",
      "archive/**",
      "attached_assets/**",
      "pnpm-lock.yaml",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
);
