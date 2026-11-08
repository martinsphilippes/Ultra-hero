"use client";

import { Save, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveRequestAction, submitRequestAction } from "@/app/marca/actions";
import { BriefFields } from "@/components/brief/BriefFields";
import { CompensationFields } from "@/components/compensation/CompensationFields";
import { CompensationView } from "@/components/compensation/CompensationView";
import { DeliverableGroupsEditor, useGroupsError } from "@/components/deals/DeliverableGroupsEditor";
import { Button, Checkbox, DateRangePicker, Dialog, FormField, Input, MoneyInput, Select, Textarea, useToast } from "@/components/ui";
import { briefValid, draftToBrief } from "@/lib/brief/brief";
import { draftFrom } from "@/lib/compensation/model";
import { expandDeliverableGroups, groupDeliverables } from "@/lib/deals/deliverable-groups";
import type { BrandRequestInput } from "@/lib/deals/schemas";
import { centsToBrl } from "@/lib/money/brl-input";
import { ValueModelFields } from "@/components/value-model/ValueModelFields";
import { askApprovalAction } from "@/lib/selection/actions";
import { FORMATS, OBJECTIVES } from "@/lib/deals/vocab";
import { AGE_BANDS, NETWORKS, UFS } from "@/lib/talent/vocab";

// Valores vazios ficam num módulo comum (campaign-form.ts): uma página do servidor que importasse a
// constante deste arquivo "use client" receberia só uma referência de cliente, sem os campos.
export { EMPTY_CAMPAIGN, type CampaignFormValues } from "@/lib/brand-portal/campaign-form";
import { campaignValuePayload, type CampaignFormValues } from "@/lib/brand-portal/campaign-form";

/**
 * submitMode (0081): "submit" = o diretor envia à agência; "ask" = a equipe pede aprovação interna ao diretor;
 * "none" = sem botão de envio (o diretor decide um pedido aguardando pelo painel de aprovação).
 */
type Props = {
  initial: CampaignFormValues;
  creatorName: string | null;
  canEdit: boolean;
  submitMode?: "submit" | "ask" | "none";
  /** 0088: campanha de patrocínio — "agreed" = valor do acordo (travado), "negotiating" = valor sai da negociação */
  sponsorshipBudget?: "agreed" | "negotiating" | null;
  /**
   * 0096: modelo de valor — "editable" (padrão), "frozen" (campanha de um acordo de chamada: modelo, valor e máximo
   * congelados) ou "hidden" (patrocínio por cotas: o valor segue como estava, sem escolher o modelo).
   */
  valueMode?: "editable" | "frozen" | "hidden";
};

