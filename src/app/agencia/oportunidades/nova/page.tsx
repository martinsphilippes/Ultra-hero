import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { SponsorshipForm } from "@/components/sponsorship/SponsorshipForm";
import { PageHeader } from "@/components/ui";
import { listAgencyBrands } from "@/lib/agency/queries";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { plusDays } from "@/lib/calendar/ics";
import { EMPTY_PUBLIC } from "@/lib/sponsorship/negotiation";
import { localParts } from "@/lib/sponsorship/vocab";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("newSponsorship") };
}

type Props = { searchParams: Promise<{ data?: string }> };

// Nova oportunidade de patrocínio (0085), gestor+. Da agenda chega com ?data=AAAA-MM-DD.
// 0095: o primeiro campo é o HERÓI (busca na plataforma, fora do casting ou digitado); sem trava de elenco. O consentimento
// do herói só é exigido para publicar às marcas; o rascunho vale sem ele.
export default async function NewSponsorshipPage({ searchParams }: Props) {
  const ctx = await requireAgency("manager");
  const sp = await searchParams;
  const tz = ctx.agency.timezone || "America/Sao_Paulo";
  const [t, brands] = await Promise.all([getTranslations("sponsorship.agency"), listAgencyBrands(ctx.agency.id)]);
  const canValues = agencyCan(ctx.role, "admin", ctx.platformAdmin);
  const today = localParts(new Date().toISOString(), tz).date;
  const date = sp.data && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) && sp.data >= today ? sp.data : plusDays(today, 14);
  // prazo padrão: 3 dias antes do evento (ou amanhã, se o evento é logo)
  const respond = plusDays(date, -3) > today ? plusDays(date, -3) : plusDays(today, 1) <= date ? plusDays(today, 1) : date;
  return (
    <div className="flex flex-col gap-5" data-testid="sponsorship-new">
      <PageHeader
        title={t("newTitle")}
        description={t("newHint")}
        actions={
          <Link href="/agencia/oportunidades" className="inline-flex min-h-11 items-center text-sm font-medium text-accent-text underline-offset-2 hover:underline">
            {t("back")}
          </Link>
        }
      />
      <SponsorshipForm
        brands={brands.map((b) => ({ id: b.brand.id, name: b.brand.name }))}
        canValues={canValues}
        initial={{
          id: null,
          hero: null,
          title: "",
          description: "",
          location: "",
          date,
          endDate: "",
          startTime: "09:00",
          endTime: "12:00",
          allDay: false,
          expectedReach: "",
          tiers: [{ id: null, name: t("form.tiers.defaultName"), priceText: "", perksText: "", slots: 1 }],
          public: EMPTY_PUBLIC,
          networks: ["instagram"],
          respondDate: respond,
          respondTime: "18:00",
          audience: "all",
          brandIds: [],
        }}
      />
    </div>
  );
}
