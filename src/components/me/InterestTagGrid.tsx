"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Chip } from "@/components/ui";
import type { Pillar } from "@/lib/supabase/helpers";

export type InterestTagOption = { tag: string; label: string };
export type InterestGroup = { pillar: Pillar | null; tags: InterestTagOption[] };

type Props = { groups: InterestGroup[]; selected: string[]; onChange: (next: string[]) => void; disabled?: boolean };

// Grade de temas agrupada por pilar (chips com aria-pressed). Controlada: o pai guarda a seleção.
export function InterestTagGrid({ groups, selected, onChange, disabled }: Props) {
  const t = useTranslations("me.interests");
  const tp = useTranslations("common.pillars");
  const set = new Set(selected);

  function toggle(tag: string) {
    const next = new Set(set);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    onChange(Array.from(next));
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => {
        const pillarLabel = group.pillar ? tp(group.pillar) : t("title");
        return (
          <fieldset key={group.pillar ?? "other"} className="flex flex-col gap-2">
            <legend className="type-overline text-accent-text">{pillarLabel}</legend>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t("groupLabel", { pillar: pillarLabel })}>
              {group.tags.map((option) => {
                const active = set.has(option.tag);
                return (
                  <Chip
                    key={option.tag}
                    selected={active}
                    variant="neutral"
                    icon={active ? <Check /> : undefined}
                    onClick={() => toggle(option.tag)}
                    disabled={disabled}
                    className="min-h-11"
                  >
                    {option.label}
                  </Chip>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      <p aria-live="polite" className="type-caption text-fg-muted">
        {t("selected", { n: selected.length })}
      </p>
    </div>
  );
}
