"use client";

import { AlertTriangle, Check, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState, useTransition } from "react";
import { ChoicePills } from "@/components/creator-guide/GuideForms";
import { Badge, Button, Checkbox, DatePicker, DateTimePicker, EntitySelect, type EntityOption, FormField, Input, Textarea, useToast } from "@/components/ui";
import { ACTION_INTERESTS, type ActionInterest, FORMAT_INTERESTS, FORMAT_KEYS, type FormatInterest, type FormatKey, NOTE_MAX } from "@/lib/creator-guide/format";
import { deleteMeetingAction, finalizeMeetingAction, type MeetingInput, reopenMeetingAction, saveMeetingAction } from "@/lib/creator-meetings/actions";
import {
  ACTION_TITLE_MAX,
  type Checks,
  type FinalizeProblem,
  INTERNAL_DATA,
  type InternalData,
  K_KEYS,
  type KKey,
  LIMITS,
  LONG_NOTES,
  MAX_ACTIONS,
  MEETING_MODES,
  type MeetingAction,
  type MeetingMode,
  NOTE_KEYS,
  NOTE_LIMITS,
  type NoteKey,
  REGISTRATION_KEYS,
  type RegistrationKey,
  SECTION_NOTES,
  YES_NO,
  type YesNo,
  addDays,
  finalizeProblems,
  hasSensitiveData,
  meetingDay,
  meetingTime,
  postChecklist,
  postProgress,
} from "@/lib/creator-meetings/format";
import type { MeetingDoc } from "@/lib/creator-meetings/types";
import { cn } from "@/lib/utils";

// Ata de reunião (0138): o formulário A–K. Rascunho edita tudo; concluída mostra o registro e deixa mudar só o
// checklist (K), o follow-up e os encaminhamentos (I). O banco confere tudo de novo.

const TALENT = "__talent";
const SECTIONS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"] as const;
type Letter = (typeof SECTIONS)[number];
const SUGGESTIONS = ["kit", "calendar", "formalize", "registration", "answers", "heroKit"] as const;

type Row = MeetingAction & { key: string };
type State = {
  heldDate: string;
  heldTime: string;
  mode: MeetingMode;
  representativeId: string | null;
  participants: string;
  fullName: string;
  contactConfirmed: YesNo | null;
  contactFix: string;
  notes: Record<NoteKey, string>;
  formats: Partial<Record<FormatKey, { interest: FormatInterest; note: string }>>;
  actionKey: string | null;
  actionInterest: ActionInterest | null;
  registerIdea: boolean;
  checks: Checks;
  senderId: string | null;
  sentOn: string | null;
  followUpOn: string | null;
  actions: Row[];
};

let seq = 0;
const newKey = () => `n${Date.now().toString(36)}${(seq += 1)}`;

function initial(m: MeetingDoc): State {
  return {
    heldDate: meetingDay(m.heldAt),
    heldTime: meetingTime(m.heldAt),
    mode: m.mode,
    representativeId: m.representativeId,
    participants: m.participants,
    fullName: m.fullName,
    contactConfirmed: m.contactConfirmed,
    contactFix: m.contactFix,
    notes: Object.fromEntries(NOTE_KEYS.map((k) => [k, m.notes[k] ?? ""])) as Record<NoteKey, string>,
    formats: { ...m.formats },
    actionKey: m.actionKey,
    actionInterest: m.actionInterest,
    registerIdea: m.registerIdea,
    checks: { ...m.checks },
    senderId: m.senderId,
    sentOn: m.sentOn,
    followUpOn: m.followUpOn,
    actions: m.actions.map((a, i) => ({ ...a, key: a.id ?? `s${i}` })),
  };
}

function toInput(s: State): MeetingInput {
  return {
    heldDate: s.heldDate,
    heldTime: s.heldTime,
    mode: s.mode,
    representativeId: s.representativeId,
    participants: s.participants,
    fullName: s.fullName,
    contactConfirmed: s.contactConfirmed,
    contactFix: s.contactFix,
    notes: Object.fromEntries(Object.entries(s.notes).filter(([, v]) => v.trim())),
    formats: s.formats,
    actionKey: s.actionKey,
    actionInterest: s.actionInterest,
    registerIdea: s.registerIdea,
    checks: s.checks,
    senderId: s.senderId,
    sentOn: s.sentOn,
    followUpOn: s.followUpOn,
    actions: s.actions
      .filter((a) => a.title.trim())
      .map((a) => ({ id: a.id, title: a.title.trim(), ownerKind: a.ownerKind, ownerId: a.ownerKind === "team" ? a.ownerId : null, dueOn: a.dueOn, status: a.status })),
  };
}

