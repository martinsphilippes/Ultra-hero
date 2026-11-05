"use client";

import { Ban, CheckCircle2, MessageSquareReply, Save, Send, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { CastBuilderButton } from "@/components/casting/CastBuilderDialog";
import { Badge, Button, Checkbox, DatePicker, FormField, Input, Textarea, useToast } from "@/components/ui";
import { ValueModelFields } from "@/components/value-model/ValueModelFields";
import { ValueTermsView } from "@/components/value-model/ValueTermsView";
import { validateTerms, type ValueModel } from "@/lib/value-model/model";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { agencyCallReplyAction, discardCallProposalAction, saveCallProposalAction } from "@/lib/brand-call/actions";
import {
  agencyCallActions,
  mediaKitUrlValid,
  sumDeliverables,
  type CallCandidate,
  type CallInterest,
  type CallProposal,
} from "@/lib/brand-call/logic";
import type { RequestDeliverable } from "@/lib/deals/schemas";
import { brlToCents, centsToBrl } from "@/lib/money/brl-input";
import { DeliverableGroupsEditor, useGroupsError } from "@/components/deals/DeliverableGroupsEditor";
import { distinctCombos, expandDeliverableGroups, expandValidGroups, groupDeliverables, MAX_DELIVERABLE_COMBOS, newGroup, type DeliverableGroup } from "@/lib/deals/deliverable-groups";
import { DeliverablesText, TermsFields, type TermsDraft } from "./shared";

// entregas de cada creator em linhas (vários tipos × várias redes); viram itens tipo × rede ao salvar
type Chosen = { deliverables: DeliverableGroup[]; mediaKitUrl: string };

type BuilderProps = {
  callId: string;
  callDeliverables: RequestDeliverable[];
  candidates: CallCandidate[];
  interests: CallInterest[];
  draft: CallProposal | null;
  canValues: boolean;
  /** 0096: modelo e máximo da chamada (a proposta começa com eles) */
  callValueModel: ValueModel;
  callMaxHeroes: number | null;
};

// Proposta da agência para a chamada da marca (0089). Gestor+ escolhe creators do casting liberados para marcas
// (os interessados primeiro, com a mensagem), entregas de cada um (começa com as pedidas pela marca), link do media
// kit, prazo de entrega e observações. Só o Adm grava o valor total e envia; o gestor salva o rascunho para o Adm.
export function AgencyProposalBuilder({ callId, callDeliverables, candidates, interests, draft, canValues, callValueModel, callMaxHeroes }: BuilderProps) {
  const t = useTranslations("brandCall.agency.proposal");
  const tv = useTranslations("valueModel");
  const tn = useTranslations("mediaKit.networks");
  const router = useRouter();
  const { toast } = useToast();
  const [picks, setPicks] = useState<Record<string, Chosen>>(() =>
    Object.fromEntries((draft?.talents ?? []).map((x) => [x.talentId, { deliverables: groupDeliverables(x.deliverables), mediaKitUrl: x.mediaKitUrl }])),
  );
  const groupsError = useGroupsError();
  const tg = useTranslations("brandPortal.campaigns.form.groups");
  const startGroups = (): DeliverableGroup[] => (callDeliverables.length > 0 ? groupDeliverables(callDeliverables) : [newGroup("reels")]);
  const [order, setOrder] = useState<string[]>(() => (draft?.talents ?? []).map((x) => x.talentId));
  const [amountText, setAmountText] = useState(centsToBrl(draft?.amountCents ?? null));
  // 0096: a proposta começa com o modelo da chamada (a agência pode propor outro); gestor só vê o que o Adm definiu
  const [valueModel, setValueModel] = useState<ValueModel>(draft?.valueModel ?? callValueModel);
  const [maxHeroes, setMaxHeroes] = useState<number | null>(draft ? draft.maxHeroes : callValueModel === "por_heroi" ? callMaxHeroes : null);
  const [deliverBy, setDeliverBy] = useState(draft?.deliverBy ?? "");
  const [note, setNote] = useState(draft?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const interestOf = (id: string) => interests.find((i) => i.talentId === id) ?? null;
  const sorted = [...candidates].sort((a, b) => Number(b.interested) - Number(a.interested) || a.name.localeCompare(b.name));
  const total = sumDeliverables(order.flatMap((id) => expandValidGroups(picks[id]?.deliverables ?? [])));

  function toggle(id: string, on: boolean) {
    setPicks((cur) => {
      const next = { ...cur };
      if (on) next[id] = cur[id] ?? { deliverables: startGroups(), mediaKitUrl: "" };
      else delete next[id];
      return next;
    });
    setOrder((cur) => (on ? [...cur.filter((x) => x !== id), id] : cur.filter((x) => x !== id)));
  }

  function save(send: boolean) {
    setError(null);
    if (order.length === 0) return setError(t("errors.noCreators"));
    if (order.some((id) => (picks[id]?.deliverables.length ?? 0) === 0)) return setError(t("errors.deliverables"));
    const expanded: Record<string, RequestDeliverable[]> = {};
    for (const id of order) {
      const r = expandDeliverableGroups(picks[id].deliverables);
      if (!r.ok) return setError(`${candidates.find((c) => c.id === id)?.name ?? ""}: ${groupsError(r, picks[id].deliverables)}`);
      expanded[id] = r.items;
    }
    // o banco soma as entregas de todos por tipo + rede e guarda até 30 pares: acima disso, avisa em vez de cortar
    const pairs = distinctCombos(order.flatMap((id) => expanded[id]));
    if (pairs > MAX_DELIVERABLE_COMBOS) return setError(tg("tooManyTotal", { count: pairs, max: MAX_DELIVERABLE_COMBOS }));
    if (order.some((id) => !mediaKitUrlValid(picks[id]?.mediaKitUrl ?? ""))) return setError(t("errors.mediaKit"));
    const amountCents = canValues ? brlToCents(amountText) : null;
    if (send && amountCents === null) return setError(t("errors.amount"));
    const model = canValues ? valueModel : (draft?.valueModel ?? "fixo");
    const max = canValues ? (valueModel === "por_heroi" ? maxHeroes : null) : (draft?.maxHeroes ?? null);
    if (canValues) {
      const problem = validateTerms({ model, amountCents: send || valueModel === "por_heroi" ? amountCents : null, maxHeroes: max });
      if (problem === "value_per_hero_required" && !send && amountCents === null) {
        // rascunho por Hero pode ficar sem valor; o máximo é obrigatório
      } else if (problem === "value_per_hero_required" || problem === "max_heroes_required") return setError(tv(`errors.${problem}`));
    }
    if (model === "por_heroi" && max !== null && order.length > max) return setError(tv("errors.max_heroes", { max }));
    start(async () => {
      const result = await saveCallProposalAction({
        callId,
        talents: order.map((id) => ({ talentId: id, deliverables: expanded[id], mediaKitUrl: picks[id].mediaKitUrl.trim() })),
        amountCents,
        valueModel: model,
        maxHeroes: max,
        deliverBy: deliverBy || null,
        note,
        send,
      });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      router.refresh();
    });
  }

  function discard() {
    if (!draft) return;
    setError(null);
    start(async () => {
      const result = await discardCallProposalAction({ proposalId: draft.id });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setPicks({});
      setOrder([]);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="call-proposal" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4" data-testid="agency-proposal-builder">
      <div className="flex flex-col gap-0.5">
        <h2 id="call-proposal" className="text-base font-semibold text-fg">
          {draft ? t("titleDraft") : t("title")}
        </h2>
        <p className="type-caption text-fg-muted">{canValues ? t("hintAdmin") : t("hintManager")}</p>
      </div>
      <fieldset className="flex flex-col gap-2" data-testid="proposal-candidates">
        <legend className="mb-1 text-sm font-medium text-fg">{t("creators")}</legend>
        {sorted.length === 0 ? <p className="type-body-sm text-warning">{t("noCandidates")}</p> : null}
        {sorted.map((c) => {
          const on = Boolean(picks[c.id]);
          const interest = interestOf(c.id);
          return (
            <div key={c.id} className={`flex flex-col gap-2 rounded-xl border p-3 ${on ? "border-accent/40 bg-accent-soft/40" : "border-border"}`} data-testid="proposal-candidate">
              <div className="flex flex-wrap items-center gap-2">
                <Checkbox label={c.name} checked={on} onChange={(e) => toggle(c.id, e.target.checked)} disabled={pending} />
                {c.interested ? (
                  <Badge size="sm" variant="accent" icon={<Sparkles />}>
                    {t("interested")}
                  </Badge>
                ) : null}
                {c.networks.length > 0 ? <span className="type-caption text-fg-muted">{c.networks.map((n) => tn(n as never)).join(", ")}</span> : null}
              </div>
              {interest?.message ? <p className="type-caption text-fg-muted">“{interest.message}”</p> : null}
              {on ? (
                <div className="flex flex-col gap-2">
                  <DeliverableGroupsEditor idPrefix={`pick-${c.id}`} value={picks[c.id].deliverables} onChange={(d) => setPicks((cur) => ({ ...cur, [c.id]: { ...cur[c.id], deliverables: d } }))} disabled={pending} defaultKind="reels" />
                  <FormField label={t("mediaKit")} hint={t("mediaKitHint")}>
                    <Input type="url" inputMode="url" value={picks[c.id].mediaKitUrl} maxLength={500} placeholder="https://" onChange={(e) => setPicks((cur) => ({ ...cur, [c.id]: { ...cur[c.id], mediaKitUrl: e.target.value } }))} disabled={pending} />
                  </FormField>
                </div>
              ) : null}
            </div>
          );
        })}
      </fieldset>
      {total.length > 0 ? (
        <p className="type-body-sm text-fg">
          <span className="font-medium">{t("total")}: </span>
          <DeliverablesText items={total} className="type-body-sm text-fg" />
        </p>
      ) : null}
      {canValues ? (
        <ValueModelFields
          idPrefix="proposal"
          model={valueModel}
          onModelChange={(m) => {
            setValueModel(m);
            setMaxHeroes(m === "por_heroi" ? (maxHeroes ?? callMaxHeroes ?? Math.max(1, order.length)) : null);
          }}
          amountText={amountText}
          onAmountChange={setAmountText}
          maxHeroes={maxHeroes}
          onMaxHeroesChange={setMaxHeroes}
          disabled={pending}
          required
          amountTestId="proposal-amount"
        />
      ) : (
        <FormField label={t("amount")}>
          <div className="flex min-h-11 flex-col justify-center gap-0.5">
            <p className="type-body-sm text-fg-muted">{draft?.hasAmount ? t("amountSet") : t("amountByAdmin")}</p>
            {draft?.valueModel === "por_heroi" ? <ValueTermsView model="por_heroi" amountCents={null} maxHeroes={draft.maxHeroes} canValues={false} /> : null}
          </div>
        </FormField>
      )}
      {canValues && valueModel === "fixo" ? (
        <CastBuilderButton
          callId={callId}
          maxHeroes={null}
          currentIds={order}
          allowedIds={candidates.map((c) => c.id)}
          budgetCents={brlToCents(amountText)}
          onUse={(ids) => {
            setPicks((cur) => {
              const next: Record<string, Chosen> = {};
              for (const id of ids) next[id] = cur[id] ?? { deliverables: startGroups(), mediaKitUrl: "" };
              return next;
            });
            setOrder(ids);
          }}
        />
      ) : null}
      <FormField label={t("deliverBy")}>
        <DatePicker value={deliverBy} onChange={setDeliverBy} disabled={pending} />
      </FormField>
      <FormField label={t("note")} hint={t("noteHint")}>
        <Textarea value={note} maxLength={1000} rows={3} onChange={(e) => setNote(e.target.value)} disabled={pending} />
      </FormField>
      {error ? (
        <p role="alert" className="type-body-sm text-danger" data-testid="proposal-error">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        {draft ? (
          <Button type="button" variant="ghost" size="lg" leadingIcon={<Trash2 />} onClick={discard} disabled={pending}>
            {t("discard")}
          </Button>
        ) : null}
        <Button type="button" variant="secondary" size="lg" leadingIcon={<Save />} onClick={() => save(false)} disabled={pending || sorted.length === 0} data-testid="proposal-save">
          {t("saveDraft")}
        </Button>
        {canValues ? (
          <Button type="button" size="lg" leadingIcon={<Send />} onClick={() => save(true)} disabled={pending || sorted.length === 0} data-testid="proposal-send">
            {t("send")}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/** A vez da agência (só Adm): aceitar a contraproposta, contrapropor ou recusar com nota. */
export function AgencyCallReply({ proposal: p, decided, canValues }: { proposal: CallProposal; decided: boolean; canValues: boolean }) {
  const t = useTranslations("brandCall.negotiation");
  const tv = useTranslations("valueModel");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { toast } = useToast();
  const actions = agencyCallActions(p, decided, canValues);
  const [mode, setMode] = useState<"counter" | "decline" | null>(null);
  const [terms, setTerms] = useState<TermsDraft>({ amountText: centsToBrl(p.amountCents), valueModel: p.valueModel, maxHeroes: p.maxHeroes, deliverables: groupDeliverables(p.deliverables), deliverBy: p.deliverBy ?? "", note: "" });
  const groupsError = useGroupsError();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (p.status === "open" && p.awaiting === "agency" && !canValues) return <p className="type-caption text-warning">{t("adminOnly")}</p>;
  if (actions.length === 0) return null;
  const last = p.history[p.history.length - 1];

  function reply(action: "accept" | "decline" | "counter") {
    setError(null);
    const amountCents = action === "counter" ? brlToCents(terms.amountText) : null;
    if (action === "counter" && (amountCents === null || terms.deliverables.length === 0)) return setError(t("termsRequired"));
    const expanded = action === "counter" ? expandDeliverableGroups(terms.deliverables) : { ok: true as const, items: [] };
    if (!expanded.ok) return setError(groupsError(expanded, terms.deliverables));
    if (action === "counter") {
      const problem = validateTerms({ model: terms.valueModel, amountCents, maxHeroes: terms.maxHeroes });
      if (problem === "value_per_hero_required" || problem === "max_heroes_required") return setError(tv(`errors.${problem}`));
    }
    if (action === "decline" && terms.note.trim().length < 3) return setError(t("declineNoteRequired"));
    start(async () => {
      const result = await agencyCallReplyAction({
        proposalId: p.id,
        action,
        amountCents,
        deliverables: expanded.items,
        deliverBy: terms.deliverBy || null,
        note: terms.note,
        valueModel: action === "counter" ? terms.valueModel : null,
        maxHeroes: action === "counter" ? terms.maxHeroes : null,
      });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setMode(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning-soft p-3" data-testid="agency-call-reply">
      <p className="type-body-sm text-fg">{t("yourTurn", { date: last ? formatDateTime(last.createdAt, locale) : "—" })}</p>
      {mode === "counter" ? (
        <>
          <TermsFields idPrefix={`agency-counter-${p.id}`} value={terms} onChange={setTerms} disabled={pending} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" leadingIcon={<MessageSquareReply />} onClick={() => reply("counter")} disabled={pending}>
              {t("sendCounter")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode(null)} disabled={pending}>
              {t("back")}
            </Button>
          </div>
        </>
      ) : mode === "decline" ? (
        <>
          <FormField label={t("declineNoteAgency")} required>
            <Textarea value={terms.note} maxLength={500} rows={2} onChange={(e) => setTerms({ ...terms, note: e.target.value })} disabled={pending} />
          </FormField>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="danger" leadingIcon={<Ban />} onClick={() => reply("decline")} disabled={pending}>
              {t("confirmDecline")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode(null)} disabled={pending}>
              {t("back")}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <Button type="button" leadingIcon={<CheckCircle2 />} onClick={() => reply("accept")} disabled={pending} data-testid="agency-accept">
            {t("accept")}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" onClick={() => setMode("counter")} disabled={pending}>
              {t("counter")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode("decline")} disabled={pending}>
              {t("decline")}
            </Button>
          </div>
        </div>
      )}
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
