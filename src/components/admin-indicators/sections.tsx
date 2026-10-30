import { getTranslations } from "next-intl/server";
import { KpiCard } from "@/components/admin-ops/KpiCard";
import { Badge, DemoBadge } from "@/components/ui";
import { formatCurrency, formatDate, formatNumber, formatPercent } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import {
  COLLECTIBLE_STATUSES,
  CONTACT_STATUSES,
  heroTotals,
  heroViews,
  rankHeroes,
  rankHeroesByPageViews,
  recipeTaps,
  SERVICE_ORDER_STATUSES,
  sumDaily,
  type CollectiblesData,
  type ConversionData,
  type HeroesData,
  type ProfessionalsData,
  type RankingData,
  type ShortcutsData,
} from "@/lib/indicators";
import { durationParts } from "@/lib/professionals/rules";
import { BarList, Block, DailyBars, Funnel, StatGrid } from "./charts";

// Seções do /admin/indicadores (0060). Cada bloco sem número vira "Sem dados ainda".

async function tools() {
  const [t, tp, locale] = await Promise.all([getTranslations("adminOps.indicators"), getTranslations("professionals.portal"), getLocale()]);
  const n = (v: number) => formatNumber(v, locale);
  const money = (cents: number) => formatCurrency(cents / 100, locale);
  const day = (d: string) => formatDate(d, locale, { day: "2-digit", month: "2-digit" }, "UTC");
  const ofPrevious = (ratio: number) => t("ofPrevious", { share: formatPercent(ratio, locale) });
  const dayBar = (d: string, v: number) => t("dayBar", { date: day(d), count: n(v) });
  // mesmo formato do painel do profissional e de /admin/professionals ("45 min", "3 h", "2 d")
  const duration = (minutes: number | null) => {
    if (minutes === null) return t("professionals.noResponse");
    const p = durationParts(minutes);
    return tp(`duration.${p.unit}`, { value: p.value });
  };
  return { t, locale, n, money, day, ofPrevious, dayBar, duration, empty: t("noData") };
}

