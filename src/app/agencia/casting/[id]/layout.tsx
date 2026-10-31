import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { RouteTabs } from "@/components/agency/RouteTabs";
import { TalentStatusBadges } from "@/components/agency/TalentStatusBadges";
import { Avatar, PageHeader } from "@/components/ui";
import { loadTalent } from "./_lib";

type Props = { children: ReactNode; params: Promise<{ id: string }> };

// Ficha do talento com abas por rota (Resumo, Redes, Media kit, Documentos, Histórico).
export default async function TalentLayout({ children, params }: Props) {
  const { id } = await params;
  const [{ talent }, t] = await Promise.all([loadTalent(id), getTranslations("agency.casting")]);
  const base = `/agencia/casting/${talent.id}`;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar src={talent.hero?.avatarUrl ?? null} name={talent.name} size="lg" alt="" />
            <span className="min-w-0">{talent.name}</span>
          </span>
        }
        backHref="/agencia/casting"
        backLabel={t("title")}
        description={<TalentStatusBadges status={talent.commercialStatus} availability={talent.availability} consent={talent.consent} catalogVisible={talent.catalogVisible} archived={talent.archived} />}
      />
      <RouteTabs
        label={t("tabsLabel")}
        tabs={[
          { href: base, label: t("tabs.summary"), exact: true },
          { href: `${base}/redes`, label: t("tabs.networks") },
          { href: `${base}/media-kit`, label: t("tabs.kit") },
          { href: `${base}/documentos`, label: t("tabs.documents") },
          { href: `${base}/historico`, label: t("tabs.history") },
        ]}
      />
      {children}
    </div>
  );
}
