import { describe, expect, it } from "vitest";
import { decideNavigation, webUrlFromDeepLink, webUrlFromPath } from "../src/navigation";

const ORIGIN = "https://ultra-hero.vercel.app";

describe("decideNavigation", () => {
  it("o próprio site carrega na WebView", () => {
    expect(decideNavigation(`${ORIGIN}/personalities`, ORIGIN, true)).toBe("load");
    expect(decideNavigation("about:blank", ORIGIN, true)).toBe("load");
  });

  it("outro site no quadro principal abre no navegador do app, nunca dentro da casca", () => {
    expect(decideNavigation("https://www.instagram.com/neymarjr", ORIGIN, true)).toBe("browser");
    expect(decideNavigation("https://ultra-hero.vercel.app.evil.com/x", ORIGIN, true)).toBe("browser");
  });

  it("iframe de outro domínio (player de vídeo) carrega", () => {
    expect(decideNavigation("https://iframe.videodelivery.net/abc", ORIGIN, false)).toBe("load");
  });

  it("mailto, tel e similares vão para o sistema; esquema desconhecido é barrado", () => {
    expect(decideNavigation("mailto:contato@gchero.com", ORIGIN, true)).toBe("system");
    expect(decideNavigation("tel:+5511999999999", ORIGIN, true)).toBe("system");
    expect(decideNavigation("intent://x#Intent;end", ORIGIN, true)).toBe("block");
    expect(decideNavigation("javascript:alert(1)", ORIGIN, true)).toBe("block");
    expect(decideNavigation("http://ultra-hero.vercel.app/x", ORIGIN, true)).toBe("browser");
  });
});

describe("webUrlFromDeepLink", () => {
  it("volta do login: abre /auth/callback com o código na WebView", () => {
    expect(webUrlFromDeepLink("gchero://auth/callback?code=abc&next=%2Finicio", ORIGIN)).toBe(`${ORIGIN}/auth/callback?code=abc&next=%2Finicio`);
  });

  it("gchero://open?path= abre uma página do site", () => {
    expect(webUrlFromDeepLink("gchero://open?path=%2Fpersonalities%2Fneymar", ORIGIN)).toBe(`${ORIGIN}/personalities/neymar`);
  });

  it("caminho absoluto ou de protocolo relativo é recusado", () => {
    expect(webUrlFromDeepLink("gchero://open?path=https%3A%2F%2Fevil.com", ORIGIN)).toBeNull();
    expect(webUrlFromDeepLink("gchero://open?path=%2F%2Fevil.com", ORIGIN)).toBeNull();
    expect(webUrlFromDeepLink("gchero://open", ORIGIN)).toBeNull();
  });

  it("outro esquema ou rota desconhecida é ignorado", () => {
    expect(webUrlFromDeepLink("https://evil.com/auth/callback?code=x", ORIGIN)).toBeNull();
    expect(webUrlFromDeepLink("gchero://wipe", ORIGIN)).toBeNull();
  });
});

describe("webUrlFromPath", () => {
  it("caminho do aviso de push vira endereço do próprio site", () => {
    expect(webUrlFromPath("/content/treino", ORIGIN)).toBe(`${ORIGIN}/content/treino`);
  });

  it("endereço absoluto, protocolo relativo ou vazio são recusados", () => {
    expect(webUrlFromPath("https://evil.com", ORIGIN)).toBeNull();
    expect(webUrlFromPath("//evil.com", ORIGIN)).toBeNull();
    expect(webUrlFromPath(null, ORIGIN)).toBeNull();
  });
});
