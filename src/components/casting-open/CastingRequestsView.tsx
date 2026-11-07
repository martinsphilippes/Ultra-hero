import { BadgeCheck, TriangleAlert } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { createClient } from "@/lib/supabase/server";
import { RequestDecision } from "./RequestDecision";

type AccessReq = { id: string; talent: string; talent_id: string; agency: string; note: string | null; created_at: string };
type ClaimReq = { id: string; talent: string; talent_id: string; email: string; email_matches: boolean; created_at: string };

// Pedidos ao casting da agência (0126), para o Adm: outras agências pedindo contato e valores; Heroes pedindo o
// próprio perfil ("É você?"), com o sinal de que o e-mail da conta é o mesmo do casting.
export async function CastingRequestsView({ agencyId }: { agencyId: string }) {
  const [t, locale, supabase] = await Promise.all([getTranslations("castingOpen.requests"), getLocale(), createClient()]);
  const [access, claims] = await Promise.all([
    supabase.rpc("casting_access_inbox", { p_agency: agencyId }),
    supabase.rpc("profile_claim_inbox", { p_agency: agencyId }),
  ]);
  const accessList = (Array.isArray(access.data) ? access.data : []) as AccessReq[];
  const claimList = (Array.isArray(claims.data) ? claims.data : []) as ClaimReq[];
  const card = "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4";
  return (
    <div className="flex flex-col gap-6" data-testid="casting-requests">
      <section className="flex flex-col gap-3">
        <h2 className="type-h3 text-fg">{t("claimsTitle", { count: claimList.length })}</h2>
        <p className="type-body-sm text-fg-muted">{t("claimsHint")}</p>
        {claimList.length === 0 ? <p className="type-body-sm text-fg-muted">{t("none")}</p> : null}
        <ul className="flex flex-col gap-3">
          {claimList.map((c) => (
            <li key={c.id} className={card}>
              <div className="flex flex-col gap-0.5">
                <a href={`/agencia/casting/${c.talent_id}`} className="font-semibold text-fg underline-offset-2 hover:underline">
                  {c.talent}
                </a>
                <p className="break-all text-sm text-fg-muted">{c.email}</p>
                <p className={`inline-flex items-center gap-1.5 text-sm ${c.email_matches ? "text-success" : "text-warning"}`}>
                  {c.email_matches ? <BadgeCheck className="size-4" aria-hidden="true" /> : <TriangleAlert className="size-4" aria-hidden="true" />}
                  {c.email_matches ? t("emailMatches") : t("emailDiffers")}
                </p>
                <p className="type-caption text-fg-subtle">{t("since", { date: formatDate(c.created_at, locale as Locale) })}</p>
              </div>
              <RequestDecision id={c.id} kind="claim" />
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="type-h3 text-fg">{t("accessTitle", { count: accessList.length })}</h2>
        <p className="type-body-sm text-fg-muted">{t("accessHint")}</p>
        {accessList.length === 0 ? <p className="type-body-sm text-fg-muted">{t("none")}</p> : null}
        <ul className="flex flex-col gap-3">
          {accessList.map((r) => (
            <li key={r.id} className={card}>
              <div className="flex flex-col gap-0.5">
                <p className="font-semibold text-fg">{t("accessLine", { agency: r.agency, talent: r.talent })}</p>
                {r.note ? <p className="text-sm text-fg-muted">“{r.note}”</p> : null}
                <p className="type-caption text-fg-subtle">{t("since", { date: formatDate(r.created_at, locale as Locale) })}</p>
              </div>
              <RequestDecision id={r.id} kind="access" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
