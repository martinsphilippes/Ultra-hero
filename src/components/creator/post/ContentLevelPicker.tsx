"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui";
import { CONTENT_LEVELS, type ContentLevel } from "@/lib/content-level/levels";
import { cn } from "@/lib/utils";

type Props = {
  level: ContentLevel | null;
  onLevel: (level: ContentLevel) => void;
  accepted: boolean;
  onAccepted: (accepted: boolean) => void;
  disabled?: boolean;
};

// Antes de publicar (0127): o nível do conteúdo na escala de consciência (só de 400 para cima) e o aceite de
// responsabilidade. Sem análise automática por enquanto: quem publica responde pelo que declara.
export function ContentLevelPicker({ level, onLevel, accepted, onAccepted, disabled }: Props) {
  const t = useTranslations("contentLevel");
  return (
    <fieldset className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-elevated p-4" data-testid="content-level">
      <legend className="px-1 text-sm font-semibold text-fg">{t("title")}</legend>
      <p className="type-caption text-fg-muted">{t("hint")}</p>
      <div className="grid gap-2 sm:grid-cols-5">
        {CONTENT_LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={level === l}
            disabled={disabled}
            onClick={() => onLevel(l)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              level === l ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-surface-hover",
            )}
            data-testid={`content-level-${l}`}
          >
            <span className="text-sm font-semibold text-fg">{t(`levels.${l}.name`)}</span>
            <span className="type-caption text-fg-muted">{t("value", { value: l })}</span>
          </button>
        ))}
      </div>
      {level ? <p className="type-caption text-fg-muted">{t(`levels.${level}.body`)}</p> : null}
      <Checkbox checked={accepted} onChange={(e) => onAccepted(e.target.checked)} disabled={disabled} label={t("accept")} description={t("acceptHint")} data-testid="content-level-accept" />
      <a href="/legal/partner-terms" target="_blank" rel="noopener" className="ml-8 w-fit text-sm font-semibold text-accent-text underline">
        {t("readTerms")}
      </a>
    </fieldset>
  );
}
