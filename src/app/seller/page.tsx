import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Building2, Package, PackagePlus, Truck } from "lucide-react";
import { StatusBadge } from "@/components/admin";
import { DemoNotice } from "@/components/commerce/DemoNotice";
import { SellerHeader, SellerStateNotice } from "@/components/commerce/seller/SellerHeader";
import { Button, Card, CardBody, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { createClient } from "@/lib/supabase/server";
import { getSellerContext } from "./_lib/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: `${t("portals.seller")} · ${t("seller.dashboard")}` };
}

type ModerationRow = { id: string; action: "hide" | "suspend" | "clear"; reason: string | null; created_at: string; product: { id: string; title: string } | null };

// Painel do fornecedor: produtos por status, remessas pendentes e moderação recente (só da org ativa).
export default async function SellerHomePage() {
  const [ctx, t, tp, ts, locale] = await Promise.all([getSellerContext(), getTranslations("seller.dashboard"), getTranslations("seller.portal"), getTranslations("adminCommon.status"), getLocale()]);
  if (ctx.state !== "ok" || !ctx.org) return <SellerStateNotice state={ctx.state === "suspended" ? "suspended" : "not_linked"} />;

  const supabase = await createClient();
  const [{ data: products }, { data: fulfillments }, { data: moderationRaw }] = await Promise.all([
    supabase.from("products").select("status").eq("seller_org_id", ctx.org.id),
    supabase.from("test_fulfillments").select("status").eq("seller_org_id", ctx.org.id).in("status", ["awaiting", "preparing", "ready_for_dispatch"]),
    supabase.from("product_moderation").select("id, action, reason, created_at, product:products!inner(id, title, seller_org_id)").eq("product.seller_org_id", ctx.org.id).order("created_at", { ascending: false }).limit(5),
  ]);

  const byStatus = { draft: 0, published: 0, archived: 0 };
  for (const p of products ?? []) byStatus[p.status] += 1;
  const byFulfillment = { awaiting: 0, preparing: 0, ready_for_dispatch: 0 };
  for (const f of fulfillments ?? []) if (f.status in byFulfillment) byFulfillment[f.status as keyof typeof byFulfillment] += 1;
  const moderation = (moderationRaw ?? []) as unknown as ModerationRow[];

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

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="type-h3 flex items-center gap-2 text-fg">
              <Package className="size-5 text-accent-text" aria-hidden="true" />
              {t("productsTitle")}
            </h2>
            <dl className="mt-2 grid grid-cols-3 gap-3">
              {(["published", "draft", "archived"] as const).map((s) => (
                <div key={s} className="rounded-xl border border-border bg-surface-elevated p-3">
                  <dt className="type-caption text-fg-muted">{ts(s)}</dt>
                  <dd className="type-numeric text-2xl font-bold text-fg">{byStatus[s]}</dd>
                </div>
              ))}
            </dl>
            <Button asChild variant="link" className="mt-3 w-fit">
              <Link href="/seller/products">{t("manageProducts")}</Link>
            </Button>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="type-h3 flex items-center gap-2 text-fg">
              <Truck className="size-5 text-accent-text" aria-hidden="true" />
              {t("fulfillmentsTitle")}
            </h2>
            <dl className="mt-2 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border bg-surface-elevated p-3">
                <dt className="type-caption text-fg-muted">{t("awaiting")}</dt>
                <dd className="type-numeric text-2xl font-bold text-fg">{byFulfillment.awaiting}</dd>
              </div>
              <div className="rounded-xl border border-border bg-surface-elevated p-3">
                <dt className="type-caption text-fg-muted">{t("preparing")}</dt>
                <dd className="type-numeric text-2xl font-bold text-fg">{byFulfillment.preparing}</dd>
              </div>
              <div className="rounded-xl border border-border bg-surface-elevated p-3">
                <dt className="type-caption text-fg-muted">{t("readyForDispatch")}</dt>
                <dd className="type-numeric text-2xl font-bold text-fg">{byFulfillment.ready_for_dispatch}</dd>
              </div>
            </dl>
            <Button asChild variant="link" className="mt-3 w-fit">
              <Link href="/seller/fulfillments">{t("manageFulfillments")}</Link>
            </Button>
          </CardBody>
        </Card>
      </div>

      <section aria-labelledby="seller-moderation" className="flex flex-col gap-3">
        <h2 id="seller-moderation" className="type-h2 text-fg">
          {t("moderationTitle")}
        </h2>
        {moderation.length === 0 ? (
          <p className="type-body-sm rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-fg-muted">{t("moderationEmpty")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {moderation.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <StatusBadge status={m.action === "hide" ? "hidden" : m.action === "suspend" ? "suspended" : "clear"} label={t(`moderationAction.${m.action}`)} />
                <div className="min-w-0 flex-1">
                  {m.product ? (
                    <Link href={`/seller/products/${m.product.id}/edit`} className="text-sm font-medium text-fg underline-offset-4 hover:underline">
                      {m.product.title}
                    </Link>
                  ) : null}
                  {m.reason ? <p className="type-caption text-fg-muted">{m.reason}</p> : null}
                </div>
                <time dateTime={m.created_at} className="type-caption text-fg-muted">
                  {formatDateTime(m.created_at, locale as Locale)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="seller-shortcuts" className="flex flex-col gap-3">
        <h2 id="seller-shortcuts" className="type-h2 text-fg">
          {t("quickLinks")}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" leadingIcon={<Package />}>
            <Link href="/seller/products">{t("manageProducts")}</Link>
          </Button>
          <Button asChild variant="secondary" leadingIcon={<Truck />}>
            <Link href="/seller/fulfillments">{t("manageFulfillments")}</Link>
          </Button>
          <Button asChild variant="secondary" leadingIcon={<Building2 />}>
            <Link href="/seller/profile">{t("editProfile")}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
