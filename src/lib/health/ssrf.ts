// Anti-SSRF: o servidor só busca URL recebida da marca (ping da Garmin, `url` da Polar) se ela for
// https, sem usuário/senha nem porta, com host EXATAMENTE igual a um host da API da marca e no
// caminho esperado — senão o token da pessoa iria para um destino escolhido por terceiros (§9.4 c).

export function isAllowedProviderUrl(raw: string, allowedHosts: readonly string[], pathPrefix = "/"): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password || url.port) return false;
  if (!allowedHosts.includes(url.hostname)) return false;
  // caminho normalizado pelo URL (sem "..") e dentro do prefixo da API
  return url.pathname.startsWith(pathPrefix);
}
