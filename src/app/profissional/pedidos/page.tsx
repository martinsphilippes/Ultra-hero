import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { OrderCardLink } from "@/components/professionals/portal/OrderCardLink";
import { PageHeader } from "@/components/ui";
import { getMyProfessional, professionalOrders } from "@/lib/professionals/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FILTERS = ["open", "pending", "closed", "all"] as const;
type Filter = (typeof FILTERS)[number];

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// Caixa de pedidos do profissional: em aberto (padrão), aguardando resposta, encerrados ou todos.
export default async function ProfessionalOrdersPage({ searchParams }: Props) {
  const { professional: pro } = await getMyProfessional();
  if (!pro) return null;
  const params = await searchParams;
  const raw = Array.isArray(params.filtro) ? params.filtro[0] : params.filtro;
  const filter: Filter = (FILTERS as readonly string[]).includes(raw ?? "") ? (raw as Filter) : "open";
  const [t, orders] = await Promise.all([getTranslations("professionals.portal"), professionalOrders(pro.id, filter === "all" ? null : filter)]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("ordersTitle")} eyebrow={t("title")}>
        <nav aria-label={t("ordersTitle")}>
          <ul className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <li key={f}>
                <Link
                  href={f === "open" ? "/profissional/pedidos" : `/profissional/pedidos?filtro=${f}`}
                  aria-current={f === filter ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                    f === filter ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface text-fg hover:bg-surface-hover",
                  )}
                >
                  {t(`filters.${f}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </PageHeader>
      {orders.length === 0 ? (
        <p className="type-body-sm text-fg-muted">{t("noOrders")}</p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="pro-orders">
          {orders.map((o) => (
            <li key={o.id}>
              <OrderCardLink order={o} href={`/profissional/pedidos/${o.id}`} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
