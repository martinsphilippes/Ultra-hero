import { defineConfig } from "vitest/config";
import path from "node:path";

// Testes unitários (lógica pura: motor determinístico, máquinas de estado, validações).
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    reporters: ["default"],
    // aplica no node_modules a correção do otimizador de imagens do Next (idempotente; ver o arquivo)
    globalSetup: ["tests/setup/patch-next.ts"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // o tsconfig do Next usa jsx "preserve"; nos testes os componentes síncronos são renderizados
  // em HTML (react-dom/server), então o JSX precisa ser transformado aqui
  oxc: { jsx: { runtime: "automatic" } },
});
