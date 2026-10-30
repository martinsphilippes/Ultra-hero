import { Store } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui";

// Aviso do portal do fornecedor desligado (contas que não são admin). Página própria, sem a casca do
// portal: nenhuma tela nem ação do fornecedor fica ao alcance.
export async function SellerPortalClosed() {
  const t = await getTranslations("seller.closed");
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg px-4 py-10" data-testid="seller-portal-closed">
      <Link href="/personalities" className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        <Logo size="sm" />
      </Link>
      <section className="flex w-full max-w-md flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-5 py-8 text-center" aria-labelledby="seller-closed-title">
        <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent-text" aria-hidden="true">
          <Store className="size-6" />
        </span>
        <h1 id="seller-closed-title" className="type-h2 text-fg">
          {t("title")}
        </h1>
        <p className="type-body-sm text-fg-muted">{t("description")}</p>
        <Button asChild className="mt-2">
          <Link href="/personalities">{t("back")}</Link>
        </Button>
      </section>
    </main>
  );
}
