"use client";

import { AlertTriangle, ArrowRightLeft, CheckCircle2, MessageSquarePlus, Save, Undo2, Users, X, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { CompensationFields } from "@/components/compensation/CompensationFields";
import { CompensationView } from "@/components/compensation/CompensationView";
import { addActivityAction, confirmDealAction, createDealAction, moveDealAction, setDealCompensationAction, setDealTeamAction, updateDealAction } from "@/app/agencia/negocios/actions";
import { Button, Checkbox, DatePicker, DateRangePicker, Dialog, EntityCard, EntitySelect, FormField, IconButton, Input, SegmentedControl, Select, Textarea, useToast } from "@/components/ui";
import { campaignHeroIds, heroNames } from "@/lib/deals/client-label";
import { hasCloseWonPending, type CloseWonPending } from "@/lib/deals/next-step";
import { canConfirm, DEAL_OUTCOMES, moveNeedsNote, nextStages, type DealOutcome, type DealStage } from "@/lib/deals/stages";
import { ACTIVITY_KINDS, type ActivityKind } from "@/lib/deals/vocab";
import { serviceFitsClient, type ClientKind } from "@/lib/roadmap/vocab";
import { brandOption, memberOption, talentOption } from "@/lib/ui/entity";
import { draftFrom, draftToCompensation, MONEY_ONLY, toDb, type Compensation } from "@/lib/compensation/model";
import { brlToCents, centsToBrl } from "@/lib/money/brl-input";

/** Membro da agência para as listas; `role` (admin|manager|staff) e `jobTitle` vêm de listTeam. */
export type Member = { userId: string; name: string; role?: string | null; jobTitle?: string | null };

// ---------------------------------------------------------------- criar / editar
type DealValues = { title: string; talentBrief: string; expectedStart: string; expectedEnd: string; ownerId: string; notes: string; brandId: string };
/** Hero do casting que pode ser cliente do negócio (0107). */
export type ClientTalent = { id: string; name: string; city?: string | null; state?: string | null; avatarUrl?: string | null };
/** Serviço do catálogo (0107): ao escolher, o roteiro nasce junto com o negócio. */
export type ServiceOption = { id: string; name: string; clientKind: ClientKind; slaDays: number };

export function DealForm({
  initial,
  dealId,
  brands,
  members,
  canEdit,
  canSetOwner,
  talents = [],
  services = [],
  prefill,
  compensation,
  canSetCompensation,
}: {
  /** 0140: forma de pagamento (valor, permuta e/ou performance, combináveis). */
  compensation?: Compensation;
  /** Quem muda a forma de pagamento: ao lançar, o gestor; depois, só o Adm (padrão: quem escolhe o responsável). */
  canSetCompensation?: boolean;
  initial: DealValues;
  dealId: string | null;
  brands: { id: string; name: string; logoUrl?: string | null }[];
  members: Member[];
  canEdit: boolean;
  canSetOwner: boolean;
  talents?: ClientTalent[];
  services?: ServiceOption[];
  /** 0110: "próximo negócio" sugerido no clipping já chega com cliente, Hero e serviço. */
  prefill?: { client?: ClientKind; talentId?: string; serviceId?: string; originDealId?: string };
}) {
  const t = useTranslations("agency.deal.form");
  const tr = useTranslations("roadmap.newDeal");
  const tdp = useTranslations("common.datePicker");
  const tp = useTranslations("pickers");
  const memberOptions = members.map((m) => memberOption(tp, m));
  const router = useRouter();
  const { toast } = useToast();
  const [v, setV] = useState(initial);
  // 0107: cliente = marca, Hero ou os dois; serviço opcional (gera o roteiro) e início do roteiro (vazio = hoje)
  const [client, setClient] = useState<ClientKind>(prefill?.client ?? (brands.length > 0 || talents.length === 0 ? "brand" : "talent"));
  const [talentId, setTalentId] = useState(prefill?.talentId ?? "");
  const [serviceId, setServiceId] = useState(prefill?.serviceId ?? "");
  const [startOn, setStartOn] = useState("");
  // 04/11: Heros da campanha (escalados) ≠ Hero cliente. Só com marca: negócio só do Hero não tem a aba Heros.
  const [castIds, setCastIds] = useState<string[]>([]);
  const castOn = !dealId && client !== "talent" && talents.length > 0;
  const fitting = services.filter((x) => serviceFitsClient(x.clientKind, client));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof DealValues>(k: K, value: DealValues[K]) => setV((cur) => ({ ...cur, [k]: value }));
  const disabled = pending || !canEdit;
  const tc = useTranslations("compensation");
  const [comp, setComp] = useState(() => draftFrom(compensation ?? MONEY_ONLY, centsToBrl));
  // grava a forma só quando ela muda (editar o título não pode reescrever a forma de pagamento)
  const [savedComp] = useState(() => JSON.stringify(toDb(compensation ?? MONEY_ONLY)));
  const setsCompensation = canSetCompensation ?? canSetOwner;

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    // 0140: a forma de pagamento é conferida antes de gravar o negócio
    const checked = setsCompensation ? draftToCompensation(comp, brlToCents) : null;
    if (checked && !checked.ok) return setError(tc(`errors.${checked.error}`));
    start(async () => {
      const result = dealId
        ? await updateDealAction({ dealId, title: v.title, talentBrief: v.talentBrief, expectedStart: v.expectedStart, expectedEnd: v.expectedEnd, ...(canSetOwner ? { ownerId: v.ownerId } : {}) })
        : await createDealAction({
            brandId: client === "talent" ? "" : v.brandId,
            clientTalentId: client === "brand" ? "" : talentId,
            serviceId: fitting.some((x) => x.id === serviceId) ? serviceId : "",
            startOn,
            title: v.title,
            talentBrief: v.talentBrief,
            expectedStart: v.expectedStart,
            expectedEnd: v.expectedEnd,
            ownerId: v.ownerId,
            notes: v.notes,
            originDealId: prefill?.originDealId ?? "",
            campaignTalentIds: castOn ? campaignHeroIds(castIds) : [],
          });
      if (!result.ok) return setError(result.error);
      // 0140: forma de pagamento (gestor+; o banco confere de novo)
      const savedId = dealId ?? result.id;
      if (savedId && checked?.ok && JSON.stringify(toDb(checked.value)) !== savedComp) {
        const saved = await setDealCompensationAction({ dealId: savedId, compensation: toDb(checked.value) });
        if (!saved.ok) toast({ title: saved.error, variant: "error" });
      }
      toast({ title: result.message, variant: "success" });
      // falha parcial: o negócio existe; os Heros que não entraram são adicionados depois na aba Heros
      if (result.castFailed && result.castFailed.length > 0) {
        const names = heroNames(result.castFailed, talents);
        toast({ title: tr("castFailed", { names: names.join(", ") }), variant: "error", duration: 12000 });
      }
      if (!dealId && result.id) router.push(`/agencia/negocios/${result.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate data-testid="deal-form">
      {!dealId ? (
        <FormField label={tr("client")} hint={tr("clientHint")}>
          <SegmentedControl<ClientKind>
            aria-label={tr("client")}
            value={client}
            onValueChange={setClient}
            options={[
              { value: "brand", label: tr("clientKinds.brand"), disabled: brands.length === 0 },
              { value: "talent", label: tr("clientKinds.talent"), disabled: talents.length === 0 },
              { value: "both", label: tr("clientKinds.both"), disabled: brands.length === 0 || talents.length === 0 },
            ]}
          />
        </FormField>
      ) : null}
      {!dealId && client !== "talent" ? (
        <FormField label={t("brand")} hint={tp("hints.dealBrand")} required>
          <EntitySelect
            value={v.brandId}
            onChange={(e) => set("brandId", e.target.value)}
            disabled={disabled}
            emptyLabel="—"
            roleInOption={false}
            options={brands.map((b) => brandOption(tp, b))}
          />
        </FormField>
      ) : null}
      {!dealId && client !== "brand" ? (
        <FormField label={tr("hero")} hint={tr("heroHint")} required>
          <EntitySelect value={talentId} onChange={(e) => setTalentId(e.target.value)} disabled={disabled} emptyLabel="—" options={talents.map((x) => talentOption(tp, x))} data-testid="deal-client-hero" />
        </FormField>
      ) : null}
      {castOn ? (
        <div className="flex flex-col gap-2" data-testid="deal-cast">
          {/* reaproveita a caixa de Heros do casting: escolher adiciona à lista abaixo e a caixa volta ao vazio */}
          <FormField label={tr("cast")} hint={tr("castHint")}>
            <EntitySelect
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (id) setCastIds((cur) => campaignHeroIds([...cur, id]));
              }}
              disabled={disabled || castIds.length >= 30}
              emptyLabel={tr("castAdd")}
              options={talents.filter((x) => !castIds.includes(x.id)).map((x) => talentOption(tp, x))}
              data-testid="deal-cast-select"
            />
          </FormField>
          {castIds.length > 0 ? (
            <ul className="flex flex-col gap-2" aria-label={tr("castChosen", { count: castIds.length })}>
              {castIds.map((id) => {
                const hero = talents.find((x) => x.id === id);
                if (!hero) return null;
                return (
                  <li key={id} className="flex items-center gap-2">
                    <EntityCard option={talentOption(tp, hero)} className="min-w-0 flex-1" />
                    <IconButton type="button" variant="ghost" icon={<X />} label={tr("castRemove", { name: hero.name })} disabled={disabled} onClick={() => setCastIds((cur) => cur.filter((x) => x !== id))} />
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
      {!dealId && services.length > 0 ? (
        <FormField label={tr("service")} hint={tr("serviceHint")}>
          <Select value={fitting.some((x) => x.id === serviceId) ? serviceId : ""} onChange={(e) => setServiceId(e.target.value)} disabled={disabled} data-testid="deal-service">
            <option value="">{tr("serviceLater")}</option>
            {fitting.map((x) => (
              <option key={x.id} value={x.id}>
                {tr("serviceOption", { name: x.name, days: x.slaDays })}
              </option>
            ))}
          </Select>
        </FormField>
      ) : null}
      {!dealId && fitting.some((x) => x.id === serviceId) ? (
        <FormField label={tr("startOn")} hint={tr("startOnHint")}>
          <DatePicker value={startOn} onChange={setStartOn} disabled={disabled} data-testid="deal-start-on" />
        </FormField>
      ) : null}
      <FormField label={t("title")} required>
        <Input value={v.title} maxLength={120} onChange={(e) => set("title", e.target.value)} disabled={disabled} />
      </FormField>
      <FormField label={t("brief")} hint={t("briefHint")}>
        <Textarea value={v.talentBrief} maxLength={3000} rows={4} onChange={(e) => set("talentBrief", e.target.value)} disabled={disabled} />
      </FormField>
      <FormField label={tdp("period")}>
        <DateRangePicker start={v.expectedStart} end={v.expectedEnd} onChange={(a, b) => setV((cur) => ({ ...cur, expectedStart: a, expectedEnd: b }))} disabled={disabled} data-testid="deal-period" />
      </FormField>
      {canSetOwner ? (
        <FormField label={t("owner")} hint={tp("hints.dealOwner")}>
          <EntitySelect value={v.ownerId} onChange={(e) => set("ownerId", e.target.value)} disabled={disabled} emptyLabel={t("noOwner")} emptyCard={tp("empty.noOwner")} options={memberOptions} />
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
      {setsCompensation ? (
        // 0140: o valor em dinheiro do negócio é o cachê de cada Hero (aba Heros); aqui só marca que tem dinheiro
        <CompensationFields idPrefix="deal" draft={comp} onChange={setComp} disabled={disabled} hint={tc("dealHint")} />
      ) : compensation ? (
        // gestor e equipe: a forma de pagamento sem números (quem ajusta é o Adm)
        <div className="flex flex-col gap-1.5" data-testid="deal-compensation-view">
          <span className="text-sm font-medium text-fg">{tc("label")}</span>
          <CompensationView compensation={compensation} canValues={false} always />
          <span className="type-caption text-fg-muted">{tc("adminOnly")}</span>
        </div>
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
// 04/11: encerrar como ganho com pendências (termos sem aceite, contratação não confirmada, entregas abertas) mostra o
// que falta e oferece dois caminhos: "Voltar e concluir" (leva ao Próximo passo) ou, só o Adm e com motivo, "Encerrar
// mesmo assim e cancelar as entregas pendentes" — a RPC (0109) cancela entregas e tarefas abertas na mesma transação,
// para nenhum portal mostrar trabalho fantasma.
export function MoveForm({
  dealId,
  stage,
  role,
  isOwner,
  canClose,
  closePending = null,
}: {
  dealId: string;
  stage: DealStage;
  role: "admin" | "manager" | "staff" | null;
  isOwner: boolean;
  canClose: boolean;
  closePending?: CloseWonPending | null;
}) {
  const t = useTranslations("agency.deal.move");
  const ts = useTranslations("commercial");
  const { toast } = useToast();
  const options = nextStages(role, isOwner, stage);
  const [to, setTo] = useState<string>("");
  const [outcome, setOutcome] = useState<DealOutcome>("lost");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const closing = to === "closed";
  const guarded = closing && outcome === "won" && closePending !== null && hasCloseWonPending(closePending);
  const openCount = closePending?.deliverables.length ?? 0;
  const needsNote = closing ? outcome !== "won" || guarded : to !== "" && moveNeedsNote(stage, to as DealStage);
  if (stage === "closed" && role !== "admin") return null;

  function run(force: boolean) {
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
  function submit(event: FormEvent) {
    event.preventDefault();
    if (guarded) return;
    run(false);
  }
  function back() {
    setTo("");
    setOutcome("lost");
    setError(null);
    document.getElementById("next-step")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const itemLabel = (d: CloseWonPending["deliverables"][number]) => d.title || ts(`deliverableKinds.${d.kind}`);

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
      {closing && outcome !== "won" && openCount > 0 ? <p className="type-caption text-fg-muted">{t("cancelsOpen", { count: openCount })}</p> : null}
      {guarded && closePending ? (
        <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning-soft p-3" role="alert" data-testid="close-won-guard">
          <p className="flex items-center gap-2 text-sm font-semibold text-fg">
            <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />
            {t("guard.title")}
          </p>
          <ul className="flex list-disc flex-col gap-0.5 pl-5 type-body-sm text-fg">
            {closePending.termsPending ? <li>{t("guard.terms")}</li> : null}
            {closePending.contractPending ? <li>{t("guard.contract")}</li> : null}
            {closePending.deliverables.map((d) => (
              <li key={d.id}>{t("guard.deliverable", { item: itemLabel(d), hero: d.heroName, status: ts(`deliverableStatus.${d.status}`) })}</li>
            ))}
          </ul>
          <p className="type-caption text-fg-muted">{t("guard.hint")}</p>
        </div>
      ) : null}
      <FormField label={guarded ? t("guard.reason") : t("note")} hint={needsNote ? t("noteHintRequired") : t("noteHint")} required={needsNote}>
        <Textarea value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)} disabled={pending} />
      </FormField>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      {guarded ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button type="button" variant="secondary" leadingIcon={<Undo2 />} onClick={back} disabled={pending} className="min-h-11" data-testid="close-won-back">
            {t("guard.back")}
          </Button>
          {role === "admin" ? (
            <Button type="button" variant="danger" leadingIcon={<XCircle />} onClick={() => run(true)} loading={pending} className="min-h-11 whitespace-normal text-left" data-testid="close-won-force">
              {openCount > 0 ? t("guard.forceCancel", { count: openCount }) : t("guard.force")}
            </Button>
          ) : (
            <p className="type-caption text-fg-muted">{t("guard.adminOnly")}</p>
          )}
        </div>
      ) : (
        <Button type="submit" size="sm" variant="secondary" leadingIcon={<ArrowRightLeft />} loading={pending} className="w-fit">
          {t("apply")}
        </Button>
      )}
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
