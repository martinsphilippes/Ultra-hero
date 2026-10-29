import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    // Só as fotos de perfil (0031) e as capas de herói (0042) dos buckets públicos: o otimizador não
    // serve outros objetos do projeto.
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/avatars/**" },
      { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/hero-covers/**" },
    ],
  },
  experimental: {
    // Foto de perfil (até 2 MiB) e capa do herói (até 3 MiB) passam pela server action, + multipart;
    // o padrão do Next é 1 MB.
    serverActions: { bodySizeLimit: "4mb" },
  },
  // As mensagens são lidas com fs em tempo de request: garante que vão para o bundle serverless.
  // "/*" cobre a rota raiz "/", "/**/*" as demais (o matcher usa `contains`).
  outputFileTracingIncludes: {
    "/*": ["./messages/**/*"],
    "/**/*": ["./messages/**/*"],
  },
  // A listagem de programas vive na aba "Programas" do Explorar; evita 404 em links diretos.
  async redirects() {
    return [{ source: "/programs", destination: "/explore?tab=programas", permanent: true }];
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
