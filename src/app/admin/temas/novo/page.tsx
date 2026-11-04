import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ThemeEditor } from "@/components/seasonal-theme/ThemeEditor";
import { PageHeader } from "@/components/ui";
import { zonedDayKey } from "@/lib/calendar/grid";
import { DEFAULT_THEME_TZ, newThemeForm } from "@/lib/seasonal-theme/form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seasonalTheme.admin");
  return { title: t("new") };
}

// Novo tema sazonal (admin, 0100): nasce rascunho (invisível para todos até publicar).
export default async function AdminThemeNewPage() {
  const t = await getTranslations("seasonalTheme.admin");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("new")} backHref="/admin/temas" backLabel={t("back")} />
      <ThemeEditor initial={newThemeForm(zonedDayKey(new Date(), DEFAULT_THEME_TZ))} event={null} status={null} />
    </div>
  );
}
