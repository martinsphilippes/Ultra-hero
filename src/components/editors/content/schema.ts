// Esquema Zod do formulário de conteúdo. Reutilizado pelo ContentForm (cliente) e pelas
// server actions (portal da personalidade e admin). As mensagens são CHAVES de tradução
// do namespace "editors.validation" — a UI traduz; o servidor só precisa do ok/erro.
import { z } from "zod";
import { supabaseBaseUrl } from "@/lib/avatar/paths";
import { isPostPhotoPath, storedPostPhotoPath } from "@/lib/post-photo/paths";
import type { ContentFormValues } from "../types";
import { parseMediaRef } from "./media";

export const PILLAR_VALUES = ["routine", "training", "nutrition", "gastronomy"] as const;
export const CONTENT_TYPE_VALUES = ["video", "recipe", "workout", "guide", "article"] as const;
export const LOCALE_VALUES = ["pt-BR", "en", "es"] as const;
export const DIFFICULTY_VALUES = ["beginner", "intermediate", "advanced"] as const;
export const DISCLAIMER_VALUES = ["general", "training", "nutrition", "none"] as const;
export const COMPLETION_VALUES = ["manual", "auto"] as const;
export const MEDIA_PROVIDER_VALUES = ["none", "embed_youtube", "embed_vimeo", "cloudflare_stream", "mux", "upload"] as const;
/** Provedores que a POC consegue reproduzir (os demais aparecem desabilitados: "não configurado"). */
export const ENABLED_MEDIA_PROVIDERS = ["none", "embed_youtube", "embed_vimeo"] as const;
// uid do Cloudflare Stream (32 hex). Só chega ao formulário pelo composer de post: o editor mantém
// o vídeo já enviado, sem oferecer a escolha manual do provedor.
export const STREAM_UID = /^[0-9a-f]{32}$/;
/** Licença da mídia (RF-008). Espelha o check de public.content.media_license_kind. */
export const LICENSE_KIND_VALUES = ["platform_demo", "own", "licensed", "third_party_embed"] as const;

export type ContentTypeValue = (typeof CONTENT_TYPE_VALUES)[number];
export type LicenseKindValue = (typeof LICENSE_KIND_VALUES)[number];

/** Licenças coerentes com o provedor (espelha public.media_license_compatible, validado também no banco). */
export function allowedLicenseKinds(provider: string): readonly LicenseKindValue[] {
  if (provider === "embed_youtube" || provider === "embed_vimeo") return ["third_party_embed"];
  if (provider === "none") return ["platform_demo", "own"];
  return ["platform_demo", "own", "licensed"];
}

/** Mantém a licença escolhida quando ainda é coerente com o provedor; senão cai na primeira permitida. */
export function coerceLicenseKind(provider: string, kind: string | null | undefined): LicenseKindValue {
  const allowed = allowedLicenseKinds(provider);
  return (allowed as readonly string[]).includes(kind ?? "") ? (kind as LicenseKindValue) : allowed[0];
}

// Caminho relativo à própria origem ("/placeholders/..."): nunca "//host" nem esquema externo.
export const SAME_ORIGIN_PATH = /^\/(?!\/)[A-Za-z0-9_\-./%]*$/;
const HTTPS_URL = /^https:\/\/[^\s]+$/;

const text = (max: number) => z.string().trim().max(max, { error: "tooLong" });
const requiredText = (max: number) =>
  z.string().trim().min(1, { error: "required" }).max(max, { error: "tooLong" });
const intField = (min: number, max: number) =>
  z
    .number({ error: "invalidNumber" })
    .int({ error: "invalidNumber" })
    .min(min, { error: "invalidNumber" })
    .max(max, { error: "invalidNumber" });
const intOrNull = (min: number, max: number) => intField(min, max).nullable();

// ---------------------------------------------------------------- corpos por tipo
export const videoBodySchema = z.object({
  kind: z.literal("video"),
  intro: text(2000),
  key_points: z.array(requiredText(200)).max(12, { error: "tooMany" }),
  transcript: z.array(z.object({ t: intField(0, 86_400), text: requiredText(500) })).max(500, { error: "tooMany" }),
});

// ---------------------------------------------------------------- nutrição (RF-006, RB-08)
// Números por porção são livres de digitar; "validado" só pode ser verdadeiro com responsável e
// data (a server action da personalidade zera a validação; só o admin valida).
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const nutrientOrNull = z
  .number({ error: "invalidNumber" })
  .min(0, { error: "invalidNumber" })
  .max(100_000, { error: "invalidNumber" })
  .nullable();

