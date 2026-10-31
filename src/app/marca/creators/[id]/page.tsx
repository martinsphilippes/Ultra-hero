import type { Metadata } from "next";
import { Megaphone } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TalentCardFull } from "@/components/brand-portal/TalentCardView";
import { Avatar, Button, PageHeader } from "@/components/ui";
import { getBrandContext } from "@/lib/brand-portal/server";
import { getTalentForBrand } from "@/lib/deals/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brandPortal.meta");
  return { title: t("creator") };
}

type Props = { params: Promise<{ id: string }> };

// Detalhe do creator para a marca: cartão autorizado + disponibilidade comercial + "Fazer proposta".
export default async function BrandCreatorPage({ params }: Props) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const { id } = await params;
  const [t, card] = await Promise.all([getTranslations("brandPortal.creators"), getTalentForBrand(ctx.brand.id, id)]);
  if (!card) notFound();
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
            <Button asChild size="sm" leadingIcon={<Megaphone />}>
              <Link href={`/marca/campanhas/nova?creator=${card.id}`} data-testid="propose-to-creator">
                {t("propose")}
              </Link>
            </Button>
          ) : null
        }
      />
      <TalentCardFull card={card} />
    </div>
  );
}
