"use client";

import { Mail, ShieldAlert, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition, type FormEvent } from "react";
import { adminInviteAction, type AdminInviteLink } from "@/app/admin/invitations/actions";
import { createInvitation } from "@/app/admin/ops-actions";
import { Button, Checkbox, Dialog, EntitySelect, FormField, Input, Select } from "@/components/ui";
import {
  ADMIN_INVITE_ROLES,
  adminInviteFields,
  clampDays,
  defaultDaysFor,
  maxDaysFor,
  validateAdminInvite,
  type AdminInviteError,
  type AdminInviteRole,
  type HeroMode,
  type TeamMode,
} from "@/lib/invitations/rules";
import { heroOption } from "@/lib/ui/entity";
import { CopyButton } from "./CopyButton";

export type CreatorOption = { id: string; name: string; linked: boolean; slug?: string | null; avatarUrl?: string | null };
export type SellerOption = { id: string; name: string };
/** Pessoa com papel de herói (para entrar na equipe de um herói). */
export type CreatorUserOption = { id: string; name: string; email?: string | null };
/** Ficha do casting que pode receber o convite de acesso (0097). */
export type TalentOption = { id: string; name: string; agency: string; hasHero: boolean };

type Props = {
  creators: CreatorOption[];
  creatorUsers: CreatorUserOption[];
  talents?: TalentOption[];
  sellers: SellerOption[];
  /** Pré-preenchimento (ex.: botão "convidar" no herói ou na organização). */
  initialRole?: AdminInviteRole;
  initialCreatorId?: string;
  initialSellerId?: string;
  /** Abre o diálogo já na montagem (ex.: ?new=1). */
  defaultOpen?: boolean;
  triggerLabel?: string;
};

const DAY_CHOICES = [1, 2, 3, 7, 14, 30] as const;

