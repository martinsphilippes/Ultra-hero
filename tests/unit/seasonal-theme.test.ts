import { describe, expect, it } from "vitest";
import { checkBackground, checkModeTokens, checkTokens, contrastRatio, ensureContrast, textOn, TEMPLATE_PALETTES } from "@/lib/seasonal-theme/contrast";
import { backgroundLayerStyle, buildSeasonCss, modeVars } from "@/lib/seasonal-theme/css";
import { formTokensOf, formWindow, newThemeForm, parseAdminTheme, themeToForm } from "@/lib/seasonal-theme/form";
import { sanitizeBackground, sanitizeBanner, sanitizeDecorations, sanitizeTokens, toPublicTheme } from "@/lib/seasonal-theme/normalize";
import { buildTimeline, computeWindow, minusDays, resolveActive, themePhase, type Candidate } from "@/lib/seasonal-theme/resolve";
import { isAssetUrl, isBannerHref, isSeasonExcludedPath, localized } from "@/lib/seasonal-theme/vocab";

const ASSET = "https://abc.supabase.co/storage/v1/object/public/theme-assets/123e4567-e89b-42d3-a456-426614174000.webp";

describe("janela do tema (mesma regra do gatilho da 0100)", () => {
  const event = { startsAt: "2026-12-25T03:00:00.000Z", endsAt: "2026-12-26T03:00:00.000Z" }; // 25/12 dia inteiro em São Paulo
  it("por datas", () => {
    expect(computeWindow({ startMode: "date", startsAt: "2026-12-01T00:00:00-03:00", leadDays: 0, endMode: "date", endsAt: "2026-12-31T00:00:00-03:00", timezone: "America/Sao_Paulo" }, null)).toEqual({
      start: "2026-12-01T03:00:00.000Z",
      end: "2026-12-31T03:00:00.000Z",
    });
  });
  it("N dias antes do evento, à meia-noite no fuso do tema, até o fim do evento", () => {
    expect(computeWindow({ startMode: "lead_days", startsAt: null, leadDays: 10, endMode: "event_end", endsAt: null, timezone: "America/Sao_Paulo" }, event)).toEqual({
      start: "2026-12-15T03:00:00.000Z",
      end: "2026-12-26T03:00:00.000Z",
    });
  });
  it("0 dias = no próprio dia; o fuso do tema decide o dia", () => {
    expect(computeWindow({ startMode: "lead_days", startsAt: null, leadDays: 0, endMode: "event_end", endsAt: null, timezone: "America/Sao_Paulo" }, event)?.start).toBe("2026-12-25T03:00:00.000Z");
    // em Tóquio o evento (03:00Z de 25/12) cai em 25/12 12:00 → meia-noite de Tóquio de 25/12 = 24/12 15:00Z
    expect(computeWindow({ startMode: "lead_days", startsAt: null, leadDays: 0, endMode: "event_end", endsAt: null, timezone: "Asia/Tokyo" }, event)?.start).toBe("2026-12-24T15:00:00.000Z");
  });
  it("horário de verão: meia-noite local com o deslocamento do dia (Nova York, março)", () => {
    const ev = { startsAt: "2027-03-20T04:00:00.000Z", endsAt: "2027-03-21T04:00:00.000Z" };
    // 14/03/2027 entra o horário de verão; 10 dias antes de 20/03 = 10/03 (ainda EST, −05:00)
    expect(computeWindow({ startMode: "lead_days", startsAt: null, leadDays: 10, endMode: "event_end", endsAt: null, timezone: "America/New_York" }, ev)?.start).toBe("2027-03-10T05:00:00.000Z");
  });
  it("inválida: sem evento para dias antes, fim antes do início, mais de 400 dias", () => {
    expect(computeWindow({ startMode: "lead_days", startsAt: null, leadDays: 3, endMode: "date", endsAt: "2026-12-31T00:00:00Z", timezone: "UTC" }, null)).toBeNull();
    expect(computeWindow({ startMode: "date", startsAt: "2026-12-31T00:00:00Z", leadDays: 0, endMode: "date", endsAt: "2026-12-01T00:00:00Z", timezone: "UTC" }, null)).toBeNull();
    expect(computeWindow({ startMode: "date", startsAt: "2026-01-01T00:00:00Z", leadDays: 0, endMode: "date", endsAt: "2027-03-01T00:00:00Z", timezone: "UTC" }, null)).toBeNull();
  });
  it("minusDays atravessa mês e ano", () => {
    expect(minusDays("2026-03-01", 1)).toBe("2026-02-28");
    expect(minusDays("2027-01-05", 10)).toBe("2026-12-26");
    expect(minusDays("2026-12-31", -1)).toBe("2027-01-01");
  });
});

