import { Stethoscope } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { PortalShell } from "@/components/layout/PortalShell";
import { Button, EmptyState } from "@/components/ui";
import { getRoles, requireRole } from "@/lib/auth/session";
import { getMyProfessional } from "@/lib/professionals/queries";

// Portal do profissional (0058): gate de papel no servidor (admin também passa) e perfil ligado à
// conta. Sem perfil (ou sem a 0058 no banco) mostra um aviso curto no lugar das telas.
export default async function ProfessionalLayout({ children }: { children: ReactNode }) {
  await requireRole("professional", "/profissional");
  const [mine, roles, t] = await Promise.all([getMyProfessional(), getRoles(), getTranslations("professionals.portal")]);
  const isAdmin = roles.some((r) => r.role === "admin");

  return (
    <PortalShell portal="professional">
      {mine.professional ? (
        children
      ) : (
        <div className="rounded-2xl border border-border bg-surface" data-testid="professional-portal-empty">
          <EmptyState
            icon={<Stethoscope />}
            title={!mine.available ? t("unavailable") : t("noProfile")}
            description={isAdmin ? t("noProfileAdmin") : undefined}
            action={
              isAdmin ? (
                <Button asChild>
                  <Link href="/admin/professionals">{t("goAdmin")}</Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      )}
    </PortalShell>
  );
}
