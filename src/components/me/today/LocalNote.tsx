import { Smartphone, TriangleAlert } from "lucide-react";

type Props = { note: string; warning?: string | null };

// Nota fixa "registro local" e, se o storage não funcionar (modo privado), um aviso discreto.
export function LocalNote({ note, warning }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-start gap-1.5 type-caption text-fg-muted">
        <Smartphone className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>{note}</span>
      </p>
      {warning ? (
        <p role="status" className="flex items-start gap-1.5 type-caption text-warning">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{warning}</span>
        </p>
      ) : null}
    </div>
  );
}
