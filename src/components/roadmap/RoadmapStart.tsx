"use client";

import { ListChecks, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Button, DatePicker, EntitySelect, FormField, Select, useToast } from "@/components/ui";
import { setDealClientAction, startRoadmapAction } from "@/lib/roadmap/actions";
import { serviceFitsClient, type ClientKind } from "@/lib/roadmap/vocab";
import { talentOption } from "@/lib/ui/entity";

type ServiceOption = { id: string; name: string; clientKind: ClientKind; slaDays: number; stepCount: number };

// Escolher o serviço do negócio e gerar o roteiro (ou trocar, enquanto nenhuma etapa foi concluída). Os serviços que
// combinam com o cliente do negócio vêm primeiro; os outros ficam disponíveis (a agência decide).
export function RoadmapStart({
  dealId,
  services,
  client,
  replacing = false,
  currentServiceId = null,
}: {
  dealId: string;
  services: ServiceOption[];
  client: ClientKind | null;
  replacing?: boolean;
  currentServiceId?: string | null;
}) {
  const t = useTranslations("roadmap.deal");
  const { toast } = useToast();
  const sorted = [...services].sort((a, b) => Number(serviceFitsClient(b.clientKind, client)) - Number(serviceFitsClient(a.clientKind, client)));
  const [serviceId, setServiceId] = useState(sorted.find((x) => x.id !== currentServiceId)?.id ?? "");
  const [startOn, setStartOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!serviceId) return setError(t("pickService"));
    if (replacing && !window.confirm(t("replaceConfirm"))) return;
    start(async () => {
      const result = await startRoadmapAction({ dealId, serviceId, startOn, replace: replacing });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate data-testid="roadmap-start">
      <FormField label={t("service")}>
        <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)} disabled={pending} data-testid="roadmap-service">
          <option value="">—</option>
          {sorted.map((x) => (
            <option key={x.id} value={x.id}>
              {t("serviceOption", { name: x.name, days: x.slaDays, steps: x.stepCount })}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={t("startOn")} hint={t("startOnHint")}>
        <DatePicker value={startOn} onChange={setStartOn} disabled={pending} data-testid="roadmap-start-on" />
      </FormField>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" leadingIcon={<ListChecks />} loading={pending} variant={replacing ? "secondary" : "primary"} className="w-full sm:w-fit" data-testid="roadmap-start-submit">
        {replacing ? t("replace") : t("start")}
      </Button>
    </form>
  );
}

// Hero-cliente do negócio: o Hero vê o projeto (só as etapas visíveis ao cliente) no Portal do Hero.
export function DealClientForm({
  dealId,
  talents,
  current,
  hasBrand,
}: {
  dealId: string;
  talents: { id: string; name: string; city?: string | null; state?: string | null; avatarUrl?: string | null }[];
  current: string | null;
  hasBrand: boolean;
}) {
  const t = useTranslations("roadmap.deal");
  const tp = useTranslations("pickers");
  const { toast } = useToast();
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    start(async () => {
      const result = await setDealClientAction({ dealId, talentId: value });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate data-testid="deal-client-form">
      <FormField label={t("heroClient")} hint={t("heroClientHint")}>
        <EntitySelect
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
          emptyLabel={hasBrand ? t("noHeroClient") : "—"}
          options={talents.map((x) => talentOption(tp, x))}
        />
      </FormField>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" leadingIcon={<Save />} loading={pending} disabled={value === (current ?? "")} className="w-full sm:w-fit">
        {t("saveClient")}
      </Button>
    </form>
  );
}
