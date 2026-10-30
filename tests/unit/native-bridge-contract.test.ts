import { describe, expect, it } from "vitest";
import { parseNativeToWeb, parseWebToNative } from "@/lib/native-app/bridge-contract";

describe("parseWebToNative", () => {
  it("aceita as mensagens do contrato", () => {
    expect(parseWebToNative(JSON.stringify({ type: "oauth", url: "https://x.supabase.co/auth/v1/authorize?provider=google" }))).toEqual({
      type: "oauth",
      url: "https://x.supabase.co/auth/v1/authorize?provider=google",
    });
    expect(parseWebToNative(JSON.stringify({ type: "apple-signin" }))).toEqual({ type: "apple-signin" });
    expect(parseWebToNative(JSON.stringify({ type: "share", url: "https://a.b/c" }))).toEqual({ type: "share", title: undefined, text: undefined, url: "https://a.b/c" });
    expect(parseWebToNative(JSON.stringify({ type: "theme", theme: "light" }))).toEqual({ type: "theme", theme: "light" });
  });

  it("recusa JSON inválido, tipo desconhecido e OAuth fora de https", () => {
    expect(parseWebToNative("{")).toBeNull();
    expect(parseWebToNative(JSON.stringify({ type: "exec", code: "x" }))).toBeNull();
    expect(parseWebToNative(JSON.stringify({ type: "oauth", url: "javascript:alert(1)" }))).toBeNull();
    // OAuth só abre a tela de autorização do Supabase, nunca um endereço qualquer
    expect(parseWebToNative(JSON.stringify({ type: "oauth", url: "https://evil.example/phish" }))).toBeNull();
    expect(parseWebToNative(JSON.stringify({ type: "theme", theme: "blue" }))).toBeNull();
    expect(parseWebToNative(JSON.stringify({ type: "share", title: 1 }))).toBeNull();
    expect(parseWebToNative("null")).toBeNull();
  });
});

describe("parseNativeToWeb", () => {
  it("aceita o resultado do Apple e do OAuth", () => {
    expect(parseNativeToWeb({ type: "apple-result", ok: true, token: "t", nonce: "n" })).toEqual({ type: "apple-result", ok: true, token: "t", nonce: "n" });
    expect(parseNativeToWeb({ type: "apple-result", ok: false, reason: "canceled" })).toEqual({ type: "apple-result", ok: false, reason: "canceled" });
    expect(parseNativeToWeb({ type: "apple-result", ok: true, token: "t", nonce: "n", fullName: "Ana Souza" })).toEqual({ type: "apple-result", ok: true, token: "t", nonce: "n", fullName: "Ana Souza" });
    expect(parseNativeToWeb({ type: "oauth-result", ok: false, reason: "error" })).toEqual({ type: "oauth-result", ok: false, reason: "error" });
  });

  it("recusa resultado incompleto", () => {
    expect(parseNativeToWeb({ type: "apple-result", ok: true, token: "t" })).toBeNull();
    expect(parseNativeToWeb({ type: "apple-result", ok: false, reason: "whatever" })).toBeNull();
    expect(parseNativeToWeb(null)).toBeNull();
  });
});
