import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/admin";
import { DemoNotice } from "@/components/commerce/DemoNotice";
import { SellerHeader, SellerStateNotice } from "@/components/commerce/seller/SellerHeader";
import { SellerProfileForm } from "@/components/commerce/seller/SellerProfileForm";
import { Avatar, Badge, PageHeader } from "@/components/ui";
import { getSellerContext } from "../_lib/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seller.profile");
  return { title: t("title") };
}

// Perfil da organização ativa: dados fixos (admin) + descrição/logotipo editáveis pelo fornecedor.
export default async function SellerProfilePage() {
  const [ctx, t, ts, tn] = await Promise.all([getSellerContext(), getTranslations("seller.profile"), getTranslations("adminCommon.status"), getTranslations("nav.seller")]);
  if (ctx.state !== "ok" || !ctx.org) return <SellerStateNotice state={ctx.state === "suspended" ? "suspended" : "not_linked"} />;
  const org = ctx.org;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} backHref="/seller" backLabel={tn("dashboard")} />
      <SellerHeader ctx={ctx} />
      {org.is_fictional ? <DemoNotice>{t("fictionalNote")}</DemoNotice> : null}

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr] lg:items-start">
        <section aria-labelledby="org-facts" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center gap-3">
            <Avatar src={org.logo_url} name={org.name} alt="" size="lg" />
            <h2 id="org-facts" className="type-h3 text-fg">
              {org.name}
            </h2>
          </div>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">{t("slug")}</dt>
              <dd className="font-medium text-fg">{org.slug}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">{t("kind")}</dt>
              <dd>
                <Badge variant="neutral">{t(`kinds.${org.kind}`)}</Badge>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-muted">{t("status")}</dt>
              <dd>
                <StatusBadge status={org.status} label={ts(org.status)} />
              </dd>
            </div>
          </dl>
        </section>
        <section aria-label={t("title")} className="rounded-2xl border border-border bg-surface p-5 md:p-6">
          <SellerProfileForm orgId={org.id} description={org.description ?? ""} logoUrl={org.logo_url} />
        </section>
      </div>
    </div>
  );
}
