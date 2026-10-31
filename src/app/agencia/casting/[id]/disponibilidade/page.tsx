import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AvailabilityEditor } from "@/components/talent/AvailabilityEditor";
import { agencyCan } from "@/lib/agency/roles";
import { listAvailability } from "@/lib/deals/queries";
import { loadTalent } from "../_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("talentAvailability") };
}

type Props = { params: Promise<{ id: string }> };

// Períodos de disponibilidade comercial do talento (gestor+ edita; o talento com login também, pelo
// escritório). É o que a marca vê no catálogo.
export default async function TalentAvailabilityPage({ params }: Props) {
  const { id } = await params;
  const { ctx, talent } = await loadTalent(id);
  const [t, rows] = await Promise.all([getTranslations("talent.availability"), listAvailability(talent.id)]);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="talent-periods">
      <h2 id="talent-periods" className="text-base font-semibold text-fg">
        {t("periodsTitle")}
      </h2>
      <AvailabilityEditor portal="agency" talentId={talent.id} rows={rows} canEdit={agencyCan(ctx.role, "manager", ctx.platformAdmin) && !talent.archived} />
    </section>
  );
}
