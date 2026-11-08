import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { meetingSubject } from "@/lib/creator-guide/format";
import {
  POST_ITEMS,
  actionReady,
  addDays,
  dueBucket,
  finalizeProblems,
  hasSensitiveData,
  isCpf,
  meetingDay,
  meetingInstant,
  meetingFileName,
  meetingText,
  meetingTime,
  parseChecks,
  parseNotes,
  postChecklist,
  postProgress,
} from "@/lib/creator-meetings/format";

// Ata de reunião com o Hero (0138): modelo A–K do guia da Groscove, checklist pós-reunião e formalização por e-mail.

const sql = readFileSync(path.join(process.cwd(), "supabase", "migrations", "0138_ata_reuniao_creator.sql"), "utf8");
const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");

describe("checklist pós-reunião", () => {
  it("tem os 11 itens do guia; sem nada marcado só o das dúvidas se resolve (não há dúvida pendente)", () => {
    expect(POST_ITEMS).toHaveLength(11);
    const states = postChecklist({ checks: {}, formatsAnswered: 0, hasQuestions: false, followUpOn: null, actionsReady: 0 });
    expect(postProgress(states)).toEqual({ done: 1, total: 11 });
    expect(states.find((s) => s.item === "k_questions_forwarded")).toEqual({ item: "k_questions_forwarded", done: true, auto: true });
  });
  it("com dúvida pendente, encaminhar vira item a marcar", () => {
    const s = postChecklist({ checks: {}, formatsAnswered: 0, hasQuestions: true, followUpOn: null, actionsReady: 0 });
    expect(s.find((x) => x.item === "k_questions_forwarded")).toEqual({ item: "k_questions_forwarded", done: false, auto: false });
  });
  it("cadastro, formatos e follow-up a própria ata responde; media kit recebido dispensa o pedido", () => {
    const s = postChecklist({
      checks: { reg_full_name: true, reg_artistic_name: true, reg_address: true, reg_phone: true, reg_email: true, reg_city: true, media_kit: "yes" },
      formatsAnswered: 4,
      hasQuestions: false,
      followUpOn: "2026-11-15",
      actionsReady: 1,
    });
    for (const item of ["registration", "formats", "follow_up", "k_media_kit_requested"] as const) {
      expect(s.find((x) => x.item === item)).toMatchObject({ done: true, auto: true });
    }
  });
  it("tudo marcado fecha 11 de 11", () => {
    const s = postChecklist({
      checks: {
        reg_full_name: true,
        reg_artistic_name: true,
        reg_address: true,
        reg_phone: true,
        reg_email: true,
        reg_city: true,
        k_reviewed: true,
        k_saved: true,
        k_shared: true,
        k_presidency: true,
        k_follow_up_sent: true,
        k_media_kit_requested: true,
        k_calendar_sent: true,
        k_questions_forwarded: true,
      },
      formatsAnswered: 4,
      hasQuestions: true,
      followUpOn: "2026-11-15",
      actionsReady: 2,
    });
    expect(postProgress(s)).toEqual({ done: 11, total: 11 });
  });
});

describe("concluir a ata", () => {
  const base = { representativeId: null, notes: {}, followUpOn: null, actions: [], registerIdea: false };
  it("sem nada falta representante, resumo, encaminhamento e follow-up (como o banco: meeting_incomplete)", () => {
    expect(finalizeProblems(base)).toEqual(["representative", "summary", "actions", "followUp"]);
  });
  it("encaminhamento só conta com responsável e prazo; o Hero pode ser o responsável", () => {
    expect(actionReady({ title: "Pedir media kit", ownerKind: "team", ownerId: null, dueOn: "2026-11-10" })).toBe(false);
    expect(actionReady({ title: "Pedir media kit", ownerKind: "team", ownerId: "u1", dueOn: null })).toBe(false);
    expect(actionReady({ title: "Enviar media kit", ownerKind: "talent", ownerId: null, dueOn: "2026-11-10" })).toBe(true);
  });
  it("reunião que ainda não aconteceu não conclui (até 1 hora de folga)", () => {
    const now = Date.parse("2026-11-08T12:00:00Z");
    const ok = { representativeId: "u1", notes: { summary: "Interesse em CPA." }, followUpOn: "2026-11-15", registerIdea: false, actions: [{ title: "Ligar", ownerKind: "talent" as const, ownerId: null, dueOn: "2026-11-10" }] };
    expect(finalizeProblems({ ...ok, heldAt: "2026-11-08T12:30:00Z" }, now)).toEqual([]);
    expect(finalizeProblems({ ...ok, heldAt: "2026-11-09T12:00:00Z" }, now)).toEqual(["heldAt"]);
  });
  it("hora da reunião em São Paulo vira o instante certo", () => {
    expect(meetingInstant("2026-11-08", "10:00")).toBe("2026-11-08T13:00:00.000Z");
    expect(meetingInstant("2026-11-08", "")).toBeNull();
  });
  it("pronto para concluir; registrar projeto exige nome e conceito", () => {
    const ok = {
      representativeId: "u1",
      notes: { summary: "Interesse em CPA e eventos." },
      followUpOn: "2026-11-15",
      actions: [{ title: "Formalizar por e-mail", ownerKind: "team" as const, ownerId: "u1", dueOn: "2026-11-10" }],
      registerIdea: false,
    };
    expect(finalizeProblems(ok)).toEqual([]);
    expect(finalizeProblems({ ...ok, registerIdea: true, notes: { ...ok.notes, project_name: "Fe" } })).toEqual(["project"]);
  });
});

