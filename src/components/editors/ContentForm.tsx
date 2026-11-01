"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { PillarBlockEditor } from "@/components/creator/post/PillarBlockEditor";
import { ProgramBlockEditor } from "@/components/creator/post/ProgramBlockEditor";
import { Button, FormField, Input, Select, Spinner, Switch, Textarea, useToast } from "@/components/ui";
import { PILLAR_BLOCK, draftToBlock, emptyDrafts, programDraftToBlock, type BlockDrafts } from "@/lib/post-blocks/schema";
import { AccessFields } from "./content/AccessFields";
import { CoverPicker } from "./content/CoverPicker";
import { ChipInput, FormSection, NumberField, useValidationMessage } from "./content/fields";
import { GuideEditor } from "./content/GuideEditor";
import { collectText, findHealthClaims } from "./content/health-claims";
import { HealthClaimNotice } from "./content/HealthClaimNotice";
import { LicenseFields } from "./content/LicenseFields";
import { LinkedProductsField } from "./content/LinkedProductsField";
import { MediaEditor } from "./content/MediaEditor";
import { RecipeEditor } from "./content/RecipeEditor";
import {
  CONTENT_TYPE_VALUES,
  DIFFICULTY_VALUES,
  DISCLAIMER_VALUES,
  LOCALE_VALUES,
  PILLAR_VALUES,
  bodyKindFor,
  coerceLicenseKind,
  emptyBody,
  parseContentForm,
  toFormValues,
  type ContentBody,
  type ContentTypeValue,
  type FieldErrors,
} from "./content/schema";
import { VideoEditor } from "./content/VideoEditor";
import { WorkoutEditor } from "./content/WorkoutEditor";
import type { ContentFormProps, ContentFormValues } from "./types";

// Formulário de conteúdo compartilhado (portal da personalidade e admin).
// Validação Zod no cliente (feedback imediato) e no servidor (fonte de verdade);
// regras de acesso só aparecem para o admin; readOnly desabilita tudo.
// Com a prop `blocks` (admin, 0075/0076) o conteúdo vira estruturado: o pilar abre o bloco dele (treino,
// nutrição, cardápio), um programa do herói entra como bloco à parte e produtos ficam vinculados.

type FormState = Omit<ContentFormValues, "body"> & { body: ContentBody };

const EMPTY_MEDIA: ContentFormValues["media"] = { provider: "none", ref: null, captions_url: null };

