import { describe, expect, it } from "vitest";
import {
  BOARD_STAGES,
  BRAND_TODAY_KINDS,
  TALENT_TODAY_KINDS,
  boardCounts,
  buildBrandBoard,
  buildBrandToday,
  buildTalentToday,
  countByKind,
  deliverableDeadline,
  deliverableStage,
  localDay,
  sortToday,
  urgencyOf,
  urgencyOfDay,
  type BrandWorkboard,
  type TalentTodayData,
  type TodayItem,
  type WbCampaign,
  type WbDeliverable,
} from "@/lib/today/logic";
import { toBrandWorkboard, toTalentToday } from "@/lib/today/normalize";

// Bloco 1 (0078): etapa de cada ação da marca, urgência no fuso da agência e a ordem do "Hoje".
// Agora fixo: 2026-11-02 15:00 em São Paulo (18:00Z).
const NOW = new Date("2026-11-02T18:00:00Z");
const TZ = "America/Sao_Paulo";
const h = (hours: number) => new Date(NOW.getTime() + hours * 3600_000).toISOString();

const campaign = (over: Partial<WbCampaign> = {}): WbCampaign => ({
  requestId: "r1", title: "Campanha 1", requestStatus: "converted", brandStatus: "running", dealTitle: "Negócio 1",
  submittedAt: h(-240), updatedAt: h(-240), requestedTalentName: "Ana", requestedCount: 2, ...over,
});
const deliv = (over: Partial<WbDeliverable> = {}): WbDeliverable => ({
  id: "d1", dealTalentId: "dt1", requestId: "r1", kind: "reels", network: "instagram", title: "Reels", status: "in_production",
  dueAt: null, publishAt: null, submittedAt: null, talentName: "Ana", ...over,
});
const emptyWb = (over: Partial<BrandWorkboard> = {}): BrandWorkboard => ({
  role: "owner", timezone: TZ, campaigns: [], talents: [], deliverables: [], scriptApprovals: [], termsPending: [], threads: [], ...over,
});

describe("etapa do entregável para a marca", () => {
  it("enviado aguarda aprovação; publicado/comprovado/concluído é publicada; cancelado some", () => {
    expect(deliverableStage("submitted", true)).toBe("awaiting");
    for (const s of ["published", "proof_submitted", "done"] as const) expect(deliverableStage(s, true)).toBe("published");
    expect(deliverableStage("cancelled", true)).toBeNull();
  });
  it("planejado/em produção: aceita antes da produção, em criação depois; ajuste e aprovado (falta publicar) em criação", () => {
    expect(deliverableStage("planned", false)).toBe("accepted");
    expect(deliverableStage("in_production", false)).toBe("accepted");
    expect(deliverableStage("planned", true)).toBe("creating");
    expect(deliverableStage("in_production", true)).toBe("creating");
    expect(deliverableStage("changes_requested", true)).toBe("creating");
    expect(deliverableStage("approved", true)).toBe("creating");
  });
  it("prazo: antes do envio vale a entrega; aprovado/enviado vale a publicação", () => {
    expect(deliverableDeadline({ status: "in_production", dueAt: "A", publishAt: "B" })).toBe("A");
    expect(deliverableDeadline({ status: "in_production", dueAt: null, publishAt: "B" })).toBe("B");
    expect(deliverableDeadline({ status: "approved", dueAt: "A", publishAt: "B" })).toBe("B");
    expect(deliverableDeadline({ status: "submitted", dueAt: "A", publishAt: null })).toBe("A");
  });
});

