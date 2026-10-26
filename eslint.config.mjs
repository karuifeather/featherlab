import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import react from "eslint-plugin-react";

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
      ".husky/_/**",
    ],
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.es2021 },
    },
  },
  {
    files: [
      "bin/**/*.{js,mjs,cjs}",
      "scripts/**/*.{js,mjs,cjs}",
      "src/**/*.{js,mjs,cjs}",
      "test/**/*.{js,mjs,cjs}",
      "web/vite.config.js",
      "*.config.mjs",
      "*.config.js",
    ],
    languageOptions: { globals: globals.node },
  },
  {
    // Playwright specs pass functions into the page, so they reference browser globals.
    files: ["test/e2e/**/*.mjs", "test/browser/**/*.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ["web/src/**/*.{js,jsx}"],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    rules: {
      "react/jsx-uses-vars": "error",
      ...reactHooks.configs.flat.recommended.rules,
    },
  },
  prettier,
];
