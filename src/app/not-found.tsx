import { Compass } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

// 404 global (fora do grupo (app) para não depender da casca).
export default async function NotFound() {
  const t = await getTranslations("errors");
  const tc = await getTranslations("common.actions");

  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-grid px-gutter py-12">
      <Link href="/" className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        <Logo size="lg" />
      </Link>
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface shadow-lg">
        <EmptyState
          icon={<Compass />}
          title={t("notFound.title")}
          description={t("notFound.description")}
          action={
            <Button asChild variant="primary">
              <Link href="/">{tc("goHome")}</Link>
            </Button>
          }
        />
      </div>
    </main>
  );
}
