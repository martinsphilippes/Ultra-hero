import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PackagePlus } from "lucide-react";
import { DemoNotice } from "@/components/commerce/DemoNotice";
import { SellerHeader, SellerStateNotice } from "@/components/commerce/seller/SellerHeader";
import { SellerOverview } from "@/components/commerce/seller/views/SellerOverview";
import { Button, PageHeader } from "@/components/ui";
import { getSellerContext } from "./_lib/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: `${t("portals.seller")} · ${t("seller.dashboard")}` };
}

// Painel do fornecedor: produtos por status, remessas pendentes e moderação recente (só da org ativa).
// Portal desligado por enquanto (SELLER_PORTAL_ENABLED); a mesma visão vive na organização no admin.
export default async function SellerHomePage() {
  const [ctx, t, tp] = await Promise.all([getSellerContext(), getTranslations("seller.dashboard"), getTranslations("seller.portal")]);
  if (ctx.state !== "ok" || !ctx.org) return <SellerStateNotice state={ctx.state === "suspended" ? "suspended" : "not_linked"} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description", { name: ctx.org.name })}
        eyebrow={tp("orgLabel")}
        actions={
          <Button asChild size="sm" leadingIcon={<PackagePlus />}>
            <Link href="/seller/products/new">{t("newProduct")}</Link>
          </Button>
        }
      />
      <SellerHeader ctx={ctx} />
      <DemoNotice>{tp("demoNote")}</DemoNotice>
      <SellerOverview
        orgId={ctx.org.id}
        links={{ products: "/seller/products", fulfillments: "/seller/fulfillments", profile: "/seller/profile", productEdit: (id) => `/seller/products/${id}/edit` }}
      />
    </div>
  );
}
