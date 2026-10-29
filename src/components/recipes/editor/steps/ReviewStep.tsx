"use client";

import { CalendarClock, CircleCheck, CircleX, Eye, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { localInputToIso } from "@/components/admin-content/lib/publish-at";
import { Badge, Button, FormField, Input } from "@/components/ui";
import type { ChecklistEntry } from "@/lib/recipes/checklist";
import type { RecipeChecklistCode } from "@/lib/recipes/codes";
import { effectiveTotal, isBlankIngredient, isBlankStep, type RecipeDraft } from "@/lib/recipes/draft";
import { CHECKLIST_STEP } from "@/lib/recipes/editor-steps";
import { StepSection } from "../shared";

type Props = {
  draft: RecipeDraft;
  checklist: ChecklistEntry[];
  reviewRequired: boolean;
  busy: boolean;
  /** Itens que o banco recusou na última tentativa (recipe_incomplete), enquanto o rascunho não muda. */
  serverMissing: RecipeChecklistCode[];
  /** Leva à etapa do item e mostra lá o que falta. */
  fix: (code: RecipeChecklistCode) => void;
  onPreview: () => void;
  onPublish: (publishAt: string | null) => void;
  onSubmit: (requestedPublishAt: string | null) => void;
};

// Etapa 6: prévia compacta, checklist (mesmos códigos de recipe_assert_publishable) e o botão
// conforme a regra do tipo: "Publicar agora"/"Agendar" ou "Enviar para revisão" com data sugerida.
export function ReviewStep({ draft, checklist, reviewRequired, busy, serverMissing, fix, onPreview, onPublish, onSubmit }: Props) {
  const t = useTranslations("recipes.editor.review");
  const ts = useTranslations("recipes.editor.steps");
  const tc = useTranslations("recipes.structured.checklist");
  const tv = useTranslations("recipes.view");
  const [when, setWhen] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const missing = checklist.filter((c) => !c.ok || serverMissing.includes(c.code));
  // a recusa do banco só destaca: quem decide de novo é o banco (ex.: vídeo do Stream que terminou)
  const ready = checklist.every((c) => c.ok);
  const ingredients = draft.ingredients.filter((i) => !isBlankIngredient(i)).length;
  const steps = draft.steps.filter((s) => !isBlankStep(s)).length;
  const photos = draft.media.filter((m) => m.role === "gallery").length;
  const total = effectiveTotal(draft);

  function schedule(kind: "publish" | "submit") {
    setDateError(null);
    const iso = when ? localInputToIso(when) : null;
    if (kind === "publish") {
      if (!iso) {
        setDateError(t("chooseDate"));
        return;
      }
      onPublish(iso);
    } else {
      onSubmit(iso);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <StepSection title={t("previewTitle")}>
        <div className="flex flex-col gap-1">
          <p className="type-h3 text-fg">{draft.title || "—"}</p>
          {draft.summary && <p className="type-body-sm text-fg-muted">{draft.summary}</p>}
        </div>
        <ul className="flex flex-wrap gap-2">
          {total !== null && !Number.isNaN(total) ? <li><Badge>{tv("total", { n: total })}</Badge></li> : null}
          <li><Badge>{`${ingredients} · ${ts("ingredientes")}`}</Badge></li>
          <li><Badge>{`${steps} · ${ts("preparo")}`}</Badge></li>
          <li><Badge>{`${photos} · ${tv("gallery")}`}</Badge></li>
        </ul>
        <div>
          <Button type="button" variant="secondary" leadingIcon={<Eye />} onClick={onPreview} disabled={busy} data-testid="recipe-open-preview">
            {t("openPreview")}
          </Button>
        </div>
      </StepSection>

      <StepSection title={t("checklistTitle")}>
        <p className={missing.length === 0 ? "type-body-sm text-success" : "type-body-sm text-warning"} aria-live="polite">
          {missing.length === 0 ? t("ready") : t("missing", { count: missing.length })}
        </p>
        <ul className="flex flex-col gap-2" data-testid="recipe-checklist">
          {checklist.map((item) => {
            const ok = item.ok && !serverMissing.includes(item.code);
            return (
              <li key={item.code} className="flex items-center gap-2 text-sm" data-ok={ok ? "true" : "false"}>
                {ok ? <CircleCheck className="size-4 shrink-0 text-success" aria-hidden="true" /> : <CircleX className="size-4 shrink-0 text-warning" aria-hidden="true" />}
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2">
                  <span className={ok ? "text-fg" : "text-fg-muted"}>{tc(item.code)}</span>
                  {!ok && (
                    <Button type="button" variant="link" className="min-h-11 px-1" onClick={() => fix(item.code)}
                      data-testid={`recipe-fix-${item.code}`}>
                      {t("goTo", { step: ts(CHECKLIST_STEP[item.code]) })}
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </StepSection>

      <StepSection title={t("publishTitle")}>
        <p className="-mt-2 type-body-sm text-fg-muted">{reviewRequired ? t("reviewOn") : t("reviewOff")}</p>
        <FormField id="recipe-publish-at" label={reviewRequired ? t("suggestDate") : t("scheduleAt")} hint={t("scheduleHint")} error={dateError ?? undefined}>
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} disabled={busy} className="sm:w-72" />
        </FormField>
        <div className="flex flex-wrap gap-2">
          {reviewRequired ? (
            <Button type="button" leadingIcon={<Send />} onClick={() => schedule("submit")} loading={busy} disabled={!ready} data-testid="recipe-submit">
              {t("submit")}
            </Button>
          ) : (
            <>
              <Button type="button" leadingIcon={<Send />} onClick={() => onPublish(null)} loading={busy} disabled={!ready} data-testid="recipe-publish">
                {t("publishNow")}
              </Button>
              <Button type="button" variant="secondary" leadingIcon={<CalendarClock />} onClick={() => schedule("publish")} disabled={!ready || busy} data-testid="recipe-schedule">
                {t("schedule")}
              </Button>
            </>
          )}
        </div>
      </StepSection>
    </div>
  );
}
