import type { Metadata } from "next";
import { Search, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TalentCardCompact } from "@/components/brand-portal/TalentCardView";
import { Button, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { getBrandContext } from "@/lib/brand-portal/server";
import { searchTalentsForBrand } from "@/lib/deals/queries";
import { AVAILABILITIES, NETWORKS, UFS } from "@/lib/talent/vocab";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brandPortal.meta");
  return { title: t("creators") };
}

type Props = { searchParams: Promise<{ q?: string; segmento?: string; uf?: string; rede?: string; seguidores?: string; disponibilidade?: string }> };

const pick = (value: string | undefined, allowed: readonly string[]) => (value && allowed.includes(value) ? value : undefined);

// Catálogo autorizado (6.3): só creators com consentimento vigente e liberados pela agência; cada cartão
// mostra o que o kit libera, com os critérios atendidos e "dados insuficientes" quando falta base.
export default async function BrandCreatorsPage({ searchParams }: Props) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const sp = await searchParams;
  const minFollowers = sp.seguidores && /^\d{1,9}$/.test(sp.seguidores) ? Number(sp.seguidores) : undefined;
  const filters = { q: sp.q?.slice(0, 60), segment: sp.segmento && /^[0-9a-f-]{36}$/i.test(sp.segmento) ? sp.segmento : undefined, state: pick(sp.uf, UFS), network: pick(sp.rede, NETWORKS), minFollowers, availability: pick(sp.disponibilidade, AVAILABILITIES.filter((a) => a !== "unavailable")) };
  const [t, tn, list] = await Promise.all([getTranslations("brandPortal.creators"), getTranslations("mediaKit.networks"), searchTalentsForBrand(ctx.brand.id, filters)]);
  const filtered = Boolean(filters.q || filters.segment || filters.state || filters.network || filters.minFollowers || filters.availability);
  // segmentos para o filtro: os que aparecem nos cartões (a marca não lê a lista interna da agência)
  const segments = new Map<string, string>();
  for (const card of list.items) for (const s of card.segments ?? []) segments.set(s.id, s.name);

  if (!list.available) {
    return (
      <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
        <EmptyState icon={<Users />} title={t("unavailable")} description={t("unavailableHint")} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} description={ctx.agency ? t("description", { agency: ctx.agency.name }) : t("descriptionNoAgency")} />
      <form method="get" action="/marca/creators" className="grid gap-3 rounded-2xl border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_6rem_1fr_1fr_1fr_auto]" data-testid="catalog-filters">
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("filters.search")}
          <Input name="q" defaultValue={filters.q ?? ""} maxLength={60} placeholder={t("filters.searchPlaceholder")} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("filters.segment")}
          <Select name="segmento" defaultValue={filters.segment ?? ""}>
            <option value="">{t("filters.all")}</option>
            {Array.from(segments.entries()).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("filters.state")}
          <Select name="uf" defaultValue={filters.state ?? ""}>
            <option value="">{t("filters.all")}</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("filters.network")}
          <Select name="rede" defaultValue={filters.network ?? ""}>
            <option value="">{t("filters.all")}</option>
            {NETWORKS.map((n) => (
              <option key={n} value={n}>
                {tn(n)}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("filters.minFollowers")}
          <Input name="seguidores" type="number" inputMode="numeric" min={0} step={1000} defaultValue={minFollowers ?? ""} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-fg-muted">
          {t("filters.availability")}
          <Select name="disponibilidade" defaultValue={filters.availability ?? ""}>
            <option value="">{t("filters.all")}</option>
            <option value="available">{t("availability.available")}</option>
            <option value="limited">{t("availability.limited")}</option>
          </Select>
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" size="sm" variant="secondary" leadingIcon={<Search />}>
            {t("filters.apply")}
          </Button>
          {filtered ? (
            // mesma página, só tira os parâmetros: carga completa (docs/testing.md)
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            <a href="/marca/creators" className="inline-flex min-h-9 items-center px-2 text-sm text-fg-muted underline-offset-2 hover:underline">
              {t("filters.clear")}
            </a>
          ) : null}
        </div>
      </form>
      <p className="type-caption text-fg-muted">{t("sourceNote")}</p>
      {list.items.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="catalog-list">
          {list.items.map((card) => (
            <li key={card.id}>
              <TalentCardCompact card={card} href={`/marca/creators/${card.id}`} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<Users />} title={filtered ? t("emptyFiltered") : t("empty")} description={filtered ? undefined : t("emptyHint")} />
        </div>
      )}
    </div>
  );
}
