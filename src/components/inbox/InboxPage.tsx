import { Bell } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { FilterAnchor } from "@/components/admin-ops/FilterAnchor";
import { EmptyState, PageHeader } from "@/components/ui";
import { listInbox } from "@/lib/inbox/queries";
import { InboxItemView } from "./InboxItemView";
import { MarkAllReadButton } from "./MarkAllReadButton";

type Props = {
  basePath: string;
  unreadOnly: boolean;
  /** Dentro de "Avisos e mensagens" (0115): sem cabeçalho próprio, filtros na aba Avisos e "marcar todas" ao lado deles. */
  embedded?: boolean;
};

// Página completa de avisos (agência e marca): filtro todas/não lidas por <a> e marcar todas.
export async function InboxPage({ basePath, unreadOnly, embedded = false }: Props) {
  const [t, page] = await Promise.all([getTranslations("inbox"), listInbox({ limit: 100, unreadOnly })]);
  const allHref = embedded ? `${basePath}?aba=avisos` : basePath;
  const unreadHref = embedded ? `${basePath}?aba=avisos&filtro=nao-lidas` : `${basePath}?filtro=nao-lidas`;
  return (
    <div className="flex flex-col gap-5">
      {embedded ? null : <PageHeader title={t("title")} description={t("pageDescription")} actions={<MarkAllReadButton disabled={page.unread === 0} />} />}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label={t("filterLabel")} className="flex flex-wrap gap-2">
          <FilterAnchor href={allHref} active={!unreadOnly} label={t("filterAll")} />
          <FilterAnchor href={unreadHref} active={unreadOnly} label={t("filterUnread", { count: page.unread })} />
        </nav>
        {embedded ? <MarkAllReadButton disabled={page.unread === 0} /> : null}
      </div>
      {page.items.length > 0 ? (
        <ul className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-2" data-testid="inbox-list">
          {page.items.map((item) => (
            <li key={item.id}>
              <InboxItemView item={item} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<Bell />} title={unreadOnly ? t("emptyUnread") : t("empty")} description={t("emptyHint")} />
        </div>
      )}
    </div>
  );
}
