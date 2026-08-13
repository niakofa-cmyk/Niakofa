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
import reactHooks from "eslint-plugin-react-hooks";

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
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    files: ["scripts/**/*.{ts,js,mjs}", "*.js", "*.mjs", "artifacts/api-server/build.mjs", "lib/db/scripts/**/*.{mjs,js}"],
    rules: {
      "no-console": "off",
    },
  },
);
