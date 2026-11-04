// "Avisos e mensagens" (0115): lógica pura da lista única de conversas — leitura das linhas da RPC conversation_list,
// para onde cada conversa leva em cada portal, qual etapa mostrar no chip, rótulos de tipo e os parâmetros da URL.
//
// Decisões (sem perguntar ao responsável):
//   • A conversa abre na página que já existe (nada de chat paralelo): canal da marca → aba Conversa do negócio
//     (agência) ou seção Conversa da campanha (marca); canal do herói → Conversa do negócio no canal dele (agência) ou
//     seção Conversa da oportunidade (herói); sala → sala do projeto de cada portal. Essas páginas já mostram título,
//     etapa e o resto do contexto, e marcam a conversa como lida ao abrir.
//   • Chip de etapa no vocabulário que cada lado já conhece: agência = etapa do pipeline (commercial.stages); marca e
//     salas (marca, herói, staff) = situação vista pela marca (brandStatus: recebida, montando elenco, proposta,
//     contratação, em produção, concluída); herói no canal dele = a situação dele no negócio (talentStatus). Negócio
//     encerrado = resultado (ganho/perdido/cancelado). Sala travada = "Assine o NDA"; arquivada = "Sala arquivada".
//   • URL: ?aba=mensagens|avisos. Sem "aba", ?filtro=… continua abrindo Avisos (os cartões do início já usam
//     ?filtro=nao-lidas); sem nada, abre Mensagens (o que o responsável pediu para ficar à mão).
import { brandStatus, isDealStage, type BrandStatus, type DealOutcome, type DealStage } from "@/lib/deals/stages";

export const MESSAGING_PORTALS = ["agency", "brand", "hero", "staff"] as const;
export type MessagingPortal = (typeof MESSAGING_PORTALS)[number];

export const CONVERSATION_KINDS = ["campaign", "opportunity", "room"] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

export type Conversation = {
  key: string;
  kind: ConversationKind;
  dealId: string;
  requestId: string | null;
  dealTalentId: string | null;
  talentId: string | null;
  title: string;
  counterpart: string;
  avatarUrl: string | null;
  stage: DealStage | null;
  outcome: DealOutcome | null;
  talentStatus: string | null;
  roomStatus: "open" | "archived" | null;
  locked: boolean;
  lastAt: string;
  lastAuthor: string | null;
  lastBody: string | null;
  lastAttachment: boolean;
  unread: number;
};

export type UnreadByKind = { total: number; campaign: number; opportunity: number; room: number };

export type ConversationPage = {
  available: boolean;
  items: Conversation[];
  hasMore: boolean;
  total: number;
  unread: UnreadByKind;
  kinds: Record<ConversationKind, number>;
};

