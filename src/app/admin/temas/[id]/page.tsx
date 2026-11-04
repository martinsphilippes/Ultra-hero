import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ThemeEditor } from "@/components/seasonal-theme/ThemeEditor";
import { Badge, PageHeader } from "@/components/ui";
import { themeToForm } from "@/lib/seasonal-theme/form";
import { themePhase } from "@/lib/seasonal-theme/resolve";
import { loadAdminThemes } from "@/lib/seasonal-theme/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seasonalTheme.admin");
  return { title: t("edit") };
}

// Editar tema sazonal (admin, 0100): salvar, publicar/despublicar, ver no app (pré-visualização só do admin), excluir.
export default async function AdminThemeEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [t, data] = await Promise.all([getTranslations("seasonalTheme.admin"), loadAdminThemes(id)]);
  const theme = data.themes[0];
  if (!theme) notFound();
  const phase = themePhase(theme, new Date());
  return (
    <div className="flex flex-col gap-5" data-testid="admin-theme">
      <PageHeader
        title={theme.name}
        backHref="/admin/temas"
        backLabel={t("back")}
        actions={
          <Badge variant={phase === "active" ? "success" : phase === "scheduled" ? "info" : phase === "incomplete" ? "warning" : "neutral"}>{t(`phase.${phase}`)}</Badge>
        }
      />
      {theme.eventCancelled ? <p className="rounded-xl bg-danger-soft px-3 py-2 type-body-sm text-danger">{t("eventCancelledWarning")}</p> : null}
      <ThemeEditor initial={themeToForm(theme)} event={theme.event} status={theme.status} />
    </div>
  );
}
