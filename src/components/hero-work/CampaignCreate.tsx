import { Camera, ChefHat, Dumbbell, FileText, Layers, Video, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { QuickActions } from "@/components/ui";
import { campaignCreateHref } from "@/lib/hero-work/campaign";

// "Criar para esta campanha" (pedido do responsável, 04/11): na tela da campanha do herói, o que ele pode criar,
// cada atalho abrindo o criador que já existe com ?campanha= (faixa da campanha, texto com as marcas do briefing e,
// ao publicar, a volta para cá com o link pronto para a entrega). Post rápido em destaque; os demais em 3 colunas.
export function CampaignCreate({ campaignId }: { campaignId: string }) {
  const t = useTranslations("heroWork.campaign.create");
  const item = (kind: Parameters<typeof campaignCreateHref>[0], icon: ReactNode) => ({
    href: campaignCreateHref(kind, campaignId),
    icon,
    label: t(`kinds.${kind}`),
    title: t("itemTitle", { kind: t(`kinds.${kind}`) }),
    testId: `campaign-create-${kind}`,
  });
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent-soft/40 p-4 sm:p-5" aria-labelledby="campaign-create" data-testid="campaign-create">
      <div className="flex flex-col gap-1">
        <h2 id="campaign-create" className="text-base font-semibold text-fg">
          {t("title")}
        </h2>
        <p className="type-body-sm text-fg-muted">{t("hint")}</p>
      </div>
      <QuickActions
        label={t("title")}
        primary={item("quick", <Zap />)}
        items={[item("video", <Video />), item("photo", <Camera />), item("structured", <FileText />), item("workout", <Dumbbell />), item("program", <Layers />), item("recipe", <ChefHat />)]}
      />
    </section>
  );
}
