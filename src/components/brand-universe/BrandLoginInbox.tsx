"use client";

import { BadgeCheck, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideBrandLoginAction } from "@/lib/brand-universe/actions";
import { Button } from "@/components/ui";
import { BrandLogo } from "./BrandLogo";

export type BrandLoginRequest = {
  id: string;
  brand: string;
  brand_id: string;
  logo_url: string | null;
  full_name: string;
  job_title: string | null;
  email: string;
  domain_matches: boolean;
  has_owner: boolean;
};

// Pedidos de login das marcas (0129): a Groscove confere o e-mail e aprova. O primeiro aprovado vira Dono.
export function BrandLoginInbox({ items, canDecide }: { items: BrandLoginRequest[]; canDecide: boolean }) {
  const t = useTranslations("brandUniverse.logins");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decide = (id: string, approve: boolean, role?: "owner" | "staff") =>
    start(async () => {
      setError(null);
      const r = await decideBrandLoginAction({ id, approve, role });
      if (!r.ok) return setError(r.error);
      router.refresh();
    });

  return (
    <section id="logins" className="flex scroll-mt-20 flex-col gap-3" data-testid="brand-login-inbox">
      <h2 className="type-h3 text-fg">{t("title", { count: items.length })}</h2>
      <p className="type-body-sm text-fg-muted">{t("hint")}</p>
      {items.length === 0 ? <p className="type-body-sm text-fg-muted">{t("empty")}</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((r) => (
          <li key={r.id} className="flex flex-col gap-3 rounded-2xl border-2 border-accent bg-surface p-4" data-testid="brand-login-request">
            <div className="flex items-start gap-3">
              <BrandLogo name={r.brand} url={r.logo_url} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="font-semibold text-fg">{r.brand}</p>
                <p className="text-sm text-fg">
                  {r.full_name}
                  {r.job_title ? ` · ${r.job_title}` : ""}
                </p>
                <p className="break-all text-sm text-fg-muted">{r.email}</p>
                {r.domain_matches ? (
                  <p className="inline-flex items-center gap-1 type-caption text-success">
                    <BadgeCheck className="size-3.5" aria-hidden="true" />
                    {t("domainOk")}
                  </p>
                ) : (
                  <p className="inline-flex items-center gap-1 type-caption text-warning">
                    <TriangleAlert className="size-3.5" aria-hidden="true" />
                    {t("domainNo")}
                  </p>
                )}
                <p className="type-caption text-fg-muted">{r.has_owner ? t("hasOwner") : t("noOwner")}</p>
              </div>
            </div>
            {canDecide ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={pending} onClick={() => decide(r.id, true)} data-testid="brand-login-approve">
                  {t("approve")}
                </Button>
                {!r.has_owner ? (
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => decide(r.id, true, "staff")}>
                    {t("approveStaff")}
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide(r.id, false)}>
                  {t("reject")}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