// Convite do admin (0091 + 0097): só e-mail, papel (7) e validade. Herói escolhe: herói novo (pendente, com equipe
// opcional), entrar na equipe de um herói existente ou herói já no casting de uma agência (acesso à ficha). Admin pede
// confirmação extra e vale no máximo 48h. Os links aparecem UMA vez (o banco só guarda o hash).
export function InvitationForm({ creators, creatorUsers, talents = [], sellers, initialRole = "hero", initialCreatorId = "", initialSellerId = "", defaultOpen = false, triggerLabel }: Props) {
  const t = useTranslations("invites.admin");
  const tr = useTranslations("invites.roles");
  const tl = useTranslations("adminOps.invitations");
  const tp = useTranslations("pickers");
  const tc = useTranslations("common.actions");
  const locale = useLocale();
  const formId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [role, setRole] = useState<AdminInviteRole>(initialRole);
  const [email, setEmail] = useState("");
  const [days, setDays] = useState(defaultDaysFor(initialRole));
  const [confirmAdmin, setConfirmAdmin] = useState(false);
  const [heroMode, setHeroMode] = useState<HeroMode>(initialCreatorId ? "team" : "new");
  const [heroId, setHeroId] = useState(initialCreatorId);
  const [heroName, setHeroName] = useState("");
  const [talentId, setTalentId] = useState("");
  const [teamMode, setTeamMode] = useState<TeamMode>("later");
  const [teamUserId, setTeamUserId] = useState("");
  const [teamEmail, setTeamEmail] = useState("");
  // Fornecedor: organização nova (passo a passo no primeiro acesso) ou já cadastrada (convite antigo)
  const [sellerId, setSellerId] = useState(initialSellerId);
  const [errors, setErrors] = useState<AdminInviteError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<AdminInviteLink[] | null>(null);
  const [pending, startTransition] = useTransition();
  const fields = adminInviteFields(role, heroMode);

  function changeRole(next: AdminInviteRole) {
    setRole(next);
    setDays((d) => (next === "admin" ? defaultDaysFor("admin") : role === "admin" ? defaultDaysFor(next) : clampDays(next, d)));
    setErrors([]);
    setError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const form = { email: email.trim(), role, days, confirmAdmin, heroMode, heroId, heroName, talentId, teamMode, teamUserId, teamEmail };
    const found = validateAdminInvite(form);
    setErrors(found);
    if (found.length > 0) return;
    startTransition(async () => {
      if (role === "seller" && sellerId) {
        const result = await createInvitation({ email: form.email, role: "seller", sellerOrgId: sellerId, days });
        if (!result.ok) return setError(result.error);
        setLinks([{ email: form.email, link: result.link, emailed: false, kind: "seller" }]);
        return;
      }
      const result = await adminInviteAction(form);
      if (!result.ok) return setError(result.error);
      setLinks(result.links);
    });
  }

  function close() {
    if (pending) return;
    setOpen(false);
    // Limpa os links ao fechar: nunca serão exibidos novamente.
    setLinks(null);
    setEmail("");
    setConfirmAdmin(false);
    setErrors([]);
    setError(null);
  }

  const has = (e: AdminInviteError) => errors.includes(e);
  const unlinked = creators.filter((c) => !c.linked);
  const linked = creators.filter((c) => c.linked);
  const heroOptions = [
    ...unlinked.map((c) => ({ ...heroOption(tp, { id: c.id, name: c.name, slug: c.slug, avatarUrl: c.avatarUrl, detail: tp("details.heroUnlinked") }), group: tl("form.unlinkedGroup") })),
    ...linked.map((c) => ({ ...heroOption(tp, { id: c.id, name: c.name, slug: c.slug, avatarUrl: c.avatarUrl, detail: tp("details.heroLinked") }), group: tl("form.linkedGroup") })),
  ];
  const expires = new Date(Date.now() + days * 86_400_000);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} leadingIcon={<Mail />} data-testid="admin-invite-open">
        {triggerLabel ?? tl("create")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        title={links ? tl("created.title") : tl("createTitle")}
        size="md"
        footer={
          links ? (
            <Button type="button" onClick={close}>
              {tl("created.done")}
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={close} disabled={pending}>
                {tc("cancel")}
              </Button>
              <Button type="submit" form={formId} loading={pending} data-testid="admin-invite-submit">
                {tl("form.submit")}
              </Button>
            </>
          )
        }
      >
        {links ? (
          <div className="flex flex-col gap-4" data-testid="admin-invite-links">
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {tl("created.warning")}
            </p>
            {links.map((l) => (
              <div key={l.link} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <FormField label={t("linkFor", { email: l.email })} hint={l.emailed ? t("emailed") : undefined}>
                  <Input readOnly value={l.link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
                </FormField>
                <CopyButton value={l.link} />
              </div>
            ))}
          </div>
        ) : (
          <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate data-testid="admin-invite-form">
            <FormField label={tl("form.email")} required error={has("email") ? t("errors.email") : undefined}>
              <Input type="email" autoComplete="off" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} data-testid="admin-invite-email" />
            </FormField>
            <FormField label={tl("form.role")} hint={t(`roleHints.${role}`)} required>
              <Select value={role} onChange={(e) => changeRole(e.target.value as AdminInviteRole)} disabled={pending} data-testid="admin-invite-role">
                {ADMIN_INVITE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {tr(r)}
                  </option>
                ))}
              </Select>
            </FormField>

            {fields.heroMode ? (
              <FormField label={t("heroMode.title")} hint={t(`heroMode.hints.${heroMode}`)}>
                <Select value={heroMode} onChange={(e) => setHeroMode(e.target.value as HeroMode)} disabled={pending} data-testid="admin-invite-hero-mode">
                  <option value="new">{t("heroMode.new")}</option>
                  <option value="team">{t("heroMode.team")}</option>
                  <option value="casting">{t("heroMode.casting")}</option>
                </Select>
              </FormField>
            ) : null}

            {fields.heroLink ? (
              <FormField label={t("heroLink.pick")} hint={t("heroLink.pickHint")} required error={has("hero_id") ? t("errors.hero") : undefined}>
                <EntitySelect value={heroId} onChange={(e) => setHeroId(e.target.value)} disabled={pending} emptyLabel={tl("form.selectPlaceholder")} roleInOption={false} options={heroOptions} />
              </FormField>
            ) : null}

            {fields.heroTalent ? (
              <FormField label={t("heroTalent.pick")} hint={talents.length > 0 ? t("heroTalent.hint") : t("heroTalent.none")} required error={has("talent_id") ? t("errors.talent") : undefined}>
                <EntitySelect
                  value={talentId}
                  onChange={(e) => setTalentId(e.target.value)}
                  disabled={pending || talents.length === 0}
                  emptyLabel={tl("form.selectPlaceholder")}
                  roleInOption={false}
                  data-testid="admin-invite-talent"
                  options={talents.map((x) => ({ value: x.id, name: x.name, org: x.agency, detail: x.hasHero ? t("heroTalent.withPage") : t("heroTalent.withoutPage") }))}
                />
              </FormField>
            ) : null}

            {fields.heroTeam ? (
              <fieldset className="flex min-w-0 flex-col gap-3 rounded-xl border border-border p-3" data-testid="admin-invite-hero-team">
                <legend className="px-1 text-sm font-semibold text-fg">{t("heroTeam.legend")}</legend>
                <FormField label={t("heroName")} hint={t("heroNewHint")} required error={has("hero_name") ? t("errors.heroName") : undefined}>
                  <Input value={heroName} onChange={(e) => setHeroName(e.target.value)} maxLength={80} disabled={pending} data-testid="admin-invite-hero-name" />
                </FormField>
                <FormField label={t("heroTeam.title")} hint={t("heroTeam.hint")}>
                  <Select value={teamMode} onChange={(e) => setTeamMode(e.target.value as TeamMode)} disabled={pending}>
                    <option value="later">{t("heroTeam.later")}</option>
                    <option value="existing">{t("heroTeam.existing")}</option>
                    <option value="new">{t("heroTeam.new")}</option>
                  </Select>
                </FormField>
                {teamMode === "existing" ? (
                  <FormField label={t("heroTeam.pick")} required error={has("team_user") ? t("errors.teamUser") : undefined}>
                    <EntitySelect
                      value={teamUserId}
                      onChange={(e) => setTeamUserId(e.target.value)}
                      disabled={pending}
                      emptyLabel={tl("form.selectPlaceholder")}
                      roleInOption={false}
                      options={creatorUsers.map((u) => ({ value: u.id, name: u.name, role: tp("roles.creator"), email: u.email ?? null }))}
                    />
                  </FormField>
                ) : null}
                {teamMode === "new" ? (
                  <FormField label={t("heroTeam.email")} required error={has("team_email") ? t("errors.teamEmail") : undefined}>
                    <Input type="email" inputMode="email" autoComplete="off" value={teamEmail} onChange={(e) => setTeamEmail(e.target.value)} disabled={pending} />
                  </FormField>
                ) : null}
              </fieldset>
            ) : null}

            {role === "seller" ? (
              <FormField label={tl("form.sellerOrg")} hint={t("sellerOrgHint")}>
                <EntitySelect
                  value={sellerId}
                  onChange={(e) => setSellerId(e.target.value)}
                  disabled={pending}
                  emptyLabel={t("sellerOrgNew")}
                  roleInOption={false}
                  options={sellers.map((s) => ({ value: s.id, name: s.name, role: tp("roles.seller") }))}
                />
              </FormField>
            ) : null}

            {fields.onboardingNote && !(role === "seller" && sellerId) ? <p className="rounded-lg bg-surface-elevated px-3 py-2 type-body-sm text-fg-muted">{t(`onboardingNote.${role}`)}</p> : null}

            <FormField label={t("days")} hint={t("expiresOn", { date: expires.toLocaleDateString(locale) })} required error={has("days") || has("admin_max_48h") ? t("errors.days") : undefined}>
              <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} disabled={pending} data-testid="admin-invite-days">
                {DAY_CHOICES.filter((d) => d <= maxDaysFor(role)).map((d) => (
                  <option key={d} value={d}>
                    {role === "admin" ? t("hoursOption", { hours: d * 24 }) : t("daysOption", { days: d })}
                  </option>
                ))}
              </Select>
            </FormField>

            {fields.adminConfirm ? (
              <div className="flex flex-col gap-2 rounded-xl border border-danger/40 bg-danger-soft p-3" data-testid="admin-invite-confirm">
                <p className="flex items-start gap-2 text-sm font-semibold text-danger">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {t("adminWarning")}
                </p>
                <Checkbox id={`${formId}-confirm`} checked={confirmAdmin} onChange={(e) => setConfirmAdmin(e.target.checked)} label={t("adminConfirm")} />
                {has("admin_confirm") ? <p className="type-body-sm text-danger">{t("errors.adminConfirm")}</p> : null}
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="type-body-sm text-danger">
                {error}
              </p>
            ) : null}
          </form>
        )}
      </Dialog>
    </>
  );
}