// ---------------------------------------------------------------- por herói
export async function HeroesSection({ data }: { data: HeroesData }) {
  const { t, n, day, dayBar, empty } = await tools();
  const totals = heroTotals(data.rows);
  const anyActivity = data.rows.some(
    (h) => h.followers > 0 || heroViews(h) + recipeTaps(h) + h.shortcutOpens + h.proContratar + h.proVerPerfil + h.collectibleBids + h.newFollowers + h.pageViews > 0,
  );
  const pageViewsTotal = sumDaily(data.dailyPageViews);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <KpiCard label={t("heroes.kpis.followers")} value={n(totals.followers)} />
        <KpiCard label={t("heroes.kpis.pageViews")} value={n(totals.pageViews)} />
        <KpiCard label={t("heroes.kpis.newFollowers")} value={n(totals.newFollowers)} />
        <KpiCard label={t("heroes.kpis.views")} value={n(totals.views)} />
        <KpiCard label={t("heroes.kpis.recipeTaps")} value={n(totals.recipeTaps)} />
        <KpiCard label={t("heroes.kpis.proTaps")} value={n(totals.proTaps)} />
        <KpiCard label={t("heroes.kpis.shortcutOpens")} value={n(totals.shortcutOpens)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Block id="ind-follows" title={t("heroes.dailyTitle")} description={t("heroes.dailyDescription")} empty={sumDaily(data.dailyFollows) === 0} emptyLabel={empty}>
          <DailyBars points={data.dailyFollows} label={t("heroes.dailyTitle")} barLabel={dayBar} formatDay={day} />
        </Block>
        {/* visitas à página do herói (0061): contador por dia, sem pessoa */}
        <Block
          id="ind-page-views"
          title={t("heroes.pageViewsTitle")}
          description={`${t("heroes.pageViewsDescription", { count: n(pageViewsTotal) })} ${data.pageViewsSince ? t("heroes.pageViewsSince", { date: day(data.pageViewsSince) }) : t("heroes.pageViewsNotTracked")}`}
          empty={pageViewsTotal === 0}
          emptyLabel={empty}
        >
          <DailyBars points={data.dailyPageViews} label={t("heroes.pageViewsTitle")} barLabel={dayBar} formatDay={day} />
        </Block>
      </div>

      <Block id="ind-heroes" title={t("heroes.listTitle")} description={t("heroes.listDescription")} empty={!anyActivity} emptyLabel={empty}>
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2" data-testid="indicator-heroes">
          {data.rows.map((h) => (
            <li key={h.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-bg p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-semibold text-fg">{h.name}</p>
                {h.status !== "active" ? (
                  <Badge variant="neutral" size="sm">
                    {t("heroes.inactive")}
                  </Badge>
                ) : null}
              </div>
              <StatGrid
                stats={[
                  { key: "followers", label: t("heroes.stats.followers"), value: n(h.followers) },
                  { key: "new", label: t("heroes.stats.newFollowers"), value: n(h.newFollowers) },
                  { key: "pageviews", label: t("heroes.stats.pageViews"), value: n(h.pageViews) },
                  { key: "cv", label: t("heroes.stats.contentViews"), value: n(h.contentViews) },
                  { key: "pv", label: t("heroes.stats.programViews"), value: n(h.programViews) },
                  { key: "fazer", label: t("heroes.stats.fazer"), value: n(h.recipeFazer) },
                  { key: "comprar", label: t("heroes.stats.comprarPronto"), value: n(h.recipeComprarPronto) },
                  { key: "lista", label: t("heroes.stats.listaCompras"), value: n(h.recipeListaCompras) },
                  { key: "ver", label: t("heroes.stats.verPerfil"), value: n(h.proVerPerfil) },
                  { key: "contratar", label: t("heroes.stats.contratar"), value: n(h.proContratar) },
                  { key: "atalhos", label: t("heroes.stats.shortcutOpens"), value: n(h.shortcutOpens) },
                  { key: "lances", label: t("heroes.stats.bids"), value: n(h.collectibleBids) },
                  { key: "cview", label: t("heroes.stats.collectibleViews"), value: n(h.collectibleViews) },
                ]}
              />
            </li>
          ))}
        </ul>
      </Block>
    </div>
  );
}

// ---------------------------------------------------------------- por atalho
export async function ShortcutsSection({ data }: { data: ShortcutsData }) {
  const { t, n, day, dayBar, empty } = await tools();
  const tl = await getTranslations("discover.personalities.libraries.labels");
  const total = sumDaily(data.daily);
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl border border-border bg-surface p-3 type-body-sm text-fg-muted">
        {data.trackingSince ? t("shortcuts.trackingSince", { date: day(data.trackingSince) }) : t("shortcuts.notTracked")}
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Block id="ind-sc-source" title={t("shortcuts.bySourceTitle")} description={t("shortcuts.bySourceDescription")} empty={data.bySource.length === 0} emptyLabel={empty}>
          <BarList
            label={t("shortcuts.bySourceTitle")}
            items={data.bySource.map((s) => ({ key: s.sourceKey, label: tl(s.sourceKey), value: s.opens, display: n(s.opens), hint: t("shortcuts.heroesCount", { count: n(s.heroes) }) }))}
          />
        </Block>
        <Block id="ind-sc-daily" title={t("shortcuts.dailyTitle")} description={t("shortcuts.dailyDescription", { count: n(total) })} empty={total === 0} emptyLabel={empty}>
          <DailyBars points={data.daily} label={t("shortcuts.dailyTitle")} barLabel={dayBar} formatDay={day} />
        </Block>
      </div>
      <Block id="ind-sc-hero" title={t("shortcuts.byHeroTitle")} description={t("shortcuts.byHeroDescription")} empty={data.byHero.length === 0} emptyLabel={empty}>
        <BarList
          ordered
          tone="info"
          label={t("shortcuts.byHeroTitle")}
          items={data.byHero.slice(0, 20).map((h) => ({ key: `${h.slug}/${h.sourceKey}`, label: t("shortcuts.pair", { hero: h.name, shortcut: tl(h.sourceKey) }), value: h.opens, display: n(h.opens) }))}
        />
      </Block>
    </div>
  );
}

