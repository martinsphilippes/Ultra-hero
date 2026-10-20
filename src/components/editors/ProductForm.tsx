"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition, type FormEvent } from "react";
import { StatusBadge } from "@/components/admin";
import { Button, DemoBadge, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import { localizedLabel } from "@/lib/catalog/queries";
import { AttributesEditor, attributesToRows, rowsToAttributes, type AttributeRow } from "./product/AttributesEditor";
import { ChipsInput } from "./product/ChipsInput";
import { ImagePicker } from "./product/ImagePicker";
import {
  AVAILABILITIES,
  PRODUCT_IMAGES,
  PRODUCT_STATUSES,
  PRODUCT_TYPES,
  centsToPriceInput,
  createProductSchema,
  emptyProductValues,
  flattenProductIssues,
  parsePriceToCents,
  type ProductFieldErrors,
} from "./product/schema";
import type { ProductFormProps, ProductFormValues } from "./types";

// Formulário de produto (fornecedor e admin). Valida com o esquema Zod compartilhado no cliente
// e devolve ProductFormValues para a server action; erros de servidor chegam como códigos.

type Draft = Omit<ProductFormValues, "attributes" | "price_cents_demo" | "demo_stock"> & {
  priceInput: string;
  demoStockInput: string;
  attributeRows: AttributeRow[];
  food: { ingredients: string[]; allergens: string[]; storage: string };
};

function toDraft(initial: Partial<ProductFormValues> | undefined, sellerOrgs: ProductFormProps["sellerOrgs"]): Draft {
  const base = { ...emptyProductValues(sellerOrgs.length === 1 ? sellerOrgs[0].id : ""), ...initial };
  return {
    ...base,
    priceInput: centsToPriceInput(base.price_cents_demo ?? 0),
    demoStockInput: base.demo_stock === null || base.demo_stock === undefined ? "" : String(base.demo_stock),
    attributeRows: attributesToRows(base.attributes ?? {}),
    food: { ingredients: base.food_info?.ingredients ?? [], allergens: base.food_info?.allergens ?? [], storage: base.food_info?.storage ?? "" },
  };
}

export function ProductForm({ mode, initial, sellerOrgs, categories, moderation, action }: ProductFormProps) {
  const t = useTranslations("commerce.productForm");
  const ts = useTranslations("adminCommon.status");
  const tc = useTranslations("common.actions");
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const id = useId();
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial, sellerOrgs));
  const [errors, setErrors] = useState<ProductFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const foodCategoryIds = useMemo(() => new Set(categories.filter((c) => c.is_food).map((c) => c.id)), [categories]);
  const schema = useMemo(() => createProductSchema({ isFoodCategory: (cid) => foodCategoryIds.has(cid) }), [foodCategoryIds]);
  const isFood = foodCategoryIds.has(draft.category_id);
  const moderated = moderation && moderation.status !== "clear";

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  // Traduz um código de erro ("forbidden_claim:cura", "protected_column:slug") para texto.
  function translateError(code: string): string {
    const [key, detail] = code.split(":", 2);
    if (key === "forbidden_claim") return t("errors.forbidden_claim", { term: detail ?? "" });
    if (key === "protected_column") return t("errors.protected_column", { column: detail ?? "" });
    return t.has(`errors.${key}`) ? t(`errors.${key}`) : code;
  }

  function buildValues(): ProductFormValues {
    const priceCents = parsePriceToCents(draft.priceInput);
    const stockRaw = draft.demoStockInput.trim();
    return {
      id: draft.id,
      seller_org_id: draft.seller_org_id,
      category_id: draft.category_id,
      title: draft.title.trim(),
      description: draft.description.trim(),
      image_url: draft.image_url,
      price_cents_demo: priceCents,
      product_type: draft.product_type,
      attributes: rowsToAttributes(draft.attributeRows),
      food_info: isFood ? { ingredients: draft.food.ingredients, allergens: draft.food.allergens, storage: draft.food.storage.trim() } : null,
      status: draft.status,
      availability: draft.availability,
      demo_stock: stockRaw === "" ? null : Number(stockRaw),
    };
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const values = buildValues();
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const flat = flattenProductIssues(parsed.error);
      setErrors(flat);
      setFormError(t("errors.invalid_input"));
      const firstKey = Object.keys(flat)[0];
      const el = document.getElementById(`${id}-${firstKey.split(".")[0]}`);
      el?.focus();
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await action(parsed.data as ProductFormValues);
      if (result.ok) {
        toast({ title: result.message ?? t("saved"), variant: "success" });
        router.refresh();
      } else {
        setFormError(translateError(result.error));
      }
    });
  }

  const err = (key: string) => (errors[key] ? translateError(errors[key]) : undefined);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8" aria-busy={pending || undefined}>
      {moderated ? (
        <section aria-labelledby={`${id}-moderation`} className="flex flex-col gap-2 rounded-2xl border border-warning/40 bg-warning-soft p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`${id}-moderation`} className="font-semibold text-fg">
              {t("moderation.title")}
            </h2>
            <StatusBadge status={moderation.status} label={ts(moderation.status)} />
          </div>
          <p className="type-body-sm text-fg">
            <span className="font-medium">{t("moderation.reason")}:</span> {moderation.reason ?? t("moderation.noReason")}
          </p>
          <p className="type-caption text-fg-muted">{t("moderation.readOnly")}</p>
        </section>
      ) : null}

      <fieldset className="flex flex-col gap-5">
        <legend className="type-h3 mb-1 text-fg">{t("sections.basics")}</legend>
        {sellerOrgs.length > 1 ? (
          <FormField label={t("fields.seller")} error={err("seller_org_id")} required id={`${id}-seller_org_id`}>
            <Select value={draft.seller_org_id} onChange={(e) => set("seller_org_id", e.target.value)} disabled={pending || mode === "edit"}>
              <option value="">—</option>
              {sellerOrgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}
        <FormField label={t("fields.category")} error={err("category_id")} hint={isFood ? t("foodRequired") : undefined} required id={`${id}-category_id`}>
          <Select value={draft.category_id} onChange={(e) => set("category_id", e.target.value)} disabled={pending}>
            <option value="">{t("fields.categoryPlaceholder")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {localizedLabel(c.name, locale)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("fields.title")} hint={t("fields.titleHint")} error={err("title")} required id={`${id}-title`}>
          <Input value={draft.title} onChange={(e) => set("title", e.target.value)} maxLength={120} disabled={pending} />
        </FormField>
        <FormField label={t("fields.description")} hint={t("fields.descriptionHint")} error={err("description")} required id={`${id}-description`}>
          <Textarea value={draft.description} onChange={(e) => set("description", e.target.value)} rows={5} maxLength={4000} disabled={pending} />
        </FormField>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-fg" id={`${id}-image_url-label`}>
            {t("fields.image")} <DemoBadge size="sm" className="ml-1 align-middle" />
          </p>
          <ImagePicker options={PRODUCT_IMAGES} value={draft.image_url} onChange={(v) => set("image_url", v)} label={t("fields.image")} optionLabel={(n) => t("fields.imageOption", { n })} disabled={pending} invalid={Boolean(errors.image_url)} aria-describedby={`${id}-image-hint`} />
          <p id={`${id}-image-hint`} className={errors.image_url ? "type-caption font-medium text-danger" : "type-caption text-fg-muted"} role={errors.image_url ? "alert" : undefined}>
            {err("image_url") ?? t("fields.imageHint")}
          </p>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="type-h3 mb-1 text-fg">{t("sections.pricing")}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={t("fields.price")} hint={t("fields.priceHint")} error={err("price_cents_demo")} required id={`${id}-price_cents_demo`}>
            <Input value={draft.priceInput} onChange={(e) => set("priceInput", e.target.value)} inputMode="decimal" placeholder="0,00" disabled={pending} />
          </FormField>
          <FormField label={t("fields.demoStock")} hint={t("fields.demoStockHint")} error={err("demo_stock")} id={`${id}-demo_stock`}>
            <Input value={draft.demoStockInput} onChange={(e) => set("demoStockInput", e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" disabled={pending} />
          </FormField>
        </div>
        <FormField label={t("fields.availability")} id={`${id}-availability`}>
          <Select value={draft.availability} onChange={(e) => set("availability", e.target.value as ProductFormValues["availability"])} disabled={pending}>
            {AVAILABILITIES.map((a) => (
              <option key={a} value={a}>
                {ts(a)}
              </option>
            ))}
          </Select>
        </FormField>
      </fieldset>

      <fieldset className="flex flex-col gap-5">
        <legend className="type-h3 mb-1 text-fg">{t("sections.details")}</legend>
        <FormField label={t("fields.productType")} id={`${id}-product_type`}>
          <Select value={draft.product_type} onChange={(e) => set("product_type", e.target.value as ProductFormValues["product_type"])} disabled={pending}>
            {PRODUCT_TYPES.map((p) => (
              <option key={p} value={p}>
                {t(`type.${p}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-fg">{t("fields.attributes")}</p>
          <p className="type-caption text-fg-muted">{t("fields.attributesHint")}</p>
          <AttributesEditor rows={draft.attributeRows} onChange={(rows) => set("attributeRows", rows)} errors={errors} disabled={pending} />
        </div>
      </fieldset>

      {isFood ? (
        <fieldset className="flex flex-col gap-5">
          <legend className="type-h3 mb-1 text-fg">{t("sections.food")}</legend>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold text-fg">
              {t("fields.ingredients")} <span aria-hidden="true" className="text-accent-text">*</span>
            </p>
            <ChipsInput id={`${id}-food_info`} values={draft.food.ingredients} onChange={(v) => set("food", { ...draft.food, ingredients: v })} label={t("fields.ingredients")} disabled={pending} aria-invalid={Boolean(errors["food_info.ingredients"])} />
            <p className={errors["food_info.ingredients"] ? "type-caption font-medium text-danger" : "type-caption text-fg-muted"} role={errors["food_info.ingredients"] ? "alert" : undefined}>
              {err("food_info.ingredients") ?? t("fields.ingredientsHint")}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold text-fg">{t("fields.allergens")}</p>
            <ChipsInput values={draft.food.allergens} onChange={(v) => set("food", { ...draft.food, allergens: v })} label={t("fields.allergens")} maxItems={30} disabled={pending} />
            <p className="type-caption text-fg-muted">{t("fields.allergensHint")}</p>
          </div>
          <FormField label={t("fields.storage")} error={err("food_info.storage")} required id={`${id}-storage`}>
            <Textarea value={draft.food.storage} onChange={(e) => set("food", { ...draft.food, storage: e.target.value })} rows={2} maxLength={300} disabled={pending} />
          </FormField>
        </fieldset>
      ) : null}

      <fieldset className="flex flex-col gap-5">
        <legend className="type-h3 mb-1 text-fg">{t("sections.publishing")}</legend>
        <FormField label={t("fields.status")} hint={t(`statusHint.${draft.status}`)} error={err("status")} id={`${id}-status`}>
          <Select value={draft.status} onChange={(e) => set("status", e.target.value as ProductFormValues["status"])} disabled={pending}>
            {PRODUCT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ts(s)}
              </option>
            ))}
          </Select>
        </FormField>
      </fieldset>

      {formError ? (
        <p role="alert" className="type-body-sm font-medium text-danger">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          {tc("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {mode === "create" ? t("submit.create") : t("submit.update")}
        </Button>
      </div>
    </form>
  );
}
