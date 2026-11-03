"use client";

import { Mail, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type FormEvent } from "react";
import { inviteBrandByEmailAction, inviteHeroAction, type AgencyInviteResult } from "@/app/agencia/convites-actions";
import { CopyButton } from "@/components/admin-ops/CopyButton";
import { Button, Dialog, EntitySelect, FormField, Input, Select } from "@/components/ui";

/** Creator do casting que pode receber o convite de herói (sem login; com ou sem herói). */
export type HeroInviteTalent = { id: string; name: string; hasHero: boolean; heroName?: string | null };

type Props = { mode: "brand" } | { mode: "hero"; talents: HeroInviteTalent[] };

// Convites da agência (0091): marca por e-mail (nova ou pedido de vínculo) e herói do casting. O link aparece
// UMA vez (o banco guarda o hash); com e-mail configurado ele também vai por e-mail.
export function AgencyInviteDialog(props: Props) {
  const t = useTranslations("invites.agency");
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [days, setDays] = useState("7");
  const [talentId, setTalentId] = useState("");
  const [heroName, setHeroName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Extract<AgencyInviteResult, { ok: true }> | null>(null);
  const [pending, start] = useTransition();
  const talents = props.mode === "hero" ? props.talents : [];
  const talent = talents.find((x) => x.id === talentId);
  const needsName = props.mode === "hero" && talent !== undefined && !talent.hasHero;

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (props.mode === "hero" && !talent) return setError(t("errors.talent"));
    if (needsName && heroName.trim().length < 2) return setError(t("errors.heroName"));
    start(async () => {
      const result =
        props.mode === "brand"
          ? await inviteBrandByEmailAction({ email: email.trim(), days: Number(days) })
          : await inviteHeroAction({ talentId, heroName: heroName.trim(), email: email.trim(), days: Number(days) });
      if (!result.ok) return setError(result.error);
      setDone(result);
    });
  }

  function close() {
    if (pending) return;
    setOpen(false);
    setDone(null);
    setEmail("");
    setHeroName("");
    setTalentId("");
    setError(null);
  }

  const label = props.mode === "brand" ? t("brandOpen") : t("heroOpen");
  return (
    <>
      <Button type="button" size="sm" variant={props.mode === "brand" ? "secondary" : "primary"} leadingIcon={<Mail />} onClick={() => setOpen(true)} data-testid={`agency-invite-${props.mode}`}>
        {label}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        title={done ? done.message : props.mode === "brand" ? t("brandTitle") : t("heroTitle")}
        size="md"
        footer={
          done ? (
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
        {done ? (
          <div className="flex flex-col gap-3">
            <p role="status" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {done.emailed ? t("emailed", { email: email.trim() }) : t("notEmailed")}
            </p>
            <FormField label={t("link")}>
              <Input readOnly value={done.link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            </FormField>
            <CopyButton value={done.link} />
          </div>
        ) : (
          <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <p className="type-body-sm text-fg-muted">{props.mode === "brand" ? t("brandHint") : t("heroHint")}</p>
            {props.mode === "hero" ? (
              talents.length === 0 ? (
                <p className="rounded-lg bg-surface-elevated px-3 py-2 type-body-sm text-fg-muted">{t("noTalents")}</p>
              ) : (
                <FormField label={t("talent")} required>
                  <EntitySelect
                    value={talentId}
                    onChange={(e) => setTalentId(e.target.value)}
                    disabled={pending}
                    emptyLabel={t("pick")}
                    roleInOption={false}
                    options={talents.map((x) => ({ value: x.id, name: x.name, detail: x.hasHero ? t("hasHero", { hero: x.heroName ?? "" }) : t("noHero") }))}
                  />
                </FormField>
              )
            ) : null}
            {needsName ? (
              <FormField label={t("heroName")} hint={t("heroNameHint")} required>
                <Input value={heroName} onChange={(e) => setHeroName(e.target.value)} maxLength={80} disabled={pending} />
              </FormField>
            ) : null}
            <FormField label={props.mode === "brand" ? t("brandEmail") : t("heroEmail")} required>
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
