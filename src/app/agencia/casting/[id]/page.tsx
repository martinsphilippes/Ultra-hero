import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { ArchiveTalentButton, CatalogSwitch, HeroLinkForm, RecordConsentForm, SegmentPicker, TalentForm } from "@/components/agency/CastingForms";
import { InviteDialog } from "@/components/agency/InviteDialog";
import { RevokeInviteButton } from "@/components/agency/RevokeInviteButton";
import type { Locale } from "@/i18n/config";
import { formatDate, formatDateTime } from "@/i18n/format";
import { agencyCan } from "@/lib/agency/roles";
import { listHeroOptions, listManagers, listSegments, listTalentDocuments, listTalentInvites } from "@/lib/talent/queries";
import { loadTalent } from "./_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("talent") };
}

type Props = { params: Promise<{ id: string }> };

// Resumo da ficha: dados (só a agência lê notas e contatos), segmentos, herói e acesso ao escritório,
// consentimento e catálogo. Colaborador vê tudo sem editar (a RPC recusa com forbidden).
export default async function TalentSummaryPage({ params }: Props) {
  const { id } = await params;
  const { ctx, talent } = await loadTalent(id);
  const isManager = agencyCan(ctx.role, "manager", ctx.platformAdmin);
  const isAdmin = agencyCan(ctx.role, "admin", ctx.platformAdmin);
  const canEdit = isManager && !talent.archived;
  const locked = ctx.agency.isDemo;
  const [t, locale, managers, segments, heroes, documents, invites] = await Promise.all([
    getTranslations("agency.casting"),
    getLocale() as Promise<Locale>,
    listManagers(ctx.agency.id),
    listSegments(ctx.agency.id),
    canEdit && !talent.creatorId && !talent.userId && !locked ? listHeroOptions() : Promise.resolve([]),
    canEdit && !talent.hasLogin ? listTalentDocuments(talent.id) : Promise.resolve([]),
    isManager && !talent.hasLogin ? listTalentInvites(talent.id) : Promise.resolve([]),
  ]);
  const consentOk = talent.consent === "active";
  const card = "flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5";

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <section className={card} aria-labelledby="talent-data">
        <h2 id="talent-data" className="text-base font-semibold text-fg">
          {t("sections.data")}
        </h2>
        <TalentForm
          initial={{
            id: talent.id,
            displayName: talent.name,
            city: talent.city ?? "",
            state: talent.state ?? "",
            managerId: talent.managerId ?? "",
            commercialStatus: talent.commercialStatus,
            availability: talent.availability,
            availabilityNote: talent.availabilityNote,
            contactEmail: talent.contactEmail ?? "",
            contactPhone: talent.contactPhone ?? "",
            internalNotes: talent.internalNotes,
            lastContactAt: talent.lastContactAt ? talent.lastContactAt.slice(0, 10) : "",
          }}
          managers={managers}
          canEdit={canEdit}
        />
      </section>

      <div className="flex flex-col gap-5">
        <section className={card} aria-labelledby="talent-segments">
          <h2 id="talent-segments" className="text-base font-semibold text-fg">
            {t("segmentsTitle")}
          </h2>
          {segments.length > 0 ? (
            <SegmentPicker talentId={talent.id} segments={segments.map((s) => ({ id: s.id, name: s.name }))} selected={talent.segmentIds} canEdit={canEdit} />
          ) : (
            <p className="type-body-sm text-fg-muted">{t("noSegmentsAgency")}</p>
          )}
        </section>

        <section className={card} aria-labelledby="talent-access">
          <h2 id="talent-access" className="text-base font-semibold text-fg">
            {t("sections.access")}
          </h2>
          {talent.hero ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="type-body-sm text-fg">
                {t("heroLabel")}:{" "}
                <a href={`/personalities/${talent.hero.slug}`} className="inline-flex items-center gap-1 font-semibold text-accent-text underline-offset-2 hover:underline">
                  {talent.hero.name}
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              </p>
              <HeroLinkForm talentId={talent.id} heroes={[]} currentId={talent.creatorId} canEdit={canEdit} locked={locked} />
            </div>
          ) : talent.userId ? (
            <p className="type-body-sm text-fg" data-testid="talent-has-login">
              {t("hasLogin")}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="type-body-sm text-fg-muted">{t("noLogin")}</p>
              {canEdit ? (
                locked ? (
                  <p className="rounded-xl border border-dashed border-border px-3 py-2 type-caption text-fg-muted">{t("demoLockedInvite")}</p>
                ) : (
                  <>
                    <InviteDialog target={{ kind: "talent", talentId: talent.id }} roles={[]} triggerLabel={t("inviteTalent")} triggerVariant="secondary" />
                    <HeroLinkForm talentId={talent.id} heroes={heroes} currentId={null} canEdit={canEdit} locked={locked} />
                  </>
                )
              ) : null}
              {invites.length > 0 ? (
                <ul className="flex flex-col gap-1" aria-label={t("pendingInvites")}>
                  {invites.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
                      <span className="min-w-0 truncate">
                        {i.email} · <span className="text-fg-muted">{t("inviteUntil", { date: formatDate(i.expiresAt, locale) })}</span>
                      </span>
                      <RevokeInviteButton id={i.id} email={i.email} from="agency" />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </section>

        <section className={card} aria-labelledby="talent-consent">
          <h2 id="talent-consent" className="text-base font-semibold text-fg">
            {t("sections.consent")}
          </h2>
          <p className="type-body-sm text-fg" data-testid="talent-consent-text">
            {consentOk && talent.consentAt
              ? t("consentGiven", { date: formatDateTime(talent.consentAt, locale), version: talent.consentVersion ?? "" })
              : talent.consent === "revoked" && talent.consentRevokedAt
                ? t("consentRevokedAt", { date: formatDateTime(talent.consentRevokedAt, locale) })
                : t("consentNone")}
          </p>
          {talent.hasLogin ? (
            <p className="type-caption text-fg-muted">{t("consentByTalent")}</p>
          ) : canEdit && !consentOk ? (
            locked ? (
              <p className="type-caption text-fg-muted">{t("demoLockedConsent")}</p>
            ) : (
              <RecordConsentForm talentId={talent.id} documents={documents.map((d) => ({ id: d.id, title: d.title }))} />
            )
          ) : null}
          <CatalogSwitch talentId={talent.id} visible={talent.catalogVisible} consentOk={consentOk} canEdit={canEdit} />
        </section>

        {isAdmin && !talent.archived ? (
          <section className={card} aria-labelledby="talent-archive">
            <h2 id="talent-archive" className="text-base font-semibold text-fg">
              {t("sections.archive")}
            </h2>
            <p className="type-body-sm text-fg-muted">{t("archiveHint")}</p>
            <ArchiveTalentButton talentId={talent.id} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
