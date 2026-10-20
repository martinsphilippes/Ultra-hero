import { Building2, ShieldAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { SellerContext } from "@/app/seller/_lib/context";
import { DemoNotice } from "@/components/commerce/DemoNotice";
import { Avatar, Badge, Button, EmptyState } from "@/components/ui";
import { OrgSwitcher } from "./OrgSwitcher";

// Barra de contexto do portal: organização ativa, seletor (multi-org) e aviso de demonstração.
export async function SellerHeader({ ctx }: { ctx: SellerContext }) {
  const t = await getTranslations("seller.portal");
  if (!ctx.org) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar src={ctx.org.logo_url} name={ctx.org.name} alt="" size="sm" />
          <div className="flex min-w-0 flex-col">
            <p className="truncate text-sm font-semibold text-fg">{ctx.org.name}</p>
            <p className="flex items-center gap-1.5 type-caption text-fg-muted">
              <Building2 className="size-3.5" aria-hidden="true" />
              {ctx.org.slug}
              {ctx.org.is_fictional ? (
                <Badge variant="demo" size="sm">
                  {t("fictional")}
                </Badge>
              ) : null}
            </p>
          </div>
        </div>
        {ctx.orgs.length > 1 ? <OrgSwitcher orgs={ctx.orgs.map((o) => ({ id: o.id, name: o.name }))} activeId={ctx.org.id} /> : null}
      </div>
      {ctx.supervising ? (
        <DemoNotice tone="info">
          <span className="inline-flex items-start gap-2">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t("supervising", { name: ctx.org.name })}
          </span>
        </DemoNotice>
      ) : null}
    </div>
  );
}

// Estados sem operação: conta não vinculada ou organização suspensa/pendente.
export async function SellerStateNotice({ state }: { state: "not_linked" | "suspended" }) {
  const t = await getTranslations("seller.portal");
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <EmptyState
        icon={<Building2 />}
        title={state === "suspended" ? t("suspendedTitle") : t("notLinkedTitle")}
        description={state === "suspended" ? t("suspendedDescription") : t("notLinkedDescription")}
        action={
          <Button asChild variant="secondary">
            <Link href="/">{t("backToApp")}</Link>
          </Button>
        }
      />
    </div>
  );
}
