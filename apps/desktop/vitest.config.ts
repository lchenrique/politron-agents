import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // As suítes iniciam Git, SQLite e shells reais no Windows. Evita contenção entre
    // dezenas de workers sem aumentar timeouts nem serializar tarefas do produto.
    maxWorkers: 2,
    setupFiles: ["./src/renderer/src/test/setup.ts"],
    include: ["src/renderer/src/**/*.{test,spec}.{ts,tsx}", "src/main/**/*.{test,spec}.ts", "src/shared/**/*.{test,spec}.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src/renderer/src") },
  },
});
