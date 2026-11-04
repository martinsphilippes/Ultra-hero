import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ClientProjectCard } from "@/components/roadmap/ClientProjectCard";
import { EmptyState } from "@/components/ui";
import { getClientProjects } from "@/lib/roadmap/queries";
import { getTalentContext } from "@/lib/talent/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("roadmap.hero");
  return { title: t("title") };
}

// Projetos em que o herói é cliente da agência (0107: assessoria, mentoria, business plan, vídeo…): andamento em dias
// úteis e as etapas visíveis ao cliente (as internas da agência não aparecem).
export default async function HeroProjectsPage() {
  const ctx = await getTalentContext();
  if (ctx.state !== "ok") return null;
  const [t, list] = await Promise.all([getTranslations("roadmap.hero"), getClientProjects()]);
  if (!list.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<ListChecks />} title={t("unavailable")} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4" data-testid="hero-projects">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-fg">{t("title")}</h2>
        <p className="type-body-sm text-fg-muted">{t("description")}</p>
      </div>
      {list.items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<ListChecks />} title={t("empty")} />
        </div>
      ) : (
        list.items.map((p) => <ClientProjectCard key={p.dealId} project={p} />)
      )}
    </div>
  );
}
