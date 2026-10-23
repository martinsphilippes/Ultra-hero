import { Scale } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/admin";
import { HeroBio } from "@/components/discover/personalities/HeroBio";
import { Avatar, Badge } from "@/components/ui";
import type { CreatorProfile } from "@/app/creator/_lib/creator";
import type { AvatarPhotoState } from "@/lib/avatar/availability";
import { heroAvatarSrc } from "@/lib/avatar/constants";
import { credentialsState, type CredentialsRequest } from "@/lib/recipes/credentials";
import { createClient } from "@/lib/supabase/server";
import { ChefProfileForm } from "./ChefProfileForm";
import { CreatorProfileForm } from "./CreatorProfileForm";
import { HERO_ANCHOR, HeroEditorDisclosure } from "./HeroEditorDisclosure";
import { socialsFrom } from "./profile-schema";

// Topo do /profile para o herói, no formato do Instagram: cabeçalho público (foto, nome, selo e bio
// recolhida), os Portais logo abaixo (na página) e "Editar perfil" com o editor recolhido.

/** Cabeçalho do herói: o que o público vê. Sem links aqui: o Portal do herói é o primeiro link da página. */
export async function HeroProfileHeader({ profile }: { profile: CreatorProfile }) {
  const [ts, tcat] = await Promise.all([getTranslations("adminCommon.status"), getTranslations("catalog")]);
  return (
    <section id={HERO_ANCHOR} aria-labelledby="hero-profile-name" data-testid="profile-hero" className="flex scroll-mt-20 flex-col gap-3">
      <div className="flex items-center gap-4">
        {/* o avatar único do herói: sem avatar, a ilustração da página pública (não a sorteada pelo nome) */}
        <Avatar src={heroAvatarSrc(profile.avatar_url)} name={profile.name} size="xl" alt="" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2 id="hero-profile-name" className="type-h3 break-words text-fg">
            {profile.name}
          </h2>
          <span className="flex flex-wrap items-center gap-1.5">
            {profile.is_fictional && (
              <Badge variant="demo" size="sm">
                {tcat("fictional")}
              </Badge>
            )}
            {/* status só quando foge do normal (suspenso, pendente) */}
            {profile.status !== "active" && <StatusBadge status={profile.status} label={ts(profile.status)} />}
          </span>
        </div>
      </div>
      <HeroBio headline={profile.headline} bio={profile.bio} />
    </section>
  );
}

type EditorProps = {
  profile: CreatorProfile;
  /** Perfil ativo e vinculado (my_creator_id): fora disso o editor fica somente leitura. */
  active: boolean;
  photoState: AvatarPhotoState;
};

/** "Editar perfil" e "Ver página pública" + o editor completo, recolhido por padrão. */
export async function HeroProfileEditor({ profile, active, photoState }: EditorProps) {
  const t = await getTranslations("creator.profile");
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
    <HeroEditorDisclosure publicHref={active ? `/personalities/${profile.slug}` : null}>
      {!active && (
        <p role="status" className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-fg">
          {t("inactiveNotice")}
        </p>
      )}

      <p className="type-caption text-fg-muted">{t("lockedFields")}</p>

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
        // um avatar só: foto e ilustração aqui valem no app e na página pública. Perfil inativo não
        // edita aqui; a foto do app continua em Dados (um seletor de foto por página)
        showPhotoPicker={active}
        photoState={photoState}
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
    </HeroEditorDisclosure>
  );
}