describe("resolução do tema ativo", () => {
  const c = (id: string, priority: number, start: string, end: string, areas: Candidate["areas"] = ["app", "portals", "institutional"]): Candidate => ({ id, priority, areas, windowStart: start, windowEnd: end });
  const natal = c("natal", 200, "2026-12-15T03:00:00Z", "2026-12-26T03:00:00Z");
  const verao = c("verao", 100, "2026-12-01T03:00:00Z", "2027-03-01T03:00:00Z");
  it("sem tema → identidade padrão", () => {
    expect(resolveActive([natal, verao], new Date("2026-11-20T12:00:00Z"), "app")).toBeNull();
  });
  it("coincidindo, vence a maior prioridade; ao terminar volta ao próximo", () => {
    expect(resolveActive([verao, natal], new Date("2026-12-20T12:00:00Z"), "app")?.id).toBe("natal");
    expect(resolveActive([verao, natal], new Date("2026-12-26T03:00:00Z"), "app")?.id).toBe("verao"); // fim exclusivo
    expect(resolveActive([verao, natal], new Date("2027-03-01T03:00:00Z"), "app")).toBeNull();
  });
  it("empate de prioridade: início mais recente, depois id", () => {
    const a = c("a", 100, "2026-12-01T00:00:00Z", "2026-12-31T00:00:00Z");
    const b = c("b", 100, "2026-12-10T00:00:00Z", "2026-12-31T00:00:00Z");
    const b2 = c("b2", 100, "2026-12-10T00:00:00Z", "2026-12-31T00:00:00Z");
    expect(resolveActive([a, b], new Date("2026-12-20T00:00:00Z"), "app")?.id).toBe("b");
    expect(resolveActive([b2, b], new Date("2026-12-20T00:00:00Z"), "app")?.id).toBe("b");
  });
  it("respeita as áreas", () => {
    const portais = c("portais", 999, "2026-12-01T00:00:00Z", "2026-12-31T00:00:00Z", ["portals"]);
    expect(resolveActive([portais, verao], new Date("2026-12-20T00:00:00Z"), "app")?.id).toBe("verao");
    expect(resolveActive([portais, verao], new Date("2026-12-20T00:00:00Z"), "portals")?.id).toBe("portais");
  });
  it("linha do tempo marca vencedor e conflito", () => {
    const days = buildTimeline([verao, natal], new Date("2026-12-14T15:00:00Z"), 3, "America/Sao_Paulo");
    expect(days.map((d) => d.day)).toEqual(["2026-12-14", "2026-12-15", "2026-12-16"]);
    expect(days[0]).toEqual({ day: "2026-12-14", winner: "verao", others: [] });
    expect(days[1]).toEqual({ day: "2026-12-15", winner: "natal", others: ["verao"] });
  });
  it("fase para as listas do admin", () => {
    const now = new Date("2026-12-20T00:00:00Z");
    expect(themePhase({ status: "published", windowStart: "2026-12-15T00:00:00Z", windowEnd: "2026-12-26T00:00:00Z" }, now)).toBe("active");
    expect(themePhase({ status: "published", windowStart: "2026-12-21T00:00:00Z", windowEnd: "2026-12-26T00:00:00Z" }, now)).toBe("scheduled");
    expect(themePhase({ status: "draft", windowStart: "2026-12-15T00:00:00Z", windowEnd: "2026-12-26T00:00:00Z" }, now)).toBe("draft");
    expect(themePhase({ status: "draft", windowStart: null, windowEnd: null }, now)).toBe("incomplete");
    expect(themePhase({ status: "published", windowStart: "2026-12-01T00:00:00Z", windowEnd: "2026-12-10T00:00:00Z" }, now)).toBe("ended");
    expect(themePhase({ status: "published", windowStart: "2026-12-15T00:00:00Z", windowEnd: "2026-12-26T00:00:00Z", eventCancelled: true }, now)).toBe("incomplete");
  });
});

