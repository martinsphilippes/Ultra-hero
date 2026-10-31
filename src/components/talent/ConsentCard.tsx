"use client";

import { ShieldCheck, ShieldOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { setConsentAction } from "@/app/creator/escritorio/actions";
import { Badge, Button, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";

type Props = { consentAt: string | null; consentRevokedAt: string | null; consentVersion: string | null; currentVersion: string };

// Termo de uso comercial (LGPD): sem ele não há link público do kit nem catálogo para marcas.
// Revogar desliga os dois na hora (o banco revoga o link e tira do catálogo).
export function ConsentCard({ consentAt, consentRevokedAt, consentVersion, currentVersion }: Props) {
  const t = useTranslations("talent.consent");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const active = Boolean(consentAt) && !consentRevokedAt;
  const outdated = active && consentVersion !== currentVersion;

  function change(on: boolean) {
    if (!on && !window.confirm(t("confirmRevoke"))) return;
    start(async () => {
      const result = await setConsentAction({ on });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="consent-title" data-testid="consent-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="consent-title" className="flex items-center gap-2 text-base font-semibold text-fg">
          {active ? <ShieldCheck className="size-5 text-success" aria-hidden="true" /> : <ShieldOff className="size-5 text-fg-subtle" aria-hidden="true" />}
          {t("title")}
        </h2>
        <Badge variant={active ? "success" : "neutral"} size="sm" data-testid="consent-state">
          {active ? t("stateOn") : consentRevokedAt ? t("stateRevoked") : t("stateOff")}
        </Badge>
      </div>
      <div className="flex flex-col gap-2 type-body-sm text-fg">
        <p>{t("intro")}</p>
        <ul className="ml-4 list-disc space-y-1 text-fg-muted">
          <li>{t("item1")}</li>
          <li>{t("item2")}</li>
          <li>{t("item3")}</li>
          <li>{t("item4")}</li>
        </ul>
        <p className="type-caption text-fg-muted">{t("version", { version: currentVersion })}</p>
      </div>
      {active && consentAt ? <p className="type-caption text-fg-muted">{t("givenAt", { date: formatDateTime(consentAt, locale), version: consentVersion ?? "" })}</p> : null}
      {!active && consentRevokedAt ? <p className="type-caption text-fg-muted">{t("revokedAt", { date: formatDateTime(consentRevokedAt, locale) })}</p> : null}
      {outdated ? <p className="type-body-sm text-warning">{t("outdated")}</p> : null}
      <div className="flex flex-wrap gap-2">
        {!active || outdated ? (
          <Button type="button" onClick={() => change(true)} loading={pending} leadingIcon={<ShieldCheck />} data-testid="consent-accept">
            {t("accept")}
          </Button>
        ) : null}
        {active ? (
          <Button type="button" variant="ghost" onClick={() => change(false)} disabled={pending} leadingIcon={<ShieldOff />} data-testid="consent-revoke">
            {t("revoke")}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
