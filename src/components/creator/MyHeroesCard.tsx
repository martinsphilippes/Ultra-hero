import { Building2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { StatusBadge } from "@/components/admin";
import { Avatar, Badge } from "@/components/ui";
import type { MyHero } from "@/app/heroi/_lib/creator";
import { heroCardCompact, showWorkOnHero } from "@/lib/creator-content/rules";
import { WorkOnHeroButton } from "./content/WorkOnHeroButton";

type Props = {
  heroes: MyHero[];
  /** Herói em uso (o escolhido ou o padrão). */
  currentId: string | null;
  /** Casting da agência do herói padrão (só o nome da agência; nunca valores). */
  agency?: { heroId: string; name: string } | null;
};

// "Você trabalha para" (0092): os heróis em que a pessoa é titular ou membro da equipe, com papel, situação e o
// herói em uso para postar e criar conteúdo. Titular de um único herói vê o cartão compacto.
export async function MyHeroesCard({ heroes, currentId, agency = null }: Props) {
  const [t, ts] = await Promise.all([getTranslations("me.profile.worksFor"), getTranslations("adminCommon.status")]);
  if (heroes.length === 0) return null;
  const compact = heroCardCompact(heroes);
  return (
    <section aria-labelledby="works-for-title" data-testid="works-for" data-compact={compact ? "true" : "false"} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <h3 id="works-for-title" className="text-base font-semibold text-fg">
        {t("title")}
      </h3>
      <ul className="flex flex-col divide-y divide-border">
        {heroes.map((h) => {
          const inUse = h.id === currentId && heroes.length > 1;
          return (
            <li key={h.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0" data-testid="works-for-hero" data-hero-id={h.id}>
              <div className="flex items-center gap-3">
                <Avatar src={h.avatar_url} name={h.name} size="md" alt="" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate text-sm font-semibold text-fg">{h.name}</p>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="neutral" size="sm">
                      {h.role === "owner" ? t("owner") : t("member")}
                    </Badge>
                    <StatusBadge status={h.status} label={h.status === "pending" ? t("pending") : ts(h.status)} />
                    {inUse ? (
                      <Badge variant="accent" size="sm" data-testid="works-for-current">
                        {t("current")}
                      </Badge>
                    ) : null}
                  </span>
                  {agency && agency.heroId === h.id ? (
                    <p className="type-caption inline-flex items-center gap-1 text-fg-muted">
                      <Building2 className="size-3.5" aria-hidden="true" />
                      {t("casting", { agency: agency.name })}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {h.status === "active" ? (
                  <Link href={`/personalities/${h.slug}`} className="inline-flex min-h-9 items-center text-sm font-semibold text-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                    {t("publicPage")}
                  </Link>
                ) : null}
                {showWorkOnHero(heroes, h, currentId) ? <WorkOnHeroButton heroId={h.id} name={h.name} /> : null}
              </div>
            </li>
          );
        })}
      </ul>
      {!compact ? <p className="type-caption text-fg-muted">{t("hint")}</p> : null}
    </section>
  );
}
