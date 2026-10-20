import { cn } from "@/lib/utils";

type Props = { value: unknown; summary: string; defaultOpen?: boolean; className?: string };

// JSON formatado dentro de <details> (fechado por padrão para não poluir o detalhe).
export function JsonView({ value, summary, defaultOpen = false, className }: Props) {
  let text = "";
  try {
    text = JSON.stringify(value ?? null, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <details open={defaultOpen} className={cn("group rounded-lg border border-border bg-surface-elevated", className)}>
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        {summary}
      </summary>
      <pre className="max-h-[32rem] overflow-auto border-t border-border px-3 py-2 font-mono text-xs leading-relaxed text-fg-muted">{text}</pre>
    </details>
  );
}
