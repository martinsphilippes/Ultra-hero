import type { MetadataRoute } from "next";
import { getOrigin } from "@/lib/auth/origin";
import { recipesSeoIndexEnabled } from "@/lib/recipes/jsonld";

// robots.txt (fase 3 de receitas): áreas de trabalho, dados pessoais e o Modo Cozinha ficam fora dos
// buscadores. O sitemap só é anunciado com RECIPES_SEO_INDEX ligada (P6: desligada por padrão;
// ligar é decisão do responsável).
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await getOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/creator", "/admin", "/seller", "/agencia", "/marca", "/kit", "/profile", "/api", "/*/cozinha"],
      },
    ],
    ...(recipesSeoIndexEnabled() ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
