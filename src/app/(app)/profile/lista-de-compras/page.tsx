import type { Metadata } from "next";
import { ShoppingBasket } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { loadShoppingList } from "@/components/recipes/shopping/load-shopping-list";
import { ShoppingListView } from "@/components/recipes/shopping/ShoppingListView";
import { loadUnitLabels } from "@/components/recipes/view/RecipeView";
import { Button, EmptyState, ErrorState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { SHOPPING_LIST_PATH } from "@/lib/recipes/shopping";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shopping.page");
  return { title: t("title") };
}

// Lista de compras pessoal (fase 5, decisão 5): itens agrupados por receita, o kit de cada receita
// nos 4 estados (disponível, indisponível, sem produto, comércio desligado) e as ações da lista.
// Só a própria pessoa lê (RLS da 0027; nem o admin). Fica até ela remover ou excluir a conta.
export default async function ShoppingListPage() {
  const user = await requireUser(SHOPPING_LIST_PATH);
  const [t, labels, locale] = await Promise.all([getTranslations("shopping"), loadUnitLabels(), getLocale()]);
  const supabase = await createClient();
  const data = await loadShoppingList(supabase, user.id, { labels, locale, toTasteLabel: t("add.toTaste") });

  const header = <PageHeader title={t("page.title")} description={t("page.description")} backHref="/profile" backLabel={t("page.back")} />;

  if (data.status === "error") {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState />
      </div>
    );
  }

  if (data.status === "unavailable" || data.total === 0) {
    const unavailable = data.status === "unavailable";
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface/60" data-testid={unavailable ? "shopping-unavailable" : "shopping-empty"}>
          <EmptyState
            icon={<ShoppingBasket />}
            title={unavailable ? t("unavailable.title") : t("empty.title")}
            description={unavailable ? t("unavailable.description") : t("empty.description")}
            action={
              <Button asChild variant="primary">
                <Link href="/explore?tab=receitas">{t("empty.cta")}</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}
      <ShoppingListView data={data} />
    </div>
  );
}
