import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui";

const VARIANT = { admin: "accent", manager: "info", staff: "neutral", owner: "accent" } as const;

// Selo do nível de acesso (Adm da agência, Gestor, Colaborador; Dono, Equipe na marca).
export function RoleBadge({ role }: { role: "admin" | "manager" | "staff" | "owner" | "brandStaff" }) {
  const t = useTranslations("agency.roles");
  return (
    <Badge variant={role === "brandStaff" ? "neutral" : VARIANT[role]} size="sm">
      {t(role)}
    </Badge>
  );
}
