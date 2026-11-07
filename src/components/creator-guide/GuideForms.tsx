"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, FormField, Input, Select, Sheet, Textarea } from "@/components/ui";
import { respondActionAction, saveFormatAction, saveFormatTeamAction, submitIdeaAction, updateIdeaAction } from "@/lib/creator-guide/actions";
import {
  ACTION_INTERESTS,
  ACTION_LIMITS,
  type ActionInterest,
  FORMAT_INTERESTS,
  type FormatChoice,
  type FormatInterest,
  type FormatKey,
  IDEA_FIELDS,
  IDEA_LIMITS,
  IDEA_STATUSES,
  type IdeaField,
  type IdeaStatus,
  NOTE_MAX,
} from "@/lib/creator-guide/format";
import { cn } from "@/lib/utils";

// Como trabalhamos (0136): formulários do creator (formatos, ação aberta, projeto autoral) e da equipe
// (formato registrado na reunião, andamento do projeto). O banco confere quem pode.

type Msg = { ok: boolean; text: string } | null;

function Feedback({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p role={msg.ok ? "status" : "alert"} className={cn("type-caption", msg.ok ? "text-success" : "text-danger")}>
      {msg.text}
    </p>
  );
}

/** Botões de escolha (um só marcado), com aria-pressed. */
function ChoicePills<T extends string>({
  options,
  value,
  onChange,
  label,
  testid,
}: {
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
  testid?: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2" data-testid={testid}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              on ? "border-accent bg-accent text-accent-fg" : "border-border-strong bg-surface text-fg hover:bg-surface-hover",
            )}
          >
            {on ? <Check className="size-4" aria-hidden="true" /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** "Esse formato faz sentido para você?" — no portal do creator ou, com talentId, na ficha (equipe na reunião). */
export function FormatInterestForm({ formatKey, initial, talentId }: { formatKey: FormatKey; initial: FormatChoice | null; talentId?: string }) {
  const t = useTranslations("creatorGuide");
  const router = useRouter();
  const [interest, setInterest] = useState<FormatInterest | null>(initial?.interest ?? null);
  const [note, setNote] = useState(initial?.note ?? "");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const dirty = interest !== (initial?.interest ?? null) || note.trim() !== (initial?.note ?? "");
  return (
    <form
      className="flex flex-col gap-2"
      data-testid={`format-form-${formatKey}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!interest) return;
        start(async () => {
          setMsg(null);
          const r = talentId
            ? await saveFormatTeamAction({ talentId, key: formatKey, interest, note })
            : await saveFormatAction({ key: formatKey, interest, note });
          if (!r.ok) return setMsg({ ok: false, text: r.error });
          setMsg({ ok: true, text: t("formats.saved") });
          router.refresh();
        });
      }}
    >
      <p className="text-sm font-semibold text-fg">{t("formats.question")}</p>
      <ChoicePills
        options={FORMAT_INTERESTS.map((v) => ({ value: v, label: t(`formats.interest.${v}`) }))}
        value={interest}
        onChange={setInterest}
        label={t("formats.question")}
        testid={`format-pills-${formatKey}`}
      />
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={NOTE_MAX}
        placeholder={t("formats.notePlaceholder")}
        aria-label={t("formats.notePlaceholder")}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant="secondary" loading={pending} disabled={!interest || !dirty}>
          {t("formats.save")}
        </Button>
        <Feedback msg={msg} />
      </div>
    </form>
  );
}

type ActionResponse = { interest: ActionInterest; categories: string; availability: string; notes: string } | null;

/** Resposta à ação aberta (ex.: Black Friday): interesse, categorias, disponibilidade e observações. */
export function ActionResponseForm({ actionKey, initial }: { actionKey: string; initial: ActionResponse }) {
  const t = useTranslations("creatorGuide.actions");
  const router = useRouter();
  const [interest, setInterest] = useState<ActionInterest | null>(initial?.interest ?? null);
  const [categories, setCategories] = useState(initial?.categories ?? "");
  const [availability, setAvailability] = useState(initial?.availability ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      data-testid={`action-form-${actionKey}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!interest) return;
        start(async () => {
          setMsg(null);
          const r = await respondActionAction({ key: actionKey, interest, categories, availability, notes });
          if (!r.ok) return setMsg({ ok: false, text: r.error });
          setMsg({ ok: true, text: t("sent") });
          router.refresh();
        });
      }}
    >
      <p className="text-sm font-semibold text-fg">{t("question")}</p>
      <ChoicePills options={ACTION_INTERESTS.map((v) => ({ value: v, label: t(`interest.${v}`) }))} value={interest} onChange={setInterest} label={t("question")} />
      {interest && interest !== "no" ? (
        <>
          <FormField label={t("categories")}>
            <Input value={categories} onChange={(e) => setCategories(e.target.value)} maxLength={ACTION_LIMITS.categories} />
          </FormField>
          <FormField label={t("availability")} hint={t("availabilityHint")}>
            <Textarea rows={3} value={availability} onChange={(e) => setAvailability(e.target.value)} maxLength={ACTION_LIMITS.availability} />
          </FormField>
        </>
      ) : null}
      <FormField label={t("notes")}>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={ACTION_LIMITS.notes} />
      </FormField>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} disabled={!interest}>
          {initial ? t("update") : t("send")}
        </Button>
        <Feedback msg={msg} />
      </div>
    </form>
  );
}

