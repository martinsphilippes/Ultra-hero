"use client";

import { CircleCheck, Clock, Mail, Phone, RotateCw, TriangleAlert, User, UserX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { resendAccessInviteAction, saveAccessContactAction, type AccessOutcome } from "@/app/agencia/acesso-actions";
import { CopyButton } from "@/components/admin-ops/CopyButton";
import { Badge, Button, Dialog, FormField, Input } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import type { AccessKind, AccessStatus } from "@/lib/agency/access-contact";
import { formatBrPhoneInput, formatE164ForDisplay } from "@/lib/auth/phone";

// Acesso de quem a agência cadastrou (0112): herói (talento) ou contato da marca. Só gestor+ e admin geral veem (a
// página só monta para eles; o banco também confere). Situação, e-mail e celular (dado pessoal: só aqui) e as ações
// Reenviar / Corrigir e-mail / Adicionar contato.

export function AccessStatusBadge({ kind, status }: { kind: AccessKind; status: AccessStatus }) {
  const t = useTranslations("agency.access");
  switch (status.state) {
    case "active":
      return (
        <Badge variant="success" icon={<CircleCheck />}>
          {t("active")}
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="warning" icon={<Clock />}>
          {t("pending")}
        </Badge>
      );
    case "expired":
      return (
        <Badge variant="danger" icon={<TriangleAlert />}>
          {t("expired")}
        </Badge>
      );
    default:
      return (
        <Badge variant="neutral" icon={<UserX />}>
          {kind === "talent" ? t("none") : t("noneBrand")}
        </Badge>
      );
  }
}

export function AccessPanel({ kind, targetId, status, compact = false }: { kind: AccessKind; targetId: string; status: AccessStatus; compact?: boolean }) {
  const t = useTranslations("agency.access");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<AccessOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const needsContact = !status.email;
  const canResend = !needsContact && status.state !== "active";
  const showEdit = !(compact && status.state === "active" && !needsContact);

  function resend() {
    setError(null);
    start(async () => {
      const result = await resendAccessInviteAction({ kind, targetId });
      if (!result.ok) return setError(result.error);
      setOutcome(result);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2" data-testid={`access-${kind}`} data-state={status.state}>
      <div className="flex flex-wrap items-center gap-2">
        <AccessStatusBadge kind={kind} status={status} />
        {status.state === "pending" && status.inviteExpiresAt ? (
          <span className="type-caption text-fg-muted">{t("validUntil", { date: formatDate(status.inviteExpiresAt, locale) })}</span>
        ) : null}
      </div>
      {!compact ? (
        <dl className="flex flex-col gap-1 type-body-sm">
          {kind === "brand" ? (
            <div className="flex min-w-0 items-center gap-2">
              <User className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
              <dt className="sr-only">{t("contactName")}</dt>
              <dd className="min-w-0 truncate text-fg">{status.contactName ?? t("noName")}</dd>
            </div>
          ) : null}
          <div className="flex min-w-0 items-center gap-2">
            <Mail className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            <dt className="sr-only">{t("email")}</dt>
            <dd className="min-w-0 truncate text-fg">{status.email ?? status.loginEmail ?? t("noEmail")}</dd>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            <dt className="sr-only">{t("phone")}</dt>
            <dd className="text-fg">{status.phone ? formatE164ForDisplay(status.phone) : t("noPhone")}</dd>
          </div>
        </dl>
      ) : status.email ? (
        <span className="truncate type-caption text-fg-muted">{status.email}</span>
      ) : null}
      {status.state === "none" && !compact ? <p className="type-caption text-fg-muted">{needsContact ? t("noneHint") : t("noneResendHint")}</p> : null}
      {canResend || showEdit ? (
        <div className="flex flex-wrap gap-2">
          {canResend ? (
            <Button type="button" size="sm" variant="secondary" leadingIcon={<RotateCw />} loading={pending} onClick={resend} data-testid="access-resend">
              {status.state === "none" ? t("sendInvite") : t("resend")}
            </Button>
          ) : null}
          {showEdit ? (
            <Button type="button" size="sm" variant={needsContact ? "primary" : "ghost"} onClick={() => setOpen(true)} disabled={pending} data-testid="access-edit">
              {needsContact ? t("addContact") : status.state === "active" ? t("editContact") : t("fixEmail")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="type-caption text-danger">
          {error}
        </p>
      ) : null}
      {outcome && !open ? <AccessOutcomeNote outcome={outcome} /> : null}
      {open ? (
        <AccessContactDialog
          kind={kind}
          targetId={targetId}
          onClose={() => setOpen(false)}
          initialName={status.contactName ?? ""}
          initialEmail={status.email ?? ""}
          initialPhone={status.phone ? formatE164ForDisplay(status.phone) : ""}
          onSaved={(result) => {
            setOutcome(result);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/** O que aconteceu depois de criar/corrigir/reenviar: e-mail enviado ou o link para mandar por outro canal. */
export function AccessOutcomeNote({ outcome }: { outcome: AccessOutcome }) {
  const t = useTranslations("agency.access");
  const sent = outcome.account === "invited" || outcome.account === "linked";
  return (
    <div className="flex flex-col gap-2" role="status" data-testid="access-outcome">
      <p className="rounded-lg border border-border bg-surface-elevated p-3 type-body-sm text-fg">
        {outcome.message} {sent ? (outcome.emailed ? t("emailSent") : t("emailNotSent")) : null}
      </p>
      {outcome.link ? (
        <div className="flex flex-col gap-2">
          <FormField label={t("link")}>
            <Input readOnly value={outcome.link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
          </FormField>
          <CopyButton value={outcome.link} />
        </div>
      ) : null}
    </div>
  );
}

/** Campos de contato (e-mail + celular com máscara), reaproveitados nos cadastros. */
export function AccessContactFields(props: {
  email: string;
  phone: string;
  onEmail: (value: string) => void;
  onPhone: (value: string) => void;
  disabled?: boolean;
  emailLabel: string;
  emailHint?: string;
}) {
  const t = useTranslations("agency.access");
  return (
    <>
      <FormField label={props.emailLabel} hint={props.emailHint} required>
        <Input
          type="email"
          inputMode="email"
          autoComplete="off"
          value={props.email}
          maxLength={254}
          onChange={(e) => props.onEmail(e.target.value)}
          disabled={props.disabled}
          data-testid="access-email"
        />
      </FormField>
      <FormField label={t("phoneLabel")} hint={t("phoneHint")} required>
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="(11) 91234-5678"
          value={props.phone}
          maxLength={20}
          onChange={(e) => props.onPhone(formatBrPhoneInput(e.target.value))}
          disabled={props.disabled}
          data-testid="access-phone"
        />
      </FormField>
    </>
  );
}

function AccessContactDialog(props: {
  kind: AccessKind;
  targetId: string;
  onClose: () => void;
  initialName: string;
  initialEmail: string;
  initialPhone: string;
  onSaved: (outcome: AccessOutcome) => void;
}) {
  const t = useTranslations("agency.access");
  const formId = useId();
  const [name, setName] = useState(props.initialName);
  const [email, setEmail] = useState(props.initialEmail);
  const [phone, setPhone] = useState(props.initialPhone);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function close() {
    if (pending) return;
    props.onClose();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    start(async () => {
      const result = await saveAccessContactAction({ kind: props.kind, targetId: props.targetId, email, phone, ...(props.kind === "brand" ? { name } : {}) });
      if (!result.ok) return setError(result.error);
      props.onSaved(result);
      props.onClose();
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => (next ? undefined : close())}
      title={t("dialogTitle")}
      description={t("dialogHint")}
      size="md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={close} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button type="submit" form={formId} loading={pending}>
            {t("save")}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {props.kind === "brand" ? (
          <FormField label={t("contactName")} required>
            <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} disabled={pending} />
          </FormField>
        ) : null}
        <AccessContactFields
          email={email}
          phone={phone}
          onEmail={setEmail}
          onPhone={setPhone}
          disabled={pending}
          emailLabel={t("email")}
          emailHint={props.kind === "talent" ? t("hero.emailHint") : t("brand.emailHint")}
        />
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
