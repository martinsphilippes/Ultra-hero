import type { Metadata } from "next";
import { BadgeCheck, Plus } from "lucide-react";
import { brandSearchKey } from "@/lib/brand-universe/search";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { FilterAnchor } from "@/components/admin-ops/FilterAnchor";
import { AgencyInviteDialog } from "@/components/invites/AgencyInviteDialog";
import { Badge, Button, EmptyState, PageHeader } from "@/components/ui";
import { listAgencyBrands } from "@/lib/agency/queries";
import { BrandApprovalDecision } from "@/components/casting-open/BrandApprovalDecision";
import { createClient } from "@/lib/supabase/server";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { InvitesGate } from "@/components/invites/InvitesGate";
import { BrandLogo } from "@/components/brand-universe/BrandLogo";
import { BrandLoginInbox, type BrandLoginRequest } from "@/components/brand-universe/BrandLoginInbox";
import { Search } from "lucide-react";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("brands") };
}

type Props = { searchParams: Promise<{ status?: string; cat?: string; q?: string }> };

// Marcas atendidas pela agência (ativas ou arquivadas). Gestor+ cria e vincula; todos consultam.
export default async function AgencyBrandsPage({ searchParams }: Props) {
  const ctx = await requireAgency("staff");
  const sp = await searchParams;
  const archived = sp.status === "arquivadas";
  const cat = typeof sp.cat === "string" && /^[a-z0-9-]{2,40}$/.test(sp.cat) ? sp.cat : "";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 60) : "";
  const [t, tf, tu, all, supabase] = await Promise.all([
    getTranslations("agency.brands"),
    getTranslations("agency.brands.form"),
    getTranslations("brandUniverse"),
    listAgencyBrands(ctx.agency.id, archived ? "archived" : "active"),
    createClient(),
  ]);
  // 0129: categorias (só as que têm marca) + busca pelo nome
  const { data: catRows } = await supabase.from("brand_categories").select("slug, name").order("sort_order");
  const catName = new Map((catRows ?? []).map((c) => [c.slug, c.name]));
  const used = new Set(all.map((b) => b.brand.category).filter(Boolean));
  const cats = (catRows ?? []).filter((c) => used.has(c.slug));
  const key = brandSearchKey(q);
  const brands = all.filter((b) => (!cat || b.brand.category === cat) && (!key || brandSearchKey(b.brand.name).includes(key)));
  const filterHref = (next: { cat?: string }) => {
    const p = new URLSearchParams();
    if (archived) p.set("status", "arquivadas");
    if (next.cat) p.set("cat", next.cat);
    if (q) p.set("q", q);
    const qs = p.toString();
    return qs ? `/agencia/marcas?${qs}` : "/agencia/marcas";
  };
  // 0126: a Groscove (Adm) aprova as marcas novas cadastradas pelas agências
  const { data: groscoveAdmin } = await supabase.rpc("is_groscove_admin");
  const queue = groscoveAdmin
    ? ((await supabase.rpc("brand_approval_pending")).data as Array<{ id: string; name: string; site_url: string; intent: string | null; evidence_url: string | null; agency: string | null; requested_by: string | null }> | null) ?? []
    : [];
  const canEdit = agencyCan(ctx.role, "manager", ctx.platformAdmin);
  // 0129: pedidos de login das marcas (a Groscove vê; gestor+ decide)
  const groscove = ctx.platformAdmin || ctx.agency.slug === "groscove";
  const logins = groscove ? (((await supabase.rpc("brand_login_inbox")).data as BrandLoginRequest[] | null) ?? []) : [];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          canEdit ? (
            <div className="flex flex-wrap gap-2">
              {/* 0091: marca nova (passo a passo do dono) ou pedido de vínculo para o dono de marca existente */}
              {ctx.agency.isDemo ? null : (
                <InvitesGate>
                  <AgencyInviteDialog mode="brand" />
                </InvitesGate>
              )}
              <Button asChild size="sm" leadingIcon={<Plus />}>
                <Link href="/agencia/marcas/nova">{t("new")}</Link>
              </Button>
            </div>
          ) : null
        }
      />
      {groscoveAdmin ? (
        <section id="aprovacao" className="flex scroll-mt-20 flex-col gap-3" data-testid="brand-approval-queue">
          <h2 className="type-h3 text-fg">{tf("queueTitle", { count: queue.length })}</h2>
          <p className="type-body-sm text-fg-muted">{tf("queueHint")}</p>
          {queue.length === 0 ? <p className="type-body-sm text-fg-muted">{tf("queueEmpty")}</p> : null}
          <ul className="grid gap-3 sm:grid-cols-2">
            {queue.map((b) => (
              <li key={b.id} className="flex flex-col gap-3 rounded-2xl border-2 border-accent bg-surface p-4">
                <div className="flex flex-col gap-1">
                  <p className="font-semibold text-fg">{b.name}</p>
                  <a href={b.site_url} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-accent-text underline">
                    {b.site_url}
                  </a>
                  {b.intent ? <p className="text-sm text-fg">{b.intent}</p> : null}
                  {b.evidence_url ? (
                    <a href={b.evidence_url} target="_blank" rel="noopener noreferrer" className="w-fit text-sm font-semibold text-accent-text underline">
                      {tf("queueEvidence")}
                    </a>
                  ) : null}
                  <p className="type-caption text-fg-muted">{tf("queueBy", { name: b.requested_by ?? "—", agency: b.agency ?? "—" })}</p>
                </div>
                <BrandApprovalDecision brandId={b.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {groscove ? <BrandLoginInbox items={logins} canDecide={canEdit} /> : null}
      <nav aria-label={t("filterLabel")} className="flex flex-wrap gap-2">
        <FilterAnchor href="/agencia/marcas" active={!archived} label={t("filterActive")} />
        <FilterAnchor href="/agencia/marcas?status=arquivadas" active={archived} label={t("filterArchived")} />
      </nav>
      {all.length > 8 ? (
        <div className="flex flex-col gap-3">
          <form action="/agencia/marcas" method="get" role="search" className="flex gap-2">
            {archived ? <input type="hidden" name="status" value="arquivadas" /> : null}
            {cat ? <input type="hidden" name="cat" value={cat} /> : null}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
              <input
                name="q"
                defaultValue={q}
                aria-label={tu("filters.search")}
                placeholder={tu("filters.search")}
                className="min-h-11 w-full rounded-xl border border-border-strong bg-surface pl-9 pr-3 text-base text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                data-testid="brand-search"
              />
            </div>
            <Button type="submit" variant="secondary">
              {tu("filters.searchButton")}
            </Button>
          </form>
          {cats.length > 0 ? (
            <nav aria-label={tu("filters.label")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" data-testid="brand-categories">
              <FilterAnchor href={filterHref({})} active={!cat} label={tu("filters.all")} />
              {cats.map((c) => (
                <FilterAnchor key={c.slug} href={filterHref({ cat: c.slug })} active={cat === c.slug} label={c.name} />
              ))}
            </nav>
          ) : null}
          <p className="type-caption text-fg-muted" aria-live="polite">
            {tu("filters.results", { count: brands.length })}
            {q || cat ? (
              <>
                {" · "}
                <a href={archived ? "/agencia/marcas?status=arquivadas" : "/agencia/marcas"} className="font-semibold text-accent-text underline">
                  {tu("filters.clear")}
                </a>
              </>
            ) : null}
          </p>
        </div>
      ) : null}
      {all.length > 0 && brands.length === 0 ? (
        <p className="type-body-sm text-fg-muted">{tu("filters.results", { count: 0 })}</p>
      ) : brands.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="agency-brands">
          {brands.map((b) => (
            <li key={b.linkId}>
              <Link
                href={`/agencia/marcas/${b.brand.id}`}
                className="flex min-h-20 items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <BrandLogo name={b.brand.name} url={b.brand.logoUrl} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-sm font-semibold text-fg">{b.brand.name}</span>
                  {b.brand.category ? <span className="truncate type-caption text-fg-muted">{catName.get(b.brand.category) ?? ""}</span> : null}
                  <span className="flex flex-wrap gap-1.5">
                    <Badge variant={b.brand.status === "active" ? "success" : "neutral"} size="sm">
                      {b.brand.status === "active" ? t("publicOn") : t("publicOff")}
                    </Badge>
                    {b.brand.approval === "pending" ? (
                      <Badge variant="warning" size="sm">
                        {tf("pendingBadge")}
                      </Badge>
                    ) : b.brand.approval === "rejected" ? (
                      <Badge variant="danger" size="sm">
                        {tf("rejectedBadge")}
                      </Badge>
                    ) : null}
                    {b.isDemo ? (
                      <Badge variant="neutral" size="sm">
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
