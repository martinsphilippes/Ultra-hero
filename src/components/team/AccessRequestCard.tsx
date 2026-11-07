"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideAccessAction } from "@/app/agencia/cadastro/actions";
import { Avatar, Button, FormField, Select } from "@/components/ui";
import { formatCnpj } from "@/lib/invitations/rules";

export type AccessRequestView = {
  id: string;
  fullName: string;
  email: string;
  cnpj: string;
  jobTitle: string;
  level: string;
  createdLabel: string;
};

// Pedido de acesso de quem se cadastrou com e-mail do domínio da agência (0125): bem visível no topo de Funcionários
// e no Início do portal. O Adm escolhe o nível de acesso (Equipe por padrão) e aceita, ou recusa — em um toque.
export function AccessRequestCard({ request }: { request: AccessRequestView }) {
  const t = useTranslations("team.requests");
  const tl = useTranslations("team.profile.levels");
  const tr = useTranslations("agency.roles");
  const router = useRouter();
  const [role, setRole] = useState("staff");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  function decide(approve: boolean) {
    setError(null);
    start(async () => {
      const result = await decideAccessAction({ id: request.id, approve, role });
      if (!result.ok) return setError(result.error);
      setDone(approve ? "approved" : "rejected");
      router.refresh();
    });
  }

  if (done) {
    return (
      <li className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted" data-testid="access-request-done">
        {t(done === "approved" ? "approvedDone" : "rejectedDone", { name: request.fullName })}
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-3 rounded-2xl border-2 border-accent bg-surface p-4 shadow-sm" data-testid="access-request">
      <div className="flex items-start gap-3">
        <Avatar name={request.fullName} size="md" alt="" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate font-semibold text-fg">{request.fullName}</p>
          <p className="truncate text-sm text-fg-muted">{request.email}</p>
          <p className="text-sm text-fg">
            {request.jobTitle} · {isLevel(request.level) ? tl(`${request.level}.title`) : request.level}
          </p>
          <p className="type-caption text-fg-muted">
            {t("cnpj", { cnpj: formatCnpj(request.cnpj) })} · {request.createdLabel}
          </p>
        </div>
      </div>
      <FormField label={t("roleLabel")} hint={t("roleHint")}>
        <Select value={role} onChange={(e) => setRole(e.target.value)} disabled={pending} data-testid="access-request-role">
          <option value="staff">{tr("staff")}</option>
          <option value="manager">{tr("manager")}</option>
          <option value="admin">{tr("admin")}</option>
        </Select>
      </FormField>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" leadingIcon={<X />} onClick={() => decide(false)} disabled={pending} data-testid="access-request-reject">
          {t("reject")}
        </Button>
        <Button type="button" leadingIcon={<Check />} onClick={() => decide(true)} loading={pending} data-testid="access-request-approve">
          {t("approve")}
        </Button>
      </div>
    </li>
  );
}

function isLevel(level: string): level is "junior" | "pleno" | "senior" {
  return level === "junior" || level === "pleno" || level === "senior";
}
