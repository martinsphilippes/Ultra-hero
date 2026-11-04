import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// 0044: slug antigo do personagem -> slug da pessoa real (os dois heróis removidos dão 404)
const HERO_SLUG_REDIRECTS: Record<string, string> = {
  "tiago-albuquerque": "neymar",
  "davi-nascimento": "gabriel-medina",
  "camila-sato": "joao-fonseca",
  "lia-monteiro": "anitta",
  "rafael-duarte": "ronaldinho-gaucho",
  "helena-vilar": "erick-jacquin",
};

const nextConfig: NextConfig = {
  images: {
    // Só as fotos de perfil (0031), as capas de herói (0042), as fotos de post (0043) e as imagens dos temas (0100) dos buckets
    // públicos: o otimizador não serve outros objetos do projeto.
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/avatars/**" },
      { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/hero-covers/**" },
      { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/post-photos/**" },
      // imagens dos temas sazonais (0100): decorativos e fundo, enviados só pelo admin
      { protocol: "https", hostname: "**.supabase.co", pathname: "/storage/v1/object/public/theme-assets/**" },
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
    "/*": ["./messages/**/*", "./messages-native/**/*"],
    "/**/*": ["./messages/**/*", "./messages-native/**/*"],
  },
  // A listagem de programas vive na aba "Programas" do Explorar; evita 404 em links diretos.
  // Links antigos dos heróis (0044: personagens viraram as pessoas reais) levam ao slug novo.
  async redirects() {
    return [
      { source: "/programs", destination: "/explore?tab=programas", permanent: true },
      // "/" é decidido no middleware (etapa 7): com sessão ou no app das lojas → aba Hero (/personalities), como
      // antes; visitante sem sessão → página institucional (/conheca). O ícone do celular (PWA) e a casca das lojas
      // abrem direto em /personalities. O feed mora em /inicio.
      // pedidos moram em Minhas compras: redirect HTTP aqui, e não só o redirect() da página — com o
      // loading.tsx de /orders a resposta já começava a ser enviada e o redirect virava um refresh no
      // cliente (meta refresh/roteador depois de hidratar), lento na 1ª visita (o E2E às vezes via /orders)
      { source: "/orders", destination: "/shop/compras", permanent: false },
      ...Object.entries(HERO_SLUG_REDIRECTS).flatMap(([from, to]) => [
        { source: `/personalities/${from}`, destination: `/personalities/${to}`, permanent: true },
        { source: `/personalities/${from}/:library`, destination: `/personalities/${to}/:library`, permanent: true },
      ]),
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
      {
        // Feed .ics da agenda (/api/agenda/<token>, 0067): mesmas regras do kit (fora dos buscadores, sem token no Referer)
        source: "/api/agenda/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      {
        // Link rastreável da campanha (/r/<código>, 0083): fora dos buscadores e nunca em cache (cada clique conta)
        source: "/r/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        // Media kit público (/kit/<token>, 0065): fora dos buscadores e sem o token no Referer, inclusive
        // na página de link indisponível (404) e sem guardar em cache compartilhado.
        source: "/kit/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
