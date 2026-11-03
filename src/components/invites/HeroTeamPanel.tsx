"use client";

import { Crown, Mail, TriangleAlert, UserMinus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition, type FormEvent } from "react";
import { inviteHeroTeamAction, removeHeroTeamAction, revokeHeroTeamInviteAction, transferHeroAction } from "@/app/creator/(hero)/equipe/actions";
import { CopyButton } from "@/components/admin-ops/CopyButton";
import { Avatar, Badge, Button, Dialog, EmptyState, FormField, Input, Select, useToast } from "@/components/ui";
import { canManageTeam, memberActions, type HeroTeam, type HeroTeamMember } from "@/lib/invitations/hero-team";

type Props = { creatorId: string; heroName: string; team: HeroTeam };

// Equipe do herói (0091): titular + creators da equipe (social media, editor…), cada um com login próprio.
// O titular (ou o admin) convida, remove e transfere a titularidade; o membro só consulta.
export function HeroTeamPanel({ creatorId, heroName, team }: Props) {
  const t = useTranslations("invites.team");
  const locale = useLocale();
  const manage = canManageTeam(team);
  const fmt = (iso: string) => (iso ? new Date(iso).toLocaleDateString(locale) : "");
  return (
    <div className="flex flex-col gap-5" data-testid="hero-team">
      {manage ? <InviteMember creatorId={creatorId} heroName={heroName} /> : <p className="rounded-xl border border-dashed border-border px-3 py-2 type-body-sm text-fg-muted">{t("memberNote")}</p>}
      <section aria-labelledby="hero-team-members" className="flex flex-col gap-2">
        <h2 id="hero-team-members" className="text-sm font-semibold text-fg">
          {t("membersTitle", { count: team.members.length })}
        </h2>
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
          {team.members.map((m) => (
            <MemberRow key={m.userId} creatorId={creatorId} member={m} team={team} since={fmt(m.since)} />
          ))}
        </ul>
      </section>
      {manage ? (
        <section aria-labelledby="hero-team-invites" className="flex flex-col gap-2">
          <h2 id="hero-team-invites" className="text-sm font-semibold text-fg">
            {t("invitesTitle")}
          </h2>
          {team.invites.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface">
              <EmptyState size="sm" title={t("noInvites")} />
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
              {team.invites.map((i) => (
                <InviteRow key={i.id} creatorId={creatorId} id={i.id} email={i.email} expires={fmt(i.expiresAt)} />
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

function MemberRow({ creatorId, member, team, since }: { creatorId: string; member: HeroTeamMember; team: HeroTeam; since: string }) {
  const t = useTranslations("invites.team");
  const { toast } = useToast();
  const [confirm, setConfirm] = useState<"remove" | "transfer" | null>(null);
  const [pending, start] = useTransition();
  const actions = memberActions(team, member);
  function run() {
    const kind = confirm;
    start(async () => {
      const result = kind === "transfer" ? await transferHeroAction({ creatorId, userId: member.userId }) : await removeHeroTeamAction({ creatorId, userId: member.userId });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
      if (result.ok) setConfirm(null);
    });
  }
  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={member.name} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-fg">
            {member.name}
            {member.me ? <span className="font-normal text-fg-muted"> · {t("you")}</span> : null}
          </span>
          <span className="truncate type-caption text-fg-muted">{[member.email, since ? t("since", { date: since }) : null].filter(Boolean).join(" · ")}</span>
        </div>
        <Badge variant={member.role === "owner" ? "accent" : "neutral"} size="sm">
          {member.role === "owner" ? t("owner") : t("member")}
        </Badge>
      </div>
      {actions.transfer || actions.remove ? (
        <div className="flex flex-wrap gap-2">
          {actions.transfer ? (
            <Button type="button" variant="secondary" size="sm" leadingIcon={<Crown />} onClick={() => setConfirm("transfer")}>
              {t("transfer")}
            </Button>
          ) : null}
          {actions.remove ? (
            <Button type="button" variant="ghost" size="sm" leadingIcon={<UserMinus />} onClick={() => setConfirm("remove")}>
              {t("remove")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => (!open && !pending ? setConfirm(null) : undefined)}
        title={confirm === "transfer" ? t("transferTitle") : t("removeTitle")}
        description={confirm === "transfer" ? t("transferText", { name: member.name }) : t("removeText", { name: member.name })}
        size="sm"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setConfirm(null)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="button" variant={confirm === "remove" ? "danger" : "primary"} onClick={run} loading={pending}>
              {confirm === "transfer" ? t("transferConfirm") : t("removeConfirm")}
            </Button>
          </>
        }
      >
        {null}
      </Dialog>
    </li>
  );
}

function InviteRow({ creatorId, id, email, expires }: { creatorId: string; id: string; email: string; expires: string }) {
  const t = useTranslations("invites.team");
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 p-3">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-fg">{email}</span>
        <span className="type-caption text-fg-muted">{t("inviteExpires", { date: expires })}</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        leadingIcon={<X />}
        loading={pending}
        aria-label={t("revokeFor", { email })}
        onClick={() =>
          start(async () => {
            const result = await revokeHeroTeamInviteAction({ creatorId, id });
            toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
          })
        }
      >
        {t("revoke")}
      </Button>
    </li>
  );
}

function InviteMember({ creatorId, heroName }: { creatorId: string; heroName: string }) {
  const t = useTranslations("invites.team");
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [days, setDays] = useState("7");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  const [pending, start] = useTransition();
  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    start(async () => {
      const result = await inviteHeroTeamAction({ creatorId, email: email.trim(), days: Number(days) });
      if (!result.ok) return setError(result.error);
      setLink(result.link ?? null);
      setEmailed(Boolean(result.emailed));
    });
  }
  function close() {
    if (pending) return;
    setOpen(false);
    setLink(null);
    setEmail("");
    setError(null);
  }
  return (
    <>
      <Button type="button" size="lg" block leadingIcon={<Mail />} onClick={() => setOpen(true)} data-testid="hero-team-invite">
        {t("invite")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        title={link ? t("createdTitle") : t("inviteTitle", { hero: heroName })}
        size="md"
        footer={
          link ? (
            <Button type="button" onClick={close}>
              {t("done")}
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={close} disabled={pending}>
                {t("cancel")}
              </Button>
              <Button type="submit" form={formId} loading={pending}>
                {t("send")}
              </Button>
            </>
          )
        }
      >
        {link ? (
          <div className="flex flex-col gap-3">
            <p role="status" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {emailed ? t("emailed", { email: email.trim() }) : t("notEmailed")}
            </p>
            <FormField label={t("link")}>
              <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            </FormField>
            <CopyButton value={link} />
          </div>
        ) : (
          <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <p className="type-body-sm text-fg-muted">{t("inviteHint")}</p>
            <FormField label={t("email")} required error={error ?? undefined}>
              <Input type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} />
            </FormField>
            <FormField label={t("days")} required>
              <Select value={days} onChange={(e) => setDays(e.target.value)} disabled={pending}>
                {["3", "7", "14", "30"].map((d) => (
                  <option key={d} value={d}>
                    {t("daysOption", { days: Number(d) })}
                  </option>
                ))}
              </Select>
            </FormField>
          </form>
        )}
      </Dialog>
    </>
  );
}
