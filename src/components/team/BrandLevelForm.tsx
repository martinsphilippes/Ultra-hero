"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, FormField, Input } from "@/components/ui";
import { MEMBER_LEVELS, isMemberLevel, type MemberLevel } from "@/lib/team/levels";
import { saveBrandLevelAction } from "@/lib/team/segment-actions";
import { cn } from "@/lib/utils";

// Cargo e nível de quem é da equipe da marca (reunião Groscove: níveis também nas equipes de cliente).
export function BrandLevelForm({ initialLevel, initialJobTitle }: { initialLevel: string | null; initialJobTitle: string | null }) {
  const t = useTranslations("team.brand");
  const tl = useTranslations("team.profile.levels");
  const [level, setLevel] = useState<MemberLevel | null>(isMemberLevel(initialLevel) ? initialLevel : null);
  const [jobTitle, setJobTitle] = useState(initialJobTitle ?? "");
  const [status, setStatus] = useState<string>("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3" data-testid="brand-level-form">
      <FormField label={t("jobTitle")}>
        <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={80} />
      </FormField>
      <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label={t("level")}>
        {MEMBER_LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={level === l}
            onClick={() => setLevel(level === l ? null : l)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              level === l ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-surface-hover",
            )}
          >
            <span className="text-sm font-semibold text-fg">{tl(`${l}.title`)}</span>
            <span className="type-caption text-fg-muted">{tl(`${l}.body`)}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await saveBrandLevelAction({ level, jobTitle });
              setStatus(r.ok ? t("saved") : r.error);
            })
          }
        >
          {t("save")}
        </Button>
        <span aria-live="polite" className="type-body-sm text-fg-muted">
          {status}
        </span>
      </div>
    </div>
  );
}
