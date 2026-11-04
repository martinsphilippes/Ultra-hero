import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { StartProfileButton } from "@/components/invites/StartProfileButton";
import { Button } from "@/components/ui";
import { businessKindOfRoles } from "@/lib/auth/profile-conflict";
import { isBusinessProfile, parseSignupProfile, loginPathFor, PROFILE_HOME, PROFILE_ONBOARDING_PATH } from "@/lib/auth/profile-signup";
import { getRoles, getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = Promise<{ perfil: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invites.start");
  return { title: t("metaTitle") };
}

// /comecar/heroi|marca|agencia (0103): continuação do cadastro por perfil depois de entrar ("Já tenho conta" com o
// perfil escolhido na entrada e o Google). Passo em aberto: vai direto a ele. Já tem o perfil: mostra o portal.
// 0116 (um e-mail, um perfil de negócio): conta que já é de OUTRO tipo vê o motivo e o próprio portal, sem "Começar".
// Não há mais link para cá de dentro do app (a seção "Novo perfil" das Configurações saiu).
export default async function StartProfilePage({ params }: { params: Params }) {
  const { perfil } = await params;
  const profile = parseSignupProfile(perfil);
  if (!profile || !isBusinessProfile(profile)) notFound();
  // sem sessão: a entrada já com o perfil escolhido (criar conta ou "Já tenho conta" volta para cá)
  if (!(await getUser())) redirect(loginPathFor(profile));
  const [t, roles, supabase] = await Promise.all([getTranslations("invites.start"), getRoles(), createClient()]);
  const { data } = await supabase.rpc("onboarding_pending");
  const open = (Array.isArray(data) ? data : []).some((x) => (x as { kind?: string }).kind === profile);
  if (open) redirect(PROFILE_ONBOARDING_PATH);

  // agência e herói: um por conta; marca: dá para ser Equipe de outra, mas Dono só de uma (o banco confere)
  const roleNames = roles.map((r) => r.role as string);
  const current = roleNames.includes("admin") ? null : businessKindOfRoles(roleNames);
  if (current && current !== profile) {
    return (
      <AuthCard title={t(`${profile}.title`)} subtitle={t("errors.profile_conflict", { kind: current })}>
        <div className="flex flex-col gap-3" data-testid="start-profile-conflict">
          <Button asChild size="lg" block>
            <Link href={PROFILE_HOME[current]}>{t(`${current}.go`)}</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }
  const already = profile !== "brand" && current === profile;
  return (
    <AuthCard title={t(`${profile}.title`)} subtitle={already ? t("alreadyText") : t(`${profile}.text`)}>
      {already ? (
        <Button asChild size="lg" block>
          <Link href={PROFILE_HOME[profile]}>{t(`${profile}.go`)}</Link>
        </Button>
      ) : (
        <div className="flex flex-col gap-4" data-testid={`start-${profile}`}>
          <ul className="flex flex-col gap-2 type-body-sm text-fg-muted">
            {(["1", "2", "3"] as const).map((n) => (
              <li key={n} className="flex gap-2">
                <span aria-hidden="true" className="font-semibold text-accent-text">
                  {n}.
                </span>
                {t(`${profile}.step${n}`)}
              </li>
            ))}
          </ul>
          <StartProfileButton profile={profile} label={t("start")} />
          <Button asChild variant="ghost" block>
            <Link href="/configuracoes">{t("notNow")}</Link>
          </Button>
        </div>
      )}
    </AuthCard>
  );
}
