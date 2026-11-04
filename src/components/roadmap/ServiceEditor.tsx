"use client";

import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Button, FormField, IconButton, Input, QuantityInput, Select, Switch, Textarea, useToast } from "@/components/ui";
import { plannedTotal } from "@/lib/roadmap/business-days";
import { saveServiceAction } from "@/lib/roadmap/actions";
import type { Service } from "@/lib/roadmap/queries";
import { serviceSaveSchema, type ServiceSaveInput, type ServiceStepInput } from "@/lib/roadmap/schemas";
import { CLIENT_KINDS, DUE_RULES, MILESTONES, SECTORS, SERVICE_RECURRENCES, STEP_RECURRENCES, type DueRule, type Sector } from "@/lib/roadmap/vocab";

type StepDraft = ServiceStepInput & { key: string };

let seq = 0;
const newKey = () => `n${++seq}`;

function toDraft(service: Service | null): { values: Omit<ServiceSaveInput, "steps">; steps: StepDraft[] } {
  return {
    values: {
      id: service?.id ?? "",
      name: service?.name ?? "",
      description: service?.description ?? "",
      clientKind: service?.clientKind ?? "both",
      recurrence: service?.recurrence ?? "none",
      slaDays: service?.slaDays ?? 10,
      milestoneDays: service?.milestoneDays ?? null,
      milestoneLabel: service?.milestoneLabel ?? "",
      active: service?.active ?? true,
    },
    steps: (service?.steps ?? []).map((s) => ({
      key: s.id,
      id: s.id,
      title: s.title,
      description: s.description,
      sector: s.sector,
      sectorExtra: s.sectorExtra ?? "",
      dueRule: s.dueRule,
      dueDays: s.dueDays,
      recurrence: s.recurrence ?? "",
      dependsOnPrev: s.dependsOnPrev,
      clientVisible: s.clientVisible,
      automatic: s.automatic,
      milestone: s.milestone ?? "",
    })),
  };
}

const blankStep = (): StepDraft => ({
  key: newKey(),
  id: "",
  title: "",
  description: "",
  sector: "operacao",
  sectorExtra: "",
  dueRule: "business_days",
  dueDays: 1,
  recurrence: "",
  dependsOnPrev: true,
  clientVisible: false,
  automatic: false,
  milestone: "",
});

