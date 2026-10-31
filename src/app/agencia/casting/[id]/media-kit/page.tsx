import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { KitEditor } from "@/components/talent/KitEditor";
import { KitShareCard } from "@/components/talent/KitShareCard";
import { KitView } from "@/components/talent/KitView";
import { agencyCan } from "@/lib/agency/roles";
import { buildKit } from "@/lib/talent/media-kit";
import { getKit, kitSource, listSocial } from "@/lib/talent/queries";
import { loadTalent } from "../_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("talentKit") };
}

type Props = { params: Promise<{ id: string }> };

// Media kit pela agência: editor, prévia igual ao /kit e o link público (só com consentimento; na
// agência de demonstração, só a prévia).
export default async function TalentKitPage({ params }: Props) {
  const { id } = await params;
  const { ctx, talent } = await loadTalent(id);
  const [t, kit, networks] = await Promise.all([getTranslations("agency.casting"), getKit(talent.id), listSocial(talent.id)]);
  const preview = buildKit(
    await kitSource({
      talentId: talent.id,
      name: talent.name,
      city: talent.city,
      state: talent.state,
      creatorId: talent.creatorId,
      agencyName: ctx.agency.name,
      agencyEmail: ctx.agency.contactEmail,
      kit,
      networks,
    }),
  );
  const canEdit = agencyCan(ctx.role, "manager", ctx.platformAdmin) && !talent.archived;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="kit-edit">
          <h2 id="kit-edit" className="text-base font-semibold text-fg">
            {t("kitEditor")}
          </h2>
          <KitEditor portal="agency" talentId={talent.id} headline={kit.headline} about={kit.about} visibleFields={kit.visibleFields} canEdit={canEdit} />
        </section>
        <KitShareCard
          portal="agency"
          talentId={talent.id}
          canEdit={canEdit}
          consentOk={talent.consent === "active"}
          lockedNote={ctx.agency.isDemo ? t("demoLockedKit") : null}
          share={{ active: kit.shareActive, expiresAt: kit.shareExpiresAt, viewCount: kit.viewCount, lastViewedAt: kit.lastViewedAt }}
        />
      </div>
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-bg p-4 sm:p-5" aria-labelledby="kit-preview" data-testid="kit-preview">
        <h2 id="kit-preview" className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          {t("kitPreview")}
        </h2>
        <KitView kit={preview} headingLevel={2} />
      </section>
    </div>
  );
}
