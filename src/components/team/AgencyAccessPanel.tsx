import { Clock, MailX, ShieldX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { MemberProfileForm } from "./MemberProfileForm";

type Access = {
  domain_ok?: boolean;
  agency?: string | null;
  member?: boolean;
  request?: { status?: string; decision_note?: string | null; full_name?: string; job_title?: string; level?: string } | null;
};

// Primeiro acesso de quem escolheu "Agência" (0125): o e-mail precisa ser de um domínio autorizado; aí a pessoa envia o
// pedido (CNPJ, cargo, nível, termo) e espera os Adms. Mostra o estado: formulário, aguardando, recusado ou fora do domínio.
export async function AgencyAccessPanel() {
  const [t, supabase] = await Promise.all([getTranslations("team.access"), createClient()]);
  const { data } = await supabase.rpc("my_agency_access");
  const access = (data ?? {}) as Access;
  const agency = access.agency ?? "Groscove";

  if (access.member) {
    return (
      <Button asChild size="lg" block>
        <Link href="/agencia">{t("goPortal")}</Link>
      </Button>
    );
  }

  if (!access.domain_ok) {
    return (
      <div className="flex flex-col gap-4" data-testid="agency-access-domain">
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface-elevated p-4">
          <MailX className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-fg">{t("domainTitle")}</p>
            <p className="type-body-sm text-fg-muted">{t("domainBody")}</p>
          </div>
        </div>
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="secondary" size="lg" block>
            {t("signOut")}
          </Button>
        </form>
      </div>
    );
  }

  const status = access.request?.status;
  if (status === "pending") {
    return (
      <div className="flex flex-col gap-4" data-testid="agency-access-pending">
        <div className="flex items-start gap-3 rounded-2xl border-2 border-accent bg-accent-soft p-4">
          <Clock className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-fg">{t("pendingTitle")}</p>
            <p className="type-body-sm text-fg-muted">{t("pendingBody", { agency })}</p>
          </div>
        </div>
        <details className="rounded-2xl border border-border bg-surface p-4">
          <summary className="cursor-pointer text-sm font-semibold text-fg">{t("pendingEdit")}</summary>
          <div className="mt-4">
            <MemberProfileForm mode="request" initial={{ fullName: access.request?.full_name, jobTitle: access.request?.job_title, level: access.request?.level }} />
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="agency-access-request">
      {status === "rejected" ? (
        <div className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger-soft p-4">
          <ShieldX className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-fg">{t("rejectedTitle")}</p>
            <p className="type-body-sm text-fg-muted">{t("rejectedBody", { agency })}</p>
            {access.request?.decision_note ? <p className="type-body-sm text-fg">{t("rejectedNote", { note: access.request.decision_note })}</p> : null}
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <h2 className="type-h3 text-fg">{t("requestTitle", { agency })}</h2>
        <p className="type-body-sm text-fg-muted">{t("requestBody", { agency })}</p>
      </div>
      <MemberProfileForm mode="request" />
    </div>
  );
}
