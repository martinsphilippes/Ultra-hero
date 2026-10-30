import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { CreatorUnavailable } from "@/components/creator/CreatorUnavailable";
import { getManagedCreator } from "../_lib/creator";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: `${t("portals.creator")} · ${t("creator.content")}` };
}

const STATUS = ["draft", "published", "archived"] as const;
const REVIEW = ["none", "in_review", "returned", "approved", "rejected"] as const;
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const pick = <T extends string>(value: unknown, allowed: readonly T[]): T | null =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;

// Conteúdos do herói: só o admin gerencia, no módulo de conteúdo do admin já filtrado pelo herói
// escolhido (mesmos filtros de status/revisão do painel). O herói comum volta ao Perfil.
export default async function CreatorContentPage({ searchParams }: Props) {
  const ctx = await getManagedCreator("content");
  if (!ctx.creatorId) {
    const tn = await getTranslations("nav");
    return <CreatorUnavailable reason={ctx.reason === "ok" ? "unlinked" : ctx.reason} title={tn("creator.content")} />;
  }
  const params = await searchParams;
  const query = new URLSearchParams({ creator: ctx.creatorId });
  const status = pick(params.status, STATUS);
  const review = pick(params.review, REVIEW);
  if (status) query.set("status", status);
  if (review) query.set("review", review);
  redirect(`/admin/content?${query.toString()}`);
}
