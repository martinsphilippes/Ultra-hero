import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  contextHref,
  conversationHref,
  dealBrandKey,
  dealTalentKey,
  kindLabelKey,
  messagesHref,
  noticesHref,
  parseConversation,
  parseConversationPage,
  parseMessagesQuery,
  resolveTab,
  roomKey,
  sortConversations,
  stageChip,
  type Conversation,
} from "@/lib/messaging/logic";

const D = "11111111-1111-4111-8111-111111111111";
const R = "22222222-2222-4222-8222-222222222222";
const DT = "33333333-3333-4333-8333-333333333333";
const T = "44444444-4444-4444-8444-444444444444";

function raw(over: Record<string, unknown> = {}) {
  return {
    key: dealBrandKey(D),
    kind: "campaign",
    deal_id: D,
    request_id: R,
    deal_talent_id: null,
    talent_id: null,
    title: "Lançamento",
    counterpart: "Marca X",
    avatar_url: null,
    stage: "negotiation",
    outcome: null,
    talent_status: null,
    room_status: null,
    locked: false,
    last_at: "2026-11-04T10:00:00Z",
    last_author: "Ana",
    last_body: "Oi",
    last_attachment: false,
    unread: 2,
    ...over,
  };
}

function conv(over: Record<string, unknown> = {}): Conversation {
  const c = parseConversation(raw(over));
  if (!c) throw new Error("conversa inválida no teste");
  return c;
}

describe("chaves de conversa (iguais às do banco, 0115)", () => {
  it("monta as três formas", () => {
    expect(dealBrandKey(D)).toBe(`deal:${D}:brand`);
    expect(dealTalentKey(D, T)).toBe(`deal:${D}:talent:${T}`);
    expect(roomKey(D)).toBe(`room:${D}`);
  });
  it("o formato bate com o check da tabela conversation_reads", () => {
    const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/0115_avisos_e_mensagens.sql"), "utf8");
    const m = sql.match(/conversation_reads_key_check check \(conv_key ~ \('([^']+)'\s*\|\|\s*'([^']+)'\)\)/);
    expect(m).not.toBeNull();
    const re = new RegExp(m![1] + m![2]);
    expect(re.test(dealBrandKey(D))).toBe(true);
    expect(re.test(dealTalentKey(D, T))).toBe(true);
    expect(re.test(roomKey(D))).toBe(true);
    expect(re.test(`deal:${D}:x`)).toBe(false);
  });
});

describe("leitura da RPC", () => {
  it("lê uma linha válida e recusa linha sem negócio/tipo/data", () => {
    const c = conv();
    expect(c).toMatchObject({ kind: "campaign", dealId: D, requestId: R, title: "Lançamento", counterpart: "Marca X", stage: "negotiation", unread: 2 });
    expect(parseConversation(raw({ deal_id: "x" }))).toBeNull();
    expect(parseConversation(raw({ kind: "chat" }))).toBeNull();
    expect(parseConversation(raw({ last_at: null }))).toBeNull();
    expect(parseConversation(null)).toBeNull();
  });
  it("sala travada não conta como não lida; etapa desconhecida vira null", () => {
    expect(conv({ kind: "room", key: roomKey(D), locked: true, unread: 5 }).unread).toBe(0);
    expect(conv({ stage: "outra" }).stage).toBeNull();
    expect(conv({ unread: -3 }).unread).toBe(0);
  });
  it("página: itens ordenados, contagens e has_more", () => {
    const page = parseConversationPage({
      items: [raw({ key: "a", last_at: "2026-11-01T00:00:00Z" }), raw({ key: "b", last_at: "2026-11-03T00:00:00Z" }), { lixo: true }],
      has_more: true,
      total: 7,
      unread: { total: 2, campaign: 1, opportunity: 1, room: 0 },
      kinds: { campaign: 3, opportunity: 2, room: 2 },
    });
    expect(page.items.map((x) => x.key)).toEqual(["b", "a"]);
    expect(page).toMatchObject({ available: true, hasMore: true, total: 7, unread: { total: 2, campaign: 1, opportunity: 1, room: 0 }, kinds: { room: 2 } });
    expect(parseConversationPage(null)).toMatchObject({ available: true, items: [], total: 0 });
  });
});

describe("ordenação", () => {
  it("mais recente primeiro; empate pela chave", () => {
    const list = [conv({ key: "c", last_at: "2026-11-04T10:00:00Z" }), conv({ key: "a", last_at: "2026-11-04T10:00:00Z" }), conv({ key: "z", last_at: "2026-11-05T00:00:00Z" })];
    expect(sortConversations(list).map((x) => x.key)).toEqual(["z", "a", "c"]);
  });
});