const IDEA_MULTILINE: readonly IdeaField[] = ["concept", "audience", "partners", "needs"];

/** "Enviar meu projeto": abre a folha com o formulário do projeto autoral. */
export function IdeaSheet() {
  const t = useTranslations("creatorGuide.idea");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const empty = Object.fromEntries(IDEA_FIELDS.map((f) => [f, ""])) as Record<IdeaField, string>;
  const [values, setValues] = useState<Record<IdeaField, string>>(empty);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const valid = values.title.trim().length >= 3 && values.concept.trim().length >= 10;
  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="idea-open">
        {t("open")}
      </Button>
      {msg?.ok ? <Feedback msg={msg} /> : null}
      <Sheet open={open} onOpenChange={setOpen} title={t("title")} description={t("lead")}>
        <form
          className="flex flex-col gap-3"
          data-testid="idea-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            start(async () => {
              setMsg(null);
              const r = await submitIdeaAction(values);
              if (!r.ok) return setMsg({ ok: false, text: r.error });
              setValues(empty);
              setOpen(false);
              setMsg({ ok: true, text: t("sent") });
              router.refresh();
            });
          }}
        >
          {IDEA_FIELDS.map((f) => (
            <FormField key={f} label={t(`fields.${f}`)} hint={f === "concept" ? t("fields.conceptHint") : undefined} required={f === "title" || f === "concept"}>
              {IDEA_MULTILINE.includes(f) ? (
                <Textarea rows={f === "concept" ? 5 : 2} value={values[f]} maxLength={IDEA_LIMITS[f]} onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))} />
              ) : (
                <Input value={values[f]} maxLength={IDEA_LIMITS[f]} onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))} />
              )}
            </FormField>
          ))}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button type="submit" loading={pending} disabled={!valid}>
              {t("send")}
            </Button>
            {msg && !msg.ok ? <Feedback msg={msg} /> : null}
          </div>
        </form>
      </Sheet>
    </>
  );
}

/** Gestor+ dá andamento ao projeto autoral (com nota interna). */
export function IdeaStatusControl({ id, talentId, status, note }: { id: string; talentId: string; status: IdeaStatus; note: string }) {
  const t = useTranslations("creatorGuide");
  const router = useRouter();
  const [value, setValue] = useState<IdeaStatus>(status);
  const [text, setText] = useState(note);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      data-testid="idea-status-form"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setMsg(null);
          const r = await updateIdeaAction({ id, talentId, status: value, note: text });
          if (!r.ok) return setMsg({ ok: false, text: r.error });
          setMsg({ ok: true, text: t("teamView.ideaSaved") });
          router.refresh();
        });
      }}
    >
      <FormField label={t("teamView.ideaStatus")}>
        <Select value={value} onChange={(e) => setValue(e.target.value as IdeaStatus)} selectSize="sm">
          {IDEA_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`idea.status.${s}`)}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={t("teamView.teamNote")}>
        <Textarea rows={2} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
      </FormField>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" variant="secondary" loading={pending} disabled={value === status && text.trim() === note}>
          {t("teamView.saveIdea")}
        </Button>
        <Feedback msg={msg} />
      </div>
    </form>
  );
}
