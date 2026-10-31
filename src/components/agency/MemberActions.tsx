"use client";

import { UserMinus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { removeMemberAction, setMemberRoleAction } from "@/app/agencia/equipe/actions";
import { Button, Dialog, FormField, Select, Textarea, useToast } from "@/components/ui";
import { AGENCY_ROLES, type AgencyRole } from "@/lib/agency/roles";

type Props = { userId: string; name: string; role: AgencyRole; isSelf: boolean };

// Ações do Adm sobre um membro da equipe: trocar o nível ou remover, sempre com justificativa
// (fica na auditoria). O banco impede rebaixar ou remover o último Adm.
export function MemberActions({ userId, name, role, isSelf }: Props) {
  const t = useTranslations("agency.team");
  const tr = useTranslations("agency.roles");
  const tc = useTranslations("common.actions");
  const { toast } = useToast();
  const [mode, setMode] = useState<"role" | "remove" | null>(null);
  const [nextRole, setNextRole] = useState<AgencyRole>(role);
  const [justification, setJustification] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function close() {
    if (pending) return;
    setMode(null);
    setError(null);
    setJustification("");
    setNextRole(role);
  }

  function confirm() {
    setError(null);
    start(async () => {
      const result =
        mode === "role"
          ? await setMemberRoleAction({ userId, role: nextRole, justification })
          : await removeMemberAction({ userId, justification });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({ title: result.message, variant: "success" });
      setMode(null);
      setJustification("");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label={t("changeRoleFor", { name })}
        value={role}
        onChange={(e) => {
          setNextRole(e.target.value as AgencyRole);
          setMode("role");
        }}
        className="h-9 w-auto min-w-36 text-sm"
      >
        {AGENCY_ROLES.map((r) => (
          <option key={r} value={r}>
            {tr(r)}
          </option>
        ))}
      </Select>
      <Button type="button" variant="ghost" size="sm" leadingIcon={<UserMinus />} onClick={() => setMode("remove")} aria-label={t("removeFor", { name })}>
        {isSelf ? t("leave") : t("remove")}
      </Button>
      <Dialog
        open={mode !== null}
        onOpenChange={(open) => (open ? undefined : close())}
        title={mode === "remove" ? t("removeTitle", { name }) : t("roleTitle", { name })}
        description={mode === "role" ? t("roleDescription", { role: tr(nextRole) }) : t("removeDescription")}
        size="sm"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={close} disabled={pending}>
              {tc("cancel")}
            </Button>
            <Button type="button" variant={mode === "remove" ? "danger" : "primary"} onClick={confirm} loading={pending} disabled={justification.trim().length < 5}>
              {mode === "remove" ? t("removeConfirm") : t("roleConfirm")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <FormField label={t("justification")} hint={t("justificationHint")} required>
            <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={3} maxLength={500} disabled={pending} />
          </FormField>
          {error ? (
            <p role="alert" className="type-body-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}
