// Shared ESLint flat config for the Next.js apps. Each app's eslint.config.mjs
// re-exports this (eslint-config-next resolves from the app, which has `next`
// installed).
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
