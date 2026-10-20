"use client";

import { useTranslations } from "next-intl";
import { setUserRole } from "@/app/admin/ops-actions";
import { ConfirmActionDialog } from "@/components/admin";
import { Badge } from "@/components/ui";

type Role = "admin" | "creator" | "seller";
const ROLES: Role[] = ["admin", "creator", "seller"];

type Props = { userId: string; activeGlobalRoles: string[]; isSelf: boolean };

// Concede/revoga papéis globais via RPC auditada (justificativa obrigatória).
export function RoleToggles({ userId, activeGlobalRoles, isSelf }: Props) {
  const t = useTranslations("adminOps.users");
  const ts = useTranslations("adminCommon.status");
  return (
    <ul className="flex flex-col divide-y divide-border">
      {ROLES.map((role) => {
        const active = activeGlobalRoles.includes(role);
        const label = t(`roles.${role}`);
        // Remover o próprio admin é bloqueado na RPC; não oferecemos o botão.
        const blocked = isSelf && role === "admin" && active;
        return (
          <li key={role} className="flex min-h-14 items-center justify-between gap-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-fg">{label}</span>
              {active && (
                <Badge variant="success" size="sm">
                  {ts("active")}
                </Badge>
              )}
            </div>
            <ConfirmActionDialog
              triggerSize="md"
              triggerLabel={active ? t("detail.revoke") : t("detail.grant")}
              triggerVariant={active ? "ghost" : "secondary"}
              title={active ? t("detail.revokeTitle", { role: label }) : t("detail.grantTitle", { role: label })}
              description={t("detail.roleWarning")}
              requireJustification
              destructive={active}
              disabled={blocked}
              action={(justification) => setUserRole({ userId, role, active: !active }, justification)}
            />
          </li>
        );
      })}
    </ul>
  );
}
