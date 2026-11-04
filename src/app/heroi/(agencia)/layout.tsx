import { Briefcase } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AgencyHeader } from "@/app/heroi/_components/AgencyHeader";
import { EmptyState } from "@/components/ui";
import { getTalentContext } from "@/lib/talent/server";

// Telas do Portal do Herói que dependem da agência (0065/0087 + 0097): oportunidades, tarefas, disponibilidade,
// media kit, portfólio, documentos, consentimento e assinaturas. Só para quem está num casting (login próprio na
// ficha ou titular do herói ligado); tudo vem de talent_my_context() (o herói não lê talent_profiles). A casca
// (menu, sino) é a do portal, em heroi/layout.tsx.
export default async function HeroAgencyLayout({ children }: { children: ReactNode }) {
  const [ctx, t] = await Promise.all([getTalentContext(), getTranslations("talent")]);
  if (ctx.state !== "ok") {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid={ctx.state === "unavailable" ? "module-unavailable" : "office-none"}>
        <EmptyState icon={<Briefcase />} title={ctx.state === "unavailable" ? t("home.unavailable") : t("home.none")} description={ctx.state === "unavailable" ? undefined : t("home.noneHint")} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5" data-testid="office">
      <AgencyHeader talent={ctx.talent} />
      {children}
    </div>
  );
}