describe("painel por etapa da marca", () => {
  it("campanha sem creator mostrado fica em Enviada, com a contagem pedida; rascunho e cancelada ficam fora", () => {
    const board = buildBrandBoard({
      campaigns: [
        campaign({ requestId: "r1", brandStatus: "building" }),
        campaign({ requestId: "r2", requestStatus: "draft", brandStatus: "draft" }),
        campaign({ requestId: "r3", requestStatus: "cancelled", brandStatus: "cancelled" }),
      ],
      talents: [],
      deliverables: [],
    });
    expect(boardCounts(board)).toEqual({ sent: 1, accepted: 0, creating: 0, awaiting: 0, published: 0 });
    expect(board.sent[0]).toMatchObject({ type: "campaign", requestedCount: 2, href: "/marca/campanhas/r1" });
  });
  it("creator proposto sem entregáveis: Aceita antes da produção, Em criação depois", () => {
    const pre = buildBrandBoard({ campaigns: [campaign({ brandStatus: "contracting" })], talents: [{ dealTalentId: "dt1", requestId: "r1", talentName: "Ana", status: "proposed" }], deliverables: [] });
    expect(pre.accepted).toHaveLength(1);
    expect(pre.accepted[0]).toMatchObject({ type: "talent", href: "/marca/campanhas/r1#camp-talents" });
    const run = buildBrandBoard({ campaigns: [campaign({ brandStatus: "running" })], talents: [{ dealTalentId: "dt1", requestId: "r1", talentName: "Ana", status: "contracted" }], deliverables: [] });
    expect(run.creating).toHaveLength(1);
  });
  it("cada entregável na sua etapa, ordenado pelo prazo mais próximo, com link para a campanha", () => {
    const board = buildBrandBoard({
      campaigns: [campaign()],
      talents: [{ dealTalentId: "dt1", requestId: "r1", talentName: "Ana", status: "contracted" }],
      deliverables: [
        deliv({ id: "a", status: "in_production", dueAt: h(48) }),
        deliv({ id: "b", status: "changes_requested", dueAt: h(2) }),
        deliv({ id: "c", status: "submitted", submittedAt: h(-3) }),
        deliv({ id: "d", status: "published" }),
        deliv({ id: "e", status: "cancelled" }),
      ],
    });
    expect(board.creating.map((i) => i.key)).toEqual(["d:b", "d:a"]);
    expect(board.awaiting.map((i) => i.key)).toEqual(["d:c"]);
    expect(board.published.map((i) => i.key)).toEqual(["d:d"]);
    expect(board.creating[0].href).toBe("/marca/campanhas/r1#camp-deliverables");
    expect(BOARD_STAGES.reduce((n, s) => n + board[s].length, 0)).toBe(4);
  });
  it("campanha concluída sem creator visível não vira cartão", () => {
    const board = buildBrandBoard({ campaigns: [campaign({ brandStatus: "done" })], talents: [], deliverables: [] });
    expect(boardCounts(board).sent).toBe(0);
  });
});

describe("urgência no fuso da agência", () => {
  it("passou é atrasado; mesmo dia é hoje; até 3 dias é próximos; depois fica fora", () => {
    expect(urgencyOf(h(-1), NOW, TZ)).toBe("overdue");
    expect(urgencyOf(h(5), NOW, TZ)).toBe("today"); // 20h em SP
    expect(urgencyOf(h(10), NOW, TZ)).toBe("soon"); // 01h do dia seguinte em SP (mesmo dia em UTC)
    expect(urgencyOf(h(24 * 3), NOW, TZ)).toBe("soon");
    expect(urgencyOf(h(24 * 4), NOW, TZ)).toBe("later");
    expect(urgencyOf(null, NOW, TZ)).toBe("waiting");
    expect(urgencyOf("lixo", NOW, TZ)).toBe("waiting");
  });
  it("dia civil depende do fuso", () => {
    const late = new Date("2026-11-03T02:00:00Z"); // 23h do dia 2 em SP
    expect(localDay(late, TZ)).toBe("2026-11-02");
    expect(localDay(late, "UTC")).toBe("2026-11-03");
    expect(localDay(late, "Fuso/Invalido")).toBe("2026-11-02");
  });
  it("data civil (validade dos termos) vale até o fim do dia", () => {
    expect(urgencyOfDay("2026-11-02", NOW, TZ)).toBe("today");
    expect(urgencyOfDay("2026-11-01", NOW, TZ)).toBe("overdue");
    expect(urgencyOfDay("2026-11-04", NOW, TZ)).toBe("soon");
    expect(urgencyOfDay("2026-11-30", NOW, TZ)).toBe("later");
    expect(urgencyOfDay(null, NOW, TZ)).toBe("waiting");
  });
});