export const NUTRIENT_KEYS = ["kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sodium_mg"] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

export const nutritionPerServingSchema = z.object({
  kcal: nutrientOrNull,
  protein_g: nutrientOrNull,
  carbs_g: nutrientOrNull,
  fat_g: nutrientOrNull,
  fiber_g: nutrientOrNull,
  sodium_mg: nutrientOrNull,
});

export const nutritionSchema = z
  .object({
    per_serving: nutritionPerServingSchema,
    validated: z.boolean(),
    validated_by: text(120).nullable(),
    validated_at: z
      .string()
      .regex(ISO_DATE, { error: "invalidDate" })
      .refine((v) => isValidIsoDate(v), { error: "invalidDate" })
      .nullable(),
    note: text(600),
  })
  .superRefine((n, ctx) => {
    if (!n.validated) return;
    if (!n.validated_by) ctx.addIssue({ code: "custom", message: "validatorRequired", path: ["validated_by"] });
    if (!n.validated_at) ctx.addIssue({ code: "custom", message: "validatedAtRequired", path: ["validated_at"] });
  });

export const recipeBodySchema = z.object({
  kind: z.literal("recipe"),
  servings: intOrNull(1, 100),
  prep_minutes: intOrNull(0, 1440),
  cook_minutes: intOrNull(0, 1440),
  ingredients: z.array(z.object({ item: requiredText(120), qty: text(60) })).max(60, { error: "tooMany" }),
  steps: z.array(requiredText(600)).max(40, { error: "tooMany" }),
  allergens: z.array(requiredText(40)).max(20, { error: "tooMany" }),
  note: text(600),
  nutrition: nutritionSchema.nullable().default(null),
});

export type RecipeNutrition = z.infer<typeof nutritionSchema>;

function isValidIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function emptyNutrition(): RecipeNutrition {
  return {
    per_serving: { kcal: null, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null, sodium_mg: null },
    validated: false,
    validated_by: null,
    validated_at: null,
    note: "",
  };
}

/** Há algum número por porção informado? */
export function nutritionHasValues(n: RecipeNutrition | null | undefined): boolean {
  return Boolean(n && NUTRIENT_KEYS.some((k) => n.per_serving[k] !== null));
}

/** Nada informado (nem números, nem nota, nem validação) vira null para não gravar objeto vazio. */
function compactNutrition(n: RecipeNutrition | null): RecipeNutrition | null {
  if (!n) return null;
  return nutritionHasValues(n) || n.note.trim() !== "" || n.validated || n.validated_by || n.validated_at ? n : null;
}

/** A personalidade nunca valida: zera a marcação antes de validar/gravar (só o admin valida). */
export function stripNutritionValidation<T extends { body: Record<string, unknown> }>(values: T): T {
  const body = values.body;
  if (!isRecord(body) || body.kind !== "recipe" || !isRecord(body.nutrition)) return values;
  return { ...values, body: { ...body, nutrition: { ...body.nutrition, validated: false, validated_by: null, validated_at: null } } };
}

export const workoutExerciseSchema = z.object({
  name: requiredText(120),
  sets: intOrNull(1, 20),
  reps: text(40),
  rest_seconds: intOrNull(0, 600),
});

export const workoutBodySchema = z.object({
  kind: z.literal("workout"),
  equipment: z.array(requiredText(40)).max(20, { error: "tooMany" }),
  blocks: z
    .array(z.object({ name: requiredText(80), exercises: z.array(workoutExerciseSchema).max(30, { error: "tooMany" }) }))
    .max(12, { error: "tooMany" }),
  safety_note: text(600),
});

export const guideBodySchema = z.object({
  kind: z.enum(["guide", "article"]),
  intro: text(2000),
  sections: z.array(z.object({ heading: text(120), text: requiredText(5000) })).max(30, { error: "tooMany" }),
  key_points: z.array(requiredText(200)).max(12, { error: "tooMany" }),
});

export const bodySchema = z.discriminatedUnion("kind", [videoBodySchema, recipeBodySchema, workoutBodySchema, guideBodySchema]);

export type VideoBody = z.infer<typeof videoBodySchema>;
export type RecipeBody = z.infer<typeof recipeBodySchema>;
export type WorkoutBody = z.infer<typeof workoutBodySchema>;
export type GuideBody = z.infer<typeof guideBodySchema>;
export type ContentBody = z.infer<typeof bodySchema>;