/** Todos os textos livres da ata, para achar CPF ou dado bancário antes de salvar. */
function freeTexts(s: State): string[] {
  return [s.participants, s.fullName, s.contactFix, ...Object.values(s.notes), ...Object.values(s.formats).map((f) => f?.note ?? ""), ...s.actions.map((a) => a.title)];
}

const card = "flex scroll-mt-24 flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5";

function Section({ letter, title, hint, children, done }: { letter: Letter; title: string; hint?: string; children: ReactNode; done?: boolean }) {
  return (
    <section id={`ata-${letter}`} className={card} aria-labelledby={`ata-${letter}-title`} data-testid={`ata-section-${letter}`}>
      <div className="flex flex-col gap-1">
        <h2 id={`ata-${letter}-title`} className="flex items-center gap-2 text-base font-semibold text-fg">
          {title}
          {done ? <CheckCircle2 className="size-4 text-success" aria-hidden="true" /> : null}
        </h2>
        {hint ? <p className="type-caption text-fg-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Linha do registro (ata concluída): rótulo e texto; vazio mostra "—". */
function ReadRow({ label, value }: { label: string; value: ReactNode }) {
  const empty = value === null || value === undefined || (typeof value === "string" && !value.trim());
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="type-caption font-semibold text-fg-muted">{label}</dt>
      <dd className="type-body-sm whitespace-pre-line text-fg">{empty ? "—" : value}</dd>
    </div>
  );
}

export function MeetingEditor({ meeting, memberOptions, today }: { meeting: MeetingDoc; memberOptions: EntityOption[]; today: string }) {
  const t = useTranslations("creatorMeetings");
  const router = useRouter();
  const { toast } = useToast();
  const [state, setState] = useState<State>(() => initial(meeting));
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<FinalizeProblem[]>([]);
  const locked = meeting.status === "final";

  useEffect(() => {
    setState(initial(meeting));
    setDirty(false);
  }, [meeting]);

  // sair da página com mudança não salva pede confirmação
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof State>(key: K, value: State[K]) => {
    setState((s) => ({ ...s, [key]: value }));
    setDirty(true);
  };
  const setNote = (k: NoteKey, v: string) => {
    setState((s) => ({ ...s, notes: { ...s.notes, [k]: v } }));
    setDirty(true);
  };
  const setCheck = (k: RegistrationKey | KKey, on: boolean) => {
    setState((s) => {
      const next = { ...s.checks };
      if (on) next[k] = true;
      else delete next[k];
      return { ...s, checks: next };
    });
    setDirty(true);
  };
  const setChoice = <K extends "media_kit" | "channels_insights" | "internal_data">(k: K, v: Checks[K] | null) => {
    setState((s) => {
      const next = { ...s.checks };
      if (v) (next as Record<string, unknown>)[k] = v;
      else delete next[k];
      return { ...s, checks: next };
    });
    setDirty(true);
  };
  const setAction = (key: string, patch: Partial<Row>) => {
    setState((s) => ({ ...s, actions: s.actions.map((a) => (a.key === key ? { ...a, ...patch } : a)) }));
    setDirty(true);
  };
  const addAction = (title = "") => {
    setState((s) =>
      s.actions.length >= MAX_ACTIONS
        ? s
        : {
            ...s,
            actions: [
              ...s.actions,
              { key: newKey(), id: null, title, ownerKind: "team", ownerId: s.representativeId, owner: null, dueOn: title ? addDays(today, 3) : null, status: "pending" },
            ],
          },
    );
    setDirty(true);
  };
  const removeAction = (key: string) => {
    setState((s) => ({ ...s, actions: s.actions.filter((a) => a.key !== key) }));
    setDirty(true);
  };

  const sensitive = useMemo(() => freeTexts(state).some(hasSensitiveData), [state]);
  const shortTitle = state.actions.some((a) => a.title.trim().length === 1);
  const post = postChecklist({
    checks: state.checks,
    formatsAnswered: Object.keys(state.formats).length,
    hasQuestions: Boolean(state.notes.open_questions.trim()),
    followUpOn: state.followUpOn,
    actionsReady: state.actions.filter((a) => a.title.trim().length >= 2 && a.dueOn && (a.ownerKind === "talent" || a.ownerId)).length,
  });
  const progress = postProgress(post);

  function run(kind: "save" | "finalize") {
    setError(null);
    if (sensitive) return setError(t("editor.sensitiveBlock"));
    if (shortTitle) return setError(t("editor.invalidTitle"));
    if (kind === "finalize") {
      const missing = finalizeProblems({
        representativeId: state.representativeId,
        notes: state.notes,
        followUpOn: state.followUpOn,
        actions: state.actions,
        registerIdea: state.registerIdea,
      });
      setProblems(missing);
      if (missing.length > 0) return;
    }
    start(async () => {
      const input = { id: meeting.id, talentId: meeting.talentId, data: toInput(state) };
      const res = kind === "save" ? await saveMeetingAction(input) : await finalizeMeetingAction(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDirty(false);
      setProblems([]);
      toast({ title: kind === "save" ? t("editor.saved") : t("editor.finalized"), variant: "success" });
      router.refresh();
    });
  }

  function reopen() {
    if (!window.confirm(t("editor.reopenConfirm"))) return;
    start(async () => {
      const res = await reopenMeetingAction({ id: meeting.id, talentId: meeting.talentId });
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  function remove() {
    if (!window.confirm(t("editor.deleteConfirm"))) return;
    start(async () => {
      const res = await deleteMeetingAction({ id: meeting.id, talentId: meeting.talentId });
      if (!res.ok) return setError(res.error);
      setDirty(false);
      router.push(`/agencia/casting/${meeting.talentId}/reunioes`);
    });
  }

  const ownerValue = (a: Row) => (a.ownerKind === "talent" ? TALENT : (a.ownerId ?? ""));
  const memberName = (id: string | null) => memberOptions.find((o) => o.value === id)?.name ?? null;
  const yesNoOptions = YES_NO.map((v) => ({ value: v, label: t(`yesNo.${v}`) }));
  const noteField = (k: NoteKey) =>
    locked ? (
      <ReadRow key={k} label={t(`fields.${k}`)} value={meeting.notes[k] ?? ""} />
    ) : (
      <FormField key={k} label={t(`fields.${k}`)} error={hasSensitiveData(state.notes[k]) ? t("editor.sensitive") : undefined}>
        <Textarea
          value={state.notes[k]}
          maxLength={NOTE_LIMITS[k]}
          rows={LONG_NOTES.includes(k) ? 4 : 2}
          className={LONG_NOTES.includes(k) ? undefined : "min-h-16"}
          onChange={(e) => setNote(k, e.target.value)}
        />
      </FormField>
    );
  const contactOnFile = [meeting.contactEmail, meeting.contactPhone].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-4 pb-32 md:pb-0 print:pb-0" data-testid="meeting-editor">
      {/* situação da ata */}
      <div className={cn("flex flex-col gap-2 rounded-2xl border p-4", locked ? "border-success/40 bg-success/5" : "border-border bg-surface")} data-testid="meeting-status">
        <div className="flex flex-wrap items-center gap-2">
          <Badge size="sm" variant={locked ? "success" : "warning"}>
            {t(`list.status.${meeting.status}`)}
          </Badge>
          <p className="type-body-sm text-fg">
            {locked
              ? t("editor.finalNote", { date: meeting.finalizedAt ? meetingDay(meeting.finalizedAt).split("-").reverse().join("/") : "", name: meeting.finalizedBy ?? "—" })
              : meeting.finalizedAt
                ? t("editor.reopenedNote")
                : t("editor.draftNote")}
          </p>
        </div>
        {locked && meeting.canManage ? (
          <div>
            <Button type="button" size="sm" variant="ghost" onClick={reopen} disabled={pending} data-testid="meeting-reopen">
              {t("editor.reopen")}
            </Button>
          </div>
        ) : null}
      </div>

      {/* atalhos para as seções */}
      <nav aria-label={t("editor.jump")} className="flex gap-1.5 overflow-x-auto pb-1 print:hidden">
        {SECTIONS.map((l) => (
          <a
            key={l}
            href={`#ata-${l}`}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-sm font-bold text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {l}
          </a>
        ))}
      </nav>

      {/* A. Identificação */}
      <Section letter="A" title={t("sections.A.title")}>
        {locked ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            <ReadRow label={t("fields.talent")} value={meeting.talentName} />
            <ReadRow label={t("fields.full_name")} value={meeting.fullName} />
            <ReadRow label={t("fields.held_at")} value={`${meetingDay(meeting.heldAt).split("-").reverse().join("/")} ${meetingTime(meeting.heldAt)}`} />
            <ReadRow label={t("fields.mode")} value={t(`modes.${meeting.mode}`)} />
            <ReadRow label={t("fields.representative")} value={meeting.representative} />
            <ReadRow label={t("fields.participants")} value={meeting.participants} />
            <ReadRow
              label={t("fields.contact_confirmed")}
              value={[meeting.contactConfirmed ? t(`yesNo.${meeting.contactConfirmed}`) : null, meeting.contactFix || null].filter(Boolean).join(" · ")}
            />
          </dl>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <dl>
              <ReadRow label={t("fields.talent")} value={meeting.talentName} />
            </dl>
            <FormField label={t("fields.full_name")} error={hasSensitiveData(state.fullName) ? t("editor.sensitive") : undefined}>
              <Input value={state.fullName} maxLength={LIMITS.fullName} onChange={(e) => set("fullName", e.target.value)} autoComplete="off" />
            </FormField>
            <FormField label={t("fields.held_at")} required>
              <DateTimePicker
                value={`${state.heldDate}T${state.heldTime}`}
                onChange={(v) => {
                  const [d, tm] = v.split("T");
                  if (d && tm) {
                    setState((s) => ({ ...s, heldDate: d, heldTime: tm.slice(0, 5) }));
                    setDirty(true);
                  }
                }}
              />
            </FormField>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-fg">{t("fields.mode")}</span>
              <ChoicePills options={MEETING_MODES.map((v) => ({ value: v, label: t(`modes.${v}`) }))} value={state.mode} onChange={(v) => set("mode", v)} label={t("fields.mode")} />
            </div>
            <FormField label={t("fields.representative")} required>
              <EntitySelect
                options={memberOptions}
                value={state.representativeId ?? ""}
                emptyLabel={t("owner.choose")}
                onChange={(e) => set("representativeId", e.target.value || null)}
                data-testid="meeting-representative"
              />
            </FormField>
            <FormField label={t("fields.participants")} error={hasSensitiveData(state.participants) ? t("editor.sensitive") : undefined}>
              <Input value={state.participants} maxLength={LIMITS.participants} onChange={(e) => set("participants", e.target.value)} />
            </FormField>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <span className="text-sm font-medium text-fg">{t("fields.contact_confirmed")}</span>
              <p className="type-caption text-fg-muted">{contactOnFile ? t("fields.contact_on_file", { value: contactOnFile }) : t("fields.contact_none")}</p>
              <ChoicePills options={yesNoOptions} value={state.contactConfirmed} onChange={(v) => set("contactConfirmed", state.contactConfirmed === v ? null : v)} label={t("fields.contact_confirmed")} />
              {state.contactConfirmed === "no" ? (
                <FormField label={t("fields.contact_fix")} error={hasSensitiveData(state.contactFix) ? t("editor.sensitive") : undefined}>
                  <Input value={state.contactFix} maxLength={LIMITS.contactFix} onChange={(e) => set("contactFix", e.target.value)} />
                </FormField>
              ) : null}
            </div>
          </div>
        )}
      </Section>

      {/* B e C */}
      {(["B", "C"] as const).map((l) => (
        <Section key={l} letter={l} title={t(`sections.${l}.title`)}>
          {locked ? <dl className="flex flex-col gap-3">{SECTION_NOTES[l].map(noteField)}</dl> : <div className="flex flex-col gap-4">{SECTION_NOTES[l].map(noteField)}</div>}
        </Section>
      ))}

      {/* D. Quatro formatos */}
      <Section letter="D" title={t("sections.D.title")} hint={locked ? undefined : t("sections.D.hint")}>
        <ul className="grid gap-3 lg:grid-cols-2">
          {FORMAT_KEYS.map((k) => {
            const c = state.formats[k];
            return (
              <li key={k} className="flex flex-col gap-2 rounded-xl border border-border p-3" data-testid={`meeting-format-${k}`}>
                <p className="text-sm font-semibold text-fg">{t(`formats.${k}`)}</p>
                {locked ? (
                  <p className="type-body-sm text-fg">{c ? [t(`interest.${c.interest}`), c.note || null].filter(Boolean).join(" · ") : "—"}</p>
                ) : (
                  <>
                    <ChoicePills
                      options={FORMAT_INTERESTS.map((v) => ({ value: v, label: t(`interest.${v}`) }))}
                      value={c?.interest ?? null}
                      onChange={(v) => set("formats", { ...state.formats, [k]: { interest: v, note: c?.note ?? "" } })}
                      label={t(`formats.${k}`)}
                    />
                    {c ? (
                      <Input
                        value={c.note}
                        maxLength={NOTE_MAX}
                        placeholder={t("formatNote")}
                        aria-label={`${t(`formats.${k}`)}: ${t("formatNote")}`}
                        onChange={(e) => set("formats", { ...state.formats, [k]: { ...c, note: e.target.value } })}
                      />
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      {/* E. Ação aberta (Black Friday) */}
      <Section letter="E" title={t("sections.E.title")} hint={locked ? undefined : t("sections.E.hint")}>
        {locked ? (
          <dl className="flex flex-col gap-3">
            <ReadRow label={t("fields.action")} value={meeting.availableActions.find((a) => a.key === meeting.actionKey)?.title ?? ""} />
            <ReadRow label={t("fields.action_interest")} value={meeting.actionInterest ? t(`actionInterest.${meeting.actionInterest}`) : ""} />
            {SECTION_NOTES.E.map(noteField)}
          </dl>
        ) : meeting.availableActions.length === 0 ? (
          <p className="type-body-sm text-fg-muted">{t("fields.action_none")}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {meeting.availableActions.length > 1 ? (
              <ChoicePills
                options={meeting.availableActions.map((a) => ({ value: a.key, label: a.title }))}
                value={state.actionKey}
                onChange={(v) => set("actionKey", v)}
                label={t("fields.action")}
              />
            ) : (
              <dl>
                <ReadRow label={t("fields.action")} value={meeting.availableActions[0].title} />
              </dl>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-fg">{t("fields.action_interest")}</span>
              <ChoicePills
                options={ACTION_INTERESTS.map((v) => ({ value: v, label: t(`actionInterest.${v}`) }))}
                value={state.actionInterest}
                onChange={(v) => {
                  setState((s) => ({ ...s, actionInterest: s.actionInterest === v ? null : v, actionKey: s.actionKey ?? meeting.availableActions[0]?.key ?? null }));
                  setDirty(true);
                }}
                label={t("fields.action_interest")}
                testid="meeting-action-interest"
              />
            </div>
            {SECTION_NOTES.E.map(noteField)}
          </div>
        )}
      </Section>

      {/* F. Projeto autoral */}
      <Section letter="F" title={t("sections.F.title")}>
        {locked ? <dl className="flex flex-col gap-3">{SECTION_NOTES.F.map(noteField)}</dl> : <div className="flex flex-col gap-4">{SECTION_NOTES.F.map(noteField)}</div>}
        {meeting.idea ? (
          <p className="rounded-xl bg-accent-soft px-3 py-2 type-body-sm text-fg">{t("fields.idea_registered", { title: meeting.idea.title })}</p>
        ) : !locked ? (
          <Checkbox
            checked={state.registerIdea}
            onChange={(e) => set("registerIdea", e.target.checked)}
            label={t("fields.register_idea")}
            description={t("fields.register_idea_hint")}
            data-testid="meeting-register-idea"
          />
        ) : null}
      </Section>

      {/* G. Cadastro e materiais */}
      <Section letter="G" title={t("sections.G.title")} hint={t("sections.G.hint")}>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-fg">{t("fields.registration")}</span>
          {locked ? (
            <p className="type-body-sm text-fg">
              {REGISTRATION_KEYS.map((k) => `${meeting.checks[k] ? "☑" : "☐"} ${t(`checks.${k}`)}`).join("   ")}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">
              {REGISTRATION_KEYS.map((k) => (
                <Checkbox key={k} checked={state.checks[k] === true} onChange={(e) => setCheck(k, e.target.checked)} label={t(`checks.${k}`)} />
              ))}
            </div>
          )}
        </div>
        {locked ? (
          <dl className="grid gap-3 sm:grid-cols-3">
            <ReadRow label={t("fields.media_kit")} value={meeting.checks.media_kit ? t(`yesNo.${meeting.checks.media_kit}`) : ""} />
            <ReadRow label={t("fields.internal_data")} value={meeting.checks.internal_data ? t(`internalData.${meeting.checks.internal_data}`) : ""} />
            <ReadRow label={t("fields.channels_insights")} value={meeting.checks.channels_insights ? t(`yesNo.${meeting.checks.channels_insights}`) : ""} />
          </dl>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-fg">{t("fields.media_kit")}</span>
              <ChoicePills options={yesNoOptions} value={state.checks.media_kit ?? null} onChange={(v) => setChoice("media_kit", state.checks.media_kit === v ? null : v)} label={t("fields.media_kit")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-fg">{t("fields.internal_data")}</span>
              <ChoicePills
                options={INTERNAL_DATA.map((v) => ({ value: v, label: t(`internalData.${v}`) }))}
                value={state.checks.internal_data ?? null}
                onChange={(v: InternalData) => setChoice("internal_data", state.checks.internal_data === v ? null : v)}
                label={t("fields.internal_data")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-fg">{t("fields.channels_insights")}</span>
              <ChoicePills
                options={yesNoOptions}
                value={state.checks.channels_insights ?? null}
                onChange={(v) => setChoice("channels_insights", state.checks.channels_insights === v ? null : v)}
                label={t("fields.channels_insights")}
              />
            </div>
          </div>
        )}
        {locked ? <dl>{noteField("materials_notes")}</dl> : noteField("materials_notes")}
      </Section>

      {/* H. Dúvidas */}
      <Section letter="H" title={t("sections.H.title")} hint={locked ? undefined : t("sections.H.hint")}>
        {locked ? <dl>{noteField("open_questions")}</dl> : noteField("open_questions")}
      </Section>

      {/* I. Encaminhamentos (editáveis também depois de concluir) */}
      <Section letter="I" title={t("sections.I.title")} hint={t("sections.I.hint")} done={post.find((p) => p.item === "follow_up")?.done}>
        <ol className="flex flex-col gap-3" data-testid="meeting-actions">
          {state.actions.map((a, i) => (
            <li key={a.key} className={cn("flex flex-col gap-3 rounded-xl border p-3", a.status === "done" ? "border-success/40 bg-success/5" : "border-border")} data-testid="meeting-action-row">
              <div className="flex items-start gap-2">
                <span className="mt-2.5 font-mono text-sm font-semibold text-fg-muted">{i + 1}.</span>
                <FormField label={t("actionForm.title")} className="min-w-0 flex-1" error={hasSensitiveData(a.title) ? t("editor.sensitive") : undefined}>
                  <Input value={a.title} maxLength={ACTION_TITLE_MAX} onChange={(e) => setAction(a.key, { title: e.target.value })} />
                </FormField>
                <Button type="button" variant="ghost" size="sm" className="mt-6" onClick={() => removeAction(a.key)} aria-label={t("actionForm.remove")}>
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <FormField label={t("owner.label")}>
                  <EntitySelect
                    options={memberOptions}
                    value={ownerValue(a)}
                    emptyLabel={t("owner.choose")}
                    extraOptions={[{ value: TALENT, label: t("owner.talent") }]}
                    onChange={(e) =>
                      e.target.value === TALENT
                        ? setAction(a.key, { ownerKind: "talent", ownerId: null })
                        : setAction(a.key, { ownerKind: "team", ownerId: e.target.value || null, owner: memberName(e.target.value) })
                    }
                  />
                </FormField>
                <FormField label={t("owner.due")}>
                  <DatePicker value={a.dueOn ?? ""} onChange={(v) => setAction(a.key, { dueOn: v || null })} />
                </FormField>
                <Checkbox checked={a.status === "done"} onChange={(e) => setAction(a.key, { status: e.target.checked ? "done" : "pending" })} label={t("actionForm.done")} />
              </div>
            </li>
          ))}
        </ol>
        {state.actions.length < MAX_ACTIONS ? (
          <div className="flex flex-col gap-2 print:hidden">
            <Button type="button" variant="secondary" size="sm" leadingIcon={<Plus />} onClick={() => addAction()} className="self-start" data-testid="meeting-add-action">
              {t("actionForm.add")}
            </Button>
            <p className="type-caption font-semibold text-fg-muted">{t("actionForm.suggestions")}</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => {
                const title = t(`actionForm.items.${s}`);
                const used = state.actions.some((a) => a.title.trim() === title);
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={used}
                    onClick={() => addAction(title)}
                    className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border-strong bg-surface px-3 text-sm text-fg hover:bg-surface-hover disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {used ? <Check className="size-3.5" aria-hidden="true" /> : <Plus className="size-3.5" aria-hidden="true" />}
                    {title}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="type-caption text-fg-muted">{t("actionForm.max", { max: MAX_ACTIONS })}</p>
        )}
      </Section>

      {/* J. Resumo executivo */}
      <Section letter="J" title={t("sections.J.title")} hint={locked ? undefined : t("sections.J.hint")}>
        {locked ? <dl>{noteField("summary")}</dl> : noteField("summary")}
      </Section>

      {/* K. Formalização + checklist pós-reunião */}
      <Section letter="K" title={t("sections.K.title")} hint={t("sections.K.hint")}>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label={t("fields.follow_up_on")} hint={t("fields.follow_up_hint")} required>
            <DatePicker value={state.followUpOn ?? ""} min={state.heldDate} onChange={(v) => set("followUpOn", v || null)} />
          </FormField>
          <FormField label={t("fields.sender")}>
            <EntitySelect options={memberOptions} value={state.senderId ?? ""} emptyLabel={t("owner.choose")} onChange={(e) => set("senderId", e.target.value || null)} />
          </FormField>
          <FormField label={t("fields.sent_on")}>
            <DatePicker value={state.sentOn ?? ""} onChange={(v) => set("sentOn", v || null)} />
          </FormField>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-fg">{t("sections.K.title")}</span>
            <Badge size="sm" variant={progress.done === progress.total ? "success" : "neutral"}>
              {t("post.progress", progress)}
            </Badge>
          </div>
          <ul className="flex flex-col" data-testid="meeting-post-checklist">
            {post.map((p) => (
              <li key={p.item} className="border-b border-border last:border-b-0">
                {p.auto ? (
                  <div className="flex min-h-11 items-center gap-3 py-1">
                    <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-sm", p.done ? "bg-success text-white" : "border border-border-strong")}>
                      {p.done ? <Check className="size-3.5" aria-hidden="true" /> : null}
                    </span>
                    <span className="type-body-sm text-fg">
                      {(K_KEYS as readonly string[]).includes(p.item) ? t(`checks.${p.item}`) : t(`post.${p.item}`)}
                      <span className="ml-2 type-caption text-fg-muted">({t("post.auto")})</span>
                    </span>
                  </div>
                ) : (
                  <Checkbox checked={p.done} onChange={(e) => setCheck(p.item as KKey, e.target.checked)} label={t(`checks.${p.item}`)} />
                )}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* barra fixa: salvar e concluir */}
      <div
        className="fixed inset-x-0 bottom-[calc(var(--spacing-bottomnav)+env(safe-area-inset-bottom,0px))] z-30 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur md:sticky md:bottom-4 md:rounded-2xl md:border print:hidden"
        data-testid="meeting-bar"
      >
        <div className="flex flex-col gap-2">
          {error ? (
            <p role="alert" className="flex items-start gap-2 type-caption text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}
          {problems.length > 0 ? (
            <div role="alert" className="type-caption text-danger" data-testid="meeting-problems">
              <p className="font-semibold">{t("editor.missingTitle")}</p>
              <ul className="list-disc pl-5">
                {problems.map((p) => (
                  <li key={p}>{t(`problems.${p}`)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="type-caption text-fg-muted">{dirty ? t("editor.unsaved") : null}</span>
            <div className="flex flex-wrap gap-2">
              {meeting.canDelete ? (
                <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={pending}>
                  {t("editor.delete")}
                </Button>
              ) : null}
              <Button type="button" variant={locked ? "primary" : "secondary"} size="sm" onClick={() => run("save")} disabled={pending} data-testid="meeting-save">
                {pending ? t("editor.saving") : t("editor.save")}
              </Button>
              {!locked ? (
                <Button type="button" size="sm" onClick={() => run("finalize")} disabled={pending} data-testid="meeting-finalize">
                  {pending ? t("editor.finalizing") : t("editor.finalize")}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