export const EMPTY_PAGE: ConversationPage = {
  available: false,
  items: [],
  hasMore: false,
  total: 0,
  unread: { total: 0, campaign: 0, opportunity: 0, room: 0 },
  kinds: { campaign: 0, opportunity: 0, room: 0 },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function int(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : 0;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
function uuid(v: unknown): string | null {
  const s = str(v);
  return s && UUID.test(s) ? s : null;
}

export function isMessagingPortal(v: unknown): v is MessagingPortal {
  return typeof v === "string" && (MESSAGING_PORTALS as readonly string[]).includes(v);
}

export function isConversationKind(v: unknown): v is ConversationKind {
  return typeof v === "string" && (CONVERSATION_KINDS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------- chaves (as mesmas do banco)
export function dealBrandKey(dealId: string): string {
  return `deal:${dealId}:brand`;
}
export function dealTalentKey(dealId: string, talentId: string): string {
  return `deal:${dealId}:talent:${talentId}`;
}
export function roomKey(dealId: string): string {
  return `room:${dealId}`;
}

// ---------------------------------------------------------------- leitura da RPC
export function parseConversation(raw: unknown): Conversation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const key = str(r.key);
  const dealId = uuid(r.deal_id);
  const lastAt = str(r.last_at);
  if (!key || !dealId || !lastAt || !isConversationKind(r.kind)) return null;
  const outcome = r.outcome === "won" || r.outcome === "lost" || r.outcome === "cancelled" ? r.outcome : null;
  return {
    key,
    kind: r.kind,
    dealId,
    requestId: uuid(r.request_id),
    dealTalentId: uuid(r.deal_talent_id),
    talentId: uuid(r.talent_id),
    title: str(r.title) ?? "",
    counterpart: str(r.counterpart) ?? "",
    avatarUrl: str(r.avatar_url),
    stage: isDealStage(r.stage) ? r.stage : null,
    outcome,
    talentStatus: str(r.talent_status),
    roomStatus: r.room_status === "open" || r.room_status === "archived" ? r.room_status : null,
    locked: r.locked === true,
    lastAt,
    lastAuthor: str(r.last_author),
    lastBody: str(r.last_body),
    lastAttachment: r.last_attachment === true,
    unread: r.locked === true ? 0 : int(r.unread),
  };
}

export function parseConversationPage(raw: unknown): ConversationPage {
  if (!raw || typeof raw !== "object") return { ...EMPTY_PAGE, available: true };
  const r = raw as Record<string, unknown>;
  const items = Array.isArray(r.items) ? r.items.flatMap((x) => parseConversation(x) ?? []) : [];
  const u = (r.unread && typeof r.unread === "object" ? r.unread : {}) as Record<string, unknown>;
  const k = (r.kinds && typeof r.kinds === "object" ? r.kinds : {}) as Record<string, unknown>;
  return {
    available: true,
    items: sortConversations(items),
    hasMore: r.has_more === true,
    total: int(r.total),
    unread: { total: int(u.total), campaign: int(u.campaign), opportunity: int(u.opportunity), room: int(u.room) },
    kinds: { campaign: int(k.campaign), opportunity: int(k.opportunity), room: int(k.room) },
  };
}

/** Mais recente primeiro; empate pela chave (estável, igual ao banco). */
export function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => {
    const d = Date.parse(b.lastAt) - Date.parse(a.lastAt);
    if (d !== 0 && Number.isFinite(d)) return d;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

// ---------------------------------------------------------------- destino de cada conversa
export function conversationHref(portal: MessagingPortal, c: Pick<Conversation, "kind" | "dealId" | "requestId" | "dealTalentId" | "talentId">): string | null {
  if (c.kind === "room") {
    if (portal === "agency") return `/agencia/negocios/${c.dealId}/sala`;
    if (portal === "brand") return `/marca/projetos/${c.dealId}`;
    if (portal === "hero") return `/heroi/projetos/${c.dealId}`;
    return `/projetos/${c.dealId}`;
  }
  if (portal === "agency") {
    const base = `/agencia/negocios/${c.dealId}/conversa`;
    return c.kind === "opportunity" && c.talentId ? `${base}?canal=${c.talentId}` : base;
  }
  if (portal === "brand") return c.kind === "campaign" && c.requestId ? `/marca/campanhas/${c.requestId}#camp-messages` : null;
  if (portal === "hero") return c.kind === "opportunity" && c.dealTalentId ? `/heroi/oportunidades/${c.dealTalentId}#opp-messages` : null;
  return null;
}

/** Página do contexto ("Ver campanha / oportunidade / projeto"). */
export function contextHref(portal: MessagingPortal, c: Pick<Conversation, "kind" | "dealId" | "requestId" | "dealTalentId">): string | null {
  if (portal === "agency") return `/agencia/negocios/${c.dealId}`;
  if (portal === "brand") return c.requestId ? `/marca/campanhas/${c.requestId}` : null;
  if (portal === "hero") return c.dealTalentId ? `/heroi/oportunidades/${c.dealTalentId}` : null;
  return null;
}

// ---------------------------------------------------------------- chips
/** Rótulo do tipo (messaging.kinds.<chave>): o canal do herói é "Herói" para a agência e "Oportunidade" para o herói. */
export function kindLabelKey(portal: MessagingPortal, kind: ConversationKind): "campaign" | "hero" | "opportunity" | "room" {
  if (kind === "opportunity") return portal === "agency" ? "hero" : "opportunity";
  return kind;
}

export type StageChip =
  | { group: "stages"; value: DealStage; tone: ChipTone }
  | { group: "brandStatus"; value: BrandStatus; tone: ChipTone }
  | { group: "talentStatus"; value: string; tone: ChipTone }
  | { group: "outcomes"; value: DealOutcome; tone: ChipTone }
  | { group: "room"; value: "ndaRequired" | "archived"; tone: ChipTone };
export type ChipTone = "info" | "success" | "warning" | "neutral";

const TALENT_STATUSES = ["suggested", "consulted", "interested", "talk_requested", "declined", "proposed", "contracted", "removed"];

export function stageChip(portal: MessagingPortal, c: Pick<Conversation, "kind" | "stage" | "outcome" | "talentStatus" | "roomStatus" | "locked">): StageChip | null {
  if (c.kind === "room" && c.locked) return { group: "room", value: "ndaRequired", tone: "warning" };
  if (c.kind === "room" && c.roomStatus === "archived") return { group: "room", value: "archived", tone: "neutral" };
  if (!c.stage) return null;
  if (c.stage === "closed") {
    const outcome = c.outcome ?? "cancelled";
    return { group: "outcomes", value: outcome, tone: outcome === "won" ? "success" : "neutral" };
  }
  if (portal === "agency") {
    const late = ["approved", "contracting", "production", "approval", "delivery"].includes(c.stage);
    return { group: "stages", value: c.stage, tone: late ? "success" : "info" };
  }
  if (portal === "hero" && c.kind === "opportunity" && c.talentStatus && TALENT_STATUSES.includes(c.talentStatus)) {
    const s = c.talentStatus;
    const tone: ChipTone = s === "contracted" || s === "proposed" || s === "interested" ? "success" : s === "declined" || s === "removed" ? "neutral" : "warning";
    return { group: "talentStatus", value: s, tone };
  }
  const b = brandStatus(c.stage, c.outcome);
  return { group: "brandStatus", value: b, tone: b === "running" || b === "contracting" || b === "done" ? "success" : "info" };
}

// ---------------------------------------------------------------- URL da página "Avisos e mensagens"
export type InboxTab = "messages" | "notices";
type Params = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function resolveTab(sp: Params): InboxTab {
  const aba = one(sp.aba);
  if (aba === "avisos") return "notices";
  if (aba === "mensagens") return "messages";
  return one(sp.filtro) ? "notices" : "messages";
}

const KIND_PARAM: Record<string, ConversationKind> = { campanha: "campaign", oportunidade: "opportunity", sala: "room" };
export const KIND_SLUG: Record<ConversationKind, string> = { campaign: "campanha", opportunity: "oportunidade", room: "sala" };

export const PAGE_SIZE = 50;
export const MAX_LIMIT = 200;

export type MessagesQuery = { kind: ConversationKind | null; unread: boolean; q: string; limit: number };

export function parseMessagesQuery(sp: Params): MessagesQuery {
  const kind = KIND_PARAM[one(sp.tipo) ?? ""] ?? null;
  const unread = one(sp.filtro) === "nao-lidas";
  const q = (one(sp.q) ?? "").trim().slice(0, 80);
  const raw = Number(one(sp.limite));
  const limit = Number.isFinite(raw) && raw > PAGE_SIZE ? Math.min(Math.ceil(raw / PAGE_SIZE) * PAGE_SIZE, MAX_LIMIT) : PAGE_SIZE;
  return { kind, unread, q, limit };
}

/** Link da aba Mensagens com os filtros (null apaga o filtro). */
export function messagesHref(basePath: string, q: Partial<MessagesQuery>): string {
  const p = new URLSearchParams({ aba: "mensagens" });
  if (q.kind) p.set("tipo", KIND_SLUG[q.kind]);
  if (q.unread) p.set("filtro", "nao-lidas");
  if (q.q) p.set("q", q.q);
  if (q.limit && q.limit > PAGE_SIZE) p.set("limite", String(Math.min(q.limit, MAX_LIMIT)));
  return `${basePath}?${p.toString()}`;
}

export function noticesHref(basePath: string, unreadOnly = false): string {
  return unreadOnly ? `${basePath}?aba=avisos&filtro=nao-lidas` : `${basePath}?aba=avisos`;
}
