import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { BrandCallForm } from "@/components/brand-call/BrandCallForm";
import { PageHeader } from "@/components/ui";
import { CALL_TIMEZONE, callBrandControls } from "@/lib/brand-call/logic";
import { getBrandCall, listCallAgencyOptions } from "@/lib/brand-call/queries";
import { getBrandContext } from "@/lib/brand-portal/server";
import { centsToBrl } from "@/lib/money/brl-input";
import { EMPTY_PUBLIC } from "@/lib/sponsorship/negotiation";
import { localParts } from "@/lib/sponsorship/vocab";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brandCall.meta");
  return { title: t("edit") };
}

type Props = { params: Promise<{ id: string }> };

// Editar o rascunho da chamada (0089): só rascunho; a equipe não mexe enquanto espera o dono.
export default async function EditBrandCallPage({ params }: Props) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const { id } = await params;
  const [t, detail, agencies] = await Promise.all([getTranslations("brandCall.brand"), getBrandCall(id), listCallAgencyOptions(ctx.brand.id)]);
  if (!detail) notFound();
  const { call } = detail;
  if (!ctx.role || !callBrandControls({ status: call.status, approval: call.approval, decidedAt: call.decidedAt }, detail.role).edit) redirect(`/marca/oportunidades/chamadas/${id}`);
  const respond = call.respondBy ? localParts(call.respondBy, CALL_TIMEZONE) : { date: "", time: "18:00" };
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("editTitle")} backHref={`/marca/oportunidades/chamadas/${id}`} backLabel={call.title} />
      <BrandCallForm
        role={ctx.role}
        agencies={agencies}
        initial={{
          id: call.id,
          title: call.title,
          objective: call.objective ?? "",
          description: call.description,
          startsOn: call.startsOn,
          endsOn: call.endsOn,
          location: call.location,
          public: call.public ?? EMPTY_PUBLIC,
          deliverables: call.deliverables,
          creatorsWanted: call.creatorsWanted,
          nichesText: call.niches.join(", "),
          networks: call.networks,
          budgetText: centsToBrl(call.budgetCents),
          budgetDisplay: call.budgetDisplay,
          valueModel: call.valueModel,
          maxHeroes: call.maxHeroes,
          compensation: call.compensation,
          respondDate: respond.date,
          respondTime: respond.time,
          audience: call.audience,
          agencyIds: detail.targets.map((a) => a.id),
        }}
      />
    </div>
  );
}
