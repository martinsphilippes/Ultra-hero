"use client";

import { Link2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { createBrandAction, linkBrandAction, type BrandCreateResult } from "@/app/agencia/marcas/actions";
import { AccessContactFields, AccessOutcomeNote } from "@/components/agency/AccessPanel";
import { Button, EntitySelect, FormField, Input, Textarea } from "@/components/ui";
import { normalizeAccessEmail } from "@/lib/agency/access-contact";
import { normalizeBrMobile } from "@/lib/auth/phone";
import { slugFromName } from "@/lib/agency/schemas";
import { brandOption } from "@/lib/ui/entity";

// Cadastro de marca pela agência (nasce fora do app, D7) e vínculo de marca que já existe no app.
export function BrandCreateForm({ demo }: { demo: boolean }) {
  const t = useTranslations("agency.brands.form");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [siteUrl, setSiteUrl] = useState("https://");
  const [logoUrl, setLogoUrl] = useState("");
  // 0126: para a Groscove aprovar a marca nova (o que a marca quer fazer e o print/página oficial)
  const [intent, setIntent] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  // 0112: o acesso do contato da marca nasce junto (fora da agência de exemplo)
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [done, setDone] = useState<Extract<BrandCreateResult, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ta = useTranslations("agency.access");

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!demo) {
      if (contactName.trim().length < 2) return setError(ta("brand.nameRequired"));
      if (!normalizeAccessEmail(email)) return setError(ta("brand.emailInvalid"));
      if (!normalizeBrMobile(phone)) return setError(ta("phoneInvalid"));
    }
    start(async () => {
      const result = await createBrandAction({
        name: name.trim(),
        slug: slug || slugFromName(name),
        siteUrl: siteUrl.trim(),
        logoUrl: logoUrl.trim(),
        intent: intent.trim(),
        evidenceUrl: evidenceUrl.trim(),
        ...(demo ? {} : { contactName, email, phone }),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // com acesso: mostra o que aconteceu (e o link, se o e-mail não saiu) antes de abrir a marca
      if (result.account) return setDone(result);
      if (result.id) window.location.assign(`/agencia/marcas/${result.id}`);
    });
  }

  if (done && done.account) {
    return (
      <div className="flex flex-col gap-4" data-testid="brand-created">
        <AccessOutcomeNote outcome={{ account: done.account, link: done.link ?? null, emailed: done.emailed ?? false, message: done.message }} />
        {done.id ? (
          <Button type="button" className="w-fit" onClick={() => window.location.assign(`/agencia/marcas/${done.id}`)}>
            {ta("brand.openBrand")}
          </Button>
        ) : null}
      </div>
    );
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
      {demo ? null : (
        <fieldset className="flex flex-col gap-4 rounded-xl border border-border p-3" data-testid="brand-approval-fields">
          <legend className="px-1 text-sm font-semibold text-fg">{t("approvalTitle")}</legend>
          <p className="type-caption text-fg-muted">{t("approvalHint")}</p>
          <FormField label={t("intent")} hint={t("intentHint")}>
            <Textarea value={intent} onChange={(e) => setIntent(e.target.value)} maxLength={1000} rows={3} disabled={pending} />
          </FormField>
          <FormField label={t("evidence")} hint={t("evidenceHint")}>
            <Input type="url" inputMode="url" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} disabled={pending} placeholder="https://" />
          </FormField>
        </fieldset>
      )}
      {demo ? null : (
        <fieldset className="flex flex-col gap-4 rounded-xl border border-border p-3">
          <legend className="px-1 text-sm font-semibold text-fg">{ta("brand.contactTitle")}</legend>
          <p className="type-caption text-fg-muted">{ta("brand.contactHint")}</p>
          <FormField label={ta("contactName")} required>
            <Input value={contactName} maxLength={80} autoComplete="off" onChange={(e) => setContactName(e.target.value)} disabled={pending} data-testid="brand-contact-name" />
          </FormField>
          <AccessContactFields email={email} phone={phone} onEmail={setEmail} onPhone={setPhone} disabled={pending} emailLabel={ta("email")} emailHint={ta("brand.emailHint")} />
        </fieldset>
      )}
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

export function BrandLinkForm({ brands }: { brands: Array<{ id: string; name: string; logoUrl?: string | null; siteUrl?: string | null }> }) {
  const t = useTranslations("agency.brands.link");
  const tp = useTranslations("pickers");
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (brands.length === 0) return <p className="type-body-sm text-fg-muted">{t("none")}</p>;
  return (
    <div className="flex flex-col gap-3">
      <FormField label={t("label")} hint={tp("hints.brandLink")}>
        <EntitySelect value={brandId} onChange={(e) => setBrandId(e.target.value)} disabled={pending} roleInOption={false} options={brands.map((b) => brandOption(tp, { ...b, detail: b.siteUrl?.replace(/^https?:\/\//, "") ?? null }))} />
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
