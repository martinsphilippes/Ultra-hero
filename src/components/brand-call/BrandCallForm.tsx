"use client";

import { Save, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Button, Checkbox, DatePicker, DateRangePicker, FormField, Input, QuantityInput, Select, Textarea, useToast } from "@/components/ui";
import { AudienceFields } from "@/components/sponsorship/AudienceFields";
import { saveBrandCallAction } from "@/lib/brand-call/actions";
import { MAX_CREATORS_WANTED, MAX_NICHES, parseNiches, validateCall, type AgencyOption, type CallAudience, type CallFormInput } from "@/lib/brand-call/logic";
import { OBJECTIVES } from "@/lib/deals/vocab";
import { brlToCents } from "@/lib/money/brl-input";
import { NETWORKS, type Network } from "@/lib/talent/vocab";
import { ValueModelFields } from "@/components/value-model/ValueModelFields";
import { DeliverableGroupsEditor, useGroupsError } from "@/components/deals/DeliverableGroupsEditor";
import { expandDeliverableGroups, groupDeliverables } from "@/lib/deals/deliverable-groups";

export type CallFormValues = Omit<CallFormInput, "niches" | "budgetCents"> & { nichesText: string; budgetText: string };

type Props = { initial: CallFormValues; agencies: AgencyOption[]; role: "owner" | "staff" };