// ---------------------------------------------------------------- conversão
export async function ConversionSection({ data }: { data: ConversionData }) {
  const { t, n, money, ofPrevious, empty } = await tools();
  const rf = data.recipeFunnel;
  const pf = data.programFunnel;
  const sf = data.shopFunnel;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Block
          id="ind-conv-recipe"
          title={t("conversion.recipeTitle")}
          description={t("conversion.recipeDescription")}
          empty={rf.views + rf.comprarPronto + rf.readyCartAdds + rf.readyOrderedQty + rf.fazer + rf.listaCompras === 0}
          emptyLabel={empty}
        >
          <Funnel
            label={t("conversion.recipeTitle")}
            ofPrevious={ofPrevious}
            steps={[
              { key: "views", label: t("conversion.steps.recipeViews"), value: rf.views, display: n(rf.views) },
              { key: "comprar", label: t("conversion.steps.comprarPronto"), value: rf.comprarPronto, display: n(rf.comprarPronto) },
              { key: "cart", label: t("conversion.steps.readyCartAdds"), value: rf.readyCartAdds, display: n(rf.readyCartAdds) },
              { key: "orders", label: t("conversion.steps.readyOrdered"), value: rf.readyOrderedQty, display: n(rf.readyOrderedQty) },
            ]}
          />
          <p className="type-caption text-fg-muted">{t("conversion.otherActions", { fazer: n(rf.fazer), lista: n(rf.listaCompras) })}</p>
        </Block>

        <Block id="ind-conv-program" title={t("conversion.programTitle")} description={t("conversion.programDescription")} empty={pf.views + pf.enrolled + pf.completed === 0} emptyLabel={empty}>
          <Funnel
            label={t("conversion.programTitle")}
            ofPrevious={ofPrevious}
            steps={[
              { key: "views", label: t("conversion.steps.programViews"), value: pf.views, display: n(pf.views) },
              { key: "enrolled", label: t("conversion.steps.enrolled"), value: pf.enrolled, display: n(pf.enrolled) },
              { key: "completed", label: t("conversion.steps.completed"), value: pf.completed, display: n(pf.completed) },
            ]}
          />
        </Block>
      </div>

      <Block
        id="ind-conv-shop"
        title={t("conversion.shopTitle")}
        description={t("conversion.shopDescription")}
        empty={sf.productViews + sf.cartAdds + sf.checkouts + sf.testOrders === 0}
        emptyLabel={empty}
        action={<DemoBadge size="sm" />}
      >
        <Funnel
          label={t("conversion.shopTitle")}
          ofPrevious={ofPrevious}
          steps={[
            { key: "views", label: t("conversion.steps.productViews"), value: sf.productViews, display: n(sf.productViews) },
            { key: "cart", label: t("conversion.steps.cartAdds"), value: sf.cartAdds, display: n(sf.cartAdds) },
            { key: "checkout", label: t("conversion.steps.checkouts"), value: sf.checkouts, display: n(sf.checkouts) },
            { key: "orders", label: t("conversion.steps.testOrders"), value: sf.testOrders, display: n(sf.testOrders) },
          ]}
        />
        <p className="type-caption text-fg-muted">{t("conversion.testOrdersTotal", { total: money(sf.testOrdersTotalCents) })}</p>
      </Block>

      <div className="grid gap-4 lg:grid-cols-2">
        <Block id="ind-conv-recipes" title={t("conversion.recipesTitle")} description={t("conversion.recipesDescription")} empty={data.recipes.length === 0} emptyLabel={empty}>
          <BarList
            label={t("conversion.recipesTitle")}
            items={[...data.recipes].sort((a, b) => b.comprarPronto - a.comprarPronto || b.views - a.views).slice(0, 15).map((r) => ({
              key: r.slug,
              label: r.title,
              value: r.comprarPronto,
              display: n(r.comprarPronto),
              hint: r.hasReadyProduct
                ? t("conversion.recipeHint", { views: n(r.views), cart: n(r.readyCartAdds), ordered: n(r.readyOrderedQty) })
                : t("conversion.recipeHintNoProduct", { views: n(r.views) }),
            }))}
          />
        </Block>
        <Block id="ind-conv-programs" title={t("conversion.programsTitle")} description={t("conversion.programsDescription")} empty={data.programs.length === 0} emptyLabel={empty}>
          <BarList
            tone="success"
            label={t("conversion.programsTitle")}
            items={data.programs.slice(0, 15).map((p) => ({
              key: p.slug,
              label: p.title,
              value: p.enrolled,
              display: n(p.enrolled),
              hint: t("conversion.programHint", { views: n(p.views), completed: n(p.completed) }),
            }))}
          />
        </Block>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- profissionais
export async function ProfessionalsSection({ data }: { data: ProfessionalsData }) {
  const { t, n, money, duration, empty } = await tools();
  const ts = await getTranslations("professionals.specialty");
  const tot = data.totals;
  const specialty = (s: string) => (["nutritionist", "personal_trainer", "physiotherapist", "psychologist"].includes(s) ? ts(s as "nutritionist") : s);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label={t("professionals.kpis.orders")} value={n(tot.orders)} />
        <KpiCard label={t("professionals.kpis.completed")} value={n(tot.byStatus.completed)} />
        <KpiCard label={t("professionals.kpis.revenue")} value={money(tot.revenueCents)} hint={t("professionals.revenueHint")} tag={<DemoBadge size="sm" />} />
        <KpiCard label={t("professionals.kpis.medianResponse")} value={duration(tot.medianResponseMinutes)} />
        <KpiCard className="col-span-2 md:col-span-1" label={t("professionals.kpis.taps")} value={n(tot.tapsContratar)} hint={t("professionals.tapsHint", { count: n(tot.tapsVerPerfil) })} />
      </div>

      <Block id="ind-pro-status" title={t("professionals.statusTitle")} description={t("professionals.statusDescription")} empty={tot.orders === 0} emptyLabel={empty}>
        <BarList
          label={t("professionals.statusTitle")}
          items={SERVICE_ORDER_STATUSES.map((s) => ({ key: s, label: t(`professionals.status.${s}`), value: tot.byStatus[s], display: n(tot.byStatus[s]) }))}
        />
      </Block>

      <Block id="ind-pro-list" title={t("professionals.perProTitle")} empty={data.professionals.length === 0} emptyLabel={empty}>
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {data.professionals.map((p) => (
            <li key={p.slug} className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-bg p-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-fg">{p.name}</p>
                <p className="type-caption text-fg-muted">{specialty(p.specialty)}</p>
              </div>
              <StatGrid
                stats={[
                  { key: "orders", label: t("professionals.stats.orders"), value: n(p.orders) },
                  { key: "completed", label: t("professionals.stats.completed"), value: n(p.byStatus.completed) },
                  { key: "revenue", label: t("professionals.stats.revenue"), value: money(p.revenueCents) },
                  { key: "response", label: t("professionals.stats.response"), value: duration(p.medianResponseMinutes) },
                  { key: "ver", label: t("professionals.stats.verPerfil"), value: n(p.tapsVerPerfil) },
                  { key: "contratar", label: t("professionals.stats.contratar"), value: n(p.tapsContratar) },
                ]}
              />
            </li>
          ))}
        </ul>
      </Block>

      <Block id="ind-pro-services" title={t("professionals.perServiceTitle")} empty={data.services.length === 0} emptyLabel={empty}>
        <BarList
          tone="success"
          label={t("professionals.perServiceTitle")}
          items={data.services.map((s, i) => ({
            key: `${i}`,
            label: s.title,
            value: s.orders,
            display: n(s.orders),
            hint: t("professionals.serviceHint", { professional: s.professional, completed: n(s.completed), revenue: money(s.revenueCents) }),
          }))}
        />
      </Block>
    </div>
  );
}

