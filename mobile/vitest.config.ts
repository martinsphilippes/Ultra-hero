import { defineConfig } from "vitest/config";

// Só a lógica pura da casca (navegação, ponte); a WebView em si se testa no aparelho (../docs/lojas.md).
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
