"use client";

import { Link2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { createBrandAction, linkBrandAction } from "@/app/agencia/marcas/actions";
import { Button, FormField, Input, Select } from "@/components/ui";
import { slugFromName } from "@/lib/agency/schemas";

// Cadastro de marca pela agência (nasce fora do app, D7) e vínculo de marca que já existe no app.
export function BrandCreateForm({ demo }: { demo: boolean }) {
  const t = useTranslations("agency.brands.form");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [siteUrl, setSiteUrl] = useState("https://");
  const [logoUrl, setLogoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    start(async () => {
      const result = await createBrandAction({ name: name.trim(), slug: slug || slugFromName(name), siteUrl: siteUrl.trim(), logoUrl: logoUrl.trim() });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.id) window.location.assign(`/agencia/marcas/${result.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate data-testid="brand-create-form">
      <FormField label={t("name")} required>
        <Input
          value={name}
          maxLength={60}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugFromName(e.target.value));
          }}
          disabled={pending}
        />
      </FormField>
      <FormField label={t("slug")} hint={demo ? t("slugDemoHint") : t("slugHint")} required>
        <Input
          value={slug}
          maxLength={60}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value.toLowerCase());
          }}
          disabled={pending}
          className="font-mono"
        />
      </FormField>
      <FormField label={t("site")} hint={t("siteHint")} required>
        <Input type="url" inputMode="url" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} disabled={pending} />
      </FormField>
      <FormField label={t("logo")} hint={t("logoHint")}>
        <Input type="url" inputMode="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} disabled={pending} placeholder="https://" />
      </FormField>
      <p className="type-caption text-fg-muted">{t("privacyNote")}</p>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" leadingIcon={<Plus />} loading={pending} disabled={!name.trim()} className="w-fit">
        {t("submit")}
      </Button>
    </form>
  );
}

export function BrandLinkForm({ brands }: { brands: Array<{ id: string; name: string }> }) {
  const t = useTranslations("agency.brands.link");
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (brands.length === 0) return <p className="type-body-sm text-fg-muted">{t("none")}</p>;
  return (
    <div className="flex flex-col gap-3">
      <FormField label={t("label")} hint={t("hint")}>
        <Select value={brandId} onChange={(e) => setBrandId(e.target.value)} disabled={pending}>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </FormField>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        leadingIcon={<Link2 />}
        loading={pending}
        className="w-fit"
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await linkBrandAction({ brandId, on: true });
            if (!result.ok) setError(result.error);
            else window.location.assign(`/agencia/marcas/${brandId}`);
          })
        }
      >
        {t("submit")}
      </Button>
    </div>
  );
}

export function BrandArchiveButton({ brandId, active }: { brandId: string; active: boolean }) {
  const t = useTranslations("agency.brands");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await linkBrandAction({ brandId, on: !active });
            if (!result.ok) setError(result.error);
            else window.location.reload();
          })
        }
      >
        {active ? t("archive") : t("reactivate")}
      </Button>
      {error ? (
        <p role="alert" className="type-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