// ---------------------------------------------------------------- mídia
export const mediaSchema = z.object({
  provider: z.enum(MEDIA_PROVIDER_VALUES),
  ref: z.string().trim().max(300, { error: "tooLong" }).nullable(),
  captions_url: z.string().trim().max(500, { error: "tooLong" }).nullable(),
});

// ---------------------------------------------------------------- formulário completo
// IDs: z.uuid() (RFC 4122). O seed gera IDs determinísticos já com versão/variante RFC
// (public.seed_uuid em 0008), então conteúdos e módulos do seed continuam editáveis.
export const contentFormSchema = z
  .object({
    id: z.uuid().optional(),
    title: requiredText(140),
    summary: text(600),
    pillar: z.enum(PILLAR_VALUES),
    type: z.enum(CONTENT_TYPE_VALUES),
    source_locale: z.enum(LOCALE_VALUES),
    cover_url: z
      .string()
      .trim()
      .max(300, { error: "tooLong" })
      // caminho da própria origem ou a foto do post com foto (0043); o banco confere o dono da foto
      .refine((v) => v === "" || SAME_ORIGIN_PATH.test(v) || storedPostPhotoPath(v, supabaseBaseUrl()) !== null, { error: "invalidCover" }),
    duration_minutes: intOrNull(1, 600),
    difficulty: z.enum(DIFFICULTY_VALUES).nullable(),
    tags: z.array(z.string().trim().min(1, { error: "required" }).max(30, { error: "tooLong" })).max(12, { error: "tooMany" }),
    has_captions: z.boolean(),
    disclaimer_kind: z.enum(DISCLAIMER_VALUES).nullable(),
    body: bodySchema,
    media: mediaSchema,
    // Licença e crédito da mídia (RF-008): ausente = derivada do provedor em finalizeContentValues.
    media_license_kind: z.enum(LICENSE_KIND_VALUES).optional(),
    media_license_ref: text(300).optional(),
    media_credit: text(160).optional(),
    completion_mode: z.enum(COMPLETION_VALUES).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    // licença coerente com o provedor (o banco também recusa: media_license_mismatch)
    if (v.media_license_kind && !(allowedLicenseKinds(v.media.provider) as readonly string[]).includes(v.media_license_kind)) {
      ctx.addIssue({ code: "custom", message: "licenseMismatch", path: ["media_license_kind"] });
    }
    // corpo precisa ser do mesmo tipo do conteúdo (guia/artigo compartilham o editor)
    if (bodyKindFor(v.type) !== bodyKindFor(v.body.kind)) {
      ctx.addIssue({ code: "custom", message: "bodyTypeMismatch", path: ["body"] });
    }
    // mídia: só os provedores habilitados; referência válida por provedor
    const m = v.media;
    if (m.provider === "embed_youtube" || m.provider === "embed_vimeo") {
      if (!m.ref) ctx.addIssue({ code: "custom", message: "mediaRefRequired", path: ["media", "ref"] });
      else if (!parseMediaRef(m.provider, m.ref)) ctx.addIssue({ code: "custom", message: "invalidMediaRef", path: ["media", "ref"] });
    } else if (m.provider === "cloudflare_stream") {
      if (!m.ref || !STREAM_UID.test(m.ref)) ctx.addIssue({ code: "custom", message: "invalidMediaRef", path: ["media", "ref"] });
    } else if (m.provider === "upload") {
      // foto do composer (0043): só mantém a que já está no rascunho (o servidor e o banco conferem)
      if (!isPostPhotoPath(m.ref)) ctx.addIssue({ code: "custom", message: "invalidMediaRef", path: ["media", "ref"] });
    } else if (m.provider !== "none") {
      ctx.addIssue({ code: "custom", message: "providerNotConfigured", path: ["media", "provider"] });
    }
    if (m.captions_url && !(SAME_ORIGIN_PATH.test(m.captions_url) || HTTPS_URL.test(m.captions_url))) {
      ctx.addIssue({ code: "custom", message: "invalidUrl", path: ["media", "captions_url"] });
    }
  });

export type ContentFormParsed = z.infer<typeof contentFormSchema>;
export type FieldErrors = Record<string, string>;