describe("ordem do Hoje", () => {
  const item = (key: string, kind: string, urgency: TodayItem["urgency"], deadline: string | null, since: string | null = null): TodayItem => ({
    key, kind, urgency, deadline, since, href: "/", title: key, context: "", note: null, status: null, step: null,
  });
  it("urgência, depois prazo, depois tipo, depois a espera mais longa", () => {
    const sorted = sortToday(
      [
        item("w-new", "message", "waiting", null, h(-1)),
        item("w-old", "message", "waiting", null, h(-50)),
        item("w-approval", "approval", "waiting", null, h(-1)),
        item("soon", "deadline", "soon", h(30)),
        item("today-late", "deadline", "today", h(4)),
        item("today-early", "approval", "today", h(2)),
        item("overdue", "deadline", "overdue", h(-5)),
      ],
      BRAND_TODAY_KINDS,
    );
    expect(sorted.map((i) => i.key)).toEqual(["overdue", "today-early", "today-late", "soon", "w-approval", "w-old", "w-new"]);
  });
  it("conta por tipo (todos os tipos presentes, zero quando não há)", () => {
    const c = countByKind([item("a", "terms", "waiting", null), item("b", "terms", "today", null)] as TodayItem<(typeof BRAND_TODAY_KINDS)[number]>[], BRAND_TODAY_KINDS);
    expect(c).toEqual({ approval: 0, internalApproval: 0, shortlist: 0, script: 0, terms: 2, sponsorship: 0, budget: 0, message: 0, deadline: 0, rating: 0, draft: 0 });
  });
});

describe("Depende de mim hoje (marca)", () => {
  const wb = emptyWb({
    campaigns: [
      campaign(),
      campaign({ requestId: "draft-old", title: "Rascunho velho", requestStatus: "draft", brandStatus: "draft", submittedAt: null, updatedAt: h(-24 * 5) }),
      campaign({ requestId: "draft-new", title: "Rascunho novo", requestStatus: "draft", brandStatus: "draft", submittedAt: null, updatedAt: h(-24) }),
    ],
    deliverables: [
      deliv({ id: "sub", status: "submitted", publishAt: h(3), submittedAt: h(-6) }),
      deliv({ id: "late", status: "in_production", dueAt: h(-26) }),
      deliv({ id: "far", status: "in_production", dueAt: h(24 * 10) }),
      deliv({ id: "nodate", status: "planned" }),
      deliv({ id: "pub", status: "published", dueAt: h(-50) }),
    ],
    scriptApprovals: [{ taskId: "t5", requestId: "r1", dealTitle: "Negócio 1", talentName: "Ana", dueAt: h(30), since: h(-2) }],
    termsPending: [{ termsId: "terms1", requestId: "r1", dealTitle: "Negócio 1", version: 1, sentAt: h(-20), validUntil: null }],
    threads: [{ dealId: "deal1", requestId: "r1", dealTitle: "Negócio 1", lastAt: h(-30), authorLabel: "Agência", excerpt: "Pode confirmar?" }],
  });
  it("junta aprovações, roteiro, termos, mensagens, prazos (só próximos/atrasados) e rascunhos parados, por urgência", () => {
    const items = buildBrandToday(wb, NOW);
    expect(items.map((i) => i.key)).toEqual(["deadline:late", "approval:sub", "script:t5", "terms:terms1", "message:deal1", "draft:draft-old"]);
    expect(items[0]).toMatchObject({ urgency: "overdue", href: "/marca/campanhas/r1#camp-deliverables" });
    expect(items[1]).toMatchObject({ urgency: "today", kind: "approval" });
    expect(items.find((i) => i.kind === "terms")).toMatchObject({ href: "/marca/campanhas/r1#camp-terms", status: "can_accept" });
    expect(items.find((i) => i.kind === "message")).toMatchObject({ href: "/marca/campanhas/r1#camp-messages", note: "Pode confirmar?" });
    expect(items.find((i) => i.kind === "script")?.href).toBe("/marca/campanhas/r1#camp-tasks");
  });
  it("equipe vê os termos como 'só o dono aceita'; o limite do rascunho parado é configurável", () => {
    const staff = buildBrandToday({ ...wb, role: "staff" }, NOW, { staleDraftDays: 1 });
    expect(staff.find((i) => i.kind === "terms")?.status).toBe("owner_only");
    expect(staff.filter((i) => i.kind === "draft")).toHaveLength(2);
  });
  it("vazio quando nada depende da marca", () => {
    expect(buildBrandToday(emptyWb(), NOW)).toEqual([]);
  });
});

