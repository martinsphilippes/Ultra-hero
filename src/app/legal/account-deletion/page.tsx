import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { legalRichTags } from "@/components/legal/rich-tags";
import { Button } from "@/components/ui/button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.meta");
  return { title: t("deletion"), description: t("deletionDescription") };
}

// Exclusão de conta (pública, sem login). O Google Play pede uma URL fora do app que explique como
// excluir a conta; a exclusão em si é a de Perfil › Conta e privacidade (docs/lojas.md).
export default async function AccountDeletionPage() {
  const t = await getTranslations("legal.deletion");
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-h1 text-fg">{t("title")}</h1>
        <p className="text-fg-muted">{t("intro")}</p>
      </header>
      <section className="flex flex-col gap-3" aria-labelledby="deletion-steps">
        <h2 id="deletion-steps" className="type-h3 text-fg">
          {t("stepsTitle")}
        </h2>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-fg">
          <li>{t("step1")}</li>
          <li>{t.rich("step2", legalRichTags)}</li>
          <li>{t("step3")}</li>
        </ol>
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="deletion-data">
        <h2 id="deletion-data" className="type-h3 text-fg">
          {t("dataTitle")}
        </h2>
        <p className="text-fg">{t.rich("data", legalRichTags)}</p>
      </section>
      <div>
        <Button asChild variant="primary">
          <Link href="/login?next=%2Fprofile%2Faccount">{t("cta")}</Link>
        </Button>
      </div>
    </article>
  );
}
