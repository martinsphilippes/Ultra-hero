import { LogIn } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import type { SessionSummary } from "@/lib/auth/session";
import { SETTINGS_PATH } from "@/lib/settings/sections";
import { AccountMenu } from "./AccountMenu";

type UserMenuProps = { session: SessionSummary | null };

// Avatar → quadro da conta (nome, e-mail, função, Configurações e Sair). Sem sessão: botão de entrar.
export async function UserMenu({ session }: UserMenuProps) {
  const t = await getTranslations("nav.actions");
  const ta = await getTranslations("auth");

  if (!session) {
    return (
      <>
        <IconButton asChild label={t("login")} icon={<LogIn />} variant="ghost" className="md:hidden">
          <Link href="/login" />
        </IconButton>
        <Button asChild variant="primary" size="sm" leadingIcon={<LogIn />} className="hidden md:inline-flex">
          <Link href="/login">{t("login")}</Link>
        </Button>
      </>
    );
  }

  const tr = await getTranslations("invites.roles");
  const ROLE_ORDER = [
    ["admin", "admin"],
    ["agency", "agency"],
    ["brand", "brand"],
    ["creator", "hero"],
    ["professional", "professional"],
    ["seller", "seller"],
  ] as const;
  const roles = ROLE_ORDER.filter(([role]) => session.roles.includes(role)).map(([, key]) => tr(key));
  // sem função de trabalho: é a conta do público
  if (roles.length === 0) roles.push(tr("consumer"));

  return (
    <AccountMenu
      name={session.displayName}
      email={session.email}
      avatarUrl={session.avatarUrl}
      roles={roles}
      settingsHref={SETTINGS_PATH}
      labels={{
        open: t("accountOf", { name: session.displayName }),
        settings: t("settings"),
        signout: ta("signout"),
        role: t("accountRole"),
      }}
    />
  );
}
