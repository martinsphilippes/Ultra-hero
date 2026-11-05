import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AgendaTabs } from "@/components/culture/AgendaTabs";
import { CultureView } from "@/components/culture/CultureView";
import { PageHeader } from "@/components/ui";
import { getBrandContext } from "@/lib/brand-portal/server";
import { loadCulture } from "@/lib/culture/queries";
import { parseAgendaFilters } from "@/lib/platform-calendar/vocab";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("culture.page");
  return { title: t("title") };
}

type Props = { searchParams: Promise<{ territorio?: string }> };

// Real-Time Culture no portal da marca (0101): "Tenho interesse" e "Criar campanha" direto do cartão (dono ou equipe;
// campanha só com agência ativa). A marca nunca vê Heros interessados.
export default async function BrandCulturePage({ searchParams }: Props) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const sp = await searchParams;
  const filters = parseAgendaFilters({ territorio: sp.territorio });
  const [t, data] = await Promise.all([getTranslations("culture.page"), loadCulture({ territory: filters.territory, viewer: { party: "brand", ownerId: ctx.brand.id } })]);
  return (
    <div className="flex flex-col gap-5" data-testid="brand-culture-page">
      <PageHeader eyebrow={ctx.brand.name} title={t("title")} description={t("description")} />
      <AgendaTabs base="/marca/agenda" active="cultura" />
      <CultureView data={data} actions={{ portal: "brand", ownerId: ctx.brand.id, canAct: Boolean(ctx.role), canCampaign: Boolean(ctx.role && ctx.agency) }} filters={filters} />
    </div>
  );
}
