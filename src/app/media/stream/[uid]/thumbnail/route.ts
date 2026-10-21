import { isCloudflareStreamConfigured, isStreamUid, thumbnailUrl } from "@/lib/video/providers/cloudflare-stream";

// Miniatura de vídeo do Cloudflare Stream servida pelo próprio domínio (proxy, não redirect):
// assim cover_url é um caminho local que o next/image otimiza. Pública: aparece no feed.

export const dynamic = "force-dynamic";

const CACHE_OK = "public, max-age=86400, s-maxage=86400";

function notFound(): Response {
  return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ uid: string }> }): Promise<Response> {
  const { uid } = await params;
  if (!isStreamUid(uid) || !isCloudflareStreamConfigured()) return notFound();

  let upstream: Response;
  try {
    upstream = await fetch(thumbnailUrl(uid, { height: 720 }), { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch {
    return new Response("Bad Gateway", { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  // 404 do Cloudflare = vídeo inexistente; qualquer outra falha é do provedor.
  if (upstream.status === 404) return notFound();
  if (!upstream.ok || !(upstream.headers.get("content-type") ?? "").startsWith("image/")) {
    return new Response("Bad Gateway", { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  const bytes = await upstream.arrayBuffer();
  return new Response(bytes, {
    status: 200,
    headers: { "Content-Type": "image/jpeg", "Cache-Control": CACHE_OK },
  });
}
