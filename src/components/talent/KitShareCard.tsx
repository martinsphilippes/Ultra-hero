"use client";

import { Link2, Lock, TriangleAlert, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { CopyButton } from "@/components/admin-ops/CopyButton";
import { Button, FormField, Input, Select, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { revokeKitAction, shareKitAction } from "@/lib/talent/actions";
import { KIT_LINK_DAYS } from "@/lib/talent/vocab";

type Props = {
  portal: "agency" | "office";
  talentId: string;
  canEdit: boolean;
  /** Sem consentimento vigente: não gera link (critério 4). */
  consentOk: boolean;
  /** Agência de demonstração: só a prévia (D6). O texto vem do servidor (namespace fora do app). */
  lockedNote?: string | null;
  consentHref?: string | null;
  share: { active: boolean; expiresAt: string | null; viewCount: number; lastViewedAt: string | null };
};

// Link público do kit (/kit/<token>): validade de 7, 30 ou 90 dias; o link aparece UMA vez (o banco
// guarda só o hash). Revogar desliga na hora; o contador mostra as visitas do link atual.
export function KitShareCard({ portal, talentId, canEdit, consentOk, lockedNote, consentHref, share }: Props) {
  const t = useTranslations("mediaKit.share");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [days, setDays] = useState("30");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const blocked = Boolean(lockedNote) || !consentOk;

  function generate() {
    setError(null);
    start(async () => {
      const result = await shareKitAction(portal, { talentId, days: Number(days) });
      if (!result.ok) return setError(result.error);
      if (result.token) setLink(`${window.location.origin}/kit/${result.token}`);
      toast({ title: result.message, variant: "success" });
    });
  }

  function revoke() {
    if (!window.confirm(t("confirmRevoke"))) return;
    setError(null);
    start(async () => {
      const result = await revokeKitAction(portal, { talentId });
      if (!result.ok) return setError(result.error);
      setLink(null);
      toast({ title: result.message, variant: "success" });
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" aria-labelledby="kit-share" data-testid="kit-share">
      <h2 id="kit-share" className="flex items-center gap-2 text-sm font-semibold text-fg">
        <Link2 className="size-4" aria-hidden="true" />
        {t("title")}
      </h2>
      {share.active ? (
        <p className="type-body-sm text-fg" data-testid="kit-share-status">
          {t("activeUntil", { date: formatDateTime(share.expiresAt ?? "", locale) })}
          {" · "}
          {t("views", { count: share.viewCount })}
          {share.lastViewedAt ? ` · ${t("lastView", { date: formatDateTime(share.lastViewedAt, locale) })}` : ""}
        </p>
      ) : (
        <p className="type-body-sm text-fg-muted">{t("inactive")}</p>
      )}

      {lockedNote ? (
        <p className="flex items-start gap-2 rounded-xl border border-dashed border-border px-3 py-2 type-body-sm text-fg-muted" data-testid="kit-share-locked">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {lockedNote}
        </p>
      ) : !consentOk ? (
        <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 type-body-sm text-warning" data-testid="kit-share-consent">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {t("needsConsent")}{" "}
            {consentHref ? (
              <a href={consentHref} className="font-semibold underline underline-offset-2">
                {t("goConsent")}
              </a>
            ) : null}
          </span>
        </p>
      ) : null}

      {link ? (
        <div className="flex flex-col gap-2">
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t("linkOnce")}
          </p>
          <FormField label={t("link")}>
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" data-testid="kit-link" />
          </FormField>
          <CopyButton value={link} />
        </div>
      ) : null}

      {canEdit && !blocked ? (
        <div className="flex flex-wrap items-end gap-2">
          <FormField label={t("validity")} className="w-40">
            <Select value={days} onChange={(e) => setDays(e.target.value)} disabled={pending}>
              {KIT_LINK_DAYS.map((d) => (
                <option key={d} value={d}>
                  {t("days", { count: d })}
                </option>
              ))}
            </Select>
          </FormField>
          <Button type="button" onClick={generate} loading={pending} leadingIcon={<Link2 />} data-testid="kit-generate">
            {share.active ? t("regenerate") : t("generate")}
          </Button>
          {share.active ? (
            <Button type="button" variant="ghost" onClick={revoke} disabled={pending} leadingIcon={<XCircle />}>
              {t("revoke")}
            </Button>
          ) : null}
        </div>
      ) : canEdit && share.active ? (
        <Button type="button" variant="ghost" onClick={revoke} disabled={pending} leadingIcon={<XCircle />} className="w-fit">
          {t("revoke")}
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
