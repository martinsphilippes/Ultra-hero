import type { Metadata } from "next";
import { PenLine } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AgendaTabs } from "@/components/culture/AgendaTabs";
import { CultureView } from "@/components/culture/CultureView";
import { Button, PageHeader } from "@/components/ui";
import { loadCulture } from "@/lib/culture/queries";
import { parseAgendaFilters } from "@/lib/platform-calendar/vocab";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("culture.page");
  return { title: t("title") };
}

type Props = { searchParams: Promise<{ territorio?: string }> };

// Real-Time Culture no admin (0101): como os portais veem (só o que está no ar), com atalho para editar o evento e para
// o planejamento editorial da Groscove.
export default async function AdminCulturePage({ searchParams }: Props) {
  const sp = await searchParams;
  const filters = parseAgendaFilters({ territorio: sp.territorio });
  const [t, te, data] = await Promise.all([getTranslations("culture.page"), getTranslations("culture.editorial"), loadCulture({ territory: filters.territory, viewer: { party: null } })]);
  return (
    <div className="flex flex-col gap-5" data-testid="admin-culture-page">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild size="sm" variant="secondary" leadingIcon={<PenLine />}>
            <Link href="/admin/agenda/conteudos">{te("title")}</Link>
          </Button>
        }
      />
      <AgendaTabs base="/admin/agenda" active="cultura" />
      <CultureView data={data} actions={{ portal: "admin" }} filters={filters} />
    </div>
  );
}
