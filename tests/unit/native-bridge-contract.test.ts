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
    expect(parseWebToNative(JSON.stringify({ type: "push-permission" }))).toEqual({ type: "push-permission" });
    expect(parseWebToNative(JSON.stringify({ type: "push-sync" }))).toEqual({ type: "push-sync" });
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

  it("token de push só no formato da Expo; resultado negativo com motivo conhecido", () => {
    expect(parseNativeToWeb({ type: "push-token", token: "ExponentPushToken[abcdefghij]" })).toEqual({ type: "push-token", token: "ExponentPushToken[abcdefghij]" });
    expect(parseNativeToWeb({ type: "push-token", token: "x" })).toBeNull();
    expect(parseNativeToWeb({ type: "push-result", ok: false, reason: "denied" })).toEqual({ type: "push-result", ok: false, reason: "denied" });
    expect(parseNativeToWeb({ type: "push-result", ok: false, reason: "maybe" })).toBeNull();
  });

  it("recusa resultado incompleto", () => {
    expect(parseNativeToWeb({ type: "apple-result", ok: true, token: "t" })).toBeNull();
    expect(parseNativeToWeb({ type: "apple-result", ok: false, reason: "whatever" })).toBeNull();
    expect(parseNativeToWeb(null)).toBeNull();
  });
});
