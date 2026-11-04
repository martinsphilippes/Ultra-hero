import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AgendaTabs } from "@/components/culture/AgendaTabs";
import { CultureView } from "@/components/culture/CultureView";
import { PageHeader } from "@/components/ui";
import { loadCulture } from "@/lib/culture/queries";
import { findHeroWorkspace } from "@/lib/hero-work/server";
import { parseAgendaFilters } from "@/lib/platform-calendar/vocab";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("culture.page");
  return { title: t("title") };
}

type Props = { searchParams: Promise<{ territorio?: string }> };

// Real-Time Culture no Portal do Herói (0101): aba "Cultura" da agenda. Só o titular de herói ativo manifesta interesse
// direto do cartão (a equipe lê); o resto abre o detalhe do evento na agenda.
export default async function HeroCulturePage({ searchParams }: Props) {
  const sp = await searchParams;
  const filters = parseAgendaFilters({ territorio: sp.territorio });
  const [t, ws] = await Promise.all([getTranslations("culture.page"), findHeroWorkspace()]);
  const data = await loadCulture({ territory: filters.territory, viewer: ws ? { party: "hero", ownerId: ws.hero.id } : { party: null } });
  const canAct = ws !== null && ws.hero.role === "owner" && ws.hero.status === "active";
  return (
    <div className="flex flex-col gap-5" data-testid="hero-culture-page">
      <PageHeader eyebrow={ws?.hero.name ?? undefined} title={t("title")} description={t("description")} />
      <AgendaTabs base="/heroi/agenda" active="cultura" />
      <CultureView data={data} actions={{ portal: "hero", ownerId: ws?.hero.id ?? null, canAct }} filters={filters} />
    </div>
  );
}
