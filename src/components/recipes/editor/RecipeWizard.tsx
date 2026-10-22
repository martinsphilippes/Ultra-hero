"use client";

import { ArrowLeft, ArrowRight, History, RotateCcw, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRecipeDraft, deleteRecipeMedia, publishRecipe, saveRecipe, submitRecipe, type RegisteredMedia } from "@/app/creator/recipes/actions";
import { useRecipeErrorText } from "@/components/recipes/portal/use-recipe-error";
import { Button, Dialog, useToast } from "@/components/ui";
import { recipeChecklist } from "@/lib/recipes/checklist";
import { parseRecipeIncomplete, type RecipeChecklistCode } from "@/lib/recipes/codes";
import { buildPayload, draftIssue, sameDraft, type DraftIssue, type RecipeDraft } from "@/lib/recipes/draft";
import { draftStorageKey, parseStoredDraft, serializeDraft, shouldOfferRecovery, type StoredDraft } from "@/lib/recipes/draft-recovery";
import { RECIPE_EDITOR_STEPS, fieldIdForPath, stepForPath, stepIndex, type RecipeEditorStep } from "@/lib/recipes/editor-steps";
import { cn } from "@/lib/utils";
import { BasicsStep } from "./steps/BasicsStep";
import { ExtrasStep } from "./steps/ExtrasStep";
import { IngredientsStep } from "./steps/IngredientsStep";
import { MediaStep } from "./steps/MediaStep";
import { PreparationStep } from "./steps/PreparationStep";
import { ReviewStep } from "./steps/ReviewStep";

type Props = {
  mode: "new" | "edit";
  contentId: string | null;
  creatorId: string;
  initialDraft: RecipeDraft;
  updatedAt: string | null;
  initialStep: RecipeEditorStep;
  categories: { code: string; label: string }[];
  reviewRequired: boolean;
  uploadsEnabled: boolean;
  videoConfigured: boolean;
  currentCoverUrl: string | null;
  nutritionValidated: boolean;
};

type SaveOutcome = "ok" | "invalid" | "stale" | "failed";
const AUTOSAVE_MS = 30_000;
const LOCAL_DEBOUNCE_MS = 1_000;

function readLocal(key: string): StoredDraft | null {
  try {
    return parseStoredDraft(window.localStorage.getItem(key));
  } catch {
    return null; // modo privado ou armazenamento bloqueado: segue sem cópia local
  }
}
function writeLocal(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // cota cheia ou bloqueado: o servidor continua sendo a cópia principal
  }
}
function removeLocal(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // idem
  }
}

