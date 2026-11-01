"use client";

import { Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteBrandAction, deleteBrandProductAction, saveBrandAction, saveBrandProductAction } from "@/app/admin/marcas/actions";
import { ConfirmActionDialog } from "@/components/admin";
import { Button, FormField, Input, Select, Textarea } from "@/components/ui";
import { PRODUCT_DESCRIPTION_MAX, slugify } from "@/lib/brands/admin";
import type { AdminBrand, AdminProduct } from "@/lib/brands/admin-queries";
import { RELATIONSHIPS } from "@/lib/brands";
import { ImageField } from "./ImageField";
import { useRun } from "./use-run";

// Formulários de marca e de produto (0062). O banco confere tudo de novo (RPC auditada).

type BrandFormProps = { brand?: AdminBrand | null };

export function BrandForm({ brand }: BrandFormProps) {
  const t = useTranslations("adminOps.brands");
  const router = useRouter();
  const { pending, error, run } = useRun();
  const [name, setName] = useState(brand?.name ?? "");
  const [slug, setSlug] = useState(brand?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(brand));
  const [site, setSite] = useState(brand?.site_url ?? "https://");
  const [logo, setLogo] = useState(brand?.logo_url ?? "");
  const [rel, setRel] = useState<string>(brand?.default_relationship ?? "mentioned");
  const [status, setStatus] = useState<string>(brand?.status ?? "active");

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="admin-brand-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => saveBrandAction(brand?.id ?? null, { name, slug: slug || slugify(name), site_url: site, logo_url: logo, default_relationship: rel, status, is_demo: false }),
          (result) => {
            if (!brand && "id" in result && result.id) router.push(`/admin/marcas/${result.id}`);
          },
        );
      }}
    >
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("form.name")} required>
          <Input
            value={name}
            maxLength={60}
            disabled={pending}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
          />
        </FormField>
        <FormField label={t("form.slug")} hint={t("form.slugHint")} required>
          <Input
            value={slug}
            maxLength={60}
            disabled={pending}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
          />
        </FormField>
      </div>
      <FormField label={t("form.site")} hint={t("form.siteHint")} required>
        <Input type="url" inputMode="url" value={site} maxLength={500} disabled={pending} onChange={(e) => setSite(e.target.value)} />
      </FormField>
      <ImageField kind="logo" label={t("form.logo")} hint={t("form.logoHint")} value={logo} onChange={setLogo} disabled={pending} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("form.defaultRelationship")}>
          <Select value={rel} disabled={pending} onChange={(e) => setRel(e.target.value)}>
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {t(`relationship.${r}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("form.status")}>
          <Select value={status} disabled={pending} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">{t("status.active")}</option>
            <option value="inactive">{t("status.inactive")}</option>
          </Select>
        </FormField>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={pending} leadingIcon={<Save />} data-testid="admin-brand-save">
          {brand ? t("form.save") : t("form.create")}
        </Button>
        {brand ? (
          <ConfirmActionDialog
            triggerLabel={
              <span className="inline-flex items-center gap-1.5">
                <Trash2 className="size-4" aria-hidden="true" />
                {t("form.delete")}
              </span>
            }
            triggerVariant="ghost"
            title={t("form.deleteTitle", { name: brand.name })}
            description={t("form.deleteDescription")}
            destructive
            action={async () => {
              const result = await deleteBrandAction(brand.id);
              if (result.ok) router.push("/admin/marcas");
              return result;
            }}
          />
        ) : null}
      </div>
    </form>
  );
}

type ProductFormProps = { brandId: string; product?: AdminProduct | null; onDone?: () => void };

const centsToInput = (cents: number | null | undefined) => (cents === null || cents === undefined ? "" : (cents / 100).toFixed(2).replace(".", ","));

export function ProductForm({ brandId, product, onDone }: ProductFormProps) {
  const t = useTranslations("adminOps.brands");
  const { pending, error, run } = useRun();
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [url, setUrl] = useState(product?.external_url ?? "https://");
  const [image, setImage] = useState(product?.image_url ?? "");
  const [price, setPrice] = useState(centsToInput(product?.price_cents));
  const [status, setStatus] = useState<string>(product?.status ?? "active");

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="admin-brand-product-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => saveBrandProductAction(product?.id ?? null, { brand_id: brandId, name, description, external_url: url, image_url: image, price, status, is_demo: false }),
          () => {
            if (!product) {
              setName("");
              setDescription("");
              setUrl("https://");
              setImage("");
              setPrice("");
            }
            onDone?.();
          },
        );
      }}
    >
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <FormField label={t("product.name")} required>
        <Input value={name} maxLength={80} disabled={pending} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label={t("product.description")} hint={t("product.descriptionHint")}>
        <Textarea value={description} rows={2} maxLength={PRODUCT_DESCRIPTION_MAX} disabled={pending} onChange={(e) => setDescription(e.target.value)} />
      </FormField>
      <FormField label={t("product.url")} hint={t("product.urlHint")} required>
        <Input type="url" inputMode="url" value={url} maxLength={500} disabled={pending} onChange={(e) => setUrl(e.target.value)} />
      </FormField>
      <ImageField kind="product" label={t("product.image")} hint={t("form.logoHint")} value={image} onChange={setImage} disabled={pending} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("product.price")} hint={t("product.priceHint")}>
          <Input inputMode="decimal" value={price} maxLength={11} placeholder="129,90" disabled={pending} onChange={(e) => setPrice(e.target.value)} />
        </FormField>
        <FormField label={t("product.status")}>
          <Select value={status} disabled={pending} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">{t("productStatus.active")}</option>
            <option value="inactive">{t("productStatus.inactive")}</option>
          </Select>
        </FormField>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" loading={pending} leadingIcon={<Save />} data-testid="admin-brand-product-save">
          {product ? t("product.save") : t("product.create")}
        </Button>
        {product ? (
          <ConfirmActionDialog
            triggerLabel={
              <span className="inline-flex items-center gap-1.5">
                <Trash2 className="size-4" aria-hidden="true" />
                {t("product.delete")}
              </span>
            }
            triggerVariant="ghost"
            title={t("product.deleteTitle", { name: product.name })}
            description={t("product.deleteDescription")}
            destructive
            action={() => deleteBrandProductAction(product.id, brandId)}
          />
        ) : null}
      </div>
    </form>
  );
}
