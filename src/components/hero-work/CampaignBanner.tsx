"use client";

import { ArrowLeft, Copy, Megaphone } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button, useToast } from "@/components/ui";
import { campaignReturnHref, campaignTags, type HeroCampaign } from "@/lib/hero-work/campaign";

// Faixa "Para a campanha <título> · <marca>" no topo dos criadores (?campanha=, validado no servidor): o essencial do
// briefing (marcas obrigatórias, cupom, link, o que não fazer), copiar as marcas e voltar para a campanha.
export function CampaignBanner({ campaign, note }: { campaign: HeroCampaign; note?: string | null }) {
  const t = useTranslations("heroWork.campaign.banner");
  const { toast } = useToast();
  const tags = campaignTags(campaign);

  async function copyTags() {
    try {
      await navigator.clipboard.writeText(tags.join(" "));
      toast({ title: t("copied"), variant: "success" });
    } catch {
      toast({ title: t("copyFailed"), variant: "error" });
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent-soft/40 p-4" aria-labelledby="campaign-banner" data-testid="campaign-banner">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg [&>svg]:size-5">
          <Megaphone />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="campaign-banner" className="text-sm font-semibold text-fg">
            {t("title", { title: campaign.title, brand: campaign.brand })}
          </h2>
          <p className="type-caption text-fg-muted">{note ?? t("hint")}</p>
        </div>
      </div>
      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex flex-col gap-0.5">
          <dt className="type-caption text-fg-muted">{t("tags")}</dt>
          <dd className="break-words font-medium text-accent-text" data-testid="campaign-banner-tags">
            {tags.join(" ")}
          </dd>
        </div>
        {campaign.coupon ? (
          <div className="flex flex-col gap-0.5">
            <dt className="type-caption text-fg-muted">{t("coupon")}</dt>
            <dd className="font-mono font-semibold text-fg">{campaign.coupon}</dd>
          </div>
        ) : null}
        {campaign.links.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            <dt className="type-caption text-fg-muted">{t("links")}</dt>
            {campaign.links.map((l) => (
              <dd key={l} className="break-all text-fg">
                {l}
              </dd>
            ))}
          </div>
        ) : null}
        {campaign.donts.trim() ? (
          <div className="flex flex-col gap-0.5">
            <dt className="type-caption text-fg-muted">{t("donts")}</dt>
            <dd className="whitespace-pre-wrap type-body-sm text-fg">{campaign.donts.trim()}</dd>
          </div>
        ) : null}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" leadingIcon={<Copy />} className="min-h-11" onClick={() => void copyTags()} data-testid="campaign-copy-tags">
          {t("copy")}
        </Button>
        <Button asChild variant="ghost" leadingIcon={<ArrowLeft />} className="min-h-11">
          <Link href={campaignReturnHref(campaign.id, null)}>{t("back")}</Link>
        </Button>
      </div>
    </section>
  );
}