// Proposta de campanha da marca em 5 blocos (objetivo, público, período e formato, entregáveis, pagamento e
// observações). "Salvar rascunho" e "Enviar à agência" são ações explícitas; enviar exige título,
// objetivo, data de início, pelo menos uma rede e um entregável (a RPC confere de novo).
// 0140: forma de pagamento — Valor (os campos de dinheiro de sempre), Permuta e/ou Performance; pode não ter dinheiro.
// Campanha de um acordo (chamada, patrocínio acordado): a forma de pagamento do acordo, só leitura.
export function CampaignForm({ initial, creatorName, canEdit, submitMode = "submit", sponsorshipBudget = null, valueMode = "editable" }: Props) {
  const t = useTranslations("brandPortal.campaigns.form");
  const tdp = useTranslations("common.datePicker");
  const ta = useTranslations("selection.approval");
  const asking = submitMode === "ask";
  const tc = useTranslations("commercial");
  const tn = useTranslations("mediaKit.networks");
  const tb = useTranslations("brief");
  const tcomp = useTranslations("compensation");
  const router = useRouter();
  const { toast } = useToast();
  const [v, setV] = useState(initial);
  // entregáveis em linhas (vários tipos × várias redes); viram itens tipo × rede ao salvar (formato do banco igual)
  const [groups, setGroups] = useState(() => groupDeliverables(initial.deliverables));
  // 0140: rascunho da forma de pagamento (textos digitados); vira o formato do banco ao salvar
  const [comp, setComp] = useState(() => draftFrom(initial.compensation, centsToBrl));
  const groupsError = useGroupsError();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const set = <K extends keyof CampaignFormValues>(k: K, value: CampaignFormValues[K]) => setV((cur) => ({ ...cur, [k]: value }));
  const disabled = pending || !canEdit;
  const toggle = <T extends string>(list: T[], item: T, on: boolean): T[] => (on ? Array.from(new Set([...list, item])) : list.filter((x) => x !== item));
  // valor travado pelo acordo (chamada ou patrocínio acordado): forma de pagamento só para ler; sem dinheiro, sem campo de valor
  const agreed = valueMode === "frozen" || (valueMode === "hidden" && sponsorshipBudget === "agreed");
  const agreedMoney = !agreed || initial.compensation.money;

  function payload(): BrandRequestInput | null {
    // forma de pagamento, valor e modelo (sem "Valor" marcado, os campos de dinheiro escondidos não contam)
    const value = campaignValuePayload(v, comp, valueMode);
    if (!value.ok) {
      const e = value.error;
      setError(e.kind === "compensation" ? tcomp(`errors.${e.code}`) : e.kind === "value" ? t(`valueErrors.${e.code}`) : t("budgetInvalid"));
      return null;
    }
    const expanded = expandDeliverableGroups(groups);
    if (!expanded.ok) {
      setError(groupsError(expanded, groups));
      return null;
    }
    const brief = draftToBrief(v.briefDraft);
    if (!briefValid(brief)) {
      setError(t("briefInvalid"));
      return null;
    }
    const rest: Partial<CampaignFormValues> = { ...v };
    delete rest.budgetText;
    delete rest.briefDraft;
    delete rest.compensation;
    return { ...(rest as Omit<CampaignFormValues, "budgetText" | "briefDraft" | "compensation">), deliverables: expanded.items, brief, ...value.value };
  }

  const complete = v.title.trim().length >= 3 && v.objective !== "" && v.periodStart !== "" && v.networks.length > 0 && groups.length > 0;

  function save(thenSubmit: boolean) {
    setError(null);
    const data = payload();
    if (!data) return;
    if (thenSubmit && !complete) return setError(t("incomplete"));
    start(async () => {
      const saved = await saveRequestAction(data);
      if (!saved.ok) return setError(saved.error);
      const id = saved.id ?? v.id;
      if (!id) return setError(saved.message);
      if (!thenSubmit) {
        toast({ title: saved.message, variant: "success" });
        if (!v.id) router.push(`/marca/campanhas/${id}`);
        else setV((cur) => ({ ...cur, id }));
        return;
      }
      const sent = asking ? await askApprovalAction({ id, note: "" }) : await submitRequestAction({ id });
      if (!sent.ok) {
        setConfirming(false);
        return setError(sent.error);
      }
      toast({ title: sent.message, variant: "success" });
      setConfirming(false);
      router.push(`/marca/campanhas/${id}`);
      router.refresh();
    });
  }

  const block = "flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5";
  // campos de dinheiro de sempre (modelo, valor, máximo de Heros): congelados na chamada acordada; na campanha livre,
  // só aparecem com "Valor" marcado na forma de pagamento
  const valueFields = (
    <ValueModelFields
      idPrefix="campaign"
      model={v.valueModel}
      onModelChange={(m) => setV((cur) => ({ ...cur, valueModel: m, maxHeroes: m === "por_heroi" ? (cur.maxHeroes ?? 3) : null }))}
      amountText={v.budgetText}
      onAmountChange={(text) => set("budgetText", text)}
      maxHeroes={v.maxHeroes}
      onMaxHeroesChange={(n) => set("maxHeroes", n)}
      disabled={disabled}
      frozen={valueMode === "frozen"}
      amountHint={valueMode === "frozen" ? t("budgetAgreedHint") : undefined}
      amountTestId="campaign-budget"
    />
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(false);
      }}
      className="flex flex-col gap-5"
      noValidate
      data-testid="campaign-form"
    >
      <section className={block} aria-labelledby="cf-goal">
        <h2 id="cf-goal" className="text-base font-semibold text-fg">
          {t("blocks.goal")}
        </h2>
        {creatorName ? (
          <p className="rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-fg" data-testid="campaign-creator">
            {t("forCreator", { name: creatorName })}
          </p>
        ) : null}
        <FormField label={t("title")} required>
          <Input value={v.title} maxLength={120} onChange={(e) => set("title", e.target.value)} disabled={disabled} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("objective")} required>
            <Select value={v.objective} onChange={(e) => set("objective", e.target.value as CampaignFormValues["objective"])} disabled={disabled}>
              <option value="">—</option>
              {OBJECTIVES.map((o) => (
                <option key={o} value={o}>
                  {tc(`objectives.${o}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t("product")} hint={t("productHint")}>
            <Input value={v.product} maxLength={300} onChange={(e) => set("product", e.target.value)} disabled={disabled} />
          </FormField>
        </div>
      </section>

      <section className={block} aria-labelledby="cf-audience">
        <h2 id="cf-audience" className="text-base font-semibold text-fg">
          {t("blocks.audience")}
        </h2>
        <FormField label={t("audience")} hint={t("audienceHint")}>
          <Textarea value={v.targetAudience} maxLength={500} rows={2} onChange={(e) => set("targetAudience", e.target.value)} disabled={disabled} />
        </FormField>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-fg">{t("ageBands")}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {AGE_BANDS.map((a) => (
              <Checkbox key={a} label={a} checked={v.targetAgeBands.includes(a)} onChange={(e) => set("targetAgeBands", toggle(v.targetAgeBands, a, e.target.checked))} disabled={disabled} />
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-fg">{t("states")}</legend>
          <div className="grid grid-cols-4 gap-x-3 gap-y-1 sm:grid-cols-7 lg:grid-cols-9">
            {UFS.map((uf) => (
              <Checkbox key={uf} label={uf} checked={v.targetStates.includes(uf)} onChange={(e) => set("targetStates", toggle(v.targetStates, uf, e.target.checked))} disabled={disabled} />
            ))}
          </div>
        </fieldset>
        <FormField label={t("regionNote")}>
          <Input value={v.regionNote} maxLength={200} onChange={(e) => set("regionNote", e.target.value)} disabled={disabled} />
        </FormField>
      </section>

      <section className={block} aria-labelledby="cf-when">
        <h2 id="cf-when" className="text-base font-semibold text-fg">
          {t("blocks.when")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label={tdp("period")} required className="sm:col-span-2">
            <DateRangePicker start={v.periodStart} end={v.periodEnd} onChange={(a, b) => setV((cur) => ({ ...cur, periodStart: a, periodEnd: b }))} disabled={disabled} data-testid="campaign-period" />
          </FormField>
          <FormField label={t("desiredTime")} hint={t("desiredTimeHint")}>
            <Input type="time" value={v.desiredTime} onChange={(e) => set("desiredTime", e.target.value)} disabled={disabled} />
          </FormField>
          <FormField label={t("duration")} hint={t("durationHint")}>
            <Input type="number" inputMode="numeric" min={15} max={14400} step={15} value={v.durationMinutes === "" ? "" : String(v.durationMinutes)} onChange={(e) => set("durationMinutes", e.target.value === "" ? "" : Number(e.target.value))} disabled={disabled} />
          </FormField>
          <FormField label={t("format")}>
            <Select value={v.format} onChange={(e) => set("format", e.target.value as CampaignFormValues["format"])} disabled={disabled}>
              <option value="">—</option>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {tc(`formats.${f}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t("location")} hint={t("locationHint")} className="sm:col-span-2 lg:col-span-3">
            <Input value={v.location} maxLength={200} onChange={(e) => set("location", e.target.value)} disabled={disabled} />
          </FormField>
        </div>
      </section>

      <section className={block} aria-labelledby="cf-deliverables">
        <h2 id="cf-deliverables" className="text-base font-semibold text-fg">
          {t("blocks.deliverables")}
        </h2>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-fg">
            {t("networks")} <span className="text-danger">*</span>
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {NETWORKS.map((n) => (
              <Checkbox key={n} label={tn(n)} checked={v.networks.includes(n)} onChange={(e) => set("networks", toggle(v.networks, n, e.target.checked))} disabled={disabled} />
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-fg">
            {t("deliverables")} <span className="text-danger">*</span>
          </span>
          <DeliverableGroupsEditor idPrefix="campaign" value={groups} onChange={setGroups} disabled={disabled} canEdit={canEdit} defaultKind="post" defaultNetworks={v.networks} />
        </div>
      </section>

      <section className={block} aria-labelledby="cf-brief">
        <h2 id="cf-brief" className="text-base font-semibold text-fg">
          {tb("title")}
        </h2>
        <p className="type-caption text-fg-muted">{tb("hint")}</p>
        <BriefFields value={v.briefDraft} onChange={(next) => set("briefDraft", next)} disabled={disabled} />
      </section>

      <section className={block} aria-labelledby="cf-budget">
        <h2 id="cf-budget" className="text-base font-semibold text-fg">
          {t("blocks.budget")}
        </h2>
        {agreed ? (
          <div className="flex flex-col gap-1.5" data-testid="campaign-compensation-agreed">
            <span className="text-sm font-medium text-fg">{tcomp("label")}</span>
            <CompensationView compensation={initial.compensation} always />
            <p className="type-caption text-fg-muted">{t("compensationAgreedHint")}</p>
          </div>
        ) : null}
        {valueMode === "hidden" ? (
          <div className={agreedMoney ? "grid gap-4 sm:grid-cols-[14rem_1fr]" : "flex flex-col gap-4"}>
            {agreedMoney ? (
              <FormField label={t("budget")} hint={sponsorshipBudget === "agreed" ? t("budgetAgreedHint") : sponsorshipBudget === "negotiating" ? t("budgetNegotiatingHint") : t("budgetHint")}>
                <MoneyInput
                  value={v.budgetText}
                  maxCents={10_000_000_000}
                  onValueChange={(text) => set("budgetText", text)}
                  disabled={disabled || sponsorshipBudget === "agreed"}
                  placeholder={sponsorshipBudget === "negotiating" ? t("budgetNegotiatingPlaceholder") : undefined}
                  data-testid="campaign-budget"
                />
              </FormField>
            ) : null}
            <FormField label={t("budgetNote")}>
              <Input value={v.budgetNote} maxLength={300} onChange={(e) => set("budgetNote", e.target.value)} disabled={disabled} />
            </FormField>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* chamada acordada: o valor congelado (sem dinheiro no acordo, nenhum); campanha livre: Valor/Permuta/Performance */}
            {valueMode === "frozen" ? (agreedMoney ? valueFields : null) : <CompensationFields idPrefix="campaign" draft={comp} onChange={setComp} disabled={disabled} money={valueFields} />}
            <FormField label={t("budgetNote")}>
              <Input value={v.budgetNote} maxLength={300} onChange={(e) => set("budgetNote", e.target.value)} disabled={disabled} />
            </FormField>
          </div>
        )}
        <FormField label={t("notes")} hint={t("notesHint")}>
          <Textarea value={v.notes} maxLength={2000} rows={4} onChange={(e) => set("notes", e.target.value)} disabled={disabled} />
        </FormField>
      </section>

      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="secondary" leadingIcon={<Save />} loading={pending} data-testid="campaign-save">
            {t("saveDraft")}
          </Button>
          {submitMode !== "none" ? (
            <Button type="button" leadingIcon={<Send />} onClick={() => setConfirming(true)} disabled={pending} data-testid="campaign-submit">
              {asking ? ta("ask") : t("submit")}
            </Button>
          ) : null}
          {!complete ? <span className="self-center type-caption text-fg-muted">{t("incompleteHint")}</span> : null}
        </div>
      ) : null}
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title={asking ? ta("askTitle") : t("confirmTitle")}
        description={asking ? ta("askHint") : t("confirmHint")}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
              {t("back")}
            </Button>
            <Button type="button" onClick={() => save(true)} loading={pending} leadingIcon={<Send />} data-testid="campaign-submit-confirm">
              {asking ? ta("ask") : t("submit")}
            </Button>
          </>
        }
      >
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </Dialog>
    </form>
  );
}
