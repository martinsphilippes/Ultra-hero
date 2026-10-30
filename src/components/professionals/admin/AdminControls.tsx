"use client";

import { KeyRound, Mail, Plus, TriangleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { createProfessionalDemoLogin, inviteProfessional, setProfessionalStatus, setProfessionalSuggestion } from "@/app/admin/professionals/actions";
import { CopyButton } from "@/components/admin-ops/CopyButton";
import { Button, Checkbox, FormField, IconButton, Input, Select, Textarea, useToast } from "@/components/ui";
import type { ProfessionalStatus } from "@/lib/professionals/rules";

// Controles do admin na página do profissional (0058). Cada ação chama uma RPC auditada.

function useRun() {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({ title: result.message, variant: "success" });
      after?.();
      router.refresh();
    });
  }
  return { pending, error, run };
}

/** Aprovação: registro conferido (checkbox) + nota; aprovar exige o registro conferido. */
export function StatusForm({ id, status, verified, note }: { id: string; status: ProfessionalStatus; verified: boolean; note: string }) {
  const t = useTranslations("professionals.admin.status");
  const [checked, setChecked] = useState(verified);
  const [text, setText] = useState(note);
  const { pending, error, run } = useRun();
  const go = (next: ProfessionalStatus) => run(() => setProfessionalStatus({ id, status: next, verified: checked, note: text }));

  return (
    <section aria-labelledby="pro-status-title" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="admin-pro-status">
      <h2 id="pro-status-title" className="text-base font-semibold text-fg">
        {t("title")}
      </h2>
      <Checkbox label={t("verified")} checked={checked} onChange={(e) => setChecked(e.currentTarget.checked)} disabled={pending} data-testid="admin-pro-verified" />
      <FormField label={t("note")} hint={t("noteHint")} error={error ?? undefined}>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1000} disabled={pending} />
      </FormField>
      <div className="flex flex-wrap gap-2">
        {status !== "approved" || !verified ? (
          <Button type="button" onClick={() => go("approved")} loading={pending} disabled={!checked} data-testid="admin-pro-approve">
            {t("approve")}
          </Button>
        ) : null}
        {status !== "pending" ? (
          <Button type="button" variant="secondary" onClick={() => go("pending")} loading={pending}>
            {t("pending")}
          </Button>
        ) : null}
        {status !== "suspended" ? (
          <Button type="button" variant="danger" onClick={() => go("suspended")} loading={pending}>
            {t("suspend")}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/** Convite para a conta do profissional (o link aparece uma única vez). */
export function InviteForm({ professionalId, linked }: { professionalId: string; linked: boolean }) {
  const t = useTranslations("professionals.admin.invite");
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [days, setDays] = useState("7");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await inviteProfessional({ professionalId, email: email.trim(), days: Number(days) || 7 });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLink(result.link ?? null);
      toast({ title: result.message, variant: "success" });
    });
  }

  return (
    <section aria-labelledby="pro-invite-title" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="admin-pro-invite">
      <h2 id="pro-invite-title" className="text-base font-semibold text-fg">
        {t("title")}
      </h2>
      {linked ? (
        <p className="type-body-sm text-fg-muted">{t("linked")}</p>
      ) : link ? (
        <div className="flex flex-col gap-2">
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t("linkWarning")}
          </p>
          <FormField label={t("linkTitle")}>
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
          </FormField>
          <CopyButton value={link} />
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          <p className="type-body-sm text-fg-muted">{t("description")}</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
            <FormField label={t("email")} required error={error ?? undefined}>
              <Input type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} />
            </FormField>
            <FormField label={t("days")} required>
              <Input type="number" inputMode="numeric" min={1} max={30} value={days} onChange={(e) => setDays(e.target.value)} disabled={pending} />
            </FormField>
          </div>
          <Button type="submit" variant="secondary" leadingIcon={<Mail />} loading={pending} className="self-start">
            {t("submit")}
          </Button>
        </form>
      )}
    </section>
  );
}

/** Conta de acesso rápido do profissional de exemplo (painel da tela de login). */
export function DemoLoginButton({ professionalId }: { professionalId: string }) {
  const t = useTranslations("professionals.admin.demoLogin");
  const { pending, error, run } = useRun();
  return (
    <section aria-labelledby="pro-demo-title" className="flex flex-col gap-2 rounded-2xl border border-dashed border-border bg-surface p-4" data-testid="admin-pro-demo-login">
      <h2 id="pro-demo-title" className="text-base font-semibold text-fg">
        {t("title")}
      </h2>
      <p className="type-body-sm text-fg-muted">{t("description")}</p>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="button" variant="secondary" leadingIcon={<KeyRound />} onClick={() => run(() => createProfessionalDemoLogin({ professionalId }))} loading={pending} className="self-start">
        {t("button")}
      </Button>
    </section>
  );
}

type Target = "creator" | "content" | "program";

/** Sugeridos: heróis, receitas e programas onde o profissional aparece. */
export function SuggestionsEditor({
  professionalId,
  current,
  options,
}: {
  professionalId: string;
  current: { target: Target; id: string; label: string }[];
  options: Record<Target, { id: string; label: string }[]>;
}) {
  const t = useTranslations("professionals.admin.suggestions");
  const { pending, error, run } = useRun();
  const [picked, setPicked] = useState<Record<Target, string>>({ creator: "", content: "", program: "" });
  const groups: { target: Target; label: string }[] = [
    { target: "creator", label: t("heroes") },
    { target: "content", label: t("recipes") },
    { target: "program", label: t("programs") },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="admin-pro-suggestions">
      <p className="type-body-sm text-fg-muted">{t("description")}</p>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      {groups.map(({ target, label }) => {
        const mine = current.filter((c) => c.target === target);
        const taken = new Set(mine.map((m) => m.id));
        return (
          <section key={target} aria-labelledby={`sugg-${target}`} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
            <h3 id={`sugg-${target}`} className="text-sm font-semibold text-fg">
              {label}
            </h3>
            {mine.length === 0 ? <p className="type-caption text-fg-muted">{t("none")}</p> : null}
            <ul className="flex flex-wrap gap-2">
              {mine.map((m) => (
                <li key={m.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-bg pl-3 text-sm text-fg">
                  {m.label}
                  <IconButton
                    label={`${t("remove")}: ${m.label}`}
                    icon={<X />}
                    size="sm"
                    onClick={() => run(() => setProfessionalSuggestion({ professionalId, target, targetId: m.id, on: false }))}
                    disabled={pending}
                  />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-end gap-2">
              <Select
                aria-label={label}
                value={picked[target]}
                onChange={(e) => setPicked((p) => ({ ...p, [target]: e.target.value }))}
                disabled={pending}
                className="min-w-0 flex-1"
              >
                <option value="">{t("select")}</option>
                {options[target]
                  .filter((o) => !taken.has(o.id))
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
              </Select>
              <Button
                type="button"
                variant="secondary"
                leadingIcon={<Plus />}
                disabled={pending || !picked[target]}
                onClick={() => run(() => setProfessionalSuggestion({ professionalId, target, targetId: picked[target], on: true }), () => setPicked((p) => ({ ...p, [target]: "" })))}
              >
                {t("add")}
              </Button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
