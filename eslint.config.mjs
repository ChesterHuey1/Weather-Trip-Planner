import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const USE_EFFECT_MESSAGE =
  "useEffect is banned in this project. Fetch data in server components or route handlers.";

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
  ]),
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "react", importNames: ["useEffect"], message: USE_EFFECT_MESSAGE }],
          patterns: [
            {
              group: ["@/scripts/*", "**/scripts/*"],
              message: "App and library code must not import from scripts/.",
            },
          ],
        },
      ],
      "no-restricted-properties": [
        "error",
        { object: "React", property: "useEffect", message: USE_EFFECT_MESSAGE },
      ],
    },
  },
  {
    // src/domain is pure logic: no adapters, app code, network, or database.
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "react", importNames: ["useEffect"], message: USE_EFFECT_MESSAGE }],
          patterns: [
            {
              group: [
                "@/src/adapters/*",
                "**/adapters/*",
                "@/app/*",
                "**/app/*",
                "@/scripts/*",
                "**/scripts/*",
                "next",
                "next/*",
                "firebase-admin",
                "firebase-admin/*",
                "cheerio",
                "node:http",
                "node:https",
                "node:net",
                "node:fs",
                "http",
                "https",
                "net",
                "fs",
                "undici",
              ],
              message:
                "src/domain must stay pure. Move network, database, and framework code to src/adapters or app.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "src/domain must not make network calls. Use an adapter." },
      ],
    },
  },
]);

export default eslintConfig;
