import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { StartProfileButton } from "@/components/invites/StartProfileButton";
import { Button } from "@/components/ui";
import { isBusinessProfile, parseSignupProfile, loginPathFor, PROFILE_HOME, PROFILE_ONBOARDING_PATH } from "@/lib/auth/profile-signup";
import { getRoles, getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = Promise<{ perfil: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invites.start");
  return { title: t("metaTitle") };
}

const ROLE_OF = { hero: "creator", brand: "brand", agency: "agency" } as const;

// /comecar/heroi|marca|agencia (0103): quem já tem conta vira Herói, Marca ou Agência pelo mesmo passo a passo do
// cadastro. Passo em aberto: vai direto a ele. Já tem o papel: mostra o portal. Senão: explica e "Começar".
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
  const already = profile !== "brand" && roles.some((r) => r.role === ROLE_OF[profile]);
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
