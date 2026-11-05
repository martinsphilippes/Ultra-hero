import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { ArchiveTalentButton, CatalogSwitch, HeroLinkForm, RecordConsentForm, SegmentPicker, TalentForm } from "@/components/agency/CastingForms";
import { AccessPanel } from "@/components/agency/AccessPanel";
import { ImageAuthorizationNotice } from "@/components/catalog/ImageAuthorizationNotice";
import { InviteDialog } from "@/components/agency/InviteDialog";
import { CreateTalentPageButton } from "@/components/agency/NewHeroForm";
import { RevokeInviteButton } from "@/components/agency/RevokeInviteButton";
import { TalentAccessBadge } from "@/components/agency/TalentAccessBadge";
import type { Locale } from "@/i18n/config";
import { formatDate, formatDateTime } from "@/i18n/format";
import { loadAccessStatus } from "@/lib/agency/access-status";
import { agencyCan } from "@/lib/agency/roles";
import { needsImageAuthorization } from "@/lib/catalog/rights";
import { canInviteCreator, resolveTalentAccess } from "@/lib/talent/access";
import { listHeroOptions, listManagers, listSegments, listTalentAccess, listTalentDocuments, listTalentInvites } from "@/lib/talent/queries";
import { loadTalent } from "./_lib";
import { InvitesGate } from "@/components/invites/InvitesGate";
import { getInvitesEnabled } from "@/lib/invitations/flag";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("talent") };
}

type Props = { params: Promise<{ id: string }> };

