import type { MetadataRoute } from "next";

// Manifesto PWA (servido em /manifest.webmanifest).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ultra Hero",
    short_name: "Ultra Hero",
    description: "Rotina, treino, nutrição e gastronomia em um só lugar. Ambiente de demonstração.",
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B0B0B",
    theme_color: "#FF8A2B",
    categories: ["health", "lifestyle", "food"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
