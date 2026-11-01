import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Panel } from "@/components/admin-content";
import { CollectibleForm } from "@/components/collectibles/admin/CollectibleForm";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/ui/back-link";
import { getPostPhotoState } from "@/lib/post-photo/availability";
import { createClient } from "@/lib/supabase/server";

// Novo colecionável: nasce em rascunho; o lançamento (agora ou agendado) fica no detalhe.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("collectibles.admin");
  return { title: t("new") };
}

export default async function NewCollectiblePage() {
  const [t, supabase] = await Promise.all([getTranslations("collectibles.admin"), createClient()]);
  const [{ data: heroes }, photoState] = await Promise.all([supabase.from("creator_profiles").select("id, name").order("name"), getPostPhotoState()]);
  return (
    <div className="mx-auto flex w-full max-w-prose flex-col gap-6">
      <BackLink href="/admin/collectibles">{t("title")}</BackLink>
      <PageHeader title={t("new")} description={t("newDescription")} />
      <Panel title={t("form.panel")}>
        <CollectibleForm id={null} initial={null} heroes={heroes ?? []} locked={false} photoState={photoState} />
      </Panel>
    </div>
  );
}