// Resumo da ficha: dados (só a agência lê notas e contatos), segmentos, Hero e acesso ao escritório,
// consentimento e catálogo. Colaborador vê tudo sem editar (a RPC recusa com forbidden).
export default async function TalentSummaryPage({ params }: Props) {
  const { id } = await params;
  const { ctx, talent } = await loadTalent(id);
  const isManager = agencyCan(ctx.role, "manager", ctx.platformAdmin);
  const isAdmin = agencyCan(ctx.role, "admin", ctx.platformAdmin);
  const canEdit = isManager && !talent.archived;
  const locked = ctx.agency.isDemo;
  // acesso real do creator (0087): login próprio ou do Hero ligado; Hero sem conta NÃO é login
  const accessMap = talent.archived ? new Map() : await listTalentAccess(ctx.agency.id);
  const accessInfo = accessMap.get(talent.id);
  const access = resolveTalentAccess(accessInfo, talent);
  const hasLogin = access ? access === "login" : talent.hasLogin;
  // 0103: convites pausados escondem o "reenviar" (o aviso fica no lugar do botão principal)
  const invitesOn = await getInvitesEnabled();
  const canInvite = canInviteCreator({ access, canEdit, locked, heroActive: Boolean(talent.hero), hasHero: Boolean(talent.creatorId) });
  const [t, locale, managers, segments, heroes, documents, invites] = await Promise.all([
    getTranslations("agency.casting"),
    getLocale() as Promise<Locale>,
    listManagers(ctx.agency.id),
    listSegments(ctx.agency.id),
    canEdit && !talent.creatorId && !talent.userId && !locked ? listHeroOptions() : Promise.resolve([]),
    canEdit && !hasLogin ? listTalentDocuments(talent.id) : Promise.resolve([]),
    isManager && !hasLogin ? listTalentInvites(talent.id) : Promise.resolve([]),
  ]);
  // 0112: acesso do Hero (situação, e-mail e celular — só gestor+ e admin geral)
  const accessStatus = isManager && !talent.archived ? ((await loadAccessStatus(await createClient(), ctx.agency.id, "talent")).get(talent.id) ?? null) : null;
  const consentOk = talent.consent === "active";
  // Hero ligado de pessoa real sem autorização de imagem válida: aviso interno (o público não vê selo nenhum)
  const { data: heroRights } = talent.creatorId
    ? await (await createClient()).from("creator_profiles").select("is_fictional, rights_status, rights_valid_until").eq("id", talent.creatorId).maybeSingle()
    : { data: null };
  const needsRights = heroRights ? needsImageAuthorization(heroRights) : false;
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
          {talent.creatorId ? (
            // Hero ligado; suspenso ou pendente, a página dele não é pública e o nome não vem pela RLS
            <div className="flex flex-wrap items-center justify-between gap-2">
              {talent.hero ? (
                <p className="type-body-sm text-fg">
                  {t("heroLabel")}:{" "}
                  <a href={`/personalities/${talent.hero.slug}`} className="inline-flex items-center gap-1 font-semibold text-accent-text underline-offset-2 hover:underline">
                    {talent.hero.name}
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                </p>
              ) : (
                <p className="type-body-sm text-warning" data-testid="talent-hero-unavailable">
                  {t("heroUnavailable")}
                </p>
              )}
              <HeroLinkForm talentId={talent.id} heroes={[]} currentId={talent.creatorId} canEdit={canEdit} locked={locked} />
            </div>
          ) : null}
          {needsRights ? <ImageAuthorizationNotice audience="agency" href="#talent-consent" awaiting={consentOk} /> : null}
          {accessStatus && !locked ? (
            <div className="flex flex-col gap-2 rounded-xl border border-border p-3" data-testid="talent-account">
              <h3 className="text-sm font-semibold text-fg">{t("accountTitle")}</h3>
              <AccessPanel kind="talent" targetId={talent.id} status={accessStatus} />
            </div>
          ) : null}
          {!talent.creatorId && canEdit && !locked ? (
            <div className="flex flex-col gap-2">
              <p className="type-caption text-fg-muted">{t("noPageHint")}</p>
              <CreateTalentPageButton talentId={talent.id} talentName={talent.name} />
            </div>
          ) : null}
          {/* login do creator (0087): com ou sem Hero, a agência convida quem ainda não tem conta */}
          <div className="flex flex-col gap-3" data-testid="talent-access">
            <div className="flex flex-wrap items-center gap-2">
              <TalentAccessBadge access={access} />
              {hasLogin ? (
                <p className="type-body-sm text-fg" data-testid="talent-has-login">
                  {accessInfo?.loginEmail ? t("hasLoginAs", { email: accessInfo.loginEmail }) : t("hasLogin")}
                </p>
              ) : (
                <p className="type-body-sm text-fg-muted">{talent.creatorId ? t("heroNoLogin") : t("noLogin")}</p>
              )}
            </div>
            {!hasLogin && canEdit && locked ? (
              <p className="rounded-xl border border-dashed border-border px-3 py-2 type-caption text-fg-muted">{t("demoLockedInvite")}</p>
            ) : null}
            {canInvite || (!talent.creatorId && !hasLogin && canEdit && !locked) ? (
              <div className="flex flex-wrap gap-2">
                {canInvite ? (
                  <InvitesGate>
                    <InviteDialog target={{ kind: "talent", talentId: talent.id }} roles={[]} triggerLabel={talent.creatorId ? t("inviteCreator") : t("inviteTalent")} triggerVariant="secondary" />
                  </InvitesGate>
                ) : null}
                {!talent.creatorId ? <HeroLinkForm talentId={talent.id} heroes={heroes} currentId={null} canEdit={canEdit} locked={locked} /> : null}
              </div>
            ) : null}
            {invites.length > 0 ? (
              <ul className="flex flex-col gap-1" aria-label={t("pendingInvites")} data-testid="talent-invites">
                {invites.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
                    <span className="min-w-0 truncate">
                      {i.email} · <span className="text-fg-muted">{t("inviteUntil", { date: formatDate(i.expiresAt, locale) })}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      {canInvite && invitesOn ? (
                        <InviteDialog
                          target={{ kind: "talent", talentId: talent.id }}
                          roles={[]}
                          triggerLabel={t("resendInvite")}
                          triggerVariant="ghost"
                          initialEmail={i.email}
                          triggerTestId="invite-resend"
                        />
                      ) : null}
                      <RevokeInviteButton id={i.id} email={i.email} from="agency" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
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
          {hasLogin ? (
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
