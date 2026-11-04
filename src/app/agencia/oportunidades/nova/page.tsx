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
import { FromEventNotice } from "@/components/culture/EventCommerce";
import { sponsorshipPrefill } from "@/lib/culture/prefill";
import { eventForProposal } from "@/lib/culture/from-event";
import { eventHref } from "@/lib/culture/links";
import { createClient } from "@/lib/supabase/server";
import type { HeroChoice } from "@/lib/sponsorship/hero-pick";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("newSponsorship") };
}

type Props = { searchParams: Promise<{ data?: string; evento?: string; heroi?: string; marca?: string; ideia?: string }> };

// Nova oportunidade de patrocínio (0085), gestor+. Da agenda chega com ?data=AAAA-MM-DD.
// 0095: o primeiro campo é o HERÓI (busca na plataforma, fora do casting ou digitado); sem trava de elenco. O consentimento
// do herói só é exigido para publicar às marcas; o rascunho vale sem ele.
export default async function NewSponsorshipPage({ searchParams }: Props) {
  const ctx = await requireAgency("manager");
  const sp = await searchParams;
  const tz = ctx.agency.timezone || "America/Sao_Paulo";
  const [t, brands, from] = await Promise.all([getTranslations("sponsorship.agency"), listAgencyBrands(ctx.agency.id), eventForProposal(sp.evento)]);
  const canValues = agencyCan(ctx.role, "admin", ctx.platformAdmin);
  const today = localParts(new Date().toISOString(), tz).date;
  const date = sp.data && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) && sp.data >= today ? sp.data : plusDays(today, 14);
  // prazo padrão: 3 dias antes do evento (ou amanhã, se o evento é logo)
  const respond = plusDays(date, -3) > today ? plusDays(date, -3) : plusDays(today, 1) <= date ? plusDays(today, 1) : date;
  // 0101: "Criar oportunidade de patrocínio a partir deste evento" — o herói é escolhido no formulário; da compatibilidade
  // pode vir já com a ficha do casting (?heroi=) ou com a marca interessada como público escolhido (?marca=)
  const pre = from.event ? sponsorshipPrefill(from.event, today) : null;
  // 0111: "Enviar à marca" de uma ideia aprovada (banco de estratégias) chega com ?ideia= e herói/marca/data
  const ideaId = sp.ideia && /^[0-9a-f-]{36}$/i.test(sp.ideia) ? sp.ideia : "";
  let hero: HeroChoice | null = null;
  if ((pre || ideaId) && sp.heroi && /^[0-9a-f-]{36}$/i.test(sp.heroi)) {
    const supabase = await createClient();
    const { data: f } = await supabase
      .from("talent_profiles")
      .select("id, display_name, creator_id, consent_at, consent_revoked_at")
      .eq("id", sp.heroi)
      .eq("agency_id", ctx.agency.id)
      .is("archived_at", null)
      .maybeSingle();
    if (f) {
      hero = {
        kind: "talent",
        talentId: f.id,
        creatorId: f.creator_id,
        name: f.display_name,
        slug: null,
        avatarUrl: null,
        headline: null,
        pillars: [],
        consent: f.consent_at && !f.consent_revoked_at ? "active" : f.consent_at ? "revoked" : "none",
        profile: "",
        email: "",
      };
    }
  }
  const brandPick = (pre || ideaId) && sp.marca && brands.some((b) => b.brand.id === sp.marca) ? sp.marca : null;
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
      {from.requested ? <FromEventNotice event={from.event} href={from.event ? eventHref("agency", from.event.id) : undefined} missing={!from.event} /> : null}
      <SponsorshipForm
        brands={brands.map((b) => ({ id: b.brand.id, name: b.brand.name }))}
        canValues={canValues}
        initial={{
          id: null,
          hero,
          title: pre?.title ?? "",
          description: pre?.description ?? "",
          location: pre?.location ?? "",
          date: pre?.date ?? date,
          endDate: pre?.endDate ?? "",
          startTime: pre?.startTime ?? "09:00",
          endTime: pre?.endTime ?? "12:00",
          allDay: pre?.allDay ?? false,
          expectedReach: "",
          tiers: [{ id: null, name: t("form.tiers.defaultName"), priceText: "", perksText: "", slots: 1, valueModel: "por_marca" }],
          public: EMPTY_PUBLIC,
          networks: ["instagram"],
          respondDate: pre?.respondDate ?? respond,
          respondTime: "18:00",
          audience: brandPick ? "selected" : "all",
          brandIds: brandPick ? [brandPick] : [],
          calendarEventId: pre?.calendarEventId ?? "",
          strategyIdeaId: ideaId,
        }}
      />
    </div>
  );
}
