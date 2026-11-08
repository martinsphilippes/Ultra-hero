import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { BrandCallForm, type CallFormValues } from "@/components/brand-call/BrandCallForm";
import { PageHeader } from "@/components/ui";
import { listCallAgencyOptions } from "@/lib/brand-call/queries";
import { getBrandContext } from "@/lib/brand-portal/server";
import { plusDays } from "@/lib/calendar/ics";
import { localDay } from "@/lib/today/logic";
import { EMPTY_PUBLIC } from "@/lib/sponsorship/negotiation";
import { MONEY_ONLY } from "@/lib/compensation/model";
import { FromEventNotice } from "@/components/culture/EventCommerce";
import { callPrefill } from "@/lib/culture/prefill";
import { eventForProposal } from "@/lib/culture/from-event";
import { eventHref } from "@/lib/culture/links";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brandCall.meta");
  return { title: t("new") };
}

// Nova chamada da marca (0089): a equipe monta (e pede ao dono), o dono publica. Começa com o período daqui a 2 a 4
// semanas e o prazo para propostas em 7 dias, às 18h (horário de Brasília).
type Props = { searchParams: Promise<{ evento?: string }> };

export default async function NewBrandCallPage({ searchParams }: Props) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  if (!ctx.role) redirect("/marca/oportunidades?aba=chamadas");
  const sp = await searchParams;
  const [t, tt, agencies, from] = await Promise.all([
    getTranslations("brandCall.brand"),
    getTranslations("groscoveCalendar.territories"),
    listCallAgencyOptions(ctx.brand.id),
    eventForProposal(sp.evento),
  ]);
  const today = localDay(new Date(), "America/Sao_Paulo");
  // 0101: "Abrir chamada para agências a partir deste evento" — título, período, descrição + hashtags, local, nicho (território)
  const pre = from.event ? callPrefill(from.event, today, from.event.territory ? tt(from.event.territory) : null) : null;
  const initial: CallFormValues = {
    id: null,
    title: "",
    objective: "",
    description: "",
    startsOn: plusDays(today, 14),
    endsOn: plusDays(today, 28),
    location: "",
    public: EMPTY_PUBLIC,
    deliverables: [],
    creatorsWanted: 1,
    nichesText: "",
    networks: [],
    budgetText: "",
    budgetDisplay: "open",
    valueModel: "fixo",
    maxHeroes: null,
    // 0140: começa só com "Valor"; a marca pode somar (ou trocar por) permuta e performance
    compensation: MONEY_ONLY,
    respondDate: plusDays(today, 7),
    respondTime: "18:00",
    audience: agencies.some((a) => a.serves) ? "my_agencies" : "all",
    agencyIds: [],
  };
  if (pre) {
    Object.assign(initial, {
      title: pre.title,
      description: pre.description,
      startsOn: pre.startsOn,
      endsOn: pre.endsOn,
      location: pre.location,
      nichesText: pre.nichesText,
      respondDate: pre.respondDate,
      calendarEventId: pre.calendarEventId,
    });
  }
  return (
    <div className="flex flex-col gap-5" data-testid="brand-call-new-page">
      <PageHeader title={t("newTitle")} description={t("newDescription")} backHref="/marca/oportunidades?aba=chamadas" backLabel={t("title")} />
      {from.requested ? <FromEventNotice event={from.event} href={from.event ? eventHref("brand", from.event.id) : undefined} missing={!from.event} /> : null}
      <BrandCallForm initial={initial} agencies={agencies} role={ctx.role} />
    </div>
  );
}
