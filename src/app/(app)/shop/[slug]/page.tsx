import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PackageX, Store } from "lucide-react";
import { ContentCard } from "@/components/catalog";
import { AddToCartForm } from "@/components/commerce/AddToCartForm";
import { CommerceEventTracker } from "@/components/commerce/CommerceEventTracker";
import { DemoNotice } from "@/components/commerce/DemoNotice";
import { FoodInfoBlock, parseFoodInfo } from "@/components/commerce/FoodInfoBlock";
import { OfficialStoreLink } from "@/components/commerce/OfficialStoreLink";
import { Badge, DemoBadge, Section } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import { getUser } from "@/lib/auth/session";
import { CONTENT_CARD_SELECT, localizedLabel, type ContentCardData } from "@/lib/catalog/queries";
import { createClient } from "@/lib/supabase/server";

// Página do produto de demonstração. Visibilidade vem da RLS; "comprável" vem da função SQL
// product_is_purchasable (mesma regra do carrinho e do checkout).

const PRODUCT_SELECT =
  "id, slug, title, description, image_url, price_cents_demo, product_type, attributes, food_info, status, availability, moderation_status, demo_stock, version, " +
  "category:product_categories(code, name, is_food), seller:seller_organizations(id, slug, name, kind, status, is_fictional)";

type ProductDetail = {
  id: string;
  slug: string;
  title: string;
  description: string;
  image_url: string;
  price_cents_demo: number;
  product_type: "physical" | "kit" | "digital";
  attributes: Record<string, unknown>;
  food_info: unknown;
  status: "draft" | "published" | "archived";
  availability: "available" | "unavailable";
  moderation_status: "clear" | "hidden" | "suspended";
  demo_stock: number | null;
  version: number;
  category: { code: string; name: Record<string, string>; is_food: boolean } | null;
  seller: { id: string; slug: string; name: string; kind: "own" | "partner"; status: "pending" | "active" | "suspended"; is_fictional: boolean } | null;
};

type Params = { params: Promise<{ slug: string }> };

async function loadProduct(slug: string): Promise<ProductDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("products").select(PRODUCT_SELECT).eq("slug", slug).maybeSingle();
  return (data as unknown as ProductDetail | null) ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) return {};
  return { title: product.title, description: product.description.slice(0, 160) };
}

