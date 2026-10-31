"use client";

import { Plus, Save, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { saveRequestAction, submitRequestAction } from "@/app/marca/actions";
import { Button, Checkbox, Dialog, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import { parseBrlToCents, type BrandRequestInput, type RequestDeliverable } from "@/lib/deals/schemas";
import { DELIVERABLE_KINDS, FORMATS, OBJECTIVES } from "@/lib/deals/vocab";
import { AGE_BANDS, NETWORKS, UFS } from "@/lib/talent/vocab";

export type CampaignFormValues = Omit<BrandRequestInput, "budgetMaxCents"> & { budgetText: string };

export const EMPTY_CAMPAIGN: CampaignFormValues = {
  id: null,
  talentId: "",
  title: "",
  objective: "",
  product: "",
  targetAudience: "",
  targetAgeBands: [],
  targetStates: [],
  regionNote: "",
  periodStart: "",
  periodEnd: "",
  desiredTime: "",
  durationMinutes: "",
  format: "",
  location: "",
  networks: [],
  deliverables: [],
  notes: "",
  budgetText: "",
  budgetNote: "",
};

type Props = { initial: CampaignFormValues; creatorName: string | null; canEdit: boolean };

// Proposta de campanha da marca em 5 blocos (objetivo, público, período e formato, entregáveis, valor e
// observações). "Salvar rascunho" e "Enviar à agência" são ações explícitas; enviar exige título,
// objetivo, data de início, pelo menos uma rede e um entregável (a RPC confere de novo).
export function CampaignForm({ initial, creatorName, canEdit }: Props) {
  const t = useTranslations("brandPortal.campaigns.form");
  const tc = useTranslations("commercial");
  const tn = useTranslations("mediaKit.networks");
  const router = useRouter();
  const { toast } = useToast();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const set = <K extends keyof CampaignFormValues>(k: K, value: CampaignFormValues[K]) => setV((cur) => ({ ...cur, [k]: value }));
  const disabled = pending || !canEdit;
  const toggle = <T extends string>(list: T[], item: T, on: boolean): T[] => (on ? Array.from(new Set([...list, item])) : list.filter((x) => x !== item));

  function payload(): BrandRequestInput | null {
    const cents = parseBrlToCents(v.budgetText);
    if (cents === undefined) {
      setError(t("budgetInvalid"));
      return null;
    }
    const rest: Partial<CampaignFormValues> = { ...v };
    delete rest.budgetText;
    return { ...(rest as Omit<CampaignFormValues, "budgetText">), budgetMaxCents: cents };
  }

  const complete = v.title.trim().length >= 3 && v.objective !== "" && v.periodStart !== "" && v.networks.length > 0 && v.deliverables.length > 0;

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
      const sent = await submitRequestAction({ id });
      if (!sent.ok) {
        setConfirming(false);
        return setError(sent.error);
      }
      toast({ title: sent.message, variant: "success" });
      router.push(`/marca/campanhas/${id}`);
    });
  }

  const block = "flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5";

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
          <FormField label={t("periodStart")} required>
            <Input type="date" value={v.periodStart} onChange={(e) => set("periodStart", e.target.value)} disabled={disabled} />
          </FormField>
          <FormField label={t("periodEnd")}>
            <Input type="date" value={v.periodEnd} min={v.periodStart || undefined} onChange={(e) => set("periodEnd", e.target.value)} disabled={disabled} />
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
          {v.deliverables.length === 0 ? <p className="type-body-sm text-fg-muted">{t("deliverablesEmpty")}</p> : null}
          <ul className="flex flex-col gap-2">
            {v.deliverables.map((d, i) => (
              <li key={i} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_6rem_1fr_auto] sm:items-end">
                <FormField label={t("deliverableKind")}>
                  <Select value={d.kind} onChange={(e) => set("deliverables", v.deliverables.map((x, j) => (j === i ? { ...x, kind: e.target.value as RequestDeliverable["kind"] } : x)))} disabled={disabled}>
                    {DELIVERABLE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {tc(`deliverableKinds.${k}`)}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label={t("quantity")}>
                  <Input type="number" inputMode="numeric" min={1} max={100} value={String(d.quantity)} onChange={(e) => set("deliverables", v.deliverables.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Math.min(100, Number(e.target.value) || 1)) } : x)))} disabled={disabled} />
                </FormField>
                <FormField label={t("deliverableNetwork")}>
                  <Select value={d.network ?? ""} onChange={(e) => set("deliverables", v.deliverables.map((x, j) => (j === i ? { ...x, network: (e.target.value || null) as RequestDeliverable["network"] } : x)))} disabled={disabled}>
                    <option value="">—</option>
                    {NETWORKS.map((n) => (
                      <option key={n} value={n}>
                        {tn(n)}
                      </option>
                    ))}
                  </Select>
                </FormField>
                {canEdit ? (
                  <Button type="button" size="sm" variant="ghost" leadingIcon={<Trash2 />} onClick={() => set("deliverables", v.deliverables.filter((_, j) => j !== i))} disabled={pending} aria-label={t("removeDeliverable", { n: i + 1 })}>
                    <span className="sr-only sm:not-sr-only">{t("remove")}</span>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {canEdit ? (
            <Button type="button" size="sm" variant="secondary" leadingIcon={<Plus />} onClick={() => set("deliverables", [...v.deliverables, { kind: "post", quantity: 1, network: null }])} disabled={pending || v.deliverables.length >= 30} className="w-fit">
              {t("addDeliverable")}
            </Button>
          ) : null}
        </div>
      </section>

      <section className={block} aria-labelledby="cf-budget">
        <h2 id="cf-budget" className="text-base font-semibold text-fg">
          {t("blocks.budget")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
          <FormField label={t("budget")} hint={t("budgetHint")}>
            <Input inputMode="decimal" value={v.budgetText} maxLength={20} placeholder="0,00" onChange={(e) => set("budgetText", e.target.value)} disabled={disabled} />
          </FormField>
          <FormField label={t("budgetNote")}>
            <Input value={v.budgetNote} maxLength={300} onChange={(e) => set("budgetNote", e.target.value)} disabled={disabled} />
          </FormField>
        </div>
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
          <Button type="button" leadingIcon={<Send />} onClick={() => setConfirming(true)} disabled={pending} data-testid="campaign-submit">
            {t("submit")}
          </Button>
          {!complete ? <span className="self-center type-caption text-fg-muted">{t("incompleteHint")}</span> : null}
        </div>
      ) : null}
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("confirmTitle")}
        description={t("confirmHint")}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
              {t("back")}
            </Button>
            <Button type="button" onClick={() => save(true)} loading={pending} leadingIcon={<Send />} data-testid="campaign-submit-confirm">
              {t("submit")}
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
