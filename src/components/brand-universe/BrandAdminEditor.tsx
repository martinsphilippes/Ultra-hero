"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveBrandAdminAction } from "@/lib/brand-universe/actions";
import { Button, FormField, Input, Select } from "@/components/ui";

export type BrandInternal = { cpa: string | null; cpa_influencer: string | null; mid: string | null; official_phone: string | null; official_email: string | null };

type Props = {
  brandId: string;
  initial: { name: string; category: string | null; siteUrl: string; emailDomains: string[] };
  internal: BrandInternal | null;
  categories: Array<{ slug: string; name: string }>;
};

// Ficha da marca editada pela Groscove (0129): nome, categoria, site, domínios de e-mail e os dados internos.
export function BrandAdminEditor({ brandId, initial, internal, categories }: Props) {
  const t = useTranslations("brandUniverse.admin");
  const tc = useTranslations("brandUniverse");
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [category, setCategory] = useState(initial.category ?? "");
  const [site, setSite] = useState(initial.siteUrl);
  const [domains, setDomains] = useState(initial.emailDomains.join(", "));
  const [cpa, setCpa] = useState(internal?.cpa ?? "");
  const [cpaInf, setCpaInf] = useState(internal?.cpa_influencer ?? "");
  const [mid, setMid] = useState(internal?.mid ?? "");
  const [phone, setPhone] = useState(internal?.official_phone ?? "");
  const [email, setEmail] = useState(internal?.official_email ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="brand-admin-editor"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setMsg(null);
          const r = await saveBrandAdminAction({
            brandId,
            name,
            category,
            siteUrl: site,
            emailDomains: domains
              .split(/[\s,;]+/)
              .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
              .filter(Boolean),
            internal: { cpa, cpaInfluencer: cpaInf, mid, officialPhone: phone, officialEmail: email },
          });
          if (!r.ok) return setMsg({ ok: false, text: r.error });
          setMsg({ ok: true, text: t("saved") });
          router.refresh();
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required disabled={pending} />
        </FormField>
        <FormField label={t("category")}>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} disabled={pending} data-testid="brand-admin-category">
            <option value="">{tc("noCategory")}</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("site")}>
          <Input type="url" inputMode="url" value={site} onChange={(e) => setSite(e.target.value)} required disabled={pending} />
        </FormField>
        <FormField label={t("domains")} hint={t("domainsHint")}>
          <Input value={domains} onChange={(e) => setDomains(e.target.value)} disabled={pending} autoCapitalize="none" spellCheck={false} />
        </FormField>
      </div>
      <fieldset className="flex flex-col gap-3 rounded-2xl border border-dashed border-border-strong p-4">
        <legend className="px-1 text-sm font-semibold text-fg">{t("internalTitle")}</legend>
        <p className="type-caption text-fg-muted">{t("internalHint")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("cpa")}>
            <Input value={cpa} onChange={(e) => setCpa(e.target.value)} maxLength={80} disabled={pending} />
          </FormField>
          <FormField label={t("cpaInfluencer")}>
            <Input value={cpaInf} onChange={(e) => setCpaInf(e.target.value)} maxLength={80} disabled={pending} />
          </FormField>
          <FormField label={t("mid")}>
            <Input value={mid} onChange={(e) => setMid(e.target.value)} maxLength={40} disabled={pending} />
          </FormField>
          <FormField label={t("phone")}>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={120} disabled={pending} />
          </FormField>
          <FormField label={t("email")}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} disabled={pending} />
          </FormField>
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} data-testid="brand-admin-save">
          {t("save")}
        </Button>
        {msg ? (
          <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "type-body-sm text-success" : "type-body-sm text-danger"}>
            {msg.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}
