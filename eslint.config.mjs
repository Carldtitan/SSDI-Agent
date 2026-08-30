import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "out/**",
    ".playwright-cli/**",
    "playwright-report/**",
    "test-results/**",
    "skills/**",
    "_forms_test/**",
    "next-env.d.ts",
  ]),
]);