// Editor de um serviço do catálogo (Adm): dados do serviço e a lista de etapas na ordem (setor, prazo em dias úteis |
// mesmo dia | recorrente, começa depois da anterior ou junto, visível ao cliente, automática, marco). Mostra o total que
// os prazos somam (mesmo cálculo do banco) ao lado do prazo total declarado.
export function ServiceEditor({ service, readOnly }: { service: Service | null; readOnly: boolean }) {
  const t = useTranslations("roadmap.editor");
  const tk = useTranslations("roadmap.clientKinds");
  const tsr = useTranslations("roadmap.serviceRecurrences");
  const ts = useTranslations("roadmap.sectors");
  const tdr = useTranslations("roadmap.dueRules");
  const tr = useTranslations("roadmap.recurrences");
  const tm = useTranslations("roadmap.milestones");
  const router = useRouter();
  const { toast } = useToast();
  const initial = toDraft(service);
  const [v, setV] = useState(initial.values);
  const [steps, setSteps] = useState<StepDraft[]>(initial.steps.length > 0 ? initial.steps : [blankStep()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const disabled = readOnly || pending;
  const planned = plannedTotal(steps.map((s) => ({ dueRule: s.dueRule, dueDays: s.dueRule === "same_day" ? 0 : s.dueDays, dependsOnPrev: s.dependsOnPrev })));

  const setStep = (key: string, patch: Partial<StepDraft>) => setSteps((cur) => cur.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const move = (index: number, delta: number) =>
    setSteps((cur) => {
      const next = [...cur];
      const target = index + delta;
      if (target < 0 || target >= next.length) return cur;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const payload: ServiceSaveInput = {
      ...v,
      steps: steps.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        sector: s.sector,
        sectorExtra: s.sectorExtra,
        dueRule: s.dueRule,
        dueDays: s.dueRule === "same_day" ? 0 : s.dueDays,
        recurrence: s.recurrence,
        dependsOnPrev: s.dependsOnPrev,
        clientVisible: s.clientVisible,
        automatic: s.automatic,
        milestone: s.milestone,
      })),
    };
    const parsed = serviceSaveSchema.safeParse(payload);
    if (!parsed.success) return setError(t("invalid"));
    start(async () => {
      const result = await saveServiceAction(parsed.data);
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      if (!service && result.id) router.push(`/agencia/configuracoes/servicos/${result.id}`);
      else router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate data-testid="service-editor">
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <FormField label={t("name")} required>
          <Input value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} disabled={disabled} data-testid="service-name" />
        </FormField>
        <FormField label={t("description")}>
          <Textarea value={v.description} maxLength={1000} rows={2} onChange={(e) => setV({ ...v, description: e.target.value })} disabled={disabled} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("clientKind")}>
            <Select value={v.clientKind} onChange={(e) => setV({ ...v, clientKind: e.target.value as ServiceSaveInput["clientKind"] })} disabled={disabled}>
              {CLIENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {tk(k)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t("recurrence")}>
            <Select value={v.recurrence} onChange={(e) => setV({ ...v, recurrence: e.target.value as ServiceSaveInput["recurrence"] })} disabled={disabled}>
              {SERVICE_RECURRENCES.map((k) => (
                <option key={k} value={k}>
                  {tsr(k)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t("slaDays")} hint={t("planned", { days: planned })}>
            <QuantityInput value={v.slaDays} min={1} max={365} onValueChange={(n) => setV({ ...v, slaDays: n })} disabled={disabled} aria-label={t("slaDays")} />
          </FormField>
          <FormField label={t("milestoneDays")} hint={t("milestoneHint")}>
            <div className="flex flex-col gap-2">
              <Input
                inputMode="numeric"
                value={v.milestoneDays === null ? "" : String(v.milestoneDays)}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "").slice(0, 3);
                  setV({ ...v, milestoneDays: raw === "" ? null : Number(raw) });
                }}
                disabled={disabled}
                aria-label={t("milestoneDays")}
              />
              <Input value={v.milestoneLabel} maxLength={60} placeholder={t("milestoneLabel")} onChange={(e) => setV({ ...v, milestoneLabel: e.target.value })} disabled={disabled} aria-label={t("milestoneLabel")} />
            </div>
          </FormField>
        </div>
        <Switch checked={v.active} onCheckedChange={(on) => setV({ ...v, active: on })} label={t("active")} disabled={disabled} />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="service-steps">
        <h2 id="service-steps" className="text-base font-semibold text-fg">
          {t("stepsTitle")} · {steps.length}
        </h2>
        <ol className="flex flex-col gap-3" data-testid="service-steps">
          {steps.map((s, i) => (
            <li key={s.key} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="service-step">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-fg">{t("stepTitle", { n: i + 1 })}</span>
                {!readOnly ? (
                  <span className="flex items-center gap-1">
                    <IconButton type="button" label={t("moveUp")} icon={<ArrowUp />} onClick={() => move(i, -1)} disabled={pending || i === 0} />
                    <IconButton type="button" label={t("moveDown")} icon={<ArrowDown />} onClick={() => move(i, 1)} disabled={pending || i === steps.length - 1} />
                    <IconButton type="button" label={t("remove")} icon={<Trash2 />} onClick={() => setSteps((cur) => cur.filter((x) => x.key !== s.key))} disabled={pending || steps.length === 1} />
                  </span>
                ) : null}
              </div>
              <FormField label={t("title")} required>
                <Input value={s.title} maxLength={160} onChange={(e) => setStep(s.key, { title: e.target.value })} disabled={disabled} />
              </FormField>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label={t("sector")}>
                  <Select value={s.sector} onChange={(e) => setStep(s.key, { sector: e.target.value as Sector, sectorExtra: s.sectorExtra === e.target.value ? "" : s.sectorExtra })} disabled={disabled}>
                    {SECTORS.map((x) => (
                      <option key={x} value={x}>
                        {ts(x)}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label={t("sectorExtra")}>
                  <Select value={s.sectorExtra} onChange={(e) => setStep(s.key, { sectorExtra: e.target.value as Sector | "" })} disabled={disabled}>
                    <option value="">{t("none")}</option>
                    {SECTORS.filter((x) => x !== s.sector).map((x) => (
                      <option key={x} value={x}>
                        {ts(x)}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label={t("dueRule")}>
                  <Select
                    value={s.dueRule}
                    onChange={(e) => {
                      const rule = e.target.value as DueRule;
                      setStep(s.key, { dueRule: rule, dueDays: rule === "same_day" ? 0 : Math.max(s.dueDays, 1), recurrence: rule === "recurring" ? s.recurrence || "weekly" : "" });
                    }}
                    disabled={disabled}
                  >
                    {DUE_RULES.map((x) => (
                      <option key={x} value={x}>
                        {tdr(x)}
                      </option>
                    ))}
                  </Select>
                </FormField>
                {s.dueRule !== "same_day" ? (
                  <FormField label={t("dueDays")}>
                    <QuantityInput value={Math.max(s.dueDays, 1)} min={1} max={120} onValueChange={(n) => setStep(s.key, { dueDays: n })} disabled={disabled} aria-label={t("dueDays")} />
                  </FormField>
                ) : null}
                {s.dueRule === "recurring" ? (
                  <FormField label={t("stepRecurrence")}>
                    <Select value={s.recurrence} onChange={(e) => setStep(s.key, { recurrence: e.target.value as StepDraft["recurrence"] })} disabled={disabled}>
                      {STEP_RECURRENCES.map((x) => (
                        <option key={x} value={x}>
                          {tr(x)}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                ) : null}
                <FormField label={t("milestone")}>
                  <Select value={s.milestone} onChange={(e) => setStep(s.key, { milestone: e.target.value as StepDraft["milestone"] })} disabled={disabled}>
                    <option value="">{t("none")}</option>
                    {MILESTONES.map((x) => (
                      <option key={x} value={x}>
                        {tm(x)}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <div className="grid gap-1 sm:grid-cols-3">
                <Switch size="sm" checked={s.dependsOnPrev} onCheckedChange={(on) => setStep(s.key, { dependsOnPrev: on })} label={t("dependsOnPrev")} description={t("dependsOnPrevHint")} disabled={disabled || i === 0} />
                <Switch size="sm" checked={s.clientVisible} onCheckedChange={(on) => setStep(s.key, { clientVisible: on })} label={t("clientVisible")} description={t("clientVisibleHint")} disabled={disabled} />
                <Switch size="sm" checked={s.automatic} onCheckedChange={(on) => setStep(s.key, { automatic: on })} label={t("automatic")} description={t("automaticHint")} disabled={disabled} />
              </div>
            </li>
          ))}
        </ol>
        {!readOnly ? (
          <Button type="button" variant="secondary" leadingIcon={<Plus />} onClick={() => setSteps((cur) => [...cur, blankStep()])} disabled={pending || steps.length >= 60} className="w-full sm:w-fit">
            {t("addStep")}
          </Button>
        ) : null}
      </section>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      {!readOnly ? (
        <Button type="submit" leadingIcon={<Save />} loading={pending} className="w-full sm:w-fit" data-testid="service-save">
          {t("save")}
        </Button>
      ) : null}
    </form>
  );
}