export function ContentForm({ mode, initial, canEditAccess, readOnly = false, cover, blocks, action }: ContentFormProps) {
  const t = useTranslations("editors");
  const tc = useTranslations("common");
  const tb = useTranslations("creator.post.blocks");
  const tv = useValidationMessage();
  const { toast } = useToast();
  const [values, setValues] = useState<FormState>(() => toFormValues(initial) as FormState);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  // blocos (0075/0076): rascunho por pilar + programa, e os produtos vinculados; só com a prop `blocks`
  const [drafts, setDrafts] = useState<BlockDrafts>(() => blocks?.drafts ?? emptyDrafts());
  const [productIds, setProductIds] = useState<string[]>(() => blocks?.products ?? []);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const claims = useMemo(
    () => findHealthClaims([values.title, values.summary, ...collectText(values.body)]),
    [values.title, values.summary, values.body],
  );
  const errorCount = Object.keys(errors).length;

  // Após validar com erros, leva o foco ao primeiro campo inválido.
  useEffect(() => {
    if (errorCount === 0) return;
    const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    first?.focus();
  }, [errorCount, errors]);

  function patch(p: Partial<FormState>) {
    setValues((v) => ({ ...v, ...p }));
  }

  // Trocar o tipo troca o editor de corpo; guia/artigo compartilham a forma.
  function setType(type: ContentTypeValue) {
    setValues((v) => {
      const sameFamily = bodyKindFor(v.body.kind) === bodyKindFor(type);
      const body: ContentBody = sameFamily && (type === "guide" || type === "article") && v.body.kind !== "video" && v.body.kind !== "recipe" && v.body.kind !== "workout"
        ? { ...v.body, kind: type }
        : sameFamily
          ? v.body
          : emptyBody(type);
      const media = type === "video" ? v.media : EMPTY_MEDIA;
      return { ...v, type, body, media, media_license_kind: coerceLicenseKind(media.provider, v.media_license_kind) };
    });
  }

  function translateServerError(code: string): string {
    if (code.startsWith("protected_column")) {
      const column = code.split(":")[1]?.trim() || "?";
      return t("errors.protected_column", { column });
    }
    const key = code.split(":")[0].trim();
    if (t.has(`errors.${key}`)) return t(`errors.${key}`);
    // a action do admin já devolve a frase traduzida (failWith): mostra como veio em vez do genérico
    return /\s/.test(code) ? code : t("errors.generic");
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (readOnly || pending) return;
    const candidate: ContentFormValues = { ...values, media: values.type === "video" ? values.media : EMPTY_MEDIA };
    if (blocks && values.type !== "recipe") {
      // bloco do pilar (vazio = nenhum) e programa (sem escolha = nenhum); erro de forma para o campo
      const pillarResult = draftToBlock(values.pillar, drafts);
      const programResult = programDraftToBlock(drafts);
      if (!pillarResult.ok || !programResult.ok) {
        setBlockError(tb(`errors.${!pillarResult.ok ? pillarResult.error : "invalid_block"}`));
        setServerError(null);
        return;
      }
      candidate.blocks = { pillar: pillarResult.block, program: programResult.block, products: productIds };
    }
    setBlockError(null);
    const parsed = parseContentForm(candidate);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      setServerError(null);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await action(parsed.data);
      if (result.ok) {
        setServerError(null);
        toast({ title: result.message ?? tc("states.saved"), variant: "success" });
        if (result.id && !values.id) patch({ id: result.id });
      } else {
        const message = translateServerError(result.error);
        setServerError(message);
        toast({ title: tc("states.error"), description: message, variant: "error" });
      }
    });
  }

  const bodyEditor =
    values.body.kind === "video" ? (
      <VideoEditor value={values.body} onChange={(body) => patch({ body })} errors={errors} />
    ) : values.body.kind === "recipe" ? (
      <RecipeEditor value={values.body} onChange={(body) => patch({ body })} errors={errors} canValidate={canEditAccess} />
    ) : values.body.kind === "workout" ? (
      <WorkoutEditor value={values.body} onChange={(body) => patch({ body })} errors={errors} />
    ) : (
      <GuideEditor value={values.body} onChange={(body) => patch({ body })} errors={errors} />
    );

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-5" aria-busy={pending || undefined}>
      {readOnly && (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-border bg-surface-elevated px-4 py-3 text-sm text-fg-muted">
          <Lock className="size-4 shrink-0" aria-hidden="true" />
          {t("readOnly")}
        </p>
      )}

      {(errorCount > 0 || serverError) && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-fg">
          {serverError ?? t("errors.summary", { count: errorCount })}
        </div>
      )}

      <fieldset disabled={readOnly || pending} className="flex min-w-0 flex-col gap-5">
        <FormSection legend={t("sections.basics")}>
          <FormField label={t("fields.title")} error={tv(errors.title)} required>
            <Input value={values.title} maxLength={140} onChange={(e) => patch({ title: e.target.value })} />
          </FormField>
          <FormField label={t("fields.summary")} hint={t("fields.summaryHint")} error={tv(errors.summary)}>
            <Textarea value={values.summary} rows={3} maxLength={600} onChange={(e) => patch({ summary: e.target.value })} />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label={t("fields.pillar")} error={tv(errors.pillar)} required>
              <Select value={values.pillar} onChange={(e) => patch({ pillar: e.target.value as FormState["pillar"] })}>
                {PILLAR_VALUES.map((p) => (
                  <option key={p} value={p}>
                    {tc(`pillars.${p}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t("fields.type")} hint={mode === "edit" ? t("fields.typeHint") : undefined} error={tv(errors.type) ?? tv(errors.body)} required>
              <Select value={values.type} onChange={(e) => setType(e.target.value as ContentTypeValue)}>
                {/* Receita tem editor próprio (fase 2): este formulário não cria nem converte receita; uma receita existente aparece aqui apenas para leitura. */}
                {CONTENT_TYPE_VALUES.filter((ct) => ct !== "recipe" || values.type === "recipe").map((ct) => (
                  <option key={ct} value={ct}>
                    {t(`types.${ct}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t("fields.sourceLocale")} hint={t("fields.sourceLocaleHint")} error={tv(errors.source_locale)} required>
              <Select value={values.source_locale} onChange={(e) => patch({ source_locale: e.target.value as FormState["source_locale"] })}>
                {LOCALE_VALUES.map((l) => (
                  <option key={l} value={l}>
                    {tc(`languages.${l}`)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField label={t("fields.duration")} hint={t("fields.durationHint")} value={values.duration_minutes} onChange={(duration_minutes) => patch({ duration_minutes })} min={1} max={600} error={tv(errors.duration_minutes)} />
            <FormField label={t("fields.difficulty")} error={tv(errors.difficulty)}>
              <Select value={values.difficulty ?? ""} onChange={(e) => patch({ difficulty: (e.target.value || null) as FormState["difficulty"] })}>
                <option value="">{t("fields.difficultyNone")}</option>
                {DIFFICULTY_VALUES.map((d) => (
                  <option key={d} value={d}>
                    {t(`difficulty.${d}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t("fields.disclaimer")} hint={t("fields.disclaimerHint")} error={tv(errors.disclaimer_kind)}>
              <Select value={values.disclaimer_kind ?? ""} onChange={(e) => patch({ disclaimer_kind: (e.target.value || null) as FormState["disclaimer_kind"] })}>
                <option value="">{t("fields.disclaimerChoose")}</option>
                {DISCLAIMER_VALUES.map((d) => (
                  <option key={d} value={d}>
                    {t(`disclaimer.${d}`)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <ChipInput label={t("fields.tags")} hint={t("fields.tagsHint")} values={values.tags} onChange={(tags) => patch({ tags })} error={tv(errors.tags)} max={12} maxLength={30} />

          <Switch checked={values.has_captions} onCheckedChange={(has_captions) => patch({ has_captions })} label={t("fields.hasCaptions")} description={t("fields.hasCaptionsHint")} />
        </FormSection>

        <HealthClaimNotice terms={claims} />

        <FormSection legend={t("sections.cover")} description={t("sections.coverDescription")}>
          <CoverPicker value={values.cover_url} onChange={(cover_url) => patch({ cover_url })} error={tv(errors.cover_url)} state={cover.state} creatorId={cover.creatorId} disabled={readOnly || pending} />
        </FormSection>

        {values.type === "video" && (
          <FormSection legend={t("sections.media")} description={t("sections.mediaDescription")}>
            <MediaEditor value={values.media} onChange={(media) => patch({ media, media_license_kind: coerceLicenseKind(media.provider, values.media_license_kind) })} errors={errors} />
          </FormSection>
        )}

        <FormSection legend={t("sections.license")} description={t("sections.licenseDescription")}>
          <LicenseFields provider={values.type === "video" ? values.media.provider : "none"} values={values} onChange={(p) => patch(p)} errors={errors} />
        </FormSection>

        <FormSection legend={t(`sections.body.${bodyKindFor(values.type)}`)} description={t("sections.bodyDescription")}>
          {bodyEditor}
        </FormSection>

        {blocks && values.type !== "recipe" && (
          <>
            <FormSection legend={t("sections.blocks")} description={t("sections.blocksDescription")}>
              {blocks.loading ? (
                <p className="flex items-center gap-2 type-caption text-fg-muted">
                  <Spinner size="sm" label={t("sections.blocksLoading")} />
                  {t("sections.blocksLoading")}
                </p>
              ) : null}
              {PILLAR_BLOCK[values.pillar] ? (
                <PillarBlockEditor pillar={values.pillar} drafts={drafts} onChange={setDrafts} options={blocks.options} hrefs={blocks.hrefs} error={blockError} disabled={readOnly || pending} />
              ) : (
                <p className="type-caption text-fg-muted" data-testid="block-routine-note">
                  {t("sections.blocksRoutine")}
                </p>
              )}
              <ProgramBlockEditor drafts={drafts} onChange={setDrafts} programs={blocks.options.programs} newProgramHref={blocks.hrefs.newProgram} disabled={readOnly || pending} />
            </FormSection>
            <FormSection legend={t("sections.products")} description={t("sections.productsDescription")}>
              <LinkedProductsField value={productIds} onChange={setProductIds} products={blocks.options.products} disabled={readOnly || pending} />
            </FormSection>
          </>
        )}

        {canEditAccess && (
          <FormSection legend={t("sections.access")} description={t("sections.accessDescription")}>
            <AccessFields values={values} onChange={(p) => patch(p)} errors={errors} />
          </FormSection>
        )}
      </fieldset>

      {!readOnly && (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="type-caption text-fg-muted">{t("footerNote")}</p>
          <Button type="submit" loading={pending} size="lg">
            {mode === "create" ? t("actions.create") : tc("actions.save")}
          </Button>
        </div>
      )}
    </form>
  );
}
