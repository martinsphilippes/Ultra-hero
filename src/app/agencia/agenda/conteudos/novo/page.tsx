import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PostEditorPage } from "@/components/editorial/PostEditorPage";
import { requireAgency } from "@/lib/agency/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("culture.editorial");
  return { title: t("new") };
}

type Props = { searchParams: Promise<{ evento?: string }> };

export default async function NewPostPage({ searchParams }: Props) {
  await requireAgency("manager");
  const sp = await searchParams;
  return <PostEditorPage scope="agency" base="/agencia/agenda/conteudos" post={null} eventId={sp.evento && /^[0-9a-f-]{36}$/i.test(sp.evento) ? sp.evento : null} />;
}
