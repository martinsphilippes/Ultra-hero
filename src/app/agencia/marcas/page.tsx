import type { Metadata } from "next";
import { BadgeCheck, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { FilterAnchor } from "@/components/admin-ops/FilterAnchor";
import { Badge, Button, EmptyState, PageHeader } from "@/components/ui";
import { listAgencyBrands } from "@/lib/agency/queries";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("brands") };
}

type Props = { searchParams: Promise<{ status?: string }> };

// Marcas atendidas pela agência (ativas ou arquivadas). Gestor+ cria e vincula; todos consultam.
export default async function AgencyBrandsPage({ searchParams }: Props) {
  const ctx = await requireAgency("staff");
  const archived = (await searchParams).status === "arquivadas";
  const [t, brands] = await Promise.all([getTranslations("agency.brands"), listAgencyBrands(ctx.agency.id, archived ? "archived" : "active")]);
  const canEdit = agencyCan(ctx.role, "manager", ctx.platformAdmin);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          canEdit ? (
            <Button asChild size="sm" leadingIcon={<Plus />}>
              <Link href="/agencia/marcas/nova">{t("new")}</Link>
            </Button>
          ) : null
        }
      />
      <nav aria-label={t("filterLabel")} className="flex flex-wrap gap-2">
        <FilterAnchor href="/agencia/marcas" active={!archived} label={t("filterActive")} />
        <FilterAnchor href="/agencia/marcas?status=arquivadas" active={archived} label={t("filterArchived")} />
      </nav>
      {brands.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="agency-brands">
          {brands.map((b) => (
            <li key={b.linkId}>
              <Link
                href={`/agencia/marcas/${b.brand.id}`}
                className="flex min-h-20 items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-white">
                  {b.brand.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.brand.logoUrl} alt="" className="max-h-8 max-w-9 object-contain" />
                  ) : (
                    <BadgeCheck className="size-5 text-fg-subtle" aria-hidden="true" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-sm font-semibold text-fg">{b.brand.name}</span>
                  <span className="flex flex-wrap gap-1.5">
                    <Badge variant={b.brand.status === "active" ? "success" : "neutral"} size="sm">
                      {b.brand.status === "active" ? t("publicOn") : t("publicOff")}
                    </Badge>
                    {b.isDemo ? (
                      <Badge variant="demo" size="sm">
                        {t("demoTag")}
                      </Badge>
                    ) : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            icon={<BadgeCheck />}
            title={archived ? t("emptyArchived") : t("empty")}
            description={canEdit && !archived ? t("emptyHint") : undefined}
            action={
              canEdit && !archived ? (
                <Button asChild leadingIcon={<Plus />}>
                  <Link href="/agencia/marcas/nova">{t("new")}</Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
