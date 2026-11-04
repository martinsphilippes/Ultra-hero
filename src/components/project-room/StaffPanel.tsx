"use client";

import { Copy, ShieldAlert, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Badge, Button, FormField, Input, useToast } from "@/components/ui";
import { inviteStaffAction, removeStaffAction } from "@/lib/project-room/actions";
import type { RoomMember } from "@/lib/project-room/queries";

type Props = { dealId: string; members: RoomMember[]; canManage: boolean; ndaHeroes: boolean };

const SIDE_ORDER = ["agency", "talent", "staff", "brand"] as const;

// Quem está na sala, por lado. A agência vê e-mail, convite pendente/vencido e NDA; convida staff externo (fotógrafo,
// maquiador…) com função e tira da sala. O link do convite aparece na tela (o e-mail é um caminho a mais).
export function StaffPanel({ dealId, members, canManage, ndaHeroes }: Props) {
  const t = useTranslations("projectRoom.people");
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [fn, setFn] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function invite(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLink(null);
    if (!email.trim() || name.trim().length < 2 || fn.trim().length < 2) return setError(t("required"));
    start(async () => {
      const result = await inviteStaffAction({ dealId, email: email.trim(), name: name.trim(), jobFunction: fn.trim(), days: 7 });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setLink(result.link ?? null);
      setEmail("");
      setName("");
      setFn("");
    });
  }

  function remove(m: RoomMember) {
    if (!m.id || !window.confirm(t("confirmRemove", { name: m.name }))) return;
    start(async () => {
      const result = await removeStaffAction({ dealId, memberId: m.id as string });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: t("copied"), variant: "success" });
    } catch {
      toast({ title: t("copyFailed"), variant: "error" });
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="room-people">
      {SIDE_ORDER.map((side) => {
        const list = members.filter((m) => m.side === side);
        if (list.length === 0) return null;
        return (
          <section key={side} className="flex flex-col gap-1.5">
            <h4 className="type-caption font-semibold uppercase tracking-wider text-fg-subtle">
              {t(`sides.${side}`)} · {list.length}
            </h4>
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
              {list.map((m, i) => (
                <li key={`${side}:${m.id ?? m.name}:${i}`} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-fg">{m.name}</span>
                    <span className="truncate type-caption text-fg-muted">
                      {[side === "talent" ? (m.role === "client" ? t("client") : t("contracted")) : m.role, m.email].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {m.status === "pending" ? <Badge size="sm" variant={m.expired ? "danger" : "warning"}>{m.expired ? t("expired") : t("pending")}</Badge> : null}
                  {(side === "staff" && m.status === "active") || (side === "talent" && ndaHeroes) ? (
                    m.nda ? (
                      <Badge size="sm" variant="success" icon={<ShieldCheck />}>
                        {t("ndaOk")}
                      </Badge>
                    ) : m.nda === false ? (
                      <Badge size="sm" variant="warning" icon={<ShieldAlert />}>
                        {t("ndaPending")}
                      </Badge>
                    ) : null
                  ) : null}
                  {canManage && side === "staff" && m.id ? (
                    <Button type="button" size="sm" variant="ghost" className="min-h-11" leadingIcon={<UserMinus />} onClick={() => remove(m)} disabled={pending} aria-label={t("removeLabel", { name: m.name })}>
                      <span className="sr-only sm:not-sr-only">{t("remove")}</span>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {canManage ? (
        <form onSubmit={invite} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" noValidate data-testid="staff-invite">
          <h4 className="text-sm font-semibold text-fg">{t("inviteTitle")}</h4>
          <p className="type-caption text-fg-muted">{t("inviteHint")}</p>
          <FormField label={t("email")} required>
            <Input type="email" inputMode="email" autoComplete="off" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} disabled={pending} />
          </FormField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label={t("name")} required>
              <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} disabled={pending} />
            </FormField>
            <FormField label={t("function")} required>
              <Input value={fn} maxLength={60} onChange={(e) => setFn(e.target.value)} disabled={pending} placeholder={t("functionPlaceholder")} list={`staff-fns-${dealId}`} />
            </FormField>
          </div>
          <datalist id={`staff-fns-${dealId}`}>
            {(["photographer", "makeup", "stylist", "musician", "designer", "producer", "filmmaker"] as const).map((k) => (
              <option key={k} value={t(`functions.${k}`)} />
            ))}
          </datalist>
          {error ? (
            <p role="alert" className="type-body-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" loading={pending} leadingIcon={<UserPlus />} className="w-full sm:w-fit" data-testid="staff-invite-send">
            {t("invite")}
          </Button>
          {link ? (
            <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3">
              <p className="type-caption text-fg-muted">{t("linkHint")}</p>
              <p className="break-all font-mono text-xs text-fg">{link}</p>
              <Button type="button" variant="secondary" size="sm" className="min-h-11 w-fit" leadingIcon={<Copy />} onClick={copy}>
                {t("copy")}
              </Button>
            </div>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
