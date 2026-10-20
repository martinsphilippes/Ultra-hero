import { defineConfig } from "vitest/config";
import path from "node:path";

// Testes unitários (lógica pura: motor determinístico, máquinas de estado, validações).
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    reporters: ["default"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
