import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AvailabilityEditor } from "@/components/talent/AvailabilityEditor";
import { Badge } from "@/components/ui";
import { listAvailability } from "@/lib/deals/queries";
import { getTalentContext } from "@/lib/talent/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("talent.meta");
  return { title: t("availability") };
}

// Disponibilidade comercial do creator: situação geral (a agência ajusta com ele) + períodos que ele
// mesmo declara. É só isso que a marca vê; a agenda pessoal fica fora.
export default async function AvailabilityPage() {
  const ctx = await getTalentContext();
  if (ctx.state !== "ok") return null;
  const [t, th, rows] = await Promise.all([getTranslations("talent.availability"), getTranslations("talent.home"), listAvailability(ctx.talent.id)]);
  return (
    <div className="flex flex-col gap-5" data-testid="office-availability">
      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-fg">{th("availabilityTitle")}</h2>
        <p className="flex flex-wrap items-center gap-2 text-sm text-fg">
          <Badge size="sm" variant={ctx.talent.availability === "available" ? "success" : ctx.talent.availability === "limited" ? "warning" : "neutral"}>
            {th(`availability.${ctx.talent.availability}`)}
          </Badge>
          {ctx.talent.availabilityNote ? <span className="text-fg-muted">{ctx.talent.availabilityNote}</span> : null}
        </p>
        <p className="type-caption text-fg-muted">{th("availabilityHint")}</p>
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="office-periods">
        <h2 id="office-periods" className="text-sm font-semibold text-fg">
          {t("periodsTitle")}
        </h2>
        <AvailabilityEditor portal="office" talentId={ctx.talent.id} rows={rows} canEdit />
      </section>
    </div>
  );
}
