import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ConsentBanner } from "@/components/talent/ConsentBanner";
import { KitEditor } from "@/components/talent/KitEditor";
import { KitShareCard } from "@/components/talent/KitShareCard";
import { KitView } from "@/components/talent/KitView";
import { SocialEditor, type SocialItem } from "@/components/talent/SocialEditor";
import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { buildKit } from "@/lib/talent/media-kit";
import { getKit, kitSource, listSocial } from "@/lib/talent/queries";
import { consentActive, getTalentContext } from "@/lib/talent/server";

export const dynamic = "force-dynamic";

// E-mail de contato da agência do próprio talento (o mesmo que o /kit mostra em "contato").
async function talentAgencyEmail(): Promise<string | null> {
  const supabase = await createClient();
  const { data: agencyId } = await supabase.rpc("my_talent_agency_id");
  if (!agencyId) return null;
  const { data } = await supabase.from("agencies").select("contact_email").eq("id", agencyId).maybeSingle();
  return data?.contact_email ?? null;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("talent.meta");
  return { title: t("kit") };
}

// Media kit pelo próprio talento: texto e campos visíveis, redes declaradas, prévia igual ao /kit e
// o link público (só com consentimento; na agência de demonstração, só a prévia).
export default async function OfficeKitPage() {
  const ctx = await getTalentContext();
  if (ctx.state !== "ok") return null;
  const talent = ctx.talent;
  const [t, tv, user, kit, networks, agencyEmail] = await Promise.all([
    getTranslations("talent.kit"),
    getTranslations("talent.values"),
    getUser(),
    getKit(talent.id),
    listSocial(talent.id),
    talentAgencyEmail(),
  ]);
  const preview = buildKit(
    await kitSource({
      talentId: talent.id,
      name: talent.displayName,
      city: talent.city,
      state: talent.state,
      heroUserId: talent.hasPublicPage ? (user?.id ?? null) : null,
      agencyName: talent.agency,
      agencyEmail,
      kit,
      networks,
    }),
  );
  const consentOk = consentActive(talent);

  return (
    <div className="flex flex-col gap-5">
      {!consentOk ? <ConsentBanner /> : null}
      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="office-kit-edit">
            <h2 id="office-kit-edit" className="text-base font-semibold text-fg">
              {t("editor")}
            </h2>
            <KitEditor portal="office" talentId={talent.id} headline={kit.headline} about={kit.about} visibleFields={kit.visibleFields} canEdit />
          </section>
          <KitShareCard
            portal="office"
            talentId={talent.id}
            canEdit
            consentOk={consentOk}
            consentHref="/creator/escritorio/consentimento"
            lockedNote={talent.agencyIsDemo ? tv("demoLockedKit") : null}
            share={{ active: kit.shareActive, expiresAt: kit.shareExpiresAt, viewCount: kit.viewCount, lastViewedAt: kit.lastViewedAt }}
          />
        </div>
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-bg p-4 sm:p-5" aria-labelledby="office-kit-preview" data-testid="kit-preview">
          <h2 id="office-kit-preview" className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {t("preview")}
          </h2>
          <KitView kit={preview} headingLevel={2} />
        </section>
      </div>
      <section className="flex flex-col gap-3" aria-labelledby="office-networks">
        <h2 id="office-networks" className="text-base font-semibold text-fg">
          {t("networks")}
        </h2>
        <SocialEditor portal="office" talentId={talent.id} accounts={networks as SocialItem[]} canEdit />
      </section>
    </div>
  );
}
