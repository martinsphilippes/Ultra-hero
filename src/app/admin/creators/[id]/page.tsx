import { Mail, Package } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { CreatorBrandsSection } from "@/components/admin-brands/AdminBrandSections";
import { CreatorForm } from "@/components/admin-ops/CreatorForm";
import { CreatorProductActions } from "@/components/admin-ops/CreatorProductActions";
import { ReferenceMetricsEditor } from "@/components/admin-ops/ReferenceMetricsEditor";
import { CreatorCoverRemoveButton, CreatorPhotoRemoveButton, CreatorStatusButton } from "@/components/admin-ops/StatusActions";
import { HeroCategoriesField } from "@/components/admin-content/HeroCategoriesField";
import { LibraryTabsEditor } from "@/components/admin-content/LibraryTabsEditor";
import { Badge, Button, PageHeader } from "@/components/ui";
import { isStoredAvatarUrl, supabaseBaseUrl } from "@/lib/avatar/paths";
import { isStoredCoverUrl } from "@/lib/hero-cover/paths";
import { localizedLabel } from "@/lib/catalog/queries";
import { toCategoryTabRow, toOverrideRow } from "@/lib/heroes/library-tab-queries";
import { primaryCategoryId, resolveLibraryConfig, toEditorRows, type LibraryTabEditorRow } from "@/lib/heroes/library-tabs";
import { loadFollowerCount, loadReferences } from "@/lib/heroes/follow-queries";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ id: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProductRow = { id: string; title: string; slug: string; seller: { name: string } | null };
type AllocationRow = { product_id: string; status: string; sort_order: number };
type HeroProductRow = ProductRow & { allocation: string | null };
const ALLOCATION_STATUSES = ["validated", "suspended", "rejected", "suggested"] as const;
type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];
const allocationKey = (status: string | null): AllocationStatus | "none" => (ALLOCATION_STATUSES as readonly string[]).includes(status ?? "") ? (status as AllocationStatus) : "none";

type Client = Awaited<ReturnType<typeof createClient>>;