describe("Hoje do creator", () => {
  const data: TalentTodayData = {
    timezone: TZ,
    tasks: [
      { id: "late", step: null, title: "Gravar bastidores", status: "todo", dueAt: h(-2), feedback: "", dealId: "deal1", dealTitle: "Negócio 1", brandName: "Marca", dealTalentId: "dt1" },
      { id: "tomorrow", step: null, title: "Amanhã", status: "todo", dueAt: h(24), feedback: "", dealId: "deal1", dealTitle: "Negócio 1", brandName: "Marca", dealTalentId: "dt1" },
      { id: "s4", step: 4, title: "", status: "todo", dueAt: h(48), feedback: "Encurtar a abertura", dealId: "deal1", dealTitle: "Negócio 1", brandName: "Marca", dealTalentId: "dt1" },
      { id: "s7", step: 7, title: "", status: "todo", dueAt: h(-1), feedback: "Trocar a trilha", dealId: "deal1", dealTitle: "Negócio 1", brandName: "Marca", dealTalentId: "dt1" },
      { id: "solo", step: null, title: "Atualizar kit", status: "doing", dueAt: h(3), feedback: "", dealId: null, dealTitle: null, brandName: null, dealTalentId: null },
    ],
    offers: [{ dealTalentId: "dt9", status: "consulted", respondBy: h(20), consultedAt: h(-2), dealTitle: "Nova campanha", brandName: "Outra marca" }],
    deliverables: [
      { id: "adj", dealTalentId: "dt1", dealId: "deal1", kind: "reels", network: null, title: "Reels 2", status: "changes_requested", dueAt: null, publishAt: h(30), brandFeedback: "Trocar a trilha", decidedAt: h(-5), dealTitle: "Negócio 1", brandName: "Marca" },
      { id: "soon", dealTalentId: "dt1", dealId: "deal1", kind: "post", network: null, title: "", status: "approved", dueAt: null, publishAt: h(4), brandFeedback: "", decidedAt: null, dealTitle: "Negócio 1", brandName: "Marca" },
      { id: "far", dealTalentId: "dt1", dealId: "deal1", kind: "post", network: null, title: "Longe", status: "in_production", dueAt: h(24 * 9), publishAt: null, brandFeedback: "", decidedAt: null, dealTitle: "Negócio 1", brandName: "Marca" },
    ],
    terms: [{ termsId: "terms1", dealTalentId: "dt2", version: 1, sentAt: h(-10), validUntil: "2026-11-03", dealTitle: "Negócio 2", brandName: "Marca" }],
  };
  it("tarefas só vencendo hoje ou atrasadas; o passo 7 com entregável em ajuste não se repete", () => {
    const items = buildTalentToday(data, NOW);
    const keys = items.map((i) => i.key);
    expect(keys).toContain("task:late");
    expect(keys).toContain("task:solo");
    expect(keys).not.toContain("task:tomorrow");
    expect(keys).not.toContain("task:s7");
  });
  it("ajustes (entrega e roteiro), oferta com prazo, entrega próxima e termos, com links diretos e ordem por urgência", () => {
    const items = buildTalentToday(data, NOW);
    expect(items.map((i) => i.key)).toEqual(["task:late", "task:solo", "deliverable:soon", "offer:dt9", "terms:terms1:dt2", "adjustment:adj", "scriptAdjustment:s4", "pending:far"]);
    expect(items.find((i) => i.kind === "adjustment")).toMatchObject({ href: "/heroi/oportunidades/dt1#opp-execution", note: "Trocar a trilha", urgency: "soon" });
    expect(items.find((i) => i.kind === "scriptAdjustment")).toMatchObject({ href: "/heroi/oportunidades/dt1#opp-tasks", step: 4 });
    expect(items.find((i) => i.kind === "offer")).toMatchObject({ href: "/heroi/oportunidades/dt9", urgency: "soon" });
    expect(items.find((i) => i.kind === "terms")).toMatchObject({ href: "/heroi/oportunidades/dt2#opp-terms", urgency: "soon" });
    expect(items.find((i) => i.key === "task:late")?.href).toBe("/heroi/tarefas");
    expect(Object.values(countByKind(items, TALENT_TODAY_KINDS)).reduce((a, b) => a + b, 0)).toBe(items.length);
  });
  it("entrega longe não some (04/11): entra no fim como 'Sua vez', sem pressa, com o prazo", () => {
    const items = buildTalentToday(data, NOW);
    expect(items.some((i) => i.key === "deliverable:far")).toBe(false);
    expect(items.find((i) => i.key === "pending:far")).toMatchObject({ kind: "pending", urgency: "waiting", deadline: h(24 * 9), href: "/heroi/oportunidades/dt1#opp-execution", status: "in_production" });
  });
  it("publicada espera o comprovante (sem prazo próprio); sem prazo também é 'Sua vez'", () => {
    const items = buildTalentToday(
      {
        ...data,
        tasks: [],
        deliverables: [
          { ...data.deliverables[2], id: "pub", status: "published", dueAt: h(-48) },
          { ...data.deliverables[2], id: "nodate", dueAt: null },
        ],
      },
      NOW,
    );
    expect(items.find((i) => i.key === "pending:pub")).toMatchObject({ urgency: "waiting", deadline: null, status: "published" });
    expect(items.find((i) => i.key === "pending:nodate")).toMatchObject({ urgency: "waiting", deadline: null });
  });
});

