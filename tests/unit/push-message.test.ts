import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPushMessage, chunk, interpretTickets, type PushEvent } from "@/lib/push/message";

const messages = (locale: string) => JSON.parse(readFileSync(path.join(process.cwd(), "messages", locale, "push.json"), "utf8"));

describe("buildPushMessage", () => {
  it("post de herói favorito: nome do herói no título, título do post no corpo e link do post", () => {
    const event: PushEvent = { kind: "hero_post", hero: "Neymar", contentTitle: "Treino de hoje", contentSlug: "treino-de-hoje" };
    expect(buildPushMessage(event, "pt-BR", messages("pt-BR"))).toEqual({ title: "Neymar postou", body: "Treino de hoje", url: "/content/treino-de-hoje" });
  });

  it("post sem título usa o texto genérico", () => {
    const event: PushEvent = { kind: "hero_post", hero: "Anitta", contentTitle: "  ", contentSlug: "x" };
    expect(buildPushMessage(event, "en", messages("en")).body).toBe("There's a new post from Anitta on GC Hero.");
  });

  it("conquista, programa e sequência nos três idiomas", () => {
    expect(buildPushMessage({ kind: "achievement", name: "Primeiro passo" }, "pt-BR", messages("pt-BR"))).toEqual({
      title: "Conquista desbloqueada",
      body: "Primeiro passo. Continue assim!",
      url: "/profile/evolution",
    });
    expect(buildPushMessage({ kind: "program_completed", program: "Base forte", programSlug: "base-forte" }, "es", messages("es")).url).toBe("/programs/base-forte");
    expect(buildPushMessage({ kind: "streak_reminder", streak: 1 }, "pt-BR", messages("pt-BR")).body).toBe("Você está em 1 dia seguido. Conclua um conteúdo hoje para não zerar.");
    expect(buildPushMessage({ kind: "streak_reminder", streak: 6 }, "en", messages("en")).body).toBe("You're on a 6-day streak. Complete something today to keep it going.");
  });

  it("texto longo é cortado no limite do aviso", () => {
    const event: PushEvent = { kind: "hero_post", hero: "Jacquin", contentTitle: "a".repeat(400), contentSlug: "x" };
    expect(buildPushMessage(event, "pt-BR", messages("pt-BR")).body.length).toBeLessThanOrEqual(178);
  });
});

describe("chunk", () => {
  it("divide no tamanho do lote da Expo", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 100)).toEqual([]);
  });
});

describe("interpretTickets", () => {
  it("separa enviado, aparelho que saiu e erro", () => {
    const result = interpretTickets(
      ["ExponentPushToken[a]", "ExponentPushToken[b]", "ExponentPushToken[c]"],
      [{ status: "ok", id: "1" }, { status: "error", message: "x", details: { error: "DeviceNotRegistered" } }, { status: "error", message: "rate", details: { error: "MessageRateExceeded" } }],
    );
    expect(result).toEqual({ ok: ["ExponentPushToken[a]"], gone: ["ExponentPushToken[b]"], failed: [{ token: "ExponentPushToken[c]", error: "MessageRateExceeded" }] });
  });

  it("resposta mais curta que o lote conta como falha dos que faltaram", () => {
    expect(interpretTickets(["ExponentPushToken[a]", "ExponentPushToken[b]"], [{ status: "ok", id: "1" }]).failed).toEqual([{ token: "ExponentPushToken[b]", error: "missing_ticket" }]);
  });
});
