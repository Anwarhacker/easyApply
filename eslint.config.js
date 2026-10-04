import js from "@eslint/js";
import ts from "typescript-eslint";
import globals from "globals";
export default ts.config(
  {
    ignores: [
      "dist/**",
      "dist-dev/**",
      "dist-e2e/**",
      ".browser/**",
      ".browser134/**",
      ".test-browser-profiles/**",
      "playwright-results/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, chrome: "readonly" },
    },
  },
);