describe("contraste (WCAG AA)", () => {
  it("razões conhecidas", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
  it("texto sobre o acento: preto ou branco, sempre ≥ 4,5", () => {
    for (const c of ["#ff5a1f", "#0050e6", "#e4ff3d", "#7a2f3d", "#808080", "#c41e3a", "#1b5e20"]) {
      expect(contrastRatio(textOn(c), c)).toBeGreaterThanOrEqual(4.5);
    }
    expect(textOn("#ffd700")).toBe("#0b0b0b");
    expect(textOn("#0b3d91")).toBe("#ffffff");
  });
  it("ensureContrast escurece no claro e clareia no escuro até passar em todos os fundos", () => {
    const fixed = ensureContrast("#ffd700", ["#ffffff", "#f7f4ef"], "light");
    expect(contrastRatio(fixed, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(fixed, "#f7f4ef")).toBeGreaterThanOrEqual(4.5);
    const dark = ensureContrast("#3a0ca3", ["#0b0b0b"], "dark");
    expect(contrastRatio(dark, "#0b0b0b")).toBeGreaterThanOrEqual(4.5);
    expect(ensureContrast("#141414", ["#ffffff"], "light")).toBe("#141414");
  });
  it("os 5 templates passam com as próprias cores (sanidade da tabela)", () => {
    for (const mode of ["light", "dark"] as const) for (const p of TEMPLATE_PALETTES[mode]) expect(contrastRatio(p.fg, p.bg)).toBeGreaterThanOrEqual(4.5);
  });
  it("fundo que deixa o texto ilegível bloqueia; acento claro demais é ajustado e só avisa", () => {
    const bad = checkModeTokens({ bg: "#555555" }, "light");
    expect(bad.errors.some((e) => e.kind === "bg_text")).toBe(true);
    expect(checkTokens({ light: { bg: "#555555" } }).ok).toBe(false);
    const gold = checkModeTokens({ accent: "#ffd700" }, "light");
    expect(gold.errors).toEqual([]);
    expect(gold.warnings.some((w) => w.kind === "accent_text_adjusted")).toBe(true);
    expect(gold.accentFg).toBe("#0b0b0b");
    expect(checkTokens({ light: { accent: "#c41e3a", bg: "#fff8f0" }, dark: { accent: "#ff6b6b" } }).ok).toBe(true);
  });
});

describe("fundo decorativo × texto", () => {
  it("degradê claro some no escuro (texto ficaria ilegível) e fica no claro", () => {
    const r = checkBackground({ type: "gradient", from: "#99f6e4", to: "#fde68a", angle: 160, intensity: 40 }, {});
    expect(r.hiddenIn).toEqual(["dark"]);
    expect(r.warnings.some((w) => w.kind === "background_hidden" && w.mode === "dark")).toBe(true);
    expect(buildSeasonCss({}, false, { type: "gradient", from: "#99f6e4", to: "#fde68a", angle: 160, intensity: 40 })).toContain(':root[data-theme="dark"] .uh-season-bg{display:none}');
  });
  it("degradê suave passa nos dois modos; imagem só avisa", () => {
    expect(checkBackground({ type: "gradient", from: "#808080", to: "#909090", angle: 0, intensity: 5 }, {}).hiddenIn).toEqual([]);
    const img = checkBackground({ type: "image", url: ASSET, fit: "cover", intensity: 20 }, {});
    expect(img.hiddenIn).toEqual([]);
    expect(img.warnings.map((w) => w.kind)).toEqual(["background_image", "background_image"]);
  });
});

describe("CSS do tema", () => {
  it("lista fechada de variáveis, por modo, com seletor que vence o template", () => {
    const css = buildSeasonCss({ light: { accent: "#c41e3a" }, dark: { accent: "#ff6b6b", bg: "#120808" } }, false);
    expect(css).toContain(':root:root:root[data-theme="light"]{--uh-accent:#c41e3a;');
    expect(css).toContain("--uh-accent-fg:#ffffff");
    expect(css).toContain(':root:root:root[data-theme="dark"]{');
    expect(css).toContain("--uh-bg:#120808");
    expect(css).not.toContain("animation");
  });
  it("fundo reprovado no AA não entra; cor fora do formato é ignorada", () => {
    expect(modeVars({ bg: "#555555" }, "light")["--uh-bg"]).toBeUndefined();
    expect(modeVars({ accent: "red;}body{display:none" }, "light")).toEqual({});
    expect(buildSeasonCss({}, false)).toBe("");
  });
  it("animação só sem 'reduzir movimento'", () => {
    const css = buildSeasonCss({}, true);
    expect(css).toContain("@media (prefers-reduced-motion:no-preference)");
  });
  it("camada de fundo: intensidade limitada, só URL do bucket", () => {
    expect(backgroundLayerStyle({ type: "gradient", from: "#ff0000", to: "#00ff00", angle: 90, intensity: 90 })).toEqual({ backgroundImage: "linear-gradient(90deg, #ff0000, #00ff00)", opacity: "0.4" });
    expect(backgroundLayerStyle({ type: "image", url: "https://evil.example/x.png", fit: "repeat", intensity: 20 })).toBeNull();
    expect(backgroundLayerStyle({ type: "image", url: ASSET, fit: "repeat", intensity: 20 })?.backgroundImage).toBe(`url("${ASSET}")`);
    expect(backgroundLayerStyle({ type: "none" })).toBeNull();
  });
});

describe("áreas, links e saneamento", () => {
  it("checkout, carrinho, plano, pagamentos e admin nunca recebem tema", () => {
    for (const p of ["/checkout", "/checkout/", "/cart", "/profile/plan", "/marca/pagamentos", "/marca/assinaturas/x", "/agencia/assinaturas", "/heroi/assinaturas", "/admin/temas"]) expect(isSeasonExcludedPath(p)).toBe(true);
    for (const p of ["/inicio", "/shop", "/personalities", "/profile", "/heroi/agenda", "/marca", "/login", "/checkoutx", null]) expect(isSeasonExcludedPath(p)).toBe(false);
  });
  it("URL de imagem: só o bucket theme-assets com <uuid>.(png|jpg|webp)", () => {
    expect(isAssetUrl(ASSET)).toBe(true);
    expect(isAssetUrl(ASSET.replace("theme-assets", "avatars"))).toBe(false);
    expect(isAssetUrl(ASSET.replace(".webp", ".svg"))).toBe(false);
    expect(isAssetUrl("javascript:alert(1)")).toBe(false);
  });
  it("link da faixa: caminho interno ou https", () => {
    expect(isBannerHref("/explore")).toBe(true);
    expect(isBannerHref("https://groscove.com/natal")).toBe(true);
    expect(isBannerHref("//evil.com")).toBe(false);
    expect(isBannerHref("http://x.com")).toBe(false);
    expect(isBannerHref("javascript:alert(1)")).toBe(false);
  });
  it("texto localizado volta ao pt-BR", () => {
    expect(localized({ "pt-BR": "Feliz Natal", en: "Merry Christmas" }, "en")).toBe("Merry Christmas");
    expect(localized({ "pt-BR": "Feliz Natal", es: " " }, "es")).toBe("Feliz Natal");
  });
  it("saneia o que vem do banco", () => {
    expect(sanitizeTokens({ light: { accent: "#C41E3A", bg: "#ffffff", x: "#000000" }, other: {} })).toEqual({ light: { bg: "#ffffff" } });
    expect(sanitizeBackground({ type: "image", url: "https://x.com/a.png" })).toEqual({ type: "none" });
    expect(sanitizeDecorations([{ url: ASSET, position: "top-left", size: "md" }, { url: ASSET, position: "middle", size: "md" }])).toHaveLength(1);
    expect(sanitizeBanner({ text: { "pt-BR": "Oi" }, href: "javascript:x" })).toEqual({ text: { "pt-BR": "Oi" }, label: {}, href: undefined });
    expect(toPublicTheme({ id: "x", window_start: null, window_end: "2026-01-01" })).toBeNull();
    expect(toPublicTheme({ id: "x", priority: 5, areas: ["app", "admin"], window_start: "2026-01-01T00:00:00Z", window_end: "2026-01-02T00:00:00Z" })?.areas).toEqual(["app"]);
  });
});

describe("formulário do admin", () => {
  it("ida e volta do tema e janela antes de salvar", () => {
    const raw = {
      id: "t1", name: "Natal", notes: "", status: "draft", event_id: "e1",
      event: { id: "e1", title: "Natal", starts_at: "2026-12-25T03:00:00Z", ends_at: "2026-12-26T03:00:00Z", status: "published", timezone: "America/Sao_Paulo" },
      start_mode: "lead_days", starts_at: null, lead_days: 7, end_mode: "event_end", ends_at: null, timezone: "America/Sao_Paulo", priority: 300,
      areas: ["app"], tokens: { light: { accent: "#c41e3a" } }, background: { type: "none" }, decorations: [], animations: true,
      banner: { text: { "pt-BR": "Feliz Natal" }, href: "/explore" }, window_start: "2026-12-18T03:00:00Z", window_end: "2026-12-26T03:00:00Z", event_cancelled: false, updated_at: "",
    };
    const theme = parseAdminTheme(raw)!;
    const form = themeToForm(theme);
    expect(form.leadDays).toBe(7);
    expect(form.banner.enabled).toBe(true);
    expect(form.light.accent).toBe("#c41e3a");
    expect(formTokensOf(form)).toEqual({ light: { accent: "#c41e3a" } });
    expect(formWindow(form, theme.event)).toEqual({ start: "2026-12-18T03:00:00.000Z", end: "2026-12-26T03:00:00.000Z" });
    const fresh = newThemeForm("2026-11-04");
    expect(formWindow(fresh, null)).toBeNull();
    expect(formWindow({ ...fresh, endDate: "2026-11-10" }, null)).toEqual({ start: "2026-11-04T03:00:00.000Z", end: "2026-11-10T03:00:00.000Z" });
  });
});