// Atalhos do herói (0050): configuração herdada da categoria principal ativa + exceção do herói.
// null = 0050 ausente no banco (a seção avisa).
async function loadHeroTabs(
  supabase: Client,
  creatorId: string,
  categories: { id: string; name: unknown; is_active: boolean }[],
  links: { category_id: string; position: number }[],
  locale: string,
): Promise<{ rows: LibraryTabEditorRow[]; inheritedFrom: string | null } | null> {
  const active = new Map(categories.filter((c) => c.is_active).map((c) => [c.id, c]));
  const categoryId = primaryCategoryId(links.filter((l) => active.has(l.category_id)).map((l) => ({ categoryId: l.category_id, position: l.position })));
  const [defaults, tabsRes, overridesRes] = await Promise.all([
    getTranslations({ locale: "pt-BR", namespace: "discover.personalities.libraries.labels" }),
    categoryId
      ? supabase.from("hero_library_tabs").select("source_key, label, icon, sort_order, is_visible").eq("category_id", categoryId)
      : supabase.from("hero_library_tabs").select("source_key").limit(0),
    supabase.from("creator_library_overrides").select("source_key, label, icon, sort_order, is_visible").eq("creator_id", creatorId),
  ]);
  if (tabsRes.error || overridesRes.error) return null;
  const categoryRows = categoryId ? ((tabsRes.data ?? []) as Parameters<typeof toCategoryTabRow>[1][]).map((row) => toCategoryTabRow(categoryId, row)) : [];
  const inherited = new Map(resolveLibraryConfig({ categoryId, categoryRows }).map((tab) => [tab.key, tab]));
  const effective = resolveLibraryConfig({ categoryId, categoryRows, overrideRows: (overridesRes.data ?? []).map(toOverrideRow) });
  return {
    rows: toEditorRows(effective, (key) => inherited.get(key)?.label?.["pt-BR"] ?? defaults(key), "hero"),
    inheritedFrom: categoryId ? localizedLabel(active.get(categoryId)?.name, locale) : null,
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminOps.creators");
  return { title: t("editTitle") };
}

// Edição da personalidade + status (RPC auditada) + atalho para convidar o usuário.
export default async function EditCreatorPage({ params }: { params: Params }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const [t, tc, ts, tn, tp, thc, tht, locale,{ data: creator, error }, { data: privateRow }, productsRes, allocationsRes, categoriesRes, categoryLinksRes] = await Promise.all([
    getTranslations("adminOps.creators"),
    getTranslations("adminOps.common"),
    getTranslations("adminCommon.status"),
    getTranslations("nav"),
    getTranslations("adminOps.creators.products"),
    getTranslations("adminContent.heroCategories.field"),
    getTranslations("adminContent.heroCategories.tabs"),
    getLocale(),
    supabase.from("creator_profiles").select("*").eq("id", id).maybeSingle(),
    // Documentação privada: RLS só devolve para admin; nunca vai à página pública.
    supabase.from("creator_rights_private").select("document_ref, notes, reviewed_at").eq("creator_id", id).maybeSingle(),
    // Todos os produtos publicados (admin vê tudo) + a alocação deste herói (admin vê todos os status).
    supabase.from("products").select("id, title, slug, seller:seller_organizations(name)").eq("status", "published").order("title").limit(200),
    supabase.from("creator_products").select("product_id, status, sort_order").eq("creator_id", id),
    // Categorias do herói (0049; admin vê também as inativas). Sem a 0049: aviso na seção.
    supabase.from("hero_categories").select("id, name, is_active").order("sort_order").order("slug"),
    supabase.from("creator_category_links").select("category_id, position").eq("creator_id", id).order("position"),
  ]);
  const [tabsSection, references, followers, tf] = await Promise.all([
    loadHeroTabs(supabase, id, categoriesRes.data ?? [], categoryLinksRes.data ?? [], locale),
    // referências para comparação e seguidores (0056); null = migração ausente
    loadReferences(supabase, id),
    loadFollowerCount(supabase, id),
    getTranslations("follows.admin"),
  ]);
  if (error) throw new Error(error.message);
  if (!creator) notFound();
  const rightsVariant = creator.rights_status === "authorized" ? "success" : creator.rights_status === "pending" ? "info" : "demo";

  // Validados primeiro (na ordem da vitrine), depois o resto em ordem de título.
  const allocations = new Map(((allocationsRes.data ?? []) as AllocationRow[]).map((a) => [a.product_id, a]));
  const heroProducts: HeroProductRow[] = ((productsRes.data ?? []) as unknown as ProductRow[])
    .map((p) => ({ ...p, allocation: allocations.get(p.id)?.status ?? null }))
    .sort((a, b) => {
      const av = a.allocation === "validated" ? 0 : 1;
      const bv = b.allocation === "validated" ? 0 : 1;
      if (av !== bv) return av - bv;
      if (av === 0) return (allocations.get(a.id)?.sort_order ?? 0) - (allocations.get(b.id)?.sort_order ?? 0);
      return 0;
    });
  const validatedCount = heroProducts.filter((p) => p.allocation === "validated").length;

  const productColumns: Column<HeroProductRow>[] = [
    {
      key: "product",
      header: tp("columns.product"),
      cell: (row) => (
        <Link href={`/admin/products/${row.id}`} className="font-medium text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          {row.title}
        </Link>
      ),
    },
    { key: "seller", header: tp("columns.seller"), hideOnMobile: true, cell: (row) => <span className="text-fg-muted">{row.seller?.name ?? tc("none")}</span> },
    {
      key: "status",
      header: tp("columns.status"),
      cell: (row) => {
        const key = allocationKey(row.allocation);
        return key === "none" ? <Badge variant="neutral" size="sm">{tp("statuses.none")}</Badge> : <StatusBadge status={key} label={tp(`statuses.${key}`)} />;
      },
    },
    { key: "actions", header: tp("columns.actions"), align: "right", cell: (row) => <CreatorProductActions creatorId={creator.id} productId={row.id} status={row.allocation} /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={creator.name}
        description={creator.headline ?? undefined}
        eyebrow={tn("admin.creators")}
        backHref="/admin/creators"
        backLabel={tn("admin.creators")}
        actions={
          <>
            <StatusBadge status={creator.status} label={ts(creator.status)} size="md" />
            <CreatorStatusButton id={creator.id} status={creator.status} />
            {isStoredAvatarUrl(creator.avatar_url, supabaseBaseUrl()) && <CreatorPhotoRemoveButton id={creator.id} />}
            {isStoredCoverUrl(creator.cover_url, supabaseBaseUrl()) && <CreatorCoverRemoveButton id={creator.id} />}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-elevated p-3 text-sm">
        {creator.is_fictional && <Badge variant="demo">{tc("fictional")}</Badge>}
        <Badge variant={rightsVariant}>{t(`rights.${creator.rights_status as "fictional" | "pending" | "authorized"}`)}</Badge>
        {creator.user_id ? (
          <Link href={`/admin/users/${creator.user_id}`} className="font-mono text-xs text-accent-text hover:underline">
            {creator.user_id}
          </Link>
        ) : (
          <span className="text-fg-muted">{tc("noUser")}</span>
        )}
        {/* atalho para a seção de produtos que o herói indica (fica no fim da página) */}
        <Button asChild variant="secondary" size="sm" className="ml-auto">
          <a href="#hero-products" data-testid="hero-products-jump">
            <Package className="size-4" aria-hidden="true" />
            {tp("jump", { n: validatedCount })}
          </a>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link href={`/admin/invitations?new=1&role=creator&creator=${creator.id}`}>
            <Mail className="size-4" aria-hidden="true" />
            {t("invite")}
          </Link>
        </Button>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-4 md:p-6">
        <CreatorForm
          id={creator.id}
          initial={{
            name: creator.name,
            slug: creator.slug,
            headline: creator.headline ?? "",
            bio: creator.bio ?? "",
            pillars: creator.pillars,
            isFictional: creator.is_fictional,
            rightsNote: creator.rights_note ?? "",
            sortOrder: creator.sort_order,
            rightsStatus: creator.rights_status as "fictional" | "pending" | "authorized",
            rightsHolder: creator.rights_holder ?? "",
            rightsValidUntil: creator.rights_valid_until ?? "",
            documentRef: privateRow?.document_ref ?? "",
            privateNotes: privateRow?.notes ?? "",
          }}
          privateMeta={{ reviewedAt: privateRow?.reviewed_at ?? null }}
        />
      </div>

      {/* Categorias do herói (até 2): definem os chips da aba Hero e, depois, os atalhos da página. */}
      <section aria-labelledby="hero-categories-title" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="hero-categories-title" className="type-h2 text-fg">
            {thc("title")}
          </h2>
          <p className="type-body-sm text-fg-muted">{thc("description")}</p>
        </div>
        {categoriesRes.error || categoryLinksRes.error ? (
          <p role="status" data-testid="hero-categories-unavailable" className="rounded-xl border border-dashed border-warning/40 bg-warning-soft/40 p-4 text-sm text-fg">
            {thc("unavailable")}
          </p>
        ) : (
          <HeroCategoriesField
            key={(categoryLinksRes.data ?? []).map((l) => l.category_id).join(",")}
            creatorId={creator.id}
            options={(categoriesRes.data ?? []).map((c) => ({ id: c.id, label: localizedLabel(c.name, locale), is_active: c.is_active }))}
            initial={(categoryLinksRes.data ?? []).map((l) => l.category_id)}
          />
        )}
      </section>

      {/* Atalhos da página do herói (0050): herdados da categoria principal, com exceção por herói. */}
      <section aria-labelledby="hero-tabs-title" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="hero-tabs-title" className="type-h2 text-fg">
            {tht("heroTitle")}
          </h2>
          <p className="type-body-sm text-fg-muted">{tht("heroDescription")}</p>
        </div>
        {!tabsSection ? (
          <p role="status" data-testid="hero-tabs-unavailable" className="rounded-xl border border-dashed border-warning/40 bg-warning-soft/40 p-4 text-sm text-fg">
            {tht("unavailable")}
          </p>
        ) : (
          <LibraryTabsEditor key={JSON.stringify(tabsSection.rows)} mode="hero" targetId={creator.id} rows={tabsSection.rows} inheritedFrom={tabsSection.inheritedFrom} />
        )}
      </section>

      {/* Referências para comparação (0056): metas da equipe no "Você vs Hero"; auditadas pelo banco. */}
      <section aria-labelledby="hero-references-title" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="hero-references-title" className="type-h2 text-fg">
              {tf("title")}
            </h2>
            <p className="type-body-sm max-w-prose text-fg-muted">{tf("description")}</p>
          </div>
          {followers !== null ? (
            <p className="type-caption type-numeric text-fg-muted" data-testid="hero-followers-admin">
              {tf("followers", { n: followers })}
            </p>
          ) : null}
        </div>
        {references === null ? (
          <p role="status" data-testid="hero-references-unavailable" className="rounded-xl border border-dashed border-warning/40 bg-warning-soft/40 p-4 text-sm text-fg">
            {tf("unavailable")}
          </p>
        ) : (
          <ReferenceMetricsEditor
            key={references.map((r) => `${r.key}:${r.value}`).join(",")}
            creatorId={creator.id}
            initial={Object.fromEntries(references.map((r) => [r.key, r.value]))}
          />
        )}
      </section>

      {/* Marcas do herói (0062): aparecem ao lado do nome com o tipo de relação (RPC auditada). */}
      <CreatorBrandsSection creatorId={creator.id} />

      {/* Produtos do herói: alocação direta, validada pelo admin (RPC auditada). */}
      <section id="hero-products" aria-labelledby="hero-products-title" className="scroll-mt-20 flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="hero-products-title" className="type-h2 text-fg">
              {tp("title")}
            </h2>
            <p className="type-body-sm text-fg-muted">{tp("description")}</p>
          </div>
          <p className="type-caption text-fg-muted" aria-live="polite">
            {tp("count", { n: validatedCount })}
          </p>
        </div>
        {productsRes.error || allocationsRes.error ? (
          <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-fg">
            {(productsRes.error ?? allocationsRes.error)?.message}
          </p>
        ) : (
          <DataTable columns={productColumns} rows={heroProducts} rowKey={(r) => r.id} caption={tp("tableCaption")} emptyTitle={tp("empty")} emptyDescription={tp("emptyDescription")} />
        )}
      </section>
    </div>
  );
}