/** Normaliza (ID de mídia extraído de URL, strings vazias → null) depois da validação. */
export function finalizeContentValues(parsed: ContentFormParsed): ContentFormValues {
  const provider = parsed.media.provider;
  const ref =
    provider === "embed_youtube" || provider === "embed_vimeo"
      ? parseMediaRef(provider, parsed.media.ref ?? "")
      : (provider === "cloudflare_stream" && STREAM_UID.test(parsed.media.ref ?? "")) || (provider === "upload" && isPostPhotoPath(parsed.media.ref))
        ? parsed.media.ref
        : null;
  const finalProvider = ref ? provider : "none";
  const body = parsed.body.kind === "recipe" ? { ...parsed.body, nutrition: compactNutrition(parsed.body.nutrition) } : parsed.body;
  return {
    ...parsed,
    cover_url: parsed.cover_url,
    tags: Array.from(new Set(parsed.tags)),
    body,
    media: { provider: finalProvider, ref, captions_url: parsed.media.captions_url || null },
    media_license_kind: coerceLicenseKind(finalProvider, parsed.media_license_kind),
    media_license_ref: parsed.media_license_ref ?? "",
    media_credit: parsed.media_credit ?? "",
  };
}

export type ParseResult = { ok: true; data: ContentFormValues } | { ok: false; errors: FieldErrors };

/** Valida valores vindos do formulário ou de uma action. Erros indexados por caminho ("body.steps.2"). */
export function parseContentForm(values: unknown): ParseResult {
  const result = contentFormSchema.safeParse(values);
  if (result.success) return { ok: true, data: finalizeContentValues(result.data) };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, errors };
}

// ---------------------------------------------------------------- helpers de forma
export function bodyKindFor(type: string): "video" | "recipe" | "workout" | "guide" {
  if (type === "video" || type === "recipe" || type === "workout") return type;
  return "guide";
}

