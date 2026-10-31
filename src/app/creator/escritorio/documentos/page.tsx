import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DocumentsPanel } from "@/components/agency/DocumentsPanel";
import { createClient } from "@/lib/supabase/server";
import { getTalentContext } from "@/lib/talent/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("talent.meta");
  return { title: t("documents") };
}

// Documentos compartilhados com o creator (briefings, roteiros aprovados, comprovantes): só leitura; a RLS
// entrega apenas o que a agência marcou como visível ao talento.
export default async function OfficeDocumentsPage() {
  const ctx = await getTalentContext();
  if (ctx.state !== "ok") return null;
  const t = await getTranslations("talent.documents");
  const supabase = await createClient();
  const { data } = await supabase.from("documents").select("id, agency_id, title, kind, created_at, share_talent, restricted, uploader_side").eq("status", "ready").order("created_at", { ascending: false }).limit(100);
  const documents = (data ?? []).map((d) => ({ id: d.id, title: d.title, kind: d.kind, createdAt: d.created_at, shareTalent: d.share_talent, restricted: d.restricted, uploaderSide: d.uploader_side }));
  // painel só de leitura: a agência do escopo só serve para enviar, o que o creator não faz aqui
  const agencyId = data?.[0]?.agency_id ?? "";
  return (
    <div className="flex flex-col gap-4" data-testid="office-documents">
      <p className="type-body-sm text-fg-muted">{t("intro")}</p>
      <DocumentsPanel agencyId={agencyId} scope={{ type: "talent", id: ctx.talent.id }} documents={documents} canUpload={false} canContract={false} revalidate="/creator/escritorio/documentos" />
    </div>
  );
}