describe("destino de cada conversa por portal", () => {
  const campaign = conv();
  const hero = conv({ kind: "opportunity", key: dealTalentKey(D, T), talent_id: T, deal_talent_id: DT });
  const room = conv({ kind: "room", key: roomKey(D) });
  it("agência: aba Conversa (canal do herói pelo ?canal) e sala", () => {
    expect(conversationHref("agency", campaign)).toBe(`/agencia/negocios/${D}/conversa`);
    expect(conversationHref("agency", hero)).toBe(`/agencia/negocios/${D}/conversa?canal=${T}`);
    expect(conversationHref("agency", room)).toBe(`/agencia/negocios/${D}/sala`);
    expect(contextHref("agency", hero)).toBe(`/agencia/negocios/${D}`);
  });
  it("marca: seção Conversa da campanha (por pedido) e sala da marca", () => {
    expect(conversationHref("brand", campaign)).toBe(`/marca/campanhas/${R}#camp-messages`);
    expect(conversationHref("brand", conv({ request_id: null }))).toBeNull();
    expect(conversationHref("brand", room)).toBe(`/marca/projetos/${D}`);
    expect(contextHref("brand", campaign)).toBe(`/marca/campanhas/${R}`);
  });
  it("herói: seção Conversa da oportunidade e sala do herói; staff: sala do staff", () => {
    expect(conversationHref("hero", hero)).toBe(`/heroi/oportunidades/${DT}#opp-messages`);
    expect(conversationHref("hero", room)).toBe(`/heroi/projetos/${D}`);
    expect(conversationHref("staff", room)).toBe(`/projetos/${D}`);
    expect(conversationHref("staff", campaign)).toBeNull();
  });
});

describe("chips de tipo e etapa", () => {
  it("canal do herói é 'Herói' para a agência e 'Oportunidade' para o herói", () => {
    expect(kindLabelKey("agency", "opportunity")).toBe("hero");
    expect(kindLabelKey("hero", "opportunity")).toBe("opportunity");
    expect(kindLabelKey("brand", "campaign")).toBe("campaign");
    expect(kindLabelKey("staff", "room")).toBe("room");
  });
  it("agência vê a etapa do pipeline; marca a situação dela; herói a situação dele", () => {
    expect(stageChip("agency", conv({ stage: "negotiation" }))).toMatchObject({ group: "stages", value: "negotiation", tone: "info" });
    expect(stageChip("agency", conv({ stage: "production" }))).toMatchObject({ group: "stages", value: "production", tone: "success" });
    expect(stageChip("brand", conv({ stage: "negotiation" }))).toMatchObject({ group: "brandStatus", value: "proposal" });
    expect(stageChip("hero", conv({ kind: "opportunity", stage: "consultation", talent_status: "consulted" }))).toMatchObject({ group: "talentStatus", value: "consulted", tone: "warning" });
    expect(stageChip("hero", conv({ kind: "room", stage: "production" }))).toMatchObject({ group: "brandStatus", value: "running" });
    expect(stageChip("staff", conv({ kind: "room", stage: "approved" }))).toMatchObject({ group: "brandStatus", value: "contracting" });
  });
  it("encerrado mostra o resultado; sala travada pede NDA; arquivada avisa; sem etapa → null", () => {
    expect(stageChip("agency", conv({ stage: "closed", outcome: "won" }))).toMatchObject({ group: "outcomes", value: "won", tone: "success" });
    expect(stageChip("brand", conv({ stage: "closed", outcome: null }))).toMatchObject({ group: "outcomes", value: "cancelled" });
    expect(stageChip("staff", conv({ kind: "room", locked: true }))).toMatchObject({ group: "room", value: "ndaRequired" });
    expect(stageChip("agency", conv({ kind: "room", room_status: "archived" }))).toMatchObject({ group: "room", value: "archived" });
    expect(stageChip("agency", conv({ stage: null }))).toBeNull();
  });
});

describe("URL da página Avisos e mensagens", () => {
  it("aba: explícita; sem aba, ?filtro abre Avisos (cartões do início); sem nada, Mensagens", () => {
    expect(resolveTab({})).toBe("messages");
    expect(resolveTab({ filtro: "nao-lidas" })).toBe("notices");
    expect(resolveTab({ aba: "avisos" })).toBe("notices");
    expect(resolveTab({ aba: "mensagens", filtro: "nao-lidas" })).toBe("messages");
    expect(resolveTab({ aba: ["avisos", "mensagens"] })).toBe("notices");
  });
  it("filtros da aba Mensagens: tipo, não lidas, busca e limite (passos de 50, até 200)", () => {
    expect(parseMessagesQuery({})).toEqual({ kind: null, unread: false, q: "", limit: 50 });
    expect(parseMessagesQuery({ tipo: "sala", filtro: "nao-lidas", q: "  Marca  ", limite: "100" })).toEqual({ kind: "room", unread: true, q: "Marca", limit: 100 });
    expect(parseMessagesQuery({ tipo: "x", limite: "999" })).toMatchObject({ kind: null, limit: 200 });
    expect(parseMessagesQuery({ limite: "-5" }).limit).toBe(50);
    expect(parseMessagesQuery({ q: "a".repeat(120) }).q).toHaveLength(80);
  });
  it("links preservam os filtros e voltam a ser lidos iguais", () => {
    const href = messagesHref("/marca/notificacoes", { kind: "campaign", unread: true, q: "verão", limit: 100 });
    expect(href).toBe("/marca/notificacoes?aba=mensagens&tipo=campanha&filtro=nao-lidas&q=ver%C3%A3o&limite=100");
    const sp = Object.fromEntries(new URL(href, "https://x.test").searchParams);
    expect(resolveTab(sp)).toBe("messages");
    expect(parseMessagesQuery(sp)).toEqual({ kind: "campaign", unread: true, q: "verão", limit: 100 });
    expect(messagesHref("/projetos/avisos", {})).toBe("/projetos/avisos?aba=mensagens");
    expect(noticesHref("/heroi/avisos", true)).toBe("/heroi/avisos?aba=avisos&filtro=nao-lidas");
  });
});