export function emptyBody(type: ContentTypeValue): ContentBody {
  switch (type) {
    case "video":
      return { kind: "video", intro: "", key_points: [], transcript: [] };
    case "recipe":
      return { kind: "recipe", servings: null, prep_minutes: null, cook_minutes: null, ingredients: [], steps: [], allergens: [], note: "", nutrition: null };
    case "workout":
      return { kind: "workout", equipment: [], blocks: [{ name: "", exercises: [] }], safety_note: "" };
    default:
      return { kind: type, intro: "", sections: [{ heading: "", text: "" }], key_points: [] };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function str(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}
function int(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null;
}
function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(str).filter((v) => v.trim() !== "") : [];
}
function numOrNull(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Nutrição vinda do banco (forma livre) → forma editável; ausente ou inválida vira null. */
export function normalizeNutrition(raw: unknown): RecipeNutrition | null {
  if (!isRecord(raw)) return null;
  const ps = isRecord(raw.per_serving) ? raw.per_serving : {};
  const validatedAt = str(raw.validated_at);
  return {
    per_serving: {
      kcal: numOrNull(ps.kcal),
      protein_g: numOrNull(ps.protein_g),
      carbs_g: numOrNull(ps.carbs_g),
      fat_g: numOrNull(ps.fat_g),
      fiber_g: numOrNull(ps.fiber_g),
      sodium_mg: numOrNull(ps.sodium_mg),
    },
    validated: raw.validated === true,
    validated_by: str(raw.validated_by).trim() || null,
    validated_at: ISO_DATE.test(validatedAt) ? validatedAt : null,
    note: str(raw.note),
  };
}

/** Converte um corpo vindo do banco (forma livre) para a forma editável do tipo. Tolerante a campos faltantes. */
export function normalizeBody(type: ContentTypeValue, raw: unknown): ContentBody {
  const b = isRecord(raw) ? raw : {};
  switch (type) {
    case "video":
      return {
        kind: "video",
        intro: str(b.intro),
        key_points: strList(b.key_points),
        transcript: Array.isArray(b.transcript)
          ? b.transcript
              .filter(isRecord)
              .map((row) => ({ t: int(row.t) ?? 0, text: str(row.text) }))
              .filter((row) => row.text.trim() !== "")
          : [],
      };
    case "recipe":
      return {
        kind: "recipe",
        servings: int(b.servings),
        prep_minutes: int(b.prep_minutes),
        cook_minutes: int(b.cook_minutes),
        ingredients: Array.isArray(b.ingredients)
          ? b.ingredients
              .map((row) => (typeof row === "string" ? { item: row, qty: "" } : isRecord(row) ? { item: str(row.item ?? row.name), qty: str(row.qty ?? row.quantity) } : null))
              .filter((row): row is { item: string; qty: string } => Boolean(row && row.item.trim()))
          : [],
        steps: strList(b.steps),
        allergens: strList(b.allergens),
        note: str(b.note),
        nutrition: normalizeNutrition(b.nutrition),
      };
    case "workout":
      return {
        kind: "workout",
        equipment: strList(b.equipment),
        blocks: Array.isArray(b.blocks)
          ? b.blocks.filter(isRecord).map((block) => ({
              name: str(block.name),
              exercises: Array.isArray(block.exercises)
                ? block.exercises
                    .filter(isRecord)
                    .map((ex) => ({ name: str(ex.name), sets: int(ex.sets), reps: str(ex.reps), rest_seconds: int(ex.rest_seconds) }))
                : [],
            }))
          : [],
        safety_note: str(b.safety_note),
      };
    default:
      return {
        kind: type,
        intro: str(b.intro),
        sections: Array.isArray(b.sections)
          ? b.sections
              .map((s) => (typeof s === "string" ? { heading: "", text: s } : isRecord(s) ? { heading: str(s.heading ?? s.title), text: str(s.text ?? s.body) } : null))
              .filter((s): s is { heading: string; text: string } => Boolean(s))
          : [],
        key_points: strList(b.key_points),
      };
  }
}

/** Estado inicial completo do formulário a partir de valores parciais (criação ou edição). */
export function toFormValues(initial?: Partial<ContentFormValues>): ContentFormValues {
  const type = (initial?.type ?? "video") as ContentTypeValue;
  return {
    id: initial?.id,
    title: initial?.title ?? "",
    summary: initial?.summary ?? "",
    pillar: initial?.pillar ?? "routine",
    type,
    source_locale: initial?.source_locale ?? "pt-BR",
    cover_url: initial?.cover_url ?? "",
    duration_minutes: initial?.duration_minutes ?? null,
    difficulty: initial?.difficulty ?? null,
    tags: initial?.tags ?? [],
    has_captions: initial?.has_captions ?? false,
    disclaimer_kind: initial?.disclaimer_kind ?? null,
    body: initial?.body ? normalizeBody(type, initial.body) : emptyBody(type),
    media: {
      provider: initial?.media?.provider ?? "none",
      ref: initial?.media?.ref ?? null,
      captions_url: initial?.media?.captions_url ?? null,
    },
    media_license_kind: coerceLicenseKind(initial?.media?.provider ?? "none", initial?.media_license_kind),
    media_license_ref: initial?.media_license_ref ?? "",
    media_credit: initial?.media_credit ?? "",
    completion_mode: initial?.completion_mode ?? null,
  };
}

// ---------------------------------------------------------------- checklist de completude (envio para revisão)
export type ChecklistKey = "title" | "summary" | "cover" | "body" | "media" | "disclaimer";
export type ChecklistItem = { key: ChecklistKey; ok: boolean };

/** Verifica se o corpo tem substância mínima para revisão (o banco só exige título e pilar). */
export function bodyHasSubstance(type: ContentTypeValue, raw: unknown): boolean {
  const body = normalizeBody(type, raw);
  switch (body.kind) {
    case "video":
      return body.intro.trim() !== "" || body.key_points.length > 0 || body.transcript.length > 0;
    case "recipe":
      return body.ingredients.length > 0 && body.steps.length > 0;
    case "workout":
      return body.blocks.some((b) => b.exercises.length > 0);
    default:
      return body.sections.some((s) => s.text.trim() !== "");
  }
}

export function contentChecklist(input: {
  type: ContentTypeValue;
  title: string | null;
  summary: string | null;
  cover_url: string | null;
  disclaimer_kind: string | null;
  body: unknown;
  media: { provider: string; ref: string | null } | null;
}): ChecklistItem[] {
  const items: ChecklistItem[] = [
    { key: "title", ok: Boolean(input.title?.trim()) },
    { key: "summary", ok: Boolean(input.summary?.trim()) },
    { key: "cover", ok: Boolean(input.cover_url?.trim()) },
    { key: "body", ok: bodyHasSubstance(input.type, input.body) },
    { key: "disclaimer", ok: input.disclaimer_kind !== null && input.disclaimer_kind !== "" },
  ];
  if (input.type === "video") {
    items.splice(4, 0, { key: "media", ok: Boolean(input.media && input.media.provider !== "none" && input.media.ref) });
  }
  return items;
}
