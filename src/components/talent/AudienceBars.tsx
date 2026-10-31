import { useLocale, useTranslations } from "next-intl";
import type { Audience } from "@/lib/talent/schemas";
import { audienceBars, formatBp, type Bar } from "@/lib/talent/media-kit";

// Gráficos de gênero e faixa etária (barras em CSS, sem biblioteca), em pontos-base declarados.
// Grupo sem dado: "não informado" (nunca zero).
export function AudienceBars({ audience }: { audience: Audience | null | undefined }) {
  const t = useTranslations("mediaKit.audience");
  const locale = useLocale();
  const bars = audienceBars(audience);
  const group = (title: string, items: Bar[] | null, label: (key: string) => string, id: string) => (
    <figure className="flex min-w-0 flex-col gap-2" aria-labelledby={id}>
      <figcaption id={id} className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {title}
      </figcaption>
      {items ? (
        <ul className="flex flex-col gap-1.5">
          {items.map((b) => (
            <li key={b.key} className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-2 text-sm">
              <span className="truncate text-fg-muted">{label(b.key)}</span>
              <span className="h-2 overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, b.bp / 100)}%` }} />
              </span>
              <span className="text-right font-mono text-xs text-fg">{formatBp(b.bp, locale)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-body-sm text-fg-muted">{t("notInformed")}</p>
      )}
    </figure>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2" data-testid="audience-bars">
      {group(t("gender"), bars.gender, (k) => t(`genderKeys.${k}`), "aud-gender")}
      {group(t("age"), bars.age, (k) => (k === "55+" ? t("age55") : k), "aud-age")}
    </div>
  );
}
