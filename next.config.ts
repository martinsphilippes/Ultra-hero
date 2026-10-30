import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    // Só as fotos de perfil (0031), as capas de herói (0042) e as fotos de post (0043) dos buckets
    // públicos: o otimizador não serve outros objetos do projeto.
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/avatars/**" },
      { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/hero-covers/**" },
      { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/post-photos/**" },
    ],
  },
  experimental: {
    // Foto de perfil (até 2 MiB), capa do herói (até 3 MiB) e foto do post (até 3,5 MiB) passam pela
    // server action, + multipart; o padrão do Next é 1 MB (a Vercel corta em ~4,5 MB).
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
    return [
      { source: "/programs", destination: "/explore?tab=programas", permanent: true },
      // abrir o app (endereço principal, ícone do celular) entra direto na aba Hero; o feed mora em /inicio
      { source: "/", destination: "/personalities", permanent: false },
    ];
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
