import type { Metadata } from "next";
import { ExternalLink, Scale } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { StatusBadge } from "@/components/admin";
import { ChefProfileForm } from "@/components/creator/ChefProfileForm";
import { CreatorProfileForm } from "@/components/creator/CreatorProfileForm";
import { CreatorUnavailable } from "@/components/creator/CreatorUnavailable";
import { socialsFrom } from "@/components/creator/profile-schema";
import { Avatar, Badge, Button, PageHeader, PillarBadge } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getMyCreator } from "../_lib/creator";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("creator.profile");
  return { title: t("title") };
}

// Perfil da personalidade: colunas liberadas editáveis; rights_note somente leitura.
export default async function CreatorProfilePage() {
  const [t, tn, ts, tcat, ctx] = await Promise.all([getTranslations("creator"), getTranslations("nav"), getTranslations("adminCommon.status"), getTranslations("catalog"), getMyCreator()]);
  if (!ctx.profile) return <CreatorUnavailable reason="unlinked" title={t("profile.title")} />;
  const profile = ctx.profile;
  const active = ctx.creatorId !== null;
  // perfil de chef (0027): especialidades públicas e pedido de credenciais; sem as colunas, sem a seção
  const supabase = await createClient();
  const [chefRes, requestRes] = await Promise.all([
    supabase.from("creator_profiles").select("specialties, credentials, credentials_approved_at").eq("id", profile.id).maybeSingle(),
    supabase.from("creator_credentials_requests").select("text").eq("creator_id", profile.id).maybeSingle(),
  ]);
  const chef = chefRes.error ? null : (chefRes.data as { specialties: string[] | null; credentials: string | null; credentials_approved_at: string | null } | null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("profile.title")}
        description={t("profile.description")}
        eyebrow={tn("portals.creator")}
        actions={
          active ? (
            <Button asChild variant="secondary" trailingIcon={<ExternalLink />}>
              <Link href={`/personalities/${profile.slug}`}>{t("profile.viewPublic")}</Link>
            </Button>
          ) : undefined
        }
      >
        <div className="flex items-center gap-3">
          <Avatar src={profile.avatar_url} name={profile.name} size="lg" alt="" />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-base font-semibold text-fg">{profile.name}</span>
            <span className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={profile.status} label={ts(profile.status)} />
              {profile.is_fictional && <Badge variant="demo" size="sm">{tcat("fictional")}</Badge>}
              {profile.pillars.map((p) => (
                <PillarBadge tone="pillar" key={p} pillar={p} size="sm" />
              ))}
            </span>
          </div>
        </div>
      </PageHeader>

      {!active && (
        <p role="status" className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-fg">
          {t("profile.inactiveNotice")}
        </p>
      )}

      <p className="type-caption text-fg-muted">{t("profile.lockedFields")}</p>

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
      />

      {chef && (
        <ChefProfileForm
          specialties={chef.specialties ?? []}
          request={(requestRes.data as { text: string } | null)?.text ?? null}
          approved={chef.credentials_approved_at ? chef.credentials : null}
          readOnly={!active}
        />
      )}

      <section aria-labelledby="rights-note" className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-elevated p-4 sm:p-5">
        <h2 id="rights-note" className="flex items-center gap-2 text-base font-semibold text-fg">
          <Scale className="size-4 text-accent-text" aria-hidden="true" />
          {t("profile.rightsTitle")}
        </h2>
        <p className="type-body-sm text-fg-muted">{t("profile.rightsDescription")}</p>
        <p className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg">{profile.rights_note || t("profile.rightsEmpty")}</p>
      </section>
    </div>
  );
}
