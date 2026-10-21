import type { Metadata } from "next";
import { Info, Layers, LibraryBig, ShieldCheck, ShoppingBag } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentCard, ProductActionCard, ProgramCard } from "@/components/catalog";
import { isCommerceEnabled } from "@/components/commerce/lib/settings";
import { ChipLink, ChipRow } from "@/components/discover/ChipLink";
import { CARD_GRID } from "@/components/discover/grid";
import { InlineError } from "@/components/discover/InlineError";
import { UrlTabs } from "@/components/discover/UrlTabs";
import { Badge, Button, EmptyState, PillarBadge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import { getUser } from "@/lib/auth/session";
import { groupCreatorProducts, maxCartQuantity, mergeCreatorProducts, type CreatorProduct, type CreatorProductDirectRow, type CreatorProductLinkRow } from "@/lib/catalog/creator-products";
import { CONTENT_CARD_SELECT, PRODUCT_CARD_SELECT, PROGRAM_CARD_SELECT, liveContentFilter, type ContentCardData, type ProductCardData, type ProgramCardData } from "@/lib/catalog/queries";
import { effectiveRightsStatus, showsFictionalBadge } from "@/lib/catalog/rights";
import { CONTENT_TYPES, type ContentType, type Pillar } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

type Creator = {
  id: string;
  slug: string;
  name: string;
  headline: string | null;
  bio: string | null;
  pillars: Pillar[];
  avatar_url: string | null;
  cover_url: string | null;
  is_fictional: boolean;
  rights_note: string | null;
  rights_status: string;
  rights_holder: string | null;
  rights_valid_until: string | null;
};

// Produto do card + estoque demo (limite por produto no carrinho de teste).
type LinkedProduct = ProductCardData & { demo_stock: number | null };
type LinkRow = CreatorProductLinkRow<LinkedProduct>;
type DirectRow = CreatorProductDirectRow<LinkedProduct>;

// Só os campos públicos de direitos; documento e notas ficam em creator_rights_private (só admin).
const CREATOR_SELECT = "id, slug, name, headline, bio, pillars, avatar_url, cover_url, is_fictional, rights_note, rights_status, rights_holder, rights_valid_until";
// Vínculos validados cujo conteúdo (publicado) é desta personalidade; o !inner aplica o filtro do embed à linha.
const LINK_SELECT = `id, content:content!inner(id, slug, title, creator_id, status), product:products(${PRODUCT_CARD_SELECT}, demo_stock)`;
// Alocação direta produto↔herói (creator_products): o embed vem nulo quando a RLS esconde o produto.
const DIRECT_SELECT = `id, status, sort_order, product:products(${PRODUCT_CARD_SELECT}, demo_stock)`;
const TABS = ["conteudos", "programas", "produtos"] as const;
type Tab = (typeof TABS)[number];

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const parseTab = (value: string | undefined): Tab => ((TABS as readonly string[]).includes(value ?? "") ? (value as Tab) : "conteudos");
const parseType = (value: string | undefined): ContentType | undefined => ((CONTENT_TYPES as string[]).includes(value ?? "") ? (value as ContentType) : undefined);

// RLS: visitantes só enxergam perfis ativos; o próprio criador vê o seu mesmo suspenso.
async function loadCreator(slug: string): Promise<Creator | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("creator_profiles").select(CREATOR_SELECT).eq("slug", slug).maybeSingle();
  return (data as Creator | null) ?? null;
}