// Editor de receita em 6 etapas (Portal do Chef), no modelo do RecipeOnboardingWizard: etapa na URL
// (?step=), título da etapa focado a cada troca, progresso anunciado. Rascunho que não se perde:
// cópia no aparelho (localStorage, 1 s), gravação no servidor ao trocar de etapa, em "Salvar
// rascunho" e a cada 30 s com mudança; "Recuperar | Descartar" quando a cópia local é mais nova;
// conflito (stale_draft) abre diálogo; erro de validação foca o primeiro campo e lista os demais.
export function RecipeWizard(props: Props) {
  const { mode, contentId, creatorId, categories, reviewRequired, uploadsEnabled, videoConfigured, currentCoverUrl, nutritionValidated } = props;
  const t = useTranslations("recipes.editor");
  const tf = useTranslations("recipes.editor.fieldNames");
  const tval = useTranslations("recipes.editor.validation");
  const errorText = useRecipeErrorText();
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const storageKey = draftStorageKey(contentId ?? "new");

  const [draft, setDraftState] = useState<RecipeDraft>(props.initialDraft);
  const [saved, setSaved] = useState<RecipeDraft>(props.initialDraft);
  const [updatedAt, setUpdatedAt] = useState<string | null>(props.updatedAt);
  const [step, setStep] = useState<RecipeEditorStep>(mode === "new" ? "basicos" : props.initialStep);
  const [issues, setIssues] = useState<DraftIssue[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [recovery, setRecovery] = useState<StoredDraft | null>(null);
  const [staleOpen, setStaleOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [serverMissing, setServerMissing] = useState<RecipeChecklistCode[]>([]);
  const [publishing, setPublishing] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const draftRef = useRef(draft);
  const updatedRef = useRef(updatedAt);
  const inflight = useRef<Promise<SaveOutcome> | null>(null);
  const pendingFocus = useRef<string | null>(null);
  draftRef.current = draft;
  updatedRef.current = updatedAt;

  const dirty = draft.videoDirty || !sameDraft(draft, saved);
  const setDraft = useCallback((updater: (d: RecipeDraft) => RecipeDraft) => setDraftState((d) => updater(d)), []);
  const announce = useCallback((message: string) => setAnnouncement(message), []);

  // ---------------------------------------------------------------- cópia local e recuperação
  useEffect(() => {
    const stored = readLocal(storageKey);
    if (!stored) return;
    const offer = mode === "new" ? !sameDraft(stored.draft, props.initialDraft) : shouldOfferRecovery(stored, props.updatedAt ?? "", props.initialDraft);
    if (offer) setRecovery(stored);
    else removeLocal(storageKey);
    // só na montagem: depois disso a cópia acompanha o rascunho
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // enquanto a pessoa não decide, a cópia antiga não pode ser sobrescrita
    if (recovery || !dirty) return;
    const timer = window.setTimeout(() => writeLocal(storageKey, serializeDraft(draft, updatedRef.current ?? "")), LOCAL_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, recovery, storageKey]);

  // ---------------------------------------------------------------- foco e anúncio a cada etapa
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (pendingFocus.current) {
      const el = document.getElementById(pendingFocus.current);
      pendingFocus.current = null;
      if (el) {
        el.focus();
        return;
      }
    }
    headingRef.current?.focus();
  }, [step]);

  const errors = useMemo(() => {
    const map = new Map<string, string>();
    for (const issue of issues) map.set(issue.path, tval.has(issue.message) ? tval(issue.message) : tval("invalid"));
    return map;
  }, [issues, tval]);
  const errorFor = useCallback((path: string) => errors.get(path), [errors]);

  function fieldLabel(path: string): string {
    const parts = path.split(".");
    if (parts[0] === "ingredients") return tf("ingredient", { n: Number(parts[1]) + 1 });
    if (parts[0] === "steps") return tf("step", { n: Number(parts[1]) + 1 });
    if (parts[0] === "media") return tf("media");
    if (parts[0] === "video") return tf("video");
    if (parts[0] === "nutrition") return tf("nutrition");
    if (parts[0] === "categories") return tf("categories");
    if (parts[0] === "extras") return tf("chef_note");
    const key = parts[1] ?? "";
    if (key.startsWith("allergen")) return tf("allergens");
    if (key.startsWith("media_license") || key === "media_credit") return tf("license");
    return tf.has(key) ? tf(key) : tf("other");
  }

  function changeStep(next: RecipeEditorStep, focusId?: string) {
    pendingFocus.current = focusId ?? null;
    setStep(next);
    if (contentId) window.history.replaceState(null, "", `/creator/recipes/${contentId}/edit?step=${next}`);
    if (focusId && next === step) document.getElementById(focusId)?.focus();
  }

  function showIssues(list: DraftIssue[]) {
    setIssues(list);
    const first = list[0];
    if (first) changeStep(stepForPath(first.path), first.fieldId);
  }

  // ---------------------------------------------------------------- gravação
  const saveOnce = useCallback(
    async (opts: { overwrite?: boolean; quiet?: boolean } = {}): Promise<SaveOutcome> => {
      const current = draftRef.current;
      const built = buildPayload(current);
      if (!built.ok) {
        if (!opts.quiet) showIssues(built.issues);
        return "invalid";
      }
      setSaving(true);
      setSaveError(null);
      try {
        if (mode === "new" || !contentId) {
          const result = await createRecipeDraft({ payload: built.payload });
          if (!result.ok) {
            if (result.error === "invalid_payload" && result.detail) showIssues([draftIssue({ path: result.detail, message: "invalid" }, built.ingredientIndex, built.stepIndex)]);
            else setSaveError(errorText(result.error));
            return "failed";
          }
          removeLocal(storageKey);
          router.replace(`/creator/recipes/${result.id}/edit?step=ingredientes`);
          return "ok";
        }
        const result = await saveRecipe({ id: contentId, payload: built.payload, expectedUpdatedAt: updatedRef.current ?? "", overwrite: opts.overwrite });
        if (!result.ok) {
          if (result.error === "stale_draft") {
            setStaleOpen(true);
            return "stale";
          }
          if (result.error === "invalid_payload" && result.detail) {
            showIssues([draftIssue({ path: result.detail, message: "invalid" }, built.ingredientIndex, built.stepIndex)]);
            return "invalid";
          }
          if (result.error === "media_license_mismatch") {
            showIssues([{ path: "content.media_license_kind", fieldId: fieldIdForPath("content.media_license_kind"), message: "invalid" }]);
            return "invalid";
          }
          setSaveError(errorText(result.error));
          return "failed";
        }
        setUpdatedAt(result.updatedAt);
        updatedRef.current = result.updatedAt;
        setSaved(current);
        setIssues([]);
        setSavedAt(new Date());
        setAnnouncement(t("saved"));
        // vídeo gravado: deixa de ir no payload (ausente = mantém)
        setDraftState((d) => (d.videoDirty && d.video.provider === current.video.provider && d.video.ref === current.video.ref ? { ...d, videoDirty: false } : d));
        if (sameDraft(draftRef.current, current)) removeLocal(storageKey);
        else writeLocal(storageKey, serializeDraft(draftRef.current, result.updatedAt));
        return "ok";
      } catch {
        setSaveError(t("errors.network"));
        return "failed";
      } finally {
        setSaving(false);
      }
    },
    // showIssues/changeStep usam só estado estável por render; a gravação lê o rascunho pelo ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contentId, mode, storageKey, errorText, router, t],
  );

  // Uma gravação por vez: quem pede durante outra (ex.: a automática de 30 s) espera e grava de
  // novo com o rascunho atual e o updated_at que a anterior devolveu — nunca falha em silêncio.
  const save = useCallback(
    async (opts: { overwrite?: boolean; quiet?: boolean } = {}): Promise<SaveOutcome> => {
      while (inflight.current) await inflight.current.catch(() => "failed" as const);
      const run = saveOnce(opts);
      inflight.current = run;
      try {
        return await run;
      } finally {
        if (inflight.current === run) inflight.current = null;
      }
    },
    [saveOnce],
  );

  // a cada 30 s com mudança (sem barrar a pessoa com erros de validação no meio da digitação)
  useEffect(() => {
    if (mode !== "edit" || recovery) return;
    const timer = window.setInterval(() => {
      if (inflight.current) return;
      if (draftRef.current.videoDirty || !sameDraft(draftRef.current, saved)) void save({ quiet: true });
    }, AUTOSAVE_MS);
    return () => window.clearInterval(timer);
  }, [mode, recovery, save, saved]);

  async function goTo(next: RecipeEditorStep) {
    if (next === step) return;
    if (mode === "edit" && dirty) {
      const outcome = await save();
      if (outcome === "invalid" || outcome === "stale") return;
    }
    setIssues([]);
    changeStep(next);
  }

  async function next() {
    if (mode === "new") {
      await save();
      return;
    }
    const outcome = dirty ? await save() : "ok";
    if (outcome !== "ok") return;
    const index = stepIndex(step);
    if (index < RECIPE_EDITOR_STEPS.length - 1) changeStep(RECIPE_EDITOR_STEPS[index + 1]);
  }

  // ---------------------------------------------------------------- mídia (vale na hora no servidor)
  const onMediaUploaded = useCallback((media: RegisteredMedia) => {
    const entry = { id: media.id, role: media.role, position: media.position, alt: media.alt, caption: "", width: media.width, height: media.height };
    setDraftState((d) => ({ ...d, media: [...d.media, entry] }));
    setSaved((s) => ({ ...s, media: [...s.media, entry] }));
  }, []);

  const onDeleteMedia = useCallback(
    async (mediaId: string): Promise<boolean> => {
      try {
        const result = await deleteRecipeMedia({ mediaId });
        if (!result.ok) {
          toast({ title: errorText(result.error), variant: "error" });
          return false;
        }
        const strip = (d: RecipeDraft): RecipeDraft => ({
          ...d,
          media: d.media.filter((m) => m.id !== mediaId),
          coverMediaId: d.coverMediaId === mediaId ? null : d.coverMediaId,
          steps: d.steps.map((s) => (s.imageMediaId === mediaId ? { ...s, imageMediaId: null } : s)),
        });
        setDraftState(strip);
        setSaved(strip);
        if (result.updatedAt) {
          setUpdatedAt(result.updatedAt);
          updatedRef.current = result.updatedAt;
        }
        toast({ title: t("media.removed"), variant: "success" });
        return true;
      } catch {
        toast({ title: t("errors.network"), variant: "error" });
        return false;
      }
    },
    [errorText, t, toast],
  );

  // ---------------------------------------------------------------- publicar / enviar para revisão
  async function publish(kind: "publish" | "submit", at: string | null) {
    if (!contentId) return;
    setPublishing(true);
    setServerMissing([]);
    try {
      if (dirty) {
        const outcome = await save();
        if (outcome !== "ok") return;
      }
      const result = kind === "publish" ? await publishRecipe({ id: contentId, publishAt: at }) : await submitRecipe({ id: contentId, requestedPublishAt: at });
      if (!result.ok) {
        if (result.error === "recipe_incomplete") {
          const missing = parseRecipeIncomplete(`recipe_incomplete: ${result.detail ?? ""}`);
          setServerMissing(missing);
          setSaveError(errorText(result.error));
        } else {
          setSaveError(errorText(result.error));
        }
        return;
      }
      removeLocal(storageKey);
      toast({ title: kind === "submit" ? t("review.submitted") : at ? t("review.scheduled") : t("review.published"), variant: "success" });
      router.push("/creator/recipes");
      router.refresh();
    } catch {
      setSaveError(t("errors.network"));
    } finally {
      setPublishing(false);
    }
  }

  async function openPreview() {
    if (!contentId) return;
    if (dirty) {
      const outcome = await save();
      if (outcome !== "ok") return;
    }
    router.push(`/creator/recipes/${contentId}/preview`);
  }

  // ---------------------------------------------------------------- recuperação e conflito
  function recover() {
    if (!recovery) return;
    setDraftState({ ...recovery.draft, videoDirty: recovery.draft.videoDirty || recovery.draft.video.provider !== saved.video.provider || recovery.draft.video.ref !== saved.video.ref });
    setRecovery(null);
    toast({ title: t("recovery.recovered"), variant: "info" });
  }
  function discard() {
    removeLocal(storageKey);
    setRecovery(null);
  }

  const checklist = useMemo(() => recipeChecklist(draft, { currentCoverUrl, activeCategories: categories.map((c) => c.code) }), [draft, currentCoverUrl, categories]);
  const index = stepIndex(step);
  const disabled = Boolean(recovery) || publishing;
  const stepProps = { draft, setDraft, errorFor, disabled, announce };
  const timeFormat = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-6" data-testid="recipe-wizard" data-step={step}>
      {recovery && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-info/40 bg-info-soft p-4" data-testid="recipe-recovery">
          <p className="font-semibold text-fg">{t("recovery.title")}</p>
          <p className="type-body-sm text-fg-muted">{t("recovery.description", { date: new Date(recovery.savedAt).toLocaleString(locale) })}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" leadingIcon={<RotateCcw />} onClick={recover} data-testid="recipe-recover">
              {t("recovery.recover")}
            </Button>
            <Button type="button" variant="ghost" onClick={discard} data-testid="recipe-discard">
              {t("recovery.discard")}
            </Button>
          </div>
        </div>
      )}

      {/* progresso e navegação entre etapas (só depois de criar o rascunho) */}
      <nav aria-label={t("stepsNav")} className="flex flex-col gap-2">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-accent-text" aria-live="polite">
          {t("progress", { step: index + 1, total: RECIPE_EDITOR_STEPS.length, name: t(`steps.${step}`) })}
        </p>
        <ol className="grid grid-cols-6 gap-1.5">
          {RECIPE_EDITOR_STEPS.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => void goTo(s)}
                disabled={mode === "new" || disabled || saving}
                aria-current={s === step ? "step" : undefined}
                aria-label={`${i + 1}. ${t(`steps.${s}`)}`}
                className={cn(
                  "flex min-h-11 w-full flex-col justify-end gap-1 rounded-md pb-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed",
                )}
                data-testid={`recipe-step-${s}`}
              >
                <span className={cn("h-1.5 w-full rounded-full", i <= index ? "bg-accent" : "bg-border-strong")} />
                <span className={cn("hidden truncate text-left text-xs sm:block", s === step ? "font-semibold text-fg" : "text-fg-muted")}>{t(`steps.${s}`)}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {issues.length > 0 && (
        <div role="alert" className="flex flex-col gap-2 rounded-2xl border border-danger/30 bg-danger-soft p-4" data-testid="recipe-issues">
          <p className="font-semibold text-fg">{t("errors.summaryTitle", { count: issues.length })}</p>
          <ul className="flex flex-col gap-1">
            {issues.map((issue) => (
              <li key={issue.path}>
                <Button type="button" variant="link" onClick={() => changeStep(stepForPath(issue.path), issue.fieldId)}>
                  {t("errors.goToField", { field: fieldLabel(issue.path), step: t(`steps.${stepForPath(issue.path)}`) })}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section aria-labelledby="recipe-step-title" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="recipe-step-title" ref={headingRef} tabIndex={-1} className="type-h2 text-fg outline-none">
            {t(`steps.${step}`)}
          </h2>
          <p className="type-body-sm text-fg-muted">{t(`stepDescriptions.${step}`)}</p>
        </div>

        {step === "basicos" && <BasicsStep {...stepProps} categories={categories} />}
        {step === "ingredientes" && <IngredientsStep {...stepProps} />}
        {step === "preparo" && contentId && (
          <PreparationStep {...stepProps} contentId={contentId} creatorId={creatorId} uploadsEnabled={uploadsEnabled} onMediaUploaded={onMediaUploaded} onDeleteMedia={onDeleteMedia} />
        )}
        {step === "midia" && contentId && (
          <MediaStep
            {...stepProps}
            contentId={contentId}
            creatorId={creatorId}
            uploadsEnabled={uploadsEnabled}
            videoConfigured={videoConfigured}
            onMediaUploaded={onMediaUploaded}
            onDeleteMedia={onDeleteMedia}
            onRequestSave={() => window.setTimeout(() => void save({ quiet: true }), 0)}
          />
        )}
        {step === "complementos" && <ExtrasStep {...stepProps} nutritionValidated={nutritionValidated} />}
        {step === "revisao" && (
          <ReviewStep
            draft={draft}
            checklist={checklist}
            reviewRequired={reviewRequired}
            busy={publishing || saving || Boolean(recovery)}
            serverMissing={serverMissing}
            goTo={(s) => void goTo(s)}
            onPreview={() => void openPreview()}
            onPublish={(at) => void publish("publish", at)}
            onSubmit={(at) => void publish("submit", at)}
          />
        )}
      </section>

      {saveError && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 type-body-sm text-fg" data-testid="recipe-save-error">
          {saveError}
        </p>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
        <p className="type-caption text-fg-muted" aria-live="polite" data-testid="recipe-save-state">
          {saving ? t("saving") : dirty ? t("unsaved") : savedAt ? t("savedAt", { time: timeFormat.format(savedAt) }) : ""}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {mode === "edit" && index > 0 && (
              <Button type="button" variant="ghost" leadingIcon={<ArrowLeft />} onClick={() => void goTo(RECIPE_EDITOR_STEPS[index - 1])} disabled={disabled || saving}>
                {t("back")}
              </Button>
            )}
            {mode === "edit" && (
              <Button type="button" variant="secondary" leadingIcon={<Save />} onClick={() => void save()} loading={saving} disabled={disabled} data-testid="recipe-save">
                {t("saveDraft")}
              </Button>
            )}
            {mode === "edit" && contentId && (
              <Button asChild variant="ghost" leadingIcon={<History />}>
                <Link href={`/creator/recipes/${contentId}/versions`}>{t("versions")}</Link>
              </Button>
            )}
          </div>
          {step !== "revisao" && (
            <Button type="button" trailingIcon={<ArrowRight />} onClick={() => void next()} loading={saving} disabled={disabled} data-testid="recipe-next">
              {mode === "new" ? t("create") : t("next")}
            </Button>
          )}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <Dialog
        open={staleOpen}
        onOpenChange={(open) => !open && setStaleOpen(false)}
        title={t("stale.title")}
        description={t("stale.description")}
        size="sm"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                // a cópia local fica: depois de recarregar, "Recuperar" traz as alterações de volta
                writeLocal(storageKey, serializeDraft(draftRef.current, updatedRef.current ?? ""));
                window.location.reload();
              }}
            >
              {t("stale.reload")}
            </Button>
            <Button
              type="button"
              onClick={async () => {
                setStaleOpen(false);
                await save({ overwrite: true });
              }}
              data-testid="recipe-overwrite"
            >
              {t("stale.overwrite")}
            </Button>
          </>
        }
      />
    </div>
  );
}
