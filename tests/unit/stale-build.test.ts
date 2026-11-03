import { describe, expect, it } from "vitest";
import { isStaleBuildError, shouldReloadForStaleBuild, STALE_RELOAD_COOLDOWN_MS } from "@/lib/stale-build";

describe("isStaleBuildError", () => {
  it("reconhece erros de versão desatualizada do app", () => {
    const chunk = Object.assign(new Error("Loading chunk 8820 failed.\n(error: https://x/_next/static/chunks/8820.js)"), { name: "ChunkLoadError" });
    expect(isStaleBuildError(chunk)).toBe(true);
    expect(isStaleBuildError(new Error("Loading CSS chunk app/agencia failed"))).toBe(true);
    expect(isStaleBuildError(new Error('Server Action "4072fab3" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action'))).toBe(true);
    expect(isStaleBuildError(Object.assign(new Error("x"), { name: "UnrecognizedActionError" }))).toBe(true);
    expect(isStaleBuildError(new Error("An unexpected response was received from the server."))).toBe(true);
    expect(isStaleBuildError(new TypeError("Cannot read properties of undefined (reading 'call')"))).toBe(true);
    expect(isStaleBuildError(new TypeError("undefined is not an object (evaluating 'e[t].call')"))).toBe(true);
    expect(isStaleBuildError(new TypeError("Failed to fetch dynamically imported module: https://x/a.js"))).toBe(true);
  });

  it("não confunde com erros comuns", () => {
    expect(isStaleBuildError(new Error("MISSING_MESSAGE: agency.documents.upload (pt-BR)"))).toBe(false);
    expect(isStaleBuildError(new TypeError("Cannot read properties of undefined (reading 'name')"))).toBe(false);
    expect(isStaleBuildError(new RangeError("Invalid time value"))).toBe(false);
    expect(isStaleBuildError(null)).toBe(false);
    expect(isStaleBuildError("Loading chunk 1 failed")).toBe(false);
    expect(isStaleBuildError({})).toBe(false);
  });
});

describe("shouldReloadForStaleBuild", () => {
  const now = 1_793_730_600_000;
  it("recarrega na primeira vez ou com marca inválida", () => {
    expect(shouldReloadForStaleBuild(null, now)).toBe(true);
    expect(shouldReloadForStaleBuild("abc", now)).toBe(true);
  });
  it("não recarrega de novo dentro do intervalo (sem laço)", () => {
    expect(shouldReloadForStaleBuild(String(now - 5_000), now)).toBe(false);
    expect(shouldReloadForStaleBuild(String(now - STALE_RELOAD_COOLDOWN_MS), now)).toBe(false);
  });
  it("volta a recarregar depois do intervalo ou com relógio voltando", () => {
    expect(shouldReloadForStaleBuild(String(now - STALE_RELOAD_COOLDOWN_MS - 1), now)).toBe(true);
    expect(shouldReloadForStaleBuild(String(now + 10_000), now)).toBe(true);
  });
});