describe("normalização das leituras", () => {
  it("brand_workboard: tolera nulos e valores fora da lista", () => {
    const wb = toBrandWorkboard({
      role: "intruso", timezone: null,
      campaigns: [{ request_id: "r1", title: null, request_status: "converted", brand_status: "xyz", updated_at: "2026-11-01T00:00:00Z", requested_count: "3" }],
      deliverables: [{ id: "d1", deal_talent_id: "dt1", request_id: "r1", kind: "post", status: "estranho" }],
    });
    expect(wb).not.toBeNull();
    expect(wb?.role).toBeNull();
    expect(wb?.timezone).toBe("America/Sao_Paulo");
    expect(wb?.campaigns[0]).toMatchObject({ title: "", brandStatus: "draft", requestedCount: 3 });
    expect(wb?.deliverables[0].status).toBe("planned");
    expect(wb?.threads).toEqual([]);
    expect(toBrandWorkboard(null)).toBeNull();
    expect(toBrandWorkboard([])).toBeNull();
  });
  it("talent_today: passo nulo continua nulo", () => {
    const d = toTalentToday({ timezone: "America/Manaus", tasks: [{ id: "t", step: null, title: "x", status: "todo", due_at: null, feedback: null }] });
    expect(d?.timezone).toBe("America/Manaus");
    expect(d?.tasks[0]).toMatchObject({ step: null, feedback: "", dealTalentId: null });
    expect(d?.offers).toEqual([]);
  });
});
