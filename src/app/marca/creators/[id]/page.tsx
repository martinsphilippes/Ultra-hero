import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TalentCardFull } from "@/components/brand-portal/TalentCardView";
import { AddToShortlist } from "@/components/selection/AddToShortlist";
import { TalentHistoryPanel } from "@/components/selection/TalentHistoryPanel";
import { Avatar, Button, PageHeader } from "@/components/ui";
import { getBrandContext } from "@/lib/brand-portal/server";
import { getTalentForBrand } from "@/lib/deals/queries";
import { getTalentHistory, listShortlists } from "@/lib/selection/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brandPortal.meta");
  return { title: t("creator") };
}

type Props = { params: Promise<{ id: string }> };

// Detalhe do creator para a marca: cartão autorizado + disponibilidade comercial + "Fazer proposta". 0081:
// "Adicionar à pré-seleção" (listas em montagem) e o histórico com a marca (campanhas e avaliações).
export default async function BrandCreatorPage({ params }: Props) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const { id } = await params;
  const [t, card, history, lists] = await Promise.all([
    getTranslations("brandPortal.creators"),
    getTalentForBrand(ctx.brand.id, id),
    getTalentHistory(ctx.brand.id, id),
    ctx.role ? listShortlists(ctx.brand.id) : Promise.resolve({ available: false, items: [] }),
  ]);
  if (!card) notFound();
  const draftLists = lists.items.filter((l) => l.status === "draft").map((l) => ({ id: l.id, title: l.title }));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar src={card.photoUrl ?? null} name={card.name} size="lg" alt="" />
            <span className="min-w-0">{card.name}</span>
          </span>
        }
        backHref="/marca/creators"
        backLabel={t("title")}
        actions={
          ctx.role ? (
            <span className="flex flex-wrap gap-2">
              {lists.available && ctx.agency ? <AddToShortlist talentId={card.id} talentName={card.name} lists={draftLists} /> : null}
              <Button asChild size="sm" leadingIcon={<Megaphone />}>
                <Link href={`/marca/campanhas/nova?creator=${card.id}`} data-testid="propose-to-creator">
                  {t("propose")}
                </Link>
              </Button>
            </span>
          ) : null
        }
      />
      <TalentCardFull card={card} />
      {history ? <TalentHistoryPanel history={history} /> : null}
    </div>
  );
}
