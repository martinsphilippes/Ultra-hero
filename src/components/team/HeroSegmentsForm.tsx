"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { TERRITORY_DOT } from "@/components/platform-calendar/territories";
import { Button } from "@/components/ui";
import { MEMBER_LEVELS, isMemberLevel, type MemberLevel } from "@/lib/team/levels";
import { saveMySegmentsAction, saveTalentSegmentsAction } from "@/lib/team/segment-actions";
import { HERO_SEGMENTS, HERO_SEGMENTS_MAX, normalizeSegments, type HeroSegment } from "@/lib/team/segments";
import { cn } from "@/lib/utils";

type Props = {
  /** Sem talentId: o próprio Hero; com: a agência no casting. */
  talentId?: string;
  initialSegments: string[];
  initialLevel: string | null;
  canEdit?: boolean;
};

// Segmentos do Hero (até 4, com as cores do Calendário Groscove) e o nível autodeclarado. É o que a plataforma usa
// para achar o Hero certo para cada campanha (filtro do casting e sugestões).
export function HeroSegmentsForm({ talentId, initialSegments, initialLevel, canEdit = true }: Props) {
  const t = useTranslations("team.segments");
  const tg = useTranslations("groscoveCalendar.territories");
  const tl = useTranslations("team.profile.levels");
  const [segments, setSegments] = useState<HeroSegment[]>(() => normalizeSegments(initialSegments));
  const [level, setLevel] = useState<MemberLevel | null>(isMemberLevel(initialLevel) ? initialLevel : null);
  const [status, setStatus] = useState<"idle" | "saved" | string>("idle");
  const [pending, start] = useTransition();
  const full = segments.length >= HERO_SEGMENTS_MAX;

  function toggle(s: HeroSegment) {
    setStatus("idle");
    setSegments((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : cur.length >= HERO_SEGMENTS_MAX ? cur : normalizeSegments([...cur, s])));
  }

  function save() {
    start(async () => {
      const result = talentId ? await saveTalentSegmentsAction({ talentId, segments, level }) : await saveMySegmentsAction({ segments, level });
      setStatus(result.ok ? "saved" : result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="hero-segments-form">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-fg">{t("title")}</legend>
        <p className="type-caption text-fg-muted">{t("hint", { max: HERO_SEGMENTS_MAX, count: segments.length })}</p>
        <ul className="flex flex-wrap gap-2">
          {HERO_SEGMENTS.map((s) => {
            const on = segments.includes(s);
            return (
              <li key={s}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={!canEdit || (!on && full)}
                  onClick={() => toggle(s)}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50",
                    on ? "border-accent bg-accent-soft font-semibold text-fg" : "border-border bg-surface text-fg-muted hover:bg-surface-hover",
                  )}
                  data-testid={`segment-${s}`}
                >
                  <span aria-hidden="true" className={cn("size-2.5 rounded-full", TERRITORY_DOT[s])} />
                  {tg(s)}
                  {on ? <Check className="size-3.5" aria-hidden="true" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-fg">{t("levelTitle")}</legend>
        <p className="type-caption text-fg-muted">{t("levelHint")}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {MEMBER_LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={level === l}
              disabled={!canEdit}
              onClick={() => {
                setStatus("idle");
                setLevel(level === l ? null : l);
              }}
              className={cn(
                "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed",
                level === l ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-surface-hover",
              )}
              data-testid={`hero-level-${l}`}
            >
              <span className="text-sm font-semibold text-fg">{tl(`${l}.title`)}</span>
              <span className="type-caption text-fg-muted">{tl(`${l}.body`)}</span>
            </button>
          ))}
        </div>
      </fieldset>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={save} loading={pending} data-testid="hero-segments-save">
            {t("save")}
          </Button>
          <span aria-live="polite" className={cn("type-body-sm", status === "saved" ? "text-success" : "text-danger")}>
            {status === "saved" ? t("saved") : status !== "idle" ? status : ""}
          </span>
        </div>
      ) : null}
    </div>
  );
}
