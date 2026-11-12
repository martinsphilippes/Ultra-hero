import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { ForcedPasswordChangeForm } from "@/components/auth/ForcedPasswordChangeForm";
import { Button } from "@/components/ui";
import { PENDING_PATH, readAccessClaims } from "@/lib/access/gate";
import { getUser } from "@/lib/auth/session";
import { LOGIN_HOME } from "@/lib/auth/safe-next";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.forcedChange");
  return { title: t("title") };
}

// Troca obrigatória da senha provisória no primeiro acesso (conta criada pela administração com uma senha combinada).
// O middleware e o requireUser trazem para cá enquanto o app_metadata tiver must_change_password; quem não tem mais a
// marca segue para a tela de status (pendente/recusada) ou para o app.
export default async function ForcedPasswordChangePage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const access = readAccessClaims(user.app_metadata);
  if (!access.mustChangePassword) redirect(access.status === "pending" || access.status === "rejected" ? PENDING_PATH : LOGIN_HOME);

  const t = await getTranslations("auth.forcedChange");
  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <div className="flex flex-col gap-4" data-testid="forced-password-change">
        {user.email ? (
          <p className="rounded-xl border border-border bg-bg px-4 py-3 type-body-sm text-fg-muted">
            {t("account")} <span className="font-semibold text-fg break-all">{user.email}</span>
          </p>
        ) : null}
        <ForcedPasswordChangeForm />
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="ghost" className="w-full" data-testid="forced-change-signout">
            {t("signOut")}
          </Button>
        </form>
      </div>
    </AuthCard>
  );
}
