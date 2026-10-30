import { isCloudflareStreamConfigured, isStreamUid, thumbnailUrl } from "@/lib/video/providers/cloudflare-stream";

// Miniatura de vídeo do Cloudflare Stream servida pelo próprio domínio (proxy, não redirect):
// assim cover_url é um caminho local que o next/image otimiza. Pública: aparece no feed.

export const dynamic = "force-dynamic";

const CACHE_OK = "public, max-age=86400, s-maxage=86400";

// A miniatura padrão do Stream é o 1º quadro, e vídeo de celular costuma abrir em preto (fade-in,
// lente tapada): no perfil o quadro virava um quadrado preto. Um quadro quase uniforme vira um JPEG
// minúsculo (o preto de 720p tem ~2 KB; qualquer cena real passa de 6 KB), então abaixo deste
// tamanho tentamos quadros seguintes. Tempo além do fim do vídeo responde 400: aí paramos.
const BLANK_FRAME_BYTES = 4096;
const LATER_FRAMES_SEC = [1, 2, 3] as const;

type Frame = { ok: true; bytes: ArrayBuffer } | { ok: false; status: number };

function notFound(): Response {
  return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

function badGateway(): Response {
  return new Response("Bad Gateway", { status: 502, headers: { "Cache-Control": "no-store" } });
}

async function fetchFrame(uid: string, time?: number): Promise<Frame> {
  const upstream = await fetch(thumbnailUrl(uid, { height: 720, time }), { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!upstream.ok || !(upstream.headers.get("content-type") ?? "").startsWith("image/")) return { ok: false, status: upstream.status };
  return { ok: true, bytes: await upstream.arrayBuffer() };
}

function image(bytes: ArrayBuffer): Response {
  return new Response(bytes, { status: 200, headers: { "Content-Type": "image/jpeg", "Cache-Control": CACHE_OK } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ uid: string }> }): Promise<Response> {
  const { uid } = await params;
  if (!isStreamUid(uid) || !isCloudflareStreamConfigured()) return notFound();

  let first: Frame;
  try {
    first = await fetchFrame(uid);
  } catch {
    return badGateway();
  }
  // 404 do Cloudflare = vídeo inexistente; qualquer outra falha é do provedor.
  if (!first.ok) return first.status === 404 ? notFound() : badGateway();
  if (first.bytes.byteLength >= BLANK_FRAME_BYTES) return image(first.bytes);

  // 1º quadro em branco/preto: o primeiro quadro seguinte com conteúdo; senão, o mais detalhado.
  let best = first.bytes;
  for (const time of LATER_FRAMES_SEC) {
    let frame: Frame;
    try {
      frame = await fetchFrame(uid, time);
    } catch {
      break;
    }
    if (!frame.ok) break;
    if (frame.bytes.byteLength >= BLANK_FRAME_BYTES) return image(frame.bytes);
    if (frame.bytes.byteLength > best.byteLength) best = frame.bytes;
  }
  return image(best);
}
