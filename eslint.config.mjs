import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Worktrees temporárias de agentes e cache de testes
      ".claude/**",
      ".vitest/**",
      "playwright-report/**",
      "test-results/**",
      // Assets estáticos (service worker roda em outro contexto global)
      "public/**",
      // App das lojas (Expo): projeto próprio, com lint e tsconfig dele
      "mobile/**",
    ],
  },
  {
    // Barreira de finalidade (docs/decisions/hoje-relogio.md §15.1): a credencial do papel
    // health_ingest (escrita no schema health) só pode ser usada pelas rotas de ingestão, OAuth,
    // cron de wearables e pelas ações de "Relógios e anéis".
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/health/**", "src/app/api/wearables/**", "src/app/api/cron/wearables/**", "src/app/(app)/profile/devices/actions.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "postgres", message: "Conexão direta ao Postgres só em src/lib/health/db.ts (papel health_ingest)." }],
          patterns: [
            {
              group: ["@/lib/health/db", "@/lib/health/store", "@/lib/health/pipeline", "@/lib/health/provider-api"],
              message: "Ingestão de saúde só nas rotas /api/wearables, no cron de wearables e nas ações de Relógios e anéis.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
