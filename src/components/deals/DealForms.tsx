"use client";

import { ArrowRightLeft, CheckCircle2, MessageSquarePlus, Save, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { addActivityAction, confirmDealAction, createDealAction, moveDealAction, setDealTeamAction, updateDealAction } from "@/app/agencia/negocios/actions";
import { Button, Checkbox, Dialog, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import { canConfirm, DEAL_OUTCOMES, moveNeedsNote, nextStages, type DealOutcome, type DealStage } from "@/lib/deals/stages";
import { ACTIVITY_KINDS, type ActivityKind } from "@/lib/deals/vocab";

export type Member = { userId: string; name: string };

// ---------------------------------------------------------------- criar / editar
type DealValues = { title: string; talentBrief: string; expectedStart: string; expectedEnd: string; ownerId: string; notes: string; brandId: string };

export function DealForm({ initial, dealId, brands, members, canEdit, canSetOwner }: { initial: DealValues; dealId: string | null; brands: { id: string; name: string }[]; members: Member[]; canEdit: boolean; canSetOwner: boolean }) {
  const t = useTranslations("agency.deal.form");
  const router = useRouter();
  const { toast } = useToast();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof DealValues>(k: K, value: DealValues[K]) => setV((cur) => ({ ...cur, [k]: value }));
  const disabled = pending || !canEdit;

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    start(async () => {
      const result = dealId
        ? await updateDealAction({ dealId, title: v.title, talentBrief: v.talentBrief, expectedStart: v.expectedStart, expectedEnd: v.expectedEnd, ...(canSetOwner ? { ownerId: v.ownerId } : {}) })
        : await createDealAction({ brandId: v.brandId, title: v.title, talentBrief: v.talentBrief, expectedStart: v.expectedStart, expectedEnd: v.expectedEnd, ownerId: v.ownerId, notes: v.notes });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      if (!dealId && result.id) router.push(`/agencia/negocios/${result.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate data-testid="deal-form">
      {!dealId ? (
        <FormField label={t("brand")} required>
          <Select value={v.brandId} onChange={(e) => set("brandId", e.target.value)} disabled={disabled}>
            <option value="">—</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </FormField>
      ) : null}
      <FormField label={t("title")} required>
        <Input value={v.title} maxLength={120} onChange={(e) => set("title", e.target.value)} disabled={disabled} />
      </FormField>
      <FormField label={t("brief")} hint={t("briefHint")}>
        <Textarea value={v.talentBrief} maxLength={3000} rows={4} onChange={(e) => set("talentBrief", e.target.value)} disabled={disabled} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("expectedStart")}>
          <Input type="date" value={v.expectedStart} onChange={(e) => set("expectedStart", e.target.value)} disabled={disabled} />
        </FormField>
        <FormField label={t("expectedEnd")}>
          <Input type="date" value={v.expectedEnd} min={v.expectedStart || undefined} onChange={(e) => set("expectedEnd", e.target.value)} disabled={disabled} />
        </FormField>
      </div>
      {canSetOwner ? (
        <FormField label={t("owner")} hint={t("ownerHint")}>
          <Select value={v.ownerId} onChange={(e) => set("ownerId", e.target.value)} disabled={disabled}>
            <option value="">{t("noOwner")}</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </Select>
        </FormField>
      ) : null}
      {!dealId ? (
        <FormField label={t("notes")} hint={t("notesHint")}>
          <Textarea value={v.notes} maxLength={2000} rows={3} onChange={(e) => set("notes", e.target.value)} disabled={disabled} />
        </FormField>
      ) : null}
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      {canEdit ? (
        <Button type="submit" leadingIcon={<Save />} loading={pending} className="w-fit" data-testid="deal-save">
          {dealId ? t("save") : t("create")}
        </Button>
      ) : null}
    </form>
  );
}

// ---------------------------------------------------------------- mover de etapa / encerrar
export function MoveForm({ dealId, stage, role, isOwner, canClose }: { dealId: string; stage: DealStage; role: "admin" | "manager" | "staff" | null; isOwner: boolean; canClose: boolean }) {
  const t = useTranslations("agency.deal.move");
  const ts = useTranslations("commercial");
  const { toast } = useToast();
  const options = nextStages(role, isOwner, stage);
  const [to, setTo] = useState<string>("");
  const [outcome, setOutcome] = useState<DealOutcome>("lost");
  const [note, setNote] = useState("");
  const [force, setForce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const closing = to === "closed";
  const needsNote = closing ? outcome !== "won" : to !== "" && moveNeedsNote(stage, to as DealStage);
  if (stage === "closed" && role !== "admin") return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!to) return setError(t("pickStage"));
    if (needsNote && note.trim().length < 5) return setError(t("noteRequired"));
    start(async () => {
      const result = await moveDealAction({ dealId, to, outcome: closing ? outcome : null, note: note.trim(), force: closing && outcome === "won" ? force : false });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setTo("");
      setNote("");
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate data-testid="deal-move">
      <FormField label={t("to")}>
        <Select value={to} onChange={(e) => setTo(e.target.value)} disabled={pending}>
          <option value="">—</option>
          {stage === "closed"
            ? (["briefing_received", "qualification", "shortlist", "consultation", "proposal_prep", "negotiation", "approved", "contracting", "approval", "delivery"] as const).map((s) => (
                <option key={s} value={s}>
                  {t("reopenTo", { stage: ts(`stages.${s}`) })}
                </option>
              ))
            : options.map((s) => (
                <option key={s} value={s}>
                  {ts(`stages.${s}`)}
                </option>
              ))}
          {canClose && stage !== "closed" ? <option value="closed">{t("close")}</option> : null}
        </Select>
      </FormField>
      {closing ? (
        <FormField label={t("outcome")}>
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value as DealOutcome)} disabled={pending}>
            {DEAL_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {ts(`outcomes.${o}`)}
              </option>
            ))}
          </Select>
        </FormField>
      ) : null}
      {closing && outcome === "won" && role === "admin" ? <Checkbox label={t("forceWon")} description={t("forceWonHint")} checked={force} onChange={(e) => setForce(e.target.checked)} disabled={pending} /> : null}
      <FormField label={t("note")} hint={needsNote ? t("noteHintRequired") : t("noteHint")} required={needsNote}>
        <Textarea value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} disabled={pending} />
      </FormField>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="sm" variant="secondary" leadingIcon={<ArrowRightLeft />} loading={pending} className="w-fit">
        {t("apply")}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------- confirmação (só Adm)
export function ConfirmCard({ dealId, stage, readyCount, missingFee }: { dealId: string; stage: DealStage; readyCount: number; missingFee: number }) {
  const t = useTranslations("agency.deal.confirm");
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [force, setForce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!canConfirm(stage)) return null;
  const blocked = readyCount === 0 || missingFee > 0;

  function run() {
    setError(null);
    if (force && note.trim().length < 5) return setError(t("noteRequired"));
    start(async () => {
      const result = await confirmDealAction({ dealId, note: note.trim(), force });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setOpen(false);
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-success/30 bg-success-soft/30 p-4" aria-labelledby="deal-confirm" data-testid="deal-confirm">
      <h2 id="deal-confirm" className="flex items-center gap-2 text-base font-semibold text-fg">
        <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
        {t("title")}
      </h2>
      <p className="type-body-sm text-fg-muted">{t("hint")}</p>
      <ul className="type-body-sm text-fg">
        <li>{t("ready", { count: readyCount })}</li>
        {missingFee > 0 ? <li className="text-warning">{t("missingFee", { count: missingFee })}</li> : null}
      </ul>
      <Button type="button" onClick={() => setOpen(true)} disabled={blocked} className="w-fit" data-testid="deal-confirm-open">
        {t("action")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t("dialogTitle")}
        description={t("dialogHint")}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              {t("back")}
            </Button>
            <Button type="button" onClick={run} loading={pending} data-testid="deal-confirm-run">
              {t("action")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <FormField label={t("note")} hint={t("noteHint")}>
            <Textarea value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} disabled={pending} />
          </FormField>
          <Checkbox label={t("force")} description={t("forceHint")} checked={force} onChange={(e) => setForce(e.target.checked)} disabled={pending} />
          {error ? (
            <p role="alert" className="type-body-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
    </section>
  );
}

// ---------------------------------------------------------------- equipe do negócio (gestor+)
export function TeamPicker({ dealId, members, selected, ownerId }: { dealId: string; members: Member[]; selected: string[]; ownerId: string | null }) {
  const t = useTranslations("agency.deal.team");
  const { toast } = useToast();
  const [ids, setIds] = useState<string[]>(selected);
  const [pending, start] = useTransition();
  const toggle = (id: string, on: boolean) => setIds((cur) => (on ? Array.from(new Set([...cur, id])) : cur.filter((x) => x !== id)));

  function save() {
    start(async () => {
      const result = await setDealTeamAction({ dealId, userIds: ids });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="deal-team">
      <p className="type-body-sm text-fg-muted">{t("hint")}</p>
      <ul className="grid gap-1 sm:grid-cols-2">
        {members.map((m) => (
          <li key={m.userId}>
            <Checkbox label={m.name} description={m.userId === ownerId ? t("owner") : undefined} checked={ids.includes(m.userId) || m.userId === ownerId} disabled={pending || m.userId === ownerId} onChange={(e) => toggle(m.userId, e.target.checked)} />
          </li>
        ))}
      </ul>
      <Button type="button" size="sm" variant="secondary" leadingIcon={<Users />} onClick={save} loading={pending} className="w-fit">
        {t("save")}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- registrar contato / nota
export function ActivityForm({ dealId }: { dealId: string }) {
  const t = useTranslations("agency.deal.activity");
  const tk = useTranslations("commercial.activityKinds");
  const { toast } = useToast();
  const [kind, setKind] = useState<ActivityKind>("note");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (body.trim().length === 0) return setError(t("required"));
    start(async () => {
      const result = await addActivityAction({ dealId, subjectType: "deal", subjectId: dealId, kind, body: body.trim() });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setBody("");
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate data-testid="activity-form">
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <FormField label={t("kind")}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as ActivityKind)} disabled={pending}>
            {ACTIVITY_KINDS.map((k) => (
              <option key={k} value={k}>
                {tk(k)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("body")} hint={t("bodyHint")} error={error}>
          <Textarea value={body} maxLength={4000} rows={2} onChange={(e) => setBody(e.target.value)} disabled={pending} />
        </FormField>
      </div>
      <Button type="submit" size="sm" variant="secondary" leadingIcon={<MessageSquarePlus />} loading={pending} className="w-fit">
        {t("add")}
      </Button>
    </form>
  );
}
