import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { IdeaForm } from "@/components/strategy/IdeaForm";
import { PageHeader } from "@/components/ui";
import { requireAgency } from "@/lib/agency/server";
import { strategyAiStatus } from "@/lib/strategy/ai";
import { strategyFormOptions } from "@/lib/strategy/queries";
import { monthKey } from "@/lib/strategy/vocab";
import { localDay } from "@/lib/today/logic";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("strategy");
  return { title: t("new") };
}

type Props = { searchParams: Promise<{ mes?: string }> };

export default async function NewStrategyPage({ searchParams }: Props) {
  const [ctx, sp] = await Promise.all([requireAgency(), searchParams]);
  const today = localDay(new Date(), ctx.agency.timezone || "America/Sao_Paulo");
  const month = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? `${sp.mes}-01` : monthKey(today);
  const [t, opts] = await Promise.all([getTranslations("strategy"), strategyFormOptions(ctx.agency.id, today)]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("new")} description={t("newHint")} backHref={`/agencia/estrategias?mes=${month.slice(0, 7)}`} backLabel={t("title")} />
      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <IdeaForm
          initial={{ id: "", month, brandId: "", brandLabel: "", segmentId: "", talentId: "", calendarEventId: "", ideaOn: "", title: "", body: "" }}
          brands={opts.brands}
          segments={opts.segments}
          talents={opts.talents}
          events={opts.events}
          aiStatus={strategyAiStatus()}
        />
      </section>
    </div>
  );
}
