import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.supabase.co" }],
  },
  // As mensagens são lidas com fs em tempo de request: garante que vão para o bundle serverless.
  // "/*" cobre a rota raiz "/", "/**/*" as demais (o matcher usa `contains`).
  outputFileTracingIncludes: {
    "/*": ["./messages/**/*"],
    "/**/*": ["./messages/**/*"],
  },
  async headers() {
    return [
      {
        // Service worker sempre revalidado para atualizar rápido.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
