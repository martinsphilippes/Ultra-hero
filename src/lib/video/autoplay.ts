// Vídeo começa sozinho ao abrir o conteúdo. Navegadores (e o iPhone) só permitem autoplay sem som:
// o vídeo abre mudo e o próprio player mostra o botão de som. Parâmetros por provedor do iframe.
export function withAutoplay(src: string): string {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return src;
  }
  const host = url.hostname;
  if (host.endsWith("cloudflarestream.com") || host.endsWith("videodelivery.net")) {
    url.searchParams.set("autoplay", "true");
    url.searchParams.set("muted", "true");
  } else if (host.includes("youtube")) {
    url.searchParams.set("autoplay", "1");
    url.searchParams.set("mute", "1");
    url.searchParams.set("playsinline", "1");
  } else if (host === "player.vimeo.com") {
    url.searchParams.set("autoplay", "1");
    url.searchParams.set("muted", "1");
    url.searchParams.set("playsinline", "1");
  } else {
    return src;
  }
  return url.toString();
}
