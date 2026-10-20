"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { createSeller, updateSeller, type SellerFormValues } from "@/app/admin/ops-actions";
import { Button, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import { slugify } from "./slugify";

const LOGOS = [1, 2, 3, 4].map((n) => `/placeholders/product-${n}.svg`);

type Props = { id?: string; initial?: Partial<SellerFormValues> };

// Formulário de organização fornecedora (criar/editar). Sempre fictícia na POC.
export function SellerForm({ id, initial }: Props) {
  const t = useTranslations("adminOps.sellers");
  const tc = useTranslations("common.actions");
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = useState<SellerFormValues>({
    name: initial?.name ?? "",
    slug: initial?.slug ?? "",
    kind: initial?.kind ?? "partner",
    description: initial?.description ?? "",
    logoUrl: initial?.logoUrl ?? LOGOS[0],
  });
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof SellerFormValues>(key: K, value: SellerFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = id ? await updateSeller(id, values) : await createSeller(values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({ title: result.message ?? t("form.updated"), variant: "success" });
      if (!id && "id" in result) router.push(`/admin/sellers/${result.id}`);
      else router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label={t("form.name")} required>
          <Input
            value={values.name}
            maxLength={80}
            disabled={pending}
            onChange={(e) => {
              set("name", e.target.value);
              if (!slugTouched) set("slug", slugify(e.target.value));
            }}
          />
        </FormField>
        <FormField label={t("form.slug")} hint={t("form.slugHint")} required>
          <Input
            value={values.slug}
            maxLength={80}
            disabled={pending}
            className="font-mono"
            onChange={(e) => {
              setSlugTouched(true);
              set("slug", slugify(e.target.value));
            }}
          />
        </FormField>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label={t("form.kind")} required>
          <Select value={values.kind} disabled={pending} onChange={(e) => set("kind", e.target.value as "own" | "partner")}>
            <option value="partner">{t("kind.partner")}</option>
            <option value="own">{t("kind.own")}</option>
          </Select>
        </FormField>
        <FormField label={t("form.logo")}>
          <Select value={values.logoUrl} disabled={pending} onChange={(e) => set("logoUrl", e.target.value)}>
            {LOGOS.map((src, i) => (
              <option key={src} value={src}>
                Placeholder {i + 1}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-elevated p-3">
        <span className="size-14 shrink-0 overflow-hidden rounded-lg border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={values.logoUrl} alt="" className="size-full object-cover" />
        </span>
        <span className="type-caption text-fg-muted">{values.slug || "—"}</span>
      </div>
      <FormField label={t("form.description")} error={error ?? undefined}>
        <Textarea value={values.description ?? ""} maxLength={1000} rows={4} disabled={pending} onChange={(e) => set("description", e.target.value)} />
      </FormField>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          {tc("cancel")}
        </Button>
        <Button type="submit" loading={pending}>
          {t("form.save")}
        </Button>
      </div>
    </form>
  );
}
