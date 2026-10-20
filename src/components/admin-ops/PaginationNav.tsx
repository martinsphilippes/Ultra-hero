import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  basePath: string;
  /** Parâmetros atuais (sem "page"); preservados nos links. */
  params: Record<string, string | undefined>;
  page: number;
  /** Há mais resultados depois desta página? */
  hasNext: boolean;
  total?: number;
};

function hrefFor(basePath: string, params: Record<string, string | undefined>, page: number) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

// Paginação anterior/próxima baseada em links (funciona sem JS, preserva filtros).
export async function PaginationNav({ basePath, params, page, hasNext, total }: Props) {
  const t = await getTranslations("adminOps.common");
  const linkBase =
    "inline-flex min-h-11 items-center gap-1 rounded-lg border border-border px-3 text-sm font-medium text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
  const disabled = "pointer-events-none opacity-50";
  return (
    <nav aria-label={t("pagination")} className="flex flex-wrap items-center justify-between gap-3">
      <p className="type-caption text-fg-muted">
        {t("page", { page })}
        {typeof total === "number" ? ` · ${t("results", { count: total })}` : null}
      </p>
      <div className="flex gap-2">
        <Link href={hrefFor(basePath, params, page - 1)} aria-disabled={page <= 1 || undefined} tabIndex={page <= 1 ? -1 : undefined} className={cn(linkBase, page <= 1 && disabled)}>
          <ChevronLeft className="size-4" aria-hidden="true" />
          {t("previous")}
        </Link>
        <Link href={hrefFor(basePath, params, page + 1)} aria-disabled={!hasNext || undefined} tabIndex={!hasNext ? -1 : undefined} className={cn(linkBase, !hasNext && disabled)}>
          {t("next")}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </nav>
  );
}
