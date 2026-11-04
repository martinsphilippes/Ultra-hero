import type { Metadata } from "next";
import { PenLine } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AgendaTabs } from "@/components/culture/AgendaTabs";
import { CultureView } from "@/components/culture/CultureView";
import { Button, PageHeader } from "@/components/ui";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { loadCulture } from "@/lib/culture/queries";
import { parseAgendaFilters } from "@/lib/platform-calendar/vocab";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("culture.page");
  return { title: t("title") };
}

type Props = { searchParams: Promise<{ territorio?: string }> };

// Real-Time Culture na agência (0101): gestor+ cria oportunidade de patrocínio direto do cartão e escreve notícias/dicas
// para a própria rede; o colaborador lê.
export default async function AgencyCulturePage({ searchParams }: Props) {
  const ctx = await requireAgency("staff");
  const sp = await searchParams;
  const filters = parseAgendaFilters({ territorio: sp.territorio });
  const isManager = agencyCan(ctx.role, "manager", ctx.platformAdmin);
  const [t, te, data] = await Promise.all([getTranslations("culture.page"), getTranslations("culture.editorial"), loadCulture({ territory: filters.territory, viewer: { party: null } })]);
  return (
    <div className="flex flex-col gap-5" data-testid="agency-culture-page">
      <PageHeader
        eyebrow={ctx.agency.name}
        title={t("title")}
        description={t("description")}
        actions={
          isManager ? (
            <Button asChild size="sm" variant="secondary" leadingIcon={<PenLine />}>
              <Link href="/agencia/agenda/conteudos">{te("title")}</Link>
            </Button>
          ) : undefined
        }
      />
      <AgendaTabs base="/agencia/agenda" active="cultura" />
      <CultureView data={data} actions={{ portal: "agency", canCreate: isManager }} filters={filters} />
    </div>
  );
}
