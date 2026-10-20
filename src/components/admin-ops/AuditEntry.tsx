import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { formatDateTime } from "@/i18n/format";
import { getLocale } from "@/i18n/server";
import type { Tables } from "@/lib/supabase/helpers";
import { cn } from "@/lib/utils";
import { changedKeys, prettyJson } from "./diff";

type Props = { entry: Tables<"admin_audit">; actorEmail?: string | null };

const ACTOR_VARIANT: Record<string, "accent" | "neutral" | "info" | "warning"> = {
  admin: "accent",
  system: "neutral",
  consumer: "info",
  creator: "warning",
  seller: "warning",
};

// Linha de auditoria expansível (<details> nativo): antes/depois lado a lado com chaves alteradas em destaque.
export async function AuditEntry({ entry, actorEmail }: Props) {
  const [t, locale] = await Promise.all([getTranslations("adminOps.audit"), getLocale()]);
  const keys = changedKeys(entry.before_data, entry.after_data);
  const actorLabel = t(`actorType.${entry.actor_type}`);

  return (
    <details className="group rounded-xl border border-border bg-surface open:shadow-sm">
      <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-4 shrink-0 text-fg-muted transition-transform group-open:rotate-180" aria-hidden="true" />
        <time dateTime={entry.created_at} className="type-numeric w-36 shrink-0 text-fg-muted">
          {formatDateTime(entry.created_at, locale)}
        </time>
        <span className="font-mono text-xs font-semibold text-fg">{entry.action}</span>
        <span className="text-fg-muted">
          {entry.resource_type}
          {entry.resource_id ? <span className="font-mono text-xs"> · {entry.resource_id.slice(0, 8)}…</span> : null}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <Badge variant={ACTOR_VARIANT[entry.actor_type] ?? "neutral"} size="sm">
            {actorLabel}
          </Badge>
          {entry.actor_id ? (
            <Link href={`/admin/users/${entry.actor_id}`} className="font-mono text-xs text-accent-text hover:underline" title={actorEmail ?? undefined}>
              {actorEmail ?? `${entry.actor_id.slice(0, 8)}…`}
            </Link>
          ) : (
            <span className="type-caption text-fg-subtle">{t("noActor")}</span>
          )}
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
        <p className="type-caption text-fg-muted">
          {keys.length > 0 ? t("changedKeys", { keys: keys.join(", ") }) : t("noChanges")}
          {entry.resource_id ? <span className="font-mono"> · {entry.resource_id}</span> : null}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <JsonPane title={t("before")} value={entry.before_data} keys={keys} />
          <JsonPane title={t("after")} value={entry.after_data} keys={keys} />
        </div>
        <div className="rounded-lg bg-surface-elevated p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{t("justification")}</p>
          <p className={cn("mt-1 whitespace-pre-wrap text-sm", entry.justification ? "text-fg" : "italic text-fg-subtle")}>{entry.justification || t("noJustification")}</p>
        </div>
      </div>
    </details>
  );
}

type PaneProps = { title: string; value: Tables<"admin_audit">["before_data"]; keys: string[] };

// Painel JSON: linhas cujas chaves mudaram recebem marcação de destaque.
function JsonPane({ title, value, keys }: PaneProps) {
  const text = prettyJson(value);
  const lines = text.split("\n");
  const matcher = keys.length > 0 && !keys.includes("*") ? new RegExp(`^\\s{2}"(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})"`) : null;
  return (
    <div className="min-w-0 rounded-lg border border-border bg-bg">
      <p className="border-b border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-fg-muted">{title}</p>
      <pre className="max-h-72 overflow-auto p-3 font-mono text-xs leading-relaxed text-fg">
        {lines.map((line, i) => {
          const changed = keys.includes("*") ? value !== null : matcher ? matcher.test(line) : false;
          return (
            <span key={i} className={cn("block -mx-1 px-1", changed && "rounded bg-warning-soft text-warning")}>
              {line || " "}
            </span>
          );
        })}
      </pre>
    </div>
  );
}