function profileHref(slug: string, tab: Tab, type?: ContentType) {
  const sp = new URLSearchParams();
  if (tab !== "conteudos") sp.set("tab", tab);
  if (type && tab === "conteudos") sp.set("type", type);
  const qs = sp.toString();
  return qs ? `/personalities/${slug}?${qs}` : `/personalities/${slug}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [creator, t] = await Promise.all([loadCreator(slug), getTranslations("discover.meta")]);
  if (!creator) return {};
  return { title: t("personality", { name: creator.name }), description: creator.headline ?? undefined };
}

// Perfil da personalidade: capa, identidade, nota de direitos (fictício, em validação ou autorizado) e abas.
export default async function PersonalityPage({ params, searchParams }: Props) {
  const [{ slug }, raw] = await Promise.all([params, searchParams]);
  const [creator, t, tcat, user, locale] = await Promise.all([loadCreator(slug), getTranslations("discover.personalities.profile"), getTranslations("catalog"), getUser(), getLocale()]);
  if (!creator) notFound();

  const requestedTab = parseTab(first(raw.tab));
  const type = parseType(first(raw.type));
  // RB-05: só "autorizado" com titular documentado e dentro da validade tira o selo de fictício.
  const rights = effectiveRightsStatus(creator.rights_status, creator.rights_valid_until);

  // Uma query por coleção (sem N+1); contagens e filtro por tipo derivam do mesmo resultado.
  const supabase = await createClient();
  const [contentRes, programRes, linksRes, directRes, settingsRes] = await Promise.all([
    supabase.from("content").select(CONTENT_CARD_SELECT).eq("creator_id", creator.id).eq("status", "published").or(liveContentFilter()).order("published_at", { ascending: false }).limit(100),
    supabase.from("programs").select(PROGRAM_CARD_SELECT).eq("creator_id", creator.id).eq("status", "published").order("is_featured", { ascending: false }).order("created_at", { ascending: false }).limit(50),
    supabase
      .from("content_product_links")
      .select(LINK_SELECT)
      .eq("content.creator_id", creator.id)
      .eq("content.status", "published")
      .eq("status", "validated")
      .order("validated_at", { ascending: false })
      .order("id")
      .limit(100),
    supabase.from("creator_products").select(DIRECT_SELECT).eq("creator_id", creator.id).eq("status", "validated").order("sort_order").order("id").limit(100),
    supabase.rpc("public_settings"),
  ]);
  const allContents = (contentRes.data ?? []) as unknown as ContentCardData[];
  const contents = type ? allContents.filter((c) => c.type === type) : allContents;
  const availableTypes = CONTENT_TYPES.filter((ct) => allContents.some((c) => c.type === ct));
  const programs = ((programRes.data ?? []) as unknown as ProgramCardData[]).filter((p) => p.version);

  // Kill switch: desligado, a aba de produtos some e nada é contado.
  const commerceEnabled = !settingsRes.error && isCommerceEnabled(settingsRes.data);

  // Produtos do herói: alocação direta validada primeiro, depois os ligados por conteúdo (sem repetir).
  // Mesma regra de compra do RelatedProducts: vínculo validado + product_is_purchasable.
  const productsError = Boolean(linksRes.error || directRes.error);
  let products: CreatorProduct<LinkedProduct>[] = [];
  let inCartByProduct = new Map<string, number>();
  if (commerceEnabled && !productsError) {
    const grouped = mergeCreatorProducts((directRes.data ?? []) as unknown as DirectRow[], groupCreatorProducts((linksRes.data ?? []) as unknown as LinkRow[]));
    const [purchasable, cartRes] = await Promise.all([
      Promise.all(grouped.map(async ({ product }) => Boolean((await supabase.rpc("product_is_purchasable", { p_product: product.id })).data))),
      user && grouped.length > 0
        ? supabase.from("cart_items").select("product_id, quantity").in("product_id", grouped.map(({ product }) => product.id))
        : Promise.resolve({ data: null }),
    ]);
    products = grouped.filter((_, index) => purchasable[index]);
    inCartByProduct = new Map((cartRes.data ?? []).map((row) => [row.product_id, row.quantity]));
  }

  // A aba aparece com produtos, ou quando pedida explicitamente na URL (mostra o estado vazio).
  const showProductsTab = commerceEnabled && (products.length > 0 || requestedTab === "produtos");
  const tab: Tab = requestedTab === "produtos" && !showProductsTab ? "conteudos" : requestedTab;
  const productsPath = profileHref(creator.slug, "produtos");

  const cover = creator.cover_url ?? `/placeholders/cover-${creator.pillars[0] ?? "routine"}-2.svg`;
  const avatar = creator.avatar_url ?? "/placeholders/avatar-1.svg";

  const tabs = [
    { value: "conteudos", label: `${t("tabs.contents")} · ${allContents.length}`, href: profileHref(creator.slug, "conteudos", type), icon: <LibraryBig /> },
    { value: "programas", label: `${t("tabs.programs")} · ${programs.length}`, href: profileHref(creator.slug, "programas"), icon: <Layers /> },
    ...(showProductsTab ? [{ value: "produtos", label: `${t("tabs.products")} · ${products.length}`, href: productsPath, icon: <ShoppingBag /> }] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/personalities" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        ← {t("back")}
      </Link>

      <header className="flex flex-col gap-4">
        <div className="relative aspect-[21/9] w-full overflow-hidden rounded-2xl border border-border bg-surface-elevated sm:aspect-[3/1]">
          <Image src={cover} alt={t("coverAlt", { name: creator.name })} fill priority unoptimized={cover.endsWith(".svg")} sizes="(min-width: 1024px) 60vw, 100vw" className="object-cover" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-obsidian/60 via-transparent to-transparent" />
        </div>

        <div className="-mt-14 flex flex-col gap-4 px-2 sm:-mt-16 sm:flex-row sm:items-end sm:px-4">
          <span className="relative inline-flex size-24 shrink-0 overflow-hidden rounded-full border-4 border-bg bg-surface-elevated shadow-md sm:size-28">
            <Image src={avatar} alt="" fill unoptimized={avatar.endsWith(".svg")} sizes="112px" className="object-cover" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="type-h1 text-balance text-fg">{creator.name}</h1>
              {showsFictionalBadge(rights) && <Badge variant="demo">{t("fictional")}</Badge>}
              {rights === "pending" && <Badge variant="info">{t("rightsPendingBadge")}</Badge>}
            </div>
            {creator.headline && <p className="type-body text-fg-muted">{creator.headline}</p>}
            <ul className="flex flex-wrap gap-1.5" aria-label={t("pillarsLabel")}>
              {creator.pillars.map((pillar) => (
                <li key={pillar}>
                  <PillarBadge pillar={pillar} />
                </li>
              ))}
            </ul>
            <p className="type-caption text-fg-muted">
              {t("stats.contents", { count: allContents.length })} · {t("stats.programs", { count: programs.length })}
              {commerceEnabled && products.length > 0 ? ` · ${t("stats.products", { count: products.length })}` : null}
            </p>
          </div>
        </div>

        {creator.bio && <p className="type-body max-w-prose whitespace-pre-line text-fg sm:px-4">{creator.bio}</p>}

        {/* Nota de direitos (RB-05): fictício ou em validação nunca aparecem como autorizado;
            autorizado exibe o titular e a validade registrados pela administração. */}
        <aside
          aria-label={t("rightsTitle")}
          className={cn(
            "flex gap-3 rounded-xl border border-dashed p-4 sm:mx-4",
            rights === "authorized" ? "border-success/40 bg-success-soft/40" : "border-warning/40 bg-warning-soft/40",
          )}
        >
          {rights === "authorized" ? (
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          )}
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold text-fg">{t("rightsTitle")}</p>
            {rights === "authorized" ? (
              <p className="type-body-sm text-fg-muted">
                {t("rightsAuthorized", { holder: creator.rights_holder ?? "" })}
                {creator.rights_valid_until ? ` ${t("rightsValidUntil", { date: formatPlainDate(creator.rights_valid_until, locale as Locale) })}` : ""}
              </p>
            ) : (
              <p className="type-body-sm text-fg-muted">
                {creator.rights_note?.trim() || t("rightsDefault")}
                {rights === "pending" ? ` ${t("rightsPending")}` : ""}
              </p>
            )}
          </div>
        </aside>
      </header>

      <UrlTabs value={tab} tabs={tabs} aria-label={t("tabs.label")}>
        {tab === "conteudos" ? (
          <div className="flex flex-col gap-4">
            {availableTypes.length > 1 && (
              <ChipRow label={t("typeFilter")}>
                <ChipLink href={profileHref(creator.slug, "conteudos")} selected={!type}>
                  {t("allTypes")}
                </ChipLink>
                {availableTypes.map((ct) => (
                  <ChipLink key={ct} href={profileHref(creator.slug, "conteudos", ct)} selected={type === ct}>
                    {tcat(`types.${ct}`)}
                  </ChipLink>
                ))}
              </ChipRow>
            )}
            {contentRes.error ? (
              <InlineError />
            ) : contents.length === 0 ? (
              <div className="rounded-2xl border border-border bg-surface">
                <EmptyState
                  icon={<LibraryBig />}
                  title={t("contentsEmptyTitle")}
                  description={t("contentsEmptyDescription")}
                  action={
                    type ? (
                      <Button asChild variant="secondary">
                        <Link href={profileHref(creator.slug, "conteudos")}>{t("allTypes")}</Link>
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <ul className={CARD_GRID}>
                {contents.map((content) => (
                  <li key={content.id}>
                    <ContentCard content={content} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : tab === "programas" ? (
          programRes.error ? (
            <InlineError />
          ) : programs.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface">
              <EmptyState icon={<Layers />} title={t("programsEmptyTitle")} description={t("programsEmptyDescription")} />
            </div>
          ) : (
            <ul className={CARD_GRID}>
              {programs.map((program) => (
                <li key={program.id}>
                  <ProgramCard program={program} />
                </li>
              ))}
            </ul>
          )
        ) : productsError ? (
          <InlineError />
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface">
            <EmptyState
              icon={<ShoppingBag />}
              title={t("productsEmptyTitle")}
              description={t("productsEmptyDescription")}
              action={
                <Button asChild variant="secondary">
                  <Link href="/shop">{t("productsGoToShop")}</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="type-body-sm text-fg-muted">{t("productsNote")}</p>
            <ul className={CARD_GRID}>
              {products.map(({ product, usedIn }) => (
                <li key={product.id}>
                  <ProductActionCard
                    product={product}
                    usedIn={usedIn}
                    purchasable
                    maxQuantity={maxCartQuantity(product.demo_stock)}
                    isLoggedIn={Boolean(user)}
                    inCart={inCartByProduct.get(product.id) ?? 0}
                    nextPath={productsPath}
                    interestContentId={usedIn[0]?.id}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </UrlTabs>
    </div>
  );
}
