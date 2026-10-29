import { Mail } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { CreatorForm } from "@/components/admin-ops/CreatorForm";
import { CreatorProductActions } from "@/components/admin-ops/CreatorProductActions";
import { CreatorCoverRemoveButton, CreatorPhotoRemoveButton, CreatorStatusButton } from "@/components/admin-ops/StatusActions";
import { Badge, Button, PageHeader } from "@/components/ui";
import { isStoredAvatarUrl, supabaseBaseUrl } from "@/lib/avatar/paths";
import { isStoredCoverUrl } from "@/lib/hero-cover/paths";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ id: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProductRow = { id: string; title: string; slug: string; seller: { name: string } | null };
type AllocationRow = { product_id: string; status: string; sort_order: number };
type HeroProductRow = ProductRow & { allocation: string | null };
const ALLOCATION_STATUSES = ["validated", "suspended", "rejected", "suggested"] as const;
type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];
const allocationKey = (status: string | null): AllocationStatus | "none" => (ALLOCATION_STATUSES as readonly string[]).includes(status ?? "") ? (status as AllocationStatus) : "none";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminOps.creators");
  return { title: t("editTitle") };
}

// Edição da personalidade + status (RPC auditada) + atalho para convidar o usuário.
export default async function EditCreatorPage({ params }: { params: Params }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const [t, tc, ts, tn, tp, { data: creator, error }, { data: privateRow }, productsRes, allocationsRes] = await Promise.all([
    getTranslations("adminOps.creators"),
    getTranslations("adminOps.common"),
    getTranslations("adminCommon.status"),
    getTranslations("nav"),
    getTranslations("adminOps.creators.products"),
    supabase.from("creator_profiles").select("*").eq("id", id).maybeSingle(),
    // Documentação privada: RLS só devolve para admin; nunca vai à página pública.
    supabase.from("creator_rights_private").select("document_ref, notes, reviewed_at").eq("creator_id", id).maybeSingle(),
    // Todos os produtos publicados (admin vê tudo) + a alocação deste herói (admin vê todos os status).
    supabase.from("products").select("id, title, slug, seller:seller_organizations(name)").eq("status", "published").order("title").limit(200),
    supabase.from("creator_products").select("product_id, status, sort_order").eq("creator_id", id),
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
        <Button asChild variant="secondary" size="sm" className="ml-auto">
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

      {/* Produtos do herói: alocação direta, validada pelo admin (RPC auditada). */}
      <section aria-labelledby="hero-products-title" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 md:p-6">
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
