"use client";

import { Mail, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { inviteAgencyMemberAction } from "@/app/admin/agencia/actions";
import { inviteTalentAction } from "@/app/agencia/casting/actions";
import { inviteMemberAction } from "@/app/agencia/equipe/actions";
import { inviteBrandMemberAction } from "@/app/agencia/marcas/actions";
import { inviteStaffAction } from "@/app/marca/actions";
import { CopyButton } from "@/components/admin-ops/CopyButton";
import { Button, Dialog, FormField, Input, Select } from "@/components/ui";

type Target =
  | { kind: "team" }
  | { kind: "brandMember"; brandId: string }
  | { kind: "brandStaff" }
  | { kind: "adminAgency"; agencyId: string }
  | { kind: "talent"; talentId: string };

type Props = {
  target: Target;
  /** Níveis que podem ser convidados (vazio: só "equipe" da marca). */
  roles: readonly string[];
  triggerLabel?: string;
  triggerVariant?: "primary" | "secondary";
};

// Convite por e-mail: o link aparece UMA vez (o banco guarda só o hash). Os avisos dos portais de
// gestão ficam no sino (sem e-mail transacional no MVP), por isso o link é copiado e enviado à pessoa.
export function InviteDialog({ target, roles, triggerLabel, triggerVariant = "primary" }: Props) {
  const t = useTranslations("agency.invite");
  const tr = useTranslations("agency.roles");
  const tc = useTranslations("common.actions");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(roles[roles.length - 1] ?? "staff");
  const [days, setDays] = useState("7");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    start(async () => {
      const input = { email: email.trim(), role, days: Number(days) };
      const result =
        target.kind === "team"
          ? await inviteMemberAction(input)
          : target.kind === "brandMember"
            ? await inviteBrandMemberAction({ ...input, brandId: target.brandId })
            : target.kind === "brandStaff"
              ? await inviteStaffAction({ email: input.email, days: input.days })
              : target.kind === "talent"
                ? await inviteTalentAction({ talentId: target.talentId, email: input.email, days: input.days })
                : await inviteAgencyMemberAction({ agencyId: target.agencyId, email: input.email, role });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLink(result.link ?? null);
    });
  }

  function close() {
    if (pending) return;
    setOpen(false);
    setLink(null);
    setEmail("");
    setError(null);
  }

  const roleLabel = (r: string) => (target.kind === "brandMember" && r === "staff" ? tr("brandStaff") : tr(r as "admin"));

  return (
    <>
      <Button type="button" variant={triggerVariant} size="sm" onClick={() => setOpen(true)} leadingIcon={<Mail />} data-testid="invite-open">
        {triggerLabel ?? t("open")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        title={link ? t("createdTitle") : t("title")}
        size="md"
        footer={
          link ? (
            <Button type="button" onClick={close}>
              {t("done")}
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={close} disabled={pending}>
                {tc("cancel")}
              </Button>
              <Button type="submit" form="agency-invite-form" loading={pending}>
                {t("submit")}
              </Button>
            </>
          )
        }
      >
        {link ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t("linkWarning")}
            </p>
            <FormField label={t("link")}>
              <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" data-testid="invite-link" />
            </FormField>
            <CopyButton value={link} />
            <p className="type-caption text-fg-muted">{t("inboxNote")}</p>
          </div>
        ) : (
          <form id="agency-invite-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <FormField label={t("email")} required>
              <Input type="email" autoComplete="off" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} />
            </FormField>
            {roles.length > 1 ? (
              <FormField label={t("role")} hint={t("roleHint")} required>
                <Select value={role} onChange={(e) => setRole(e.target.value)} disabled={pending}>
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {roleLabel(r)}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : null}
            {target.kind !== "adminAgency" ? (
              <FormField label={t("days")} required>
                <Select value={days} onChange={(e) => setDays(e.target.value)} disabled={pending}>
                  {["3", "7", "14", "30"].map((d) => (
                    <option key={d} value={d}>
                      {t("daysOption", { days: Number(d) })}
                    </option>
                  ))}
                </Select>
              </FormField>
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
