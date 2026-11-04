import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EditorialPlan } from "@/components/editorial/EditorialPlan";
import { requireAgency } from "@/lib/agency/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("culture.editorial");
  return { title: t("title") };
}

type Props = { searchParams: Promise<{ v?: string; semana?: string }> };

// Notícias e dicas da agenda (0101): planejamento editorial por data. Agência: gestor+ publica para a própria rede.
export default async function EditorialPage({ searchParams }: Props) {
  const ctx = await requireAgency("manager");
  const sp = await searchParams;
  return <EditorialPlan agencyId={ctx.agency.id} base="/agencia/agenda/conteudos" agendaHref="/agencia/agenda/cultura" sp={sp} />;
}