describe("dado sensível fica fora da ata", () => {
  it("dígito verificador do CPF", () => {
    expect(isCpf("52998224725")).toBe(true);
    expect(isCpf("52998224724")).toBe(false);
    expect(isCpf("11111111111")).toBe(false);
    expect(isCpf("11987654321")).toBe(false);
  });
  it("CPF (com ou sem pontuação) e dados bancários são pegos; telefone, seguidores e valores não", () => {
    expect(hasSensitiveData("CPF dele: 123.456.789-10")).toBe(true);
    expect(hasSensitiveData("cpf 12345678910")).toBe(true);
    expect(hasSensitiveData("documento 52998224725")).toBe(true);
    expect(hasSensitiveData("529 982 247 25")).toBe(true);
    expect(hasSensitiveData("Banco Itaú agência 1234 conta 56789-0")).toBe(true);
    expect(hasSensitiveData("Agência: 1234\nConta: 56789-0")).toBe(true);
    expect(hasSensitiveData("conta 56789-0 e agência 1234")).toBe(true);
    expect(hasSensitiveData("Ag. 1234 C/C 12345-6")).toBe(true);
    expect(hasSensitiveData("conta corrente 12345-6")).toBe(true);
    expect(hasSensitiveData("Tel (11) 98765-4321 / 11987654321 / 11 98765 4321")).toBe(false);
    expect(hasSensitiveData("A agência 2024 tem conta no Instagram")).toBe(false);
    expect(hasSensitiveData("A conta tem 12000 seguidores")).toBe(false);
    expect(hasSensitiveData("Cachê de R$ 5.000 por reels; 1.234.567 seguidores")).toBe(false);
  });
  it("a mesma regra está no banco", () => {
    expect(sql).toContain("create or replace function public.creator_meeting_is_cpf(d text)");
    expect(sql).toContain(String.raw`if v ~ 'cpf\D{0,15}\d{3}' or v ~ '\d{3}\.\d{3}\.\d{3}-\d{2}' then return false; end if;`);
    expect(sql).toContain(String.raw`v ~ '(conta[ -]corrente|conta[ -]poupan[cç]a|c/c|\mcc\M)\D{0,6}\d{4,}'`);
    expect(sql).toContain("raise exception 'sensitive_data'");
  });
});

