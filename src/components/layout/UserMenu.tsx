import { LogIn, LogOut } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import type { SessionSummary } from "@/lib/auth/session";
import { SETTINGS_PATH } from "@/lib/settings/sections";

type UserMenuProps = { session: SessionSummary | null };

// Avatar → Configurações (/configuracoes; de lá, portais, conta e sair) + sair no desktop
// (POST /auth/signout). Sem sessão: botão de entrar.
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
        href={SETTINGS_PATH}
        title={t("settings")}
        data-testid="header-settings-link"
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-1 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {/* iniciais fora do nome acessível (senão o leitor lia "CG Configurações…") */}
        <span aria-hidden="true" className="contents">
          <Avatar src={session.avatarUrl} name={session.displayName} size="sm" alt="" />
        </span>
        {/* nome acessível pelo conteúdo (com aria-label o nome visível ficava fora dele, axe): o texto
            oculto já traz o nome; o nome visível no desktop fica fora da árvore para não repetir */}
        <span className="sr-only">{t("settingsOf", { name: session.displayName })}</span>
        <span aria-hidden="true" className="hidden max-w-32 truncate text-sm font-semibold lg:inline">
          {session.displayName}
        </span>
      </Link>
      <form action="/auth/signout" method="post" className="hidden md:block">
        <IconButton type="submit" label={ta("signout")} icon={<LogOut />} variant="ghost" size="sm" />
      </form>
    </div>
  );
}
