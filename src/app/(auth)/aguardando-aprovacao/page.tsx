import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { APP_ONLY_PATH } from "@/lib/access/gate";
import { getMyAccess } from "@/lib/access/presidency";
import { heroChannelBlocked } from "@/lib/access/server";
import { CHOOSABLE_PROFILES, type ChoosableProfile } from "@/lib/access/status";
import { getUser } from "@/lib/auth/session";
import { refreshAccessAction } from "./actions";
import { PendingProfileChooser } from "./PendingProfileChooser";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("access.meta");
  return { title: t("pending") };
}

// Tela de status do cadastro (0141): toda conta nova espera a Presidência. A pessoa confere quem é (nome, e-mail),
// o perfil pedido e quando pediu, atualiza a situação e, se entrou com Google/Apple sem escolher, diz o perfil.
// É a única tela que abre enquanto a conta está pendente ou recusada (middleware e requireUser levam para cá).
export default async function PendingApprovalPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  // Hero no navegador nem chega aqui (o middleware encerra a sessão); se chegar, vai para a mensagem do app
  const [t, locale, result, webBlocked] = await Promise.all([getTranslations("access"), getLocale() as Promise<Locale>, getMyAccess(), heroChannelBlocked()]);
  if (result.available && result.access.appOnly && webBlocked) redirect(APP_ONLY_PATH);

  const signOut = (
    <div className="flex flex-col gap-2">
      <form action="/auth/signout" method="post">
        <Button type="submit" variant="ghost" className="w-full" data-testid="pending-signout">
          {t("pending.signOut")}
        </Button>
      </form>
      {/* exclusão da conta sempre ao alcance, mesmo pendente ou recusada (lojas e LGPD) */}
      <Link href="/legal/account-deletion" className="self-center text-sm font-medium text-fg-muted underline-offset-2 hover:underline" data-testid="pending-delete-account">
        {t("pending.deleteAccount")}
      </Link>
    </div>
  );

  if (!result.available) {
    return (
      <AuthCard title={t("pending.title")} subtitle={t("pending.intro")}>
        <div className="flex flex-col gap-4" data-testid="pending-approval" data-status="unknown">
          <AuthAlert tone="error">{t("pending.unavailable")}</AuthAlert>
          <form action={refreshAccessAction}>
            <Button type="submit" variant="secondary" className="w-full">
              {t("pending.refresh")}
            </Button>
          </form>
          {signOut}
        </div>
      </AuthCard>
    );
  }

  const access = result.access;
  if (access.status === "approved") {
    return (
      <AuthCard title={t("pending.approvedTitle")} subtitle={t("pending.approvedText")}>
        <div className="flex flex-col gap-3" data-testid="pending-approval" data-status="approved">
          <form action={refreshAccessAction}>
            <Button type="submit" className="w-full" data-testid="pending-continue">
              {t("pending.continue")}
            </Button>
          </form>
          {signOut}
        </div>
      </AuthCard>
    );
  }

  if (access.status === "rejected") {
    return (
      <AuthCard title={t("pending.rejectedTitle")} subtitle={t("pending.rejectedText")}>
        <div className="flex flex-col gap-3" data-testid="pending-approval" data-status="rejected">
          {signOut}
        </div>
      </AuthCard>
    );
  }

  const rows: [string, string][] = [
    [t("pending.name"), access.name ?? "—"],
    [t("pending.email"), access.email ?? user.email ?? "—"],
    [t("pending.profile"), t(`profiles.${access.requestedProfile}`)],
    [t("pending.origin"), t(`origins.${access.origin}`)],
    [t("pending.requestedAt"), access.requestedAt ? formatDateTime(access.requestedAt, locale) : "—"],
  ];
  const current = (CHOOSABLE_PROFILES as readonly string[]).includes(access.requestedProfile) ? (access.requestedProfile as ChoosableProfile) : null;

  return (
    <AuthCard title={t("pending.title")} subtitle={t("pending.intro")}>
      <div className="flex flex-col gap-5" data-testid="pending-approval" data-status="pending">
        <section aria-labelledby="pending-identity" className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-4">
          <h2 id="pending-identity" className="text-sm font-semibold text-fg">
            {t("pending.identityTitle")}
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 type-body-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-fg-muted">{label}</dt>
                <dd className="min-w-0 break-words font-medium text-fg">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        {!access.profileConfirmed ? <PendingProfileChooser profiles={CHOOSABLE_PROFILES} current={current} /> : null}
        <form action={refreshAccessAction}>
          <Button type="submit" className="w-full" data-testid="pending-refresh">
            {t("pending.refresh")}
          </Button>
        </form>
        {signOut}
      </div>
    </AuthCard>
  );
}