describe("formalização por e-mail", () => {
  it("assunto e arquivo no padrão do guia", () => {
    expect(meetingSubject("Agnes Nunes", "2026-11-08")).toBe("ATA | Reunião Creator | Agnes Nunes | 2026-11-08");
    expect(meetingFileName("Luísa Sonza", "2026-11-08")).toBe("ATA_Creator_Luisa_Sonza_2026-11-08");
    expect(meetingFileName("  ", "2026-11-08T10:00:00Z")).toBe("ATA_Creator_Hero_2026-11-08");
  });
  it("dia e hora no fuso de São Paulo", () => {
    expect(meetingDay("2026-11-08T02:30:00Z")).toBe("2026-11-07");
    expect(meetingTime("2026-11-08T02:30:00Z")).toBe("23:30");
    expect(addDays("2026-11-28", 3)).toBe("2026-12-01");
  });
  it("faixas de prazo dos encaminhamentos", () => {
    expect(dueBucket(null, "2026-11-08")).toBe("none");
    expect(dueBucket("2026-11-07", "2026-11-08")).toBe("overdue");
    expect(dueBucket("2026-11-08", "2026-11-08")).toBe("today");
    expect(dueBucket("2026-11-15", "2026-11-08")).toBe("week");
    expect(dueBucket("2026-11-16", "2026-11-08")).toBe("later");
  });
  it("texto da ata na ordem A–K, com — no que ficou em branco e os encaminhamentos numerados", () => {
    const tr = (key: string, values?: Record<string, string | number>) => (values ? `${key}(${Object.values(values).join(",")})` : key);
    const text = meetingText(
      {
        talentName: "Agnes Nunes",
        heldAt: "2026-11-08T13:00:00Z",
        mode: "online",
        representative: "Ana",
        participants: "",
        fullName: "Agnes Nunes da Silva",
        contactConfirmed: "yes",
        contactFix: "",
        notes: { summary: "Interesse alto." },
        formats: { cpa: { interest: "yes", note: "beleza" } },
        actionTitle: "Black Friday 2026",
        actionInterest: "depends",
        checks: { reg_email: true },
        actions: [{ id: "a", title: "Pedir media kit", ownerKind: "talent", ownerId: null, owner: null, dueOn: "2026-11-10", status: "pending" }],
        sender: null,
        sentOn: null,
        followUpOn: "2026-11-15",
      },
      tr,
      { date: (d) => d, dateTime: (iso) => iso },
    );
    const order = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"].map((l) => text.indexOf(`SECTIONS.${l}.TITLE`));
    expect(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1]))).toBe(true);
    expect(text).toContain("• fields.participants: —");
    expect(text).toContain("• formats.cpa: interest.yes · beleza");
    expect(text).toContain("1. Pedir media kit — owner.talent — 2026-11-10 — actionStatus.pending");
    expect(text).toContain("☑ checks.reg_email");
  });
  it("leitura do banco ignora o que não é do modelo", () => {
    expect(parseNotes({ summary: "ok", cpf: "x", rates: 3, conflicts: "  " })).toEqual({ summary: "ok" });
    expect(parseChecks({ reg_email: true, reg_phone: "sim", media_kit: "talvez", internal_data: "received" })).toEqual({ reg_email: true, internal_data: "received" });
  });
});

describe("migração 0138", () => {
  it("tabelas fechadas, funções fora do anon e ajudantes internos fora do app", () => {
    expect(sql).toMatch(/revoke all on public\.%I from public, anon, authenticated/);
    for (const fn of [
      "creator_meeting_create(uuid)",
      "creator_meeting_save(uuid, jsonb)",
      "creator_meeting_finalize(uuid)",
      "creator_meeting_reopen(uuid)",
      "creator_meeting_delete(uuid)",
      "creator_meeting_action_set(uuid, text)",
      "creator_meetings_list(uuid)",
      "creator_meeting_get(uuid)",
      "creator_meeting_actions_open(uuid, boolean)",
    ]) {
      expect(sql).toContain(`revoke execute on function public.${fn} from public, anon;`);
    }
    expect(sql).toContain("revoke execute on function public.creator_meeting_member_name(uuid, uuid) from public, anon, authenticated;");
    expect(sql).not.toMatch(/grant execute[^;]*to[^;]*\banon\b/i);
  });
  it("a ata nunca passa por cima da resposta que o próprio Hero deu no portal", () => {
    expect(sql).toContain("where public.talent_action_responses.meeting_id is not null");
    expect(sql).toContain("meeting_id = null");
  });
  it("só a primeira conclusão (e da reunião mais nova) mexe no relacionamento; nota da equipe não vai para o Hero", () => {
    expect(sql).toContain("v_first := m.finalized_at is null;");
    expect(sql).toContain("if v_first and v_newest and m.formats <> '{}'::jsonb then");
    expect(sql).toContain("'note', coalesce(v_cur -> r.key ->> 'note', '')");
    expect(sql).toContain("values (m.talent_id, m.action_key, m.action_interest, '', '', '', now(), auth.uid(), m.id)");
  });
  it("concluída nunca fica sem próximo passo; quem saiu da equipe não trava nem é avisado", () => {
    expect(sql).toContain("-- concluída nunca fica sem próximo passo com responsável e prazo");
    expect(sql).toContain("v_sender is distinct from m.sender_id and not public.creator_meeting_member_ok");
    expect(sql).toContain("and public.creator_meeting_member_ok(m.agency_id, x.owner_id)\n           group by x.owner_id loop");
  });
  it("campo que não veio fica como está (encaminhamentos só mudam quando a lista vem)", () => {
    expect(sql).toContain("v_data := to_jsonb(m) || p_data;");
    expect(sql).toContain("if not (p_data ? 'actions') then");
  });
  it("aba Reuniões na ficha do casting e o aviso novo", () => {
    expect(read("src", "app", "agencia", "casting", "[id]", "layout.tsx")).toContain("`${base}/reunioes`");
    expect(sql).toContain("'creator_meeting_action'));");
  });
});
