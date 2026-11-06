import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import quality from "./eslint-rules/index.cjs";

export default tseslint.config(
  { ignores: ["out", "dist", "node_modules", "src/main/marketplace/catalog", "src/renderer/src/components/assistant-ui"] }, // código do registro do assistant-ui, mantido como veio
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { quality },
    rules: {
      // Legado com arquivos maiores: medir como aviso antes de bloquear a base.
      "quality/max-lines": ["warn", { max: 350 }],
      "quality/no-direct-console": ["warn", { allow: ["error"], logger: "o logger do aplicativo" }],
      // A UI Electron usa preload/IPC; não deve consumir cliente SQLite do main.
      "quality/no-direct-data-access": ["error", {
        modules: ["node:sqlite", "../../../main/v9/store", "../../main/v9/store"],
        layers: ["/src/renderer/"],
        bindings: ["DatabaseSync", "WorkspaceStore", "db", "store"],
      }],
    },
  },

  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["src/renderer/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["src/main/**/*.ts", "src/preload/**/*.ts", "src/shared/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
