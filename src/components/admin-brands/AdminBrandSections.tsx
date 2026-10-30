import { getTranslations } from "next-intl/server";
import { Panel } from "@/components/admin-content";
import { brandOptions, contentBrandsAdmin, creatorBrandsAdmin, productOptions, programBrandProductsAdmin } from "@/lib/brands/admin-queries";
import { ContentBrandLinksEditor, CreatorBrandsEditor, ProgramBrandProductsEditor } from "./LinkEditors";
import { SmartTagEditor } from "./SmartTagEditor";

// Seções de marcas/produtos (0062) nas telas que já existem no admin: herói, programa e conteúdo.
// Sem a 0062 no banco, a seção mostra o aviso no lugar do editor.

function Unavailable({ text }: { text: string }) {
  return (
    <p role="status" data-testid="admin-brands-unavailable" className="rounded-xl border border-dashed border-warning/40 bg-warning-soft/40 p-4 text-sm text-fg">
      {text}
    </p>
  );
}

export async function CreatorBrandsSection({ creatorId }: { creatorId: string }) {
  const [t, options] = await Promise.all([getTranslations("adminOps.brands.links"), brandOptions()]);
  const items = options ? await creatorBrandsAdmin(creatorId) : [];
  return (
    <section aria-labelledby="hero-brands-title" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 md:p-6" data-testid="admin-hero-brands">
      <div className="flex flex-col gap-1">
        <h2 id="hero-brands-title" className="type-h2 text-fg">
          {t("creatorTitle")}
        </h2>
        <p className="type-body-sm max-w-prose text-fg-muted">{t("creatorDescription")}</p>
      </div>
      {options ? <CreatorBrandsEditor key={JSON.stringify(items)} creatorId={creatorId} items={items} options={options} /> : <Unavailable text={t("unavailable")} />}
    </section>
  );
}

export async function ProgramBrandProductsSection({ programId }: { programId: string }) {
  const [t, options] = await Promise.all([getTranslations("adminOps.brands.links"), productOptions()]);
  const items = options ? await programBrandProductsAdmin(programId) : [];
  return (
    <Panel title={t("programTitle")} description={t("programDescription")}>
      {options ? <ProgramBrandProductsEditor key={JSON.stringify(items)} programId={programId} items={items} options={options} /> : <Unavailable text={t("unavailable")} />}
    </Panel>
  );
}

export async function ContentBrandsSection({ contentId, coverUrl }: { contentId: string; coverUrl: string | null }) {
  const [t, tt, brands, products] = await Promise.all([getTranslations("adminOps.brands.links"), getTranslations("adminOps.brands.tags"), brandOptions(), productOptions()]);
  if (!brands || !products) {
    return (
      <Panel title={t("contentTitle")} description={t("contentDescription")}>
        <Unavailable text={t("unavailable")} />
      </Panel>
    );
  }
  const current = await contentBrandsAdmin(contentId);
  return (
    <div id="marcas" className="scroll-mt-24" data-testid="admin-content-brands-section">
      <Panel title={t("contentTitle")} description={t("contentDescription")}>
        <ContentBrandLinksEditor
          key={JSON.stringify([current.brands, current.products])}
          contentId={contentId}
          brands={current.brands}
          products={current.products}
          brandOptions={brands}
          productOptions={products}
        />
        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <h3 className="text-base font-semibold text-fg">{tt("title")}</h3>
          <p className="type-body-sm text-fg-muted">{tt("description")}</p>
        </div>
        <SmartTagEditor key={JSON.stringify([coverUrl, current.tags])} contentId={contentId} imageUrl={coverUrl} tags={current.tags} products={products} />
      </Panel>
    </div>
  );
}
