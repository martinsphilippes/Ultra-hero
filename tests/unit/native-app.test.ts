import { describe, expect, it } from "vitest";
import { isBlockedInNativeApp, nativeAuthRedirect, parseNativeApp } from "@/lib/native-app/surface";

const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 GCHeroApp/1.0.0 (ios)";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 7 Build/AP3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 GCHeroApp/1.2.3 (android)";

describe("parseNativeApp", () => {
  it("reconhece a casca iOS e a Android pelo marcador do user agent", () => {
    expect(parseNativeApp(IOS_UA)).toEqual({ platform: "ios", version: "1.0.0" });
    expect(parseNativeApp(ANDROID_UA)).toEqual({ platform: "android", version: "1.2.3" });
  });

  it("navegador comum, PWA e user agent ausente não são o app", () => {
    expect(parseNativeApp(null)).toBeNull();
    expect(parseNativeApp(undefined)).toBeNull();
    expect(parseNativeApp("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1")).toBeNull();
    // plataforma fora da lista não liga o modo nativo
    expect(parseNativeApp("Mozilla/5.0 GCHeroApp/1.0.0 (windows)")).toBeNull();
  });
});

describe("isBlockedInNativeApp", () => {
  it("bloqueia comércio e planos simulados", () => {
    for (const path of ["/shop", "/shop/camiseta", "/cart", "/checkout", "/orders", "/orders/abc", "/profile/plan"]) {
      expect(isBlockedInNativeApp(path), path).toBe(true);
    }
  });

  it("bloqueia a biblioteca de produtos do herói e a aba Produtos do Explorar", () => {
    expect(isBlockedInNativeApp("/personalities/neymar/produtos")).toBe(true);
    expect(isBlockedInNativeApp("/explore", new URLSearchParams("tab=produtos"))).toBe(true);
    expect(isBlockedInNativeApp("/explore", new URLSearchParams("tab=receitas"))).toBe(false);
  });

  it("não bloqueia o resto do app, nem prefixo parecido", () => {
    for (const path of ["/", "/personalities", "/personalities/neymar", "/personalities/neymar/receitas", "/profile", "/profile/plans-x", "/shopping", "/explore", "/profile/lista-de-compras"]) {
      expect(isBlockedInNativeApp(path), path).toBe(false);
    }
  });
});

describe("nativeAuthRedirect", () => {
  it("leva o código e o destino de volta ao app pelo esquema próprio", () => {
    const url = nativeAuthRedirect(new URLSearchParams({ code: "abc", next: "/inicio" }));
    expect(url).toBe("gchero://auth/callback?code=abc&next=%2Finicio");
  });

  it("repassa o erro do provedor e descarta parâmetros desconhecidos", () => {
    const url = nativeAuthRedirect(new URLSearchParams({ error: "access_denied", error_code: "x", foo: "bar" }));
    expect(url).toBe("gchero://auth/callback?error=access_denied&error_code=x");
  });

  it("next inseguro volta para a aba Hero", () => {
    const url = nativeAuthRedirect(new URLSearchParams({ code: "abc", next: "https://evil.example" }));
    expect(url).toBe("gchero://auth/callback?code=abc&next=%2Fpersonalities");
  });
});
