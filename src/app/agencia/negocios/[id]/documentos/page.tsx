import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DocumentsPanel } from "@/components/agency/DocumentsPanel";
import { createClient } from "@/lib/supabase/server";
import { loadDeal } from "../_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("dealDocuments") };
}

type Props = { params: Promise<{ id: string }> };

// Documentos do negócio (anexos do briefing, mídia, relatórios; contrato só o Adm). A marca envia
// anexos pelo portal dela; os marcados "visível ao talento" chegam ao escritório.
export default async function DealDocumentsPage({ params }: Props) {
  const { id } = await params;
  const { ctx, deal, canEdit, isAdmin } = await loadDeal(id);
  const t = await getTranslations("agency.casting");
  const supabase = await createClient();
  const { data } = await supabase.from("documents").select("id, title, kind, created_at, share_talent, restricted, uploader_side").eq("deal_id", deal.id).eq("status", "ready").order("created_at", { ascending: false });
  const documents = (data ?? []).map((d) => ({ id: d.id, title: d.title, kind: d.kind, createdAt: d.created_at, shareTalent: d.share_talent, restricted: d.restricted, uploaderSide: d.uploader_side }));
  return (
    <DocumentsPanel
      agencyId={ctx.agency.id}
      scope={{ type: "deal", id: deal.id }}
      documents={documents}
      canUpload={canEdit}
      canContract={isAdmin}
      lockedNote={ctx.agency.isDemo ? t("demoLockedDocuments") : null}
      revalidate={`/agencia/negocios/${deal.id}/documentos`}
    />
  );
}
