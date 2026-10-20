import { LogIn, LogOut } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import type { SessionSummary } from "@/lib/auth/session";

type UserMenuProps = { session: SessionSummary | null };

// Avatar → perfil + sair (POST /auth/signout). Sem sessão: botão de entrar.
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

  return (
    <div className="flex items-center gap-1">
      <Link
        href="/profile"
        aria-label={t("account")}
        title={t("account")}
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-1 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Avatar src={session.avatarUrl} name={session.displayName} size="sm" alt="" />
        <span className="hidden max-w-32 truncate text-sm font-semibold lg:inline">{session.displayName}</span>
      </Link>
      <form action="/auth/signout" method="post" className="hidden md:block">
        <IconButton type="submit" label={ta("signout")} icon={<LogOut />} variant="ghost" size="sm" />
      </form>
    </div>
  );
}
