import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react/no-unescaped-entities": "off"
    }
  },
  {
    files: ["src/app/apple-icon.tsx", "src/app/opengraph-image.tsx"],
    // ImageResponse rasterizes native <img> elements. An explicit file scope
    // also handles the Next rule's differing Windows metadata-path detection.
    rules: { "@next/next/no-img-element": "off" }
  },
  globalIgnores([
    ".next/**",
    ".open-next/**",
    ".wrangler/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".agents/**",
    ".tmp/**",
    "reports/**",
    "npm-cache/**",
  ]),
]);

export default eslintConfig;