// Chamada da marca (0089), formulário da marca: o que precisa (título, objetivo, período, local, público, entregas,
// nº de creators, nichos, redes), a verba e como mostrá-la às agências, o prazo para propostas e quem vê. "Salvar
// rascunho" guarda; "Publicar" (dono) publica, e na equipe vira "Pedir aprovação ao dono" (0081). Mobile first.
export function BrandCallForm({ initial, agencies, role }: Props) {
  const t = useTranslations("brandCall.form");
  const tdp = useTranslations("common.datePicker");
  const to = useTranslations("commercial.objectives");
  const tn = useTranslations("mediaKit.networks");
  const router = useRouter();
  const { toast } = useToast();
  const [v, setV] = useState(initial);
  // entregáveis em linhas (vários tipos × várias redes); viram itens tipo × rede ao salvar
  const [groups, setGroups] = useState(() => groupDeliverables(initial.deliverables));
  const groupsError = useGroupsError();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof CallFormValues>(k: K, value: CallFormValues[K]) => setV((cur) => ({ ...cur, [k]: value }));
  const toggle = <T extends string>(list: T[], item: T, on: boolean): T[] => (on ? Array.from(new Set([...list, item])) : list.filter((x) => x !== item));

  function submit(publish: boolean) {
    setError(null);
    const expanded = expandDeliverableGroups(groups);
    if (!expanded.ok) return setError(groupsError(expanded, groups));
    const budgetCents = brlToCents(v.budgetText);
    const input: CallFormInput = {
      ...v,
      deliverables: expanded.items,
      niches: parseNiches(v.nichesText),
      budgetCents: v.budgetDisplay === "open" && budgetCents === null ? null : budgetCents,
      maxHeroes: v.valueModel === "por_heroi" ? v.maxHeroes : null,
    };
    delete (input as Partial<CallFormValues>).nichesText;
    delete (input as Partial<CallFormValues>).budgetText;
    const problem = validateCall(input, publish);
    if (problem) return setError(t(`errors.${problem}`));
    start(async () => {
      const result = await saveBrandCallAction(input, publish);
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      router.push(`/marca/oportunidades/chamadas/${result.id ?? v.id}`);
      router.refresh();
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit(true);
  }

  const block = "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4";
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate data-testid="brand-call-form">
      <section className={block} aria-labelledby="bc-need">
        <h2 id="bc-need" className="text-base font-semibold text-fg">
          {t("blocks.need")}
        </h2>
        <FormField label={t("title")} required>
          <Input value={v.title} maxLength={120} placeholder={t("titlePlaceholder")} onChange={(e) => set("title", e.target.value)} disabled={pending} data-testid="brand-call-title" />
        </FormField>
        <FormField label={t("objective")}>
          <Select value={v.objective} onChange={(e) => set("objective", e.target.value as CallFormValues["objective"])} disabled={pending}>
            <option value="">—</option>
            {OBJECTIVES.map((o) => (
              <option key={o} value={o}>
                {to(o)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("description")} hint={t("descriptionHint")}>
          <Textarea value={v.description} maxLength={2000} rows={3} onChange={(e) => set("description", e.target.value)} disabled={pending} />
        </FormField>
        <FormField label={tdp("period")} required>
          <DateRangePicker start={v.startsOn} end={v.endsOn} onChange={(a, b) => setV((cur) => ({ ...cur, startsOn: a, endsOn: b }))} disabled={pending} data-testid="brand-call-period" />
        </FormField>
        <FormField label={t("location")} hint={t("locationHint")}>
          <Input value={v.location} maxLength={200} onChange={(e) => set("location", e.target.value)} disabled={pending} />
        </FormField>
      </section>

      <section className={block} aria-labelledby="bc-public">
        <h2 id="bc-public" className="text-base font-semibold text-fg">
          {t("blocks.public")}
        </h2>
        <AudienceFields idPrefix="brand-call" value={v.public} onChange={(next) => set("public", next)} disabled={pending} />
      </section>

      <section className={block} aria-labelledby="bc-deliverables">
        <h2 id="bc-deliverables" className="text-base font-semibold text-fg">
          {t("blocks.deliverables")}
        </h2>
        <DeliverableGroupsEditor idPrefix="brand-call" value={groups} onChange={setGroups} disabled={pending} defaultKind="reels" defaultNetworks={v.networks} />
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t("creatorsWanted")}>
            <QuantityInput min={1} max={MAX_CREATORS_WANTED} value={v.creatorsWanted} onValueChange={(n) => set("creatorsWanted", n)} disabled={pending} />
          </FormField>
          <FormField label={t("niches")} hint={t("nichesHint", { max: MAX_NICHES })}>
            <Input value={v.nichesText} maxLength={500} placeholder={t("nichesPlaceholder")} onChange={(e) => set("nichesText", e.target.value)} disabled={pending} />
          </FormField>
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium text-fg">{t("networks")}</legend>
          <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-4">
            {NETWORKS.map((n) => (
              <Checkbox key={n} label={tn(n)} checked={v.networks.includes(n)} onChange={(e) => set("networks", toggle<Network>(v.networks, n, e.target.checked))} disabled={pending} />
            ))}
          </div>
        </fieldset>
      </section>

      <section className={block} aria-labelledby="bc-budget">
        <h2 id="bc-budget" className="text-base font-semibold text-fg">
          {t("blocks.budget")}
        </h2>
        <ValueModelFields
          idPrefix="brand-call"
          model={v.valueModel}
          onModelChange={(m) =>
            setV((cur) => ({ ...cur, valueModel: m, maxHeroes: m === "por_heroi" ? (cur.maxHeroes ?? cur.creatorsWanted) : null, budgetDisplay: m === "por_heroi" && cur.budgetDisplay === "open" ? "exact" : cur.budgetDisplay }))
          }
          amountText={v.budgetText}
          onAmountChange={(text) => set("budgetText", text)}
          maxHeroes={v.maxHeroes}
          onMaxHeroesChange={(n) => set("maxHeroes", n)}
          disabled={pending}
          amountHint={t("budgetHint")}
          amountTestId="brand-call-budget"
        />
        <FormField label={t("budgetDisplay")}>
          <Select value={v.budgetDisplay} onChange={(e) => set("budgetDisplay", e.target.value as CallFormValues["budgetDisplay"])} disabled={pending} data-testid="brand-call-budget-display">
            {(v.valueModel === "por_heroi" ? (["exact", "up_to"] as const) : (["exact", "up_to", "open"] as const)).map((d) => (
              <option key={d} value={d}>
                {t(`budgetDisplays.${d}`)}
              </option>
            ))}
          </Select>
        </FormField>
      </section>

      <section className={block} aria-labelledby="bc-who">
        <h2 id="bc-who" className="text-base font-semibold text-fg">
          {t("blocks.who")}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t("respondDate")} hint={t("respondHint")} required>
            <DatePicker value={v.respondDate} max={v.endsOn || v.startsOn || undefined} onChange={(value) => set("respondDate", value)} disabled={pending} />
          </FormField>
          <FormField label={t("respondTime")}>
            <Input type="time" value={v.respondTime} onChange={(e) => set("respondTime", e.target.value)} disabled={pending} />
          </FormField>
        </div>
        <FormField label={t("audience")}>
          <Select value={v.audience} onChange={(e) => set("audience", e.target.value as CallAudience)} disabled={pending} data-testid="brand-call-audience">
            <option value="my_agencies">{t("audiences.my_agencies")}</option>
            <option value="selected">{t("audiences.selected")}</option>
            <option value="all">{t("audiences.all")}</option>
          </Select>
        </FormField>
        <p className="type-caption text-fg-muted">{t(`audienceHints.${v.audience}`)}</p>
        {v.audience === "selected" ? (
          <fieldset className="flex flex-col gap-1" data-testid="brand-call-agencies">
            <legend className="mb-1 text-sm font-medium text-fg">{t("agencies")}</legend>
            {agencies.length === 0 ? <p className="type-caption text-fg-muted">{t("noAgencies")}</p> : null}
            <div className="grid gap-x-3 sm:grid-cols-2">
              {agencies.map((a) => (
                <Checkbox key={a.id} label={a.serves ? t("agencyServes", { name: a.name }) : a.name} checked={v.agencyIds.includes(a.id)} onChange={(e) => set("agencyIds", toggle(v.agencyIds, a.id, e.target.checked))} disabled={pending} />
              ))}
            </div>
          </fieldset>
        ) : null}
      </section>

      <p className="type-caption text-fg-muted">{role === "owner" ? t("ownerHint") : t("staffHint")}</p>
      {error ? (
        <p role="alert" className="type-body-sm text-danger" data-testid="brand-call-error">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" size="lg" leadingIcon={<Save />} onClick={() => submit(false)} disabled={pending} data-testid="brand-call-save">
          {t("saveDraft")}
        </Button>
        <Button type="submit" size="lg" leadingIcon={<Send />} disabled={pending} data-testid="brand-call-publish">
          {role === "owner" ? t("publish") : t("askOwner")}
        </Button>
      </div>
    </form>
  );
}
