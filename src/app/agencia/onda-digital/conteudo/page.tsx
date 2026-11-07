import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { FilterAnchor } from "@/components/admin-ops/FilterAnchor";
import { OndaCasesEditor, OndaPackagesEditor, OndaProfilesEditor } from "@/components/onda-digital/OndaEditor";
import { EmptyState, PageHeader } from "@/components/ui";
import { agencyCan } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { loadOndaAdminContent } from "@/lib/onda-digital/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ondaDigital.editor");
  return { title: t("title") };
}

const TABS = ["instagram", "x", "cases", "packages"] as const;
type Tab = (typeof TABS)[number];
const SLUG: Record<Tab, string> = { instagram: "paginas", x: "perfis-x", cases: "cases", packages: "ondas" };

type Props = { searchParams: Promise<{ aba?: string }> };

// Editor da Onda Digital (0134): a Groscove atualiza seguidores, cases e ondas; gestor ou acima edita, a equipe consulta.
export default async function OndaDigitalEditorPage({ searchParams }: Props) {
  const ctx = await requireAgency("staff");
  const aba = (await searchParams).aba;
  const tab: Tab = TABS.find((k) => SLUG[k] === aba) ?? "instagram";
  const [t, content, supabase] = await Promise.all([getTranslations("ondaDigital"), loadOndaAdminContent(), createClient()]);
  const canEdit = (ctx.platformAdmin || ctx.agency.slug === "groscove") && agencyCan(ctx.role, "manager", ctx.platformAdmin);

  if (!content) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={t("editor.title")} backHref="/agencia/onda-digital" backLabel={t("agency.title")} />
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState title={t("agency.onlyGroscove")} />
        </div>
      </div>
    );
  }
  const { data: categories } = tab === "cases" ? await supabase.from("brand_categories").select("slug, name").order("sort_order") : { data: [] };
  const profiles = content.profiles.filter((p) => p.network === (tab === "x" ? "x" : "instagram"));
  const count = (k: Tab) =>
    k === "cases" ? content.cases.length : k === "packages" ? content.packages.length : content.profiles.filter((p) => p.network === k).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("editor.title")}
        description={canEdit ? t("editor.description") : t("editor.readOnly")}
        backHref="/agencia/onda-digital"
        backLabel={t("agency.title")}
      />
      <nav aria-label={t("editor.tabsLabel")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" data-testid="onda-editor-tabs">
        {TABS.map((k) => (
          <span key={k} className="shrink-0 whitespace-nowrap">
            <FilterAnchor href={`/agencia/onda-digital/conteudo?aba=${SLUG[k]}`} active={tab === k} label={`${t(`editor.tabs.${k}`)} (${count(k)})`} />
          </span>
        ))}
      </nav>
      {tab === "instagram" || tab === "x" ? (
        <OndaProfilesEditor key={tab} network={tab} profiles={profiles} canEdit={canEdit} />
      ) : tab === "cases" ? (
        <OndaCasesEditor cases={content.cases} categories={(categories ?? []) as Array<{ slug: string; name: string }>} canEdit={canEdit} />
      ) : (
        <OndaPackagesEditor packages={content.packages} canEdit={canEdit} />
      )}
      <Link href="/agencia/onda-digital" className="type-body-sm font-semibold text-accent-text underline">
        {t("editor.seeRequests")}
      </Link>
    </div>
  );
}