// ---------------------------------------------------------------- colecionáveis
export async function CollectiblesSection({ data }: { data: CollectiblesData }) {
  const { t, n, money, empty } = await tools();
  const anyItem = COLLECTIBLE_STATUSES.some((s) => data.status[s] > 0);
  const contactTotal = CONTACT_STATUSES.reduce((acc, s) => acc + data.contact[s], 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label={t("collectibles.kpis.live")} value={n(data.status.live)} />
        <KpiCard label={t("collectibles.kpis.ended")} value={n(data.status.ended)} />
        <KpiCard label={t("collectibles.kpis.bids")} value={n(data.bids)} />
        <KpiCard label={t("collectibles.kpis.views")} value={n(data.views)} />
        <KpiCard label={t("collectibles.kpis.won")} value={n(data.won)} hint={t("collectibles.noBidsHint", { count: n(data.noBids) })} />
        <KpiCard label={t("collectibles.kpis.finalValue")} value={money(data.finalCents)} tag={<DemoBadge size="sm" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Block id="ind-col-status" title={t("collectibles.statusTitle")} description={t("collectibles.statusDescription")} empty={!anyItem} emptyLabel={empty}>
          <BarList label={t("collectibles.statusTitle")} items={COLLECTIBLE_STATUSES.map((s) => ({ key: s, label: t(`collectibles.status.${s}`), value: data.status[s], display: n(data.status[s]) }))} />
        </Block>
        <Block id="ind-col-contact" title={t("collectibles.contactTitle")} description={t("collectibles.contactDescription")} empty={contactTotal === 0} emptyLabel={empty}>
          <BarList tone="warning" label={t("collectibles.contactTitle")} items={CONTACT_STATUSES.map((s) => ({ key: s, label: t(`collectibles.contact.${s}`), value: data.contact[s], display: n(data.contact[s]) }))} />
        </Block>
      </div>

      <Block id="ind-col-items" title={t("collectibles.itemsTitle")} description={t("collectibles.itemsDescription")} empty={data.items.length === 0} emptyLabel={empty}>
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {data.items.map((i, index) => (
            <li key={`${index}-${i.title}`} className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-bg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-fg">{i.title}</p>
                  <p className="type-caption text-fg-muted">{i.hero ? t("collectibles.itemHint", { hero: i.hero, status: t(`collectibles.status.${statusKey(i.status)}`) }) : t(`collectibles.status.${statusKey(i.status)}`)}</p>
                </div>
                {i.isDemo ? <DemoBadge size="sm" /> : null}
              </div>
              <StatGrid
                stats={[
                  { key: "bids", label: t("collectibles.stats.bids"), value: n(i.bids) },
                  { key: "total", label: t("collectibles.stats.totalBids"), value: n(i.totalBids) },
                  { key: "views", label: t("collectibles.stats.views"), value: n(i.views) },
                  { key: "final", label: t("collectibles.stats.final"), value: i.finalCents === null ? t("none") : money(i.finalCents) },
                  { key: "contact", label: t("collectibles.stats.contact"), value: i.contactStatus === "none" ? t("none") : t(`collectibles.contact.${contactKey(i.contactStatus)}`) },
                ]}
              />
            </li>
          ))}
        </ul>
      </Block>
    </div>
  );
}

const statusKey = (s: string) => ((COLLECTIBLE_STATUSES as readonly string[]).includes(s) ? (s as (typeof COLLECTIBLE_STATUSES)[number]) : "draft");
const contactKey = (s: string) => ((CONTACT_STATUSES as readonly string[]).includes(s) ? (s as (typeof CONTACT_STATUSES)[number]) : "pending");

// ---------------------------------------------------------------- ranking
export async function RankingSection({ data }: { data: { ranking: RankingData; heroes: HeroesData } }) {
  const { t, n, empty } = await tools();
  const heroes = rankHeroes(data.heroes.rows);
  const byPageViews = rankHeroesByPageViews(data.heroes.rows);
  const r = data.ranking;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Block id="ind-rank-heroes" title={t("ranking.heroesTitle")} description={t("ranking.heroesDescription")} empty={heroes.length === 0} emptyLabel={empty}>
        <BarList
          ordered
          label={t("ranking.heroesTitle")}
          items={heroes.map(({ hero, actions }) => ({
            key: hero.id,
            label: hero.name,
            value: actions,
            display: n(actions),
            hint: t("ranking.heroHint", { views: n(heroViews(hero)), taps: n(recipeTaps(hero) + hero.proContratar + hero.proVerPerfil), opens: n(hero.shortcutOpens) }),
          }))}
        />
      </Block>
      <Block id="ind-rank-page-views" title={t("ranking.pageViewsTitle")} description={t("ranking.pageViewsDescription")} empty={byPageViews.length === 0} emptyLabel={empty}>
        <BarList
          ordered
          tone="info"
          label={t("ranking.pageViewsTitle")}
          items={byPageViews.map((hero) => ({ key: hero.id, label: hero.name, value: hero.pageViews, display: n(hero.pageViews) }))}
        />
      </Block>
      <Block id="ind-rank-recipes" title={t("ranking.recipesTitle")} description={t("ranking.recipesDescription")} empty={r.recipes.length === 0} emptyLabel={empty}>
        <BarList
          ordered
          tone="warning"
          label={t("ranking.recipesTitle")}
          items={r.recipes.map((x) => ({
            key: x.slug,
            label: x.title,
            value: x.actions,
            display: n(x.actions),
            hint: t("ranking.recipeHint", { fazer: n(x.fazer), comprar: n(x.comprarPronto), lista: n(x.listaCompras) }),
          }))}
        />
      </Block>
      <Block id="ind-rank-programs" title={t("ranking.programsTitle")} description={t("ranking.programsDescription")} empty={r.programs.length === 0} emptyLabel={empty}>
        <BarList
          ordered
          tone="success"
          label={t("ranking.programsTitle")}
          items={r.programs.map((x) => ({ key: x.slug, label: x.title, value: x.enrolled, display: n(x.enrolled), hint: t("ranking.viewsHint", { views: n(x.views) }) }))}
        />
      </Block>
      <Block id="ind-rank-products" title={t("ranking.productsTitle")} description={t("ranking.productsDescription")} empty={r.products.length === 0} emptyLabel={empty}>
        <BarList
          ordered
          tone="info"
          label={t("ranking.productsTitle")}
          items={r.products.map((x) => ({ key: x.slug, label: x.title, value: x.cartAdds, display: n(x.cartAdds), hint: t("ranking.viewsHint", { views: n(x.views) }) }))}
        />
      </Block>
    </div>
  );
}
