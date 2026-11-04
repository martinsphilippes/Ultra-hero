import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EditorialPlan } from "@/components/editorial/EditorialPlan";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("culture.editorial");
  return { title: t("title") };
}

type Props = { searchParams: Promise<{ v?: string; semana?: string }> };

// Notícias e dicas da agenda (0101): planejamento editorial por data. Groscove: o admin publica para todos.
export default async function EditorialPage({ searchParams }: Props) {
  const sp = await searchParams;
  return <EditorialPlan agencyId={null} base="/admin/agenda/conteudos" agendaHref="/admin/agenda/cultura" sp={sp} />;
}
