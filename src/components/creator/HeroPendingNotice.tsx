import { Hourglass } from "lucide-react";
import { getTranslations } from "next-intl/server";

// Herói aguardando a aprovação do Ultra (0092): titular e equipe já preparam posts e conteúdos; o banco só
// deixa publicar com o herói ativo, e nada aparece ao público antes disso.
export async function HeroPendingNotice() {
  const t = await getTranslations("creator.pending");
  return (
    <div role="status" data-testid="hero-pending-notice" className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-fg">
      <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>{t("notice")}</p>
    </div>
  );
}
