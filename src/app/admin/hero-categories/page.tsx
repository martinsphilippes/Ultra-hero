import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Panel } from "@/components/admin-content";
import { HeroCategoriesEditor, type HeroCategoryNames, type HeroCategoryRow } from "@/components/admin-content/HeroCategoriesEditor";
import { CategoryLibraryTabsPanel, type CategoryTabsOption } from "@/components/admin-content/CategoryLibraryTabsPanel";
import { PageHeader } from "@/components/ui";
import { toCategoryTabRow } from "@/lib/heroes/library-tab-queries";
import { resolveLibraryConfig, toEditorRows } from "@/lib/heroes/library-tabs";
import { createClient } from "@/lib/supabase/server";

// Categorias da aba Hero (0049): o admin cria, renomeia (pt-BR/en/es), ordena, ativa/desativa e
// exclui. As categorias de cada herói são escolhidas na tela do herói (/admin/creators/[id]).

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminContent.heroCategories");
  return { title: t("title") };
}

type CategoryRow = {
  id: string;
  slug: string;
  name: unknown;
  is_active: boolean;
  links: { position: number; creator: { name: string; status: string; sort_order: number } | null }[] | null;
};

function names(value: unknown): HeroCategoryNames {
  const map = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const read = (key: string) => (typeof map[key] === "string" ? (map[key] as string) : "");
  return { "pt-BR": read("pt-BR"), en: read("en"), es: read("es") };
}

export default async function AdminHeroCategoriesPage() {
  const supabase = await createClient();
  const [t, res] = await Promise.all([
    getTranslations("adminContent.heroCategories"),
    supabase
      .from("hero_categories")
      .select("id, slug, name, is_active, links:creator_category_links(position, creator:creator_profiles(name, status, sort_order))")
      .order("sort_order")
      .order("slug"),
  ]);

  // Sem a 0049 no banco a tabela não existe: avisa em vez de quebrar a tela.
  if (res.error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("title")} description={t("description")} />
        <p role="status" data-testid="hero-categories-unavailable" className="rounded-xl border border-dashed border-warning/40 bg-warning-soft/40 p-4 text-sm text-fg">
          {t("unavailable")}
        </p>
      </div>
    );
  }

  const rows: HeroCategoryRow[] = ((res.data ?? []) as unknown as CategoryRow[]).map((row) => {
    const creators = (row.links ?? [])
      .map((l) => l.creator)
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    return {
      id: row.id,
      slug: row.slug,
      name: names(row.name),
      is_active: row.is_active,
      heroCount: creators.length,
      visibleCount: creators.filter((c) => c.status === "active").length,
      heroNames: creators.map((c) => (c.status === "active" ? c.name : `${c.name} (${t("suspendedHero")})`)),
    };
  });

  // Atalhos por categoria (0050): leitura separada; sem a 0050 só este painel avisa.
  const [tt, defaults, tabsRes] = await Promise.all([
    getTranslations("adminContent.heroCategories.tabs"),
    // o campo editado é o pt-BR: o rótulo padrão mostrado também é o pt-BR
    getTranslations({ locale: "pt-BR", namespace: "discover.personalities.libraries.labels" }),
    supabase.from("hero_library_tabs").select("category_id, source_key, label, icon, sort_order, is_visible"),
  ]);
  const tabOptions: CategoryTabsOption[] = rows.map((row) => ({
    id: row.id,
    name: row.name["pt-BR"],
    isActive: row.is_active,
    rows: toEditorRows(
      resolveLibraryConfig({ categoryId: row.id, categoryRows: (tabsRes.data ?? []).map((tab) => toCategoryTabRow(tab.category_id, tab)) }),
      (key) => defaults(key),
      "category",
    ),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Panel title={t("listTitle")} description={t("listDescription")}>
        <HeroCategoriesEditor categories={rows} />
      </Panel>
      <section id="atalhos" aria-labelledby="category-tabs-title" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <div>
          <h2 id="category-tabs-title" className="type-h3 text-fg">
            {tt("title")}
          </h2>
          <p className="type-body-sm mt-0.5 text-fg-muted">{tt("description")}</p>
        </div>
        {tabsRes.error ? (
          <p role="status" data-testid="category-tabs-unavailable" className="rounded-xl border border-dashed border-warning/40 bg-warning-soft/40 p-4 text-sm text-fg">
            {tt("unavailable")}
          </p>
        ) : (
          <CategoryLibraryTabsPanel categories={tabOptions} />
        )}
      </section>
    </div>
  );
}
