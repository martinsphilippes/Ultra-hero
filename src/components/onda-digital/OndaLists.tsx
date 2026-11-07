import { getTranslations } from "next-intl/server";
import { BrandLogo } from "@/components/brand-universe/BrandLogo";
import { formatCompact, formatMetric } from "@/lib/onda-digital/format";
import type { OndaCase, OndaProfile } from "@/lib/onda-digital/queries";
import { cn } from "@/lib/utils";

// Listas da Onda Digital (0132): as páginas/perfis com a foto em concha e os seguidores, e os cases com os números.

function ProfileItem({ p, locale, followersLabel }: { p: OndaProfile; locale: string; followersLabel: (count: string) => string }) {
  return (
    <li className="flex items-center gap-3">
      {p.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.avatar_url} alt="" loading="lazy" className="size-14 shrink-0 object-contain drop-shadow-[3px_3px_0_#0c0c20]" />
      ) : (
        <span className="size-14 shrink-0 rounded-full border-2 border-[#0c0c20] bg-white" aria-hidden="true" />
      )}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-extrabold text-[#0c0c20]">@{p.handle}</span>
        <span className="text-sm font-bold text-[#0b6f87]">{followersLabel(formatCompact(p.followers, locale))}</span>
      </span>
    </li>
  );
}

/** Grade de perfis: os 8 primeiros à mostra; o resto em "Ver as N páginas" (funciona sem JavaScript). */
export async function OndaProfileGrid({ profiles, locale, moreLabel, testId }: { profiles: OndaProfile[]; locale: string; moreLabel: string; testId: string }) {
  const t = await getTranslations("ondaDigital.fronts");
  const followers = (count: string) => t("followers", { count });
  const first = profiles.slice(0, 8);
  const rest = profiles.slice(8);
  return (
    <div data-testid={testId}>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
        {first.map((p) => (
          <ProfileItem key={p.id} p={p} locale={locale} followersLabel={followers} />
        ))}
      </ul>
      {rest.length > 0 ? (
        <details className="group mt-4">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-full border-2 border-[#0c0c20] bg-white px-4 text-sm font-extrabold text-[#0c0c20] shadow-[3px_3px_0_#0c0c20] group-open:hidden">
            {moreLabel}
          </summary>
          <ul className="mt-4 grid grid-cols-1 gap-x-4 gap-y-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
            {rest.map((p) => (
              <ProfileItem key={p.id} p={p} locale={locale} followersLabel={followers} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

const CASE_PANELS = ["bg-[#0a3d6b]", "bg-[#0f9fc4]", "bg-[#3a14c9]"];

/** Cases: "Onda Digital + Marca", a frase e os números da apresentação (os da área da marca com o selo). */
export async function OndaCaseList({ cases, locale, category }: { cases: OndaCase[]; locale: string; category: string | null }) {
  const t = await getTranslations("ondaDigital.cases");
  return (
    <ul className="grid gap-5 md:grid-cols-2" data-testid="onda-cases">
      {cases.map((c, i) => (
        <li key={c.id} className="flex flex-col overflow-hidden border-2 border-[#0c0c20] bg-white shadow-[5px_5px_0_#0c0c20]">
          <div className={cn("flex items-center gap-3 p-4 text-white", CASE_PANELS[i % CASE_PANELS.length])}>
            <BrandLogo name={c.brand} url={c.logo_url} />
            <div className="flex min-w-0 flex-col">
              <span className="text-lg font-extrabold leading-tight">{t("name", { brand: c.brand })}</span>
              {category && c.category === category ? (
                <span className="mt-1 w-fit rounded-full bg-[#ffd84d] px-2 py-0.5 text-xs font-bold text-[#0c0c20]">{t("yourArea")}</span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-3 bg-[#ffe06f] p-4">
            <p className="text-sm text-[#0c0c20]">{c.description}</p>
            <dl className="mt-auto flex flex-wrap gap-3">
              {c.metrics.map((m) => (
                <div key={m.k} className="flex min-w-28 flex-col items-center rounded-full border-2 border-[#0c0c20] bg-[#fff6ea] px-4 py-2 shadow-[3px_3px_0_#0c0c20]">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-[#2a1040]">{t(`metrics.${m.k}`)}</dt>
                  <dd className="text-xl font-extrabold text-[#2a1040]">{formatMetric(m, locale)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </li>
      ))}
    </ul>
  );
}
