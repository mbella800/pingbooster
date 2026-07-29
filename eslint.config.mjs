import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The Electron app is a separate CommonJS runtime — Next's TS rules flag its
    // require() imports, which are correct there. It should get its own lint
    // setup alongside the Electron tooling, not inherit the website's.
    "desktop/**",
    // Optional dev harnesses (see tools/README.md), not product code.
    "tools/**",
  ]),
]);

export default eslintConfig;