function attributeValue(value: unknown, yes: string, no: string): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "boolean") return value ? yes : no;
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default async function ProductPage({ params }: Params) {
  const { slug } = await params;
  const [product, user, locale, t, td, tcat] = await Promise.all([
    loadProduct(slug),
    getUser(),
    getLocale(),
    getTranslations("commerce.product"),
    getTranslations("commerce.demo"),
    getTranslations("catalog"),
  ]);
  if (!product) notFound();

  const supabase = await createClient();
  const [{ data: purchasableRaw }, cartRes, { data: linksRaw }] = await Promise.all([
    supabase.rpc("product_is_purchasable", { p_product: product.id }),
    user ? supabase.from("cart_items").select("quantity").eq("product_id", product.id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("content_product_links").select(`id, content:content(${CONTENT_CARD_SELECT})`).eq("product_id", product.id).eq("status", "validated").limit(6),
  ]);
  const purchasable = Boolean(purchasableRaw);
  const inCart = cartRes.data?.quantity ?? 0;
  const related = ((linksRaw ?? []) as unknown as { id: string; content: ContentCardData | ContentCardData[] | null }[])
    .map((l) => (Array.isArray(l.content) ? l.content[0] : l.content))
    .filter((c): c is ContentCardData => Boolean(c));

  const uiLocale = locale as Locale;
  const path = `/shop/${product.slug}`;
  const foodInfo = product.category?.is_food ? parseFoodInfo(product.food_info) : null;
  // external_url vira o link "Ver na loja oficial"; na lista de características só sobra o resto.
  const attributes = Object.entries(product.attributes ?? {}).filter(([key]) => key !== "external_url");
  const lowStock = product.demo_stock !== null && product.demo_stock > 0 && product.demo_stock <= 5;
  const outOfStock = product.demo_stock !== null && product.demo_stock <= 0;
  const unavailable = !purchasable;
  const maxQuantity = product.demo_stock === null ? 20 : Math.min(20, product.demo_stock);

  return (
    <div className="flex flex-col gap-8">
      <CommerceEventTracker event="product.view" properties={{ product_id: product.id, category: product.category?.code ?? null, purchasable }} />

      <Link href="/shop" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("backToShop")}
      </Link>

      <div className="grid gap-6 md:grid-cols-2 md:gap-10">
        <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-surface-elevated">
          <Image src={product.image_url} alt="" fill priority unoptimized={product.image_url.endsWith(".svg")} sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
            {product.category ? <Badge variant="neutral" className="bg-black/40 text-white border-white/30">{localizedLabel(product.category.name, uiLocale)}</Badge> : <span />}
            {unavailable ? <Badge variant="warning">{tcat("productUnavailable")}</Badge> : <DemoBadge />}
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 type-caption text-fg-muted">
              {product.category ? (
                <li>
                  {t("categoryLabel")}: {localizedLabel(product.category.name, uiLocale)}
                </li>
              ) : null}
              <li>
                {t("typeLabel")}: {t(`type.${product.product_type}`)}
              </li>
              <li>{t("versionLabel", { n: product.version })}</li>
            </ul>
            <h1 className="type-h1 text-balance text-fg">{product.title}</h1>
            {product.seller ? (
              <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                <Store className="size-4" aria-hidden="true" />
                <span>
                  {t("sellerLabel")} <span className="font-semibold text-fg">{product.seller.name}</span> · {t(`sellerKind.${product.seller.kind}`)}
                </span>
                {product.seller.is_fictional ? (
                  <Badge variant="demo" size="sm">
                    {t("fictionalSeller")}
                  </Badge>
                ) : null}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <p className="type-overline text-fg-muted">{t("priceLabel")}</p>
            <p className="flex flex-wrap items-baseline gap-2">
              <span className="type-numeric text-3xl font-bold text-fg">{formatCurrency(product.price_cents_demo / 100, uiLocale)}</span>
              <span className="text-sm text-fg-muted">{td("priceDemo")}</span>
            </p>
            {lowStock ? (
              <p className="type-caption font-medium text-warning" role="status">
                {t("stockLow", { n: product.demo_stock ?? 0 })}
              </p>
            ) : null}
            {outOfStock ? (
              <p className="type-caption inline-flex items-center gap-1 font-medium text-fg-muted" role="status">
                <PackageX className="size-3.5" aria-hidden="true" />
                {t("stockOut")}
              </p>
            ) : null}
          </div>

          <AddToCartForm productId={product.id} priceCents={product.price_cents_demo} maxQuantity={maxQuantity} purchasable={purchasable} isLoggedIn={Boolean(user)} inCart={inCart} nextPath={path} />

          {/* A compra aqui segue simulada; a loja oficial da marca fica num link externo. */}
          <OfficialStoreLink attributes={product.attributes} className="w-fit" />

          <DemoNotice>{td("notice")}</DemoNotice>

          <section aria-labelledby="product-description" className="flex flex-col gap-2">
            <h2 id="product-description" className="type-h3 text-fg">
              {t("descriptionLabel")}
            </h2>
            <p className="type-body whitespace-pre-line text-fg-muted">{product.description}</p>
          </section>

          {attributes.length > 0 ? (
            <section aria-labelledby="product-attributes" className="flex flex-col gap-2">
              <h2 id="product-attributes" className="type-h3 text-fg">
                {t("attributesLabel")}
              </h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {attributes.map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-fg-muted">{t.has(`attributes.${key}`) ? t(`attributes.${key}`) : key.replaceAll("_", " ")}</dt>
                    <dd className="font-medium text-fg">{attributeValue(value, td("yes"), td("no"))}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>
      </div>

      {foodInfo ? <FoodInfoBlock info={foodInfo} /> : null}

      {related.length > 0 ? (
        <Section id="related-content" title={t("relatedContent")} description={t("relatedContentNote")}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((content) => (
              <ContentCard key={content.id} content={content} />
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
