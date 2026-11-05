import { ScrollText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/ui";
import { getClipping } from "@/lib/project-room/queries";
import { isUuid } from "@/lib/project-room/vocab";
import { ClippingView } from "./ClippingView";

// Clipping para o cliente (marca e Hero-cliente; 0110): o mesmo da agência, sem o atalho de negócio novo.
export async function ClippingPage({ dealId, backHref }: { dealId: string; backHref: string }) {
  if (!isUuid(dealId)) notFound();
  const [t, clip] = await Promise.all([getTranslations("projectRoom.clipping"), getClipping(dealId)]);
  if (!clip.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<ScrollText />} title={t("unavailable")} />
      </div>
    );
  }
  if (!clip.data) notFound();
  return (
    <div className="flex flex-col gap-5">
      <div className="print:hidden">
        <PageHeader title={t("title")} backHref={backHref} backLabel={t("back")} />
      </div>
      <ClippingView clip={clip.data} />
    </div>
  );
}
