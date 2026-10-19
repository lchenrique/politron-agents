import tseslint from "typescript-eslint";

// Perfil adicional de promessas: avisos medidos, sem alterar as regras existentes.
export default tseslint.config(
  { ignores: ["out", "dist", "node_modules", "src/renderer/playwright*.ts"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
    },
  },
);
