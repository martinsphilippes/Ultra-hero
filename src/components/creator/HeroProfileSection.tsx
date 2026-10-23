import { ExternalLink, Scale, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { StatusBadge } from "@/components/admin";
import { Avatar, Badge, Button, PillarBadge } from "@/components/ui";
import type { CreatorProfile } from "@/app/creator/_lib/creator";
import { credentialsState, type CredentialsRequest } from "@/lib/recipes/credentials";
import { createClient } from "@/lib/supabase/server";
import { ChefProfileForm } from "./ChefProfileForm";
import { CreatorProfileForm } from "./CreatorProfileForm";
import { socialsFrom } from "./profile-schema";

type Props = {
  profile: CreatorProfile;
  /** Perfil ativo e vinculado (my_creator_id): fora disso a seção fica somente leitura. */
  active: boolean;
  /** Âncora da seção "Dados" do /profile, onde a foto é enviada/trocada. */
  dataAnchor: string;
};

// "Seu perfil de herói" dentro do /profile: o que antes ficava em /creator/profile (cabeçalho com o
// avatar público, formulário das colunas liberadas, perfil de chef e nota de direitos só leitura).
// A foto não é enviada aqui: uma só na página, em "Dados", e ela já vale nos dois lados.
export async function HeroProfileSection({ profile, active, dataAnchor }: Props) {
  const [t, ts, tcat] = await Promise.all([getTranslations("creator.profile"), getTranslations("adminCommon.status"), getTranslations("catalog")]);
  // perfil de chef (0027): especialidades públicas e pedido de credenciais; sem as colunas, sem a parte
  const supabase = await createClient();
  const requestQuery = (columns: string) => supabase.from("creator_credentials_requests").select(columns).eq("creator_id", profile.id).maybeSingle();
  const [chefRes, firstRequest] = await Promise.all([
    supabase.from("creator_profiles").select("specialties, credentials, credentials_approved_at").eq("id", profile.id).maybeSingle(),
    requestQuery("text, updated_at, decision"),
  ]);
  // banco sem a 0032 (sem a coluna decision): sem como saber da reprovação, fica "aguardando"
  const requestRes = firstRequest.error ? await requestQuery("text, updated_at") : firstRequest;
  const chef = chefRes.error ? null : (chefRes.data as { specialties: string[] | null; credentials: string | null; credentials_approved_at: string | null } | null);
  const request = (requestRes.data as unknown as CredentialsRequest | null) ?? null;

  return (
    <section id="perfil-publico" aria-labelledby="hero-profile-title" data-testid="profile-hero" className="flex scroll-mt-20 flex-col gap-5 rounded-2xl border border-accent/30 bg-surface-elevated p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg">
          <Sparkles className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="hero-profile-title" className="type-h3 text-fg">
            {t("title")}
          </h2>
          <p className="type-body-sm text-fg-muted">{t("description")}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar src={profile.avatar_url} name={profile.name} size="lg" alt="" />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-base font-semibold text-fg">{profile.name}</span>
            <span className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={profile.status} label={ts(profile.status)} />
              {profile.is_fictional && (
                <Badge variant="demo" size="sm">
                  {tcat("fictional")}
                </Badge>
              )}
              {profile.pillars.map((p) => (
                <PillarBadge tone="pillar" key={p} pillar={p} size="sm" />
              ))}
            </span>
          </div>
        </div>
        {active && (
          <Button asChild variant="secondary" trailingIcon={<ExternalLink />} className="sm:shrink-0">
            <Link href={`/personalities/${profile.slug}`}>{t("viewPublic")}</Link>
          </Button>
        )}
      </div>

      {!active && (
        <p role="status" className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-fg">
          {t("inactiveNotice")}
        </p>
      )}

      <p className="type-caption text-fg-muted">{t("lockedFields")}</p>
      {/* uma foto só na página: ela é enviada em "Dados" e já vale no avatar público */}
      <p className="type-body-sm text-fg-muted" data-testid="profile-hero-photo-note">
        {t.rich("photoInData", {
          link: (chunks) => (
            <a
              href={`#${dataAnchor}`}
              className="inline-flex min-h-11 items-center font-semibold text-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {chunks}
            </a>
          ),
        })}
      </p>

      <CreatorProfileForm
        initial={{
          headline: profile.headline ?? "",
          bio: profile.bio ?? "",
          avatar_url: profile.avatar_url ?? "",
          cover_url: profile.cover_url ?? "",
          socials: socialsFrom(profile.socials),
        }}
        pillars={profile.pillars}
        readOnly={!active}
        name={profile.name}
        showPhotoPicker={false}
      />

      {chef && (
        <ChefProfileForm
          specialties={chef.specialties ?? []}
          request={request?.text ?? null}
          status={request ? credentialsState(request, chef, undefined) : "none"}
          readOnly={!active}
        />
      )}

      <section aria-labelledby="rights-note" className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <h3 id="rights-note" className="flex items-center gap-2 text-base font-semibold text-fg">
          <Scale className="size-4 text-accent-text" aria-hidden="true" />
          {t("rightsTitle")}
        </h3>
        <p className="type-body-sm text-fg-muted">{t("rightsDescription")}</p>
        <p className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-fg">{profile.rights_note || t("rightsEmpty")}</p>
      </section>
    </section>
  );
}
