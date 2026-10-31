import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DocumentsPanel } from "@/components/agency/DocumentsPanel";
import { agencyCan } from "@/lib/agency/roles";
import { listTalentDocuments } from "@/lib/talent/queries";
import { loadTalent } from "../_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("talentDocuments") };
}

type Props = { params: Promise<{ id: string }> };

// Documentos do talento (termo assinado, mídia, relatórios). Contrato e restritos: só o Adm vê e envia.
export default async function TalentDocumentsPage({ params }: Props) {
  const { id } = await params;
  const { ctx, talent } = await loadTalent(id);
  const [t, documents] = await Promise.all([getTranslations("agency.casting"), listTalentDocuments(talent.id)]);
  const canUpload = agencyCan(ctx.role, "manager", ctx.platformAdmin) && !talent.archived;
  return (
    <DocumentsPanel
      agencyId={ctx.agency.id}
      scope={{ type: "talent", id: talent.id }}
      documents={documents}
      canUpload={canUpload}
      canContract={agencyCan(ctx.role, "admin", ctx.platformAdmin)}
      lockedNote={ctx.agency.isDemo ? t("demoLockedDocuments") : null}
      revalidate={`/agencia/casting/${talent.id}/documentos`}
    />
  );
}
