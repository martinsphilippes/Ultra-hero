import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/admin";
import { SellerStatusButton } from "@/components/admin-ops/StatusActions";
import { SellerHubTabs } from "@/components/admin-ops/SellerHubTabs";
import { DemoBadge, PageHeader } from "@/components/ui";
import { getAdminSellerOrg } from "./_lib/org";

type Props = { children: ReactNode; params: Promise<{ id: string }> };

// Organização no admin: cabeçalho (status auditado) + abas Visão geral, Produtos, Remessas e
// Organização. Tudo o que o fornecedor fazia no portal fica aqui (portal desligado, 0053).
export default async function SellerHubLayout({ children, params }: Props) {
  const { id } = await params;
  const org = await getAdminSellerOrg(id);
  if (!org) notFound();
  const [ts, tn, th] = await Promise.all([getTranslations("adminCommon.status"), getTranslations("nav"), getTranslations("adminOps.sellers.hub")]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {org.name}
            <DemoBadge />
          </span>
        }
        description={th("description")}
        eyebrow={tn("admin.sellers")}
        backHref="/admin/sellers"
        backLabel={tn("admin.sellers")}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StatusBadge status={org.status} label={ts(org.status)} size="md" />
            <SellerStatusButton id={org.id} status={org.status} />
          </div>
        }
      >
        <SellerHubTabs orgId={org.id} />
      </PageHeader>
      {children}
    </div>
  );
}
