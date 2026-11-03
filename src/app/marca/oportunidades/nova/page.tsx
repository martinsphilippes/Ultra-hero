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

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brandCall.meta");
  return { title: t("new") };
}

// Nova chamada da marca (0089): a equipe monta (e pede ao dono), o dono publica. Começa com o período daqui a 2 a 4
// semanas e o prazo para propostas em 7 dias, às 18h (horário de Brasília).
export default async function NewBrandCallPage() {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  if (!ctx.role) redirect("/marca/oportunidades?aba=chamadas");
  const [t, agencies] = await Promise.all([getTranslations("brandCall.brand"), listCallAgencyOptions(ctx.brand.id)]);
  const today = localDay(new Date(), "America/Sao_Paulo");
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
    respondDate: plusDays(today, 7),
    respondTime: "18:00",
    audience: agencies.some((a) => a.serves) ? "my_agencies" : "all",
    agencyIds: [],
  };
  return (
    <div className="flex flex-col gap-5" data-testid="brand-call-new-page">
      <PageHeader title={t("newTitle")} description={t("newDescription")} backHref="/marca/oportunidades?aba=chamadas" backLabel={t("title")} />
      <BrandCallForm initial={initial} agencies={agencies} role={ctx.role} />
    </div>
  );
}
