import { z } from "zod";
import { formatE164ForDisplay, normalizeBrMobile } from "@/lib/auth/phone";
import { toCsv } from "@/lib/indicators";

// Lista "Seja o primeiro a saber" do teaser de lançamento (/conheca e /conheca/influenciador; tabela launch_leads,
// 0117). Módulo puro: validação, limites e a planilha, usados pela server action, pelo admin e pelos testes.
// Mensagens de erro = CHAVES de institutional.form.errors.*.

export const LAUNCH_LEAD_KINDS = ["publico", "influenciador"] as const;
export type LaunchLeadKind = (typeof LAUNCH_LEAD_KINDS)[number];

/** Campo-isca: invisível para pessoas; robô que preenche tudo recebe "pronto" e nada é gravado. */
export const LAUNCH_HONEYPOT_FIELD = "empresa_site";

/** 5 envios por IP a cada 10 min (e 5 por e-mail), contados em quick_signup_attempts com prefixo próprio. */
export const LAUNCH_LEAD_LIMITS = { windowMinutes: 10, perIp: 5, perEmail: 5 } as const;

export function isLaunchLeadKind(value: unknown): value is LaunchLeadKind {
  return typeof value === "string" && (LAUNCH_LEAD_KINDS as readonly string[]).includes(value);
}

/** "@Ana.Silva", "instagram.com/ana.silva/", " ana.silva " → "ana.silva"; vazio → null; inválido → undefined. */
export function normalizeInstagram(input: unknown): string | null | undefined {
  if (input === null || input === undefined) return null;
  if (typeof input !== "string" || input.length > 200) return undefined;
  let v = input.trim();
  if (!v) return null;
  v = v.replace(/^https?:\/\//i, "").replace(/^(www\.)?instagram\.com\//i, "");
  v = v.replace(/[/?#].*$/, "").replace(/^@+/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(v) ? v.toLowerCase() : undefined;
}

/** Origem/UTM: texto curto e seguro (letras, números, . _ - +), senão null. */
export function cleanTag(value: unknown, max = 80): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().slice(0, max);
  return v && /^[\p{L}\p{N}._+\- ]+$/u.test(v) ? v : null;
}

function isName(v: string): boolean {
  if (v.length < 2 || v.length > 120) return false;
  if (!/\p{L}/u.test(v)) return false;
  return !/[<>{}\\/@]|https?:/i.test(v) && !/\d/.test(v);
}

const nameSchema = z
  .string({ error: "required" })
  .transform((v) => v.normalize("NFC").replace(/\s+/g, " ").trim())
  .superRefine((v, ctx) => {
    if (!v) ctx.addIssue({ code: "custom", message: "required" });
    else if (!isName(v)) ctx.addIssue({ code: "custom", message: "nameInvalid" });
  });

const emailSchema = z
  .string({ error: "required" })
  .trim()
  .toLowerCase()
  .min(1, { error: "required" })
  .max(254, { error: "emailInvalid" })
  .pipe(z.email({ error: "emailInvalid" }));

const phoneSchema = z
  .string({ error: "required" })
  .trim()
  .min(1, { error: "required" })
  .transform((v, ctx) => {
    const e164 = normalizeBrMobile(v);
    if (!e164) {
      ctx.addIssue({ code: "custom", message: "phoneInvalid" });
      return z.NEVER;
    }
    return e164;
  });

// caixinha obrigatória: o navegador manda "on" quando marcada; ausente = não aceitou
const consentSchema = z.unknown().transform((v, ctx) => {
  if (v === "on" || v === "1" || v === "true" || v === true) return true as const;
  ctx.addIssue({ code: "custom", message: "consentRequired" });
  return z.NEVER;
});

const instagramSchema = z.unknown().transform((v, ctx) => {
  const ig = normalizeInstagram(v);
  if (ig === undefined) {
    ctx.addIssue({ code: "custom", message: "instagramInvalid" });
    return z.NEVER;
  }
  return ig;
});

export const launchLeadSchema = z.object({
  kind: z.enum(LAUNCH_LEAD_KINDS, { error: "unknown" }),
  name: nameSchema,
  phone: phoneSchema,
  email: emailSchema,
  consent: consentSchema,
  instagram: instagramSchema,
});
export type LaunchLeadInput = z.infer<typeof launchLeadSchema>;

export type LaunchLeadField = "name" | "phone" | "email" | "consent" | "instagram";
export type LaunchLeadState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; error?: "tooMany" | "unavailable" | "unknown"; fieldErrors?: Partial<Record<LaunchLeadField, string>> };

export const initialLaunchLeadState: LaunchLeadState = { status: "idle" };

/** Primeira mensagem de cada campo (zod) → { campo: chave }. */
export function launchLeadFieldErrors(error: z.ZodError): Partial<Record<LaunchLeadField, string>> {
  const out: Partial<Record<LaunchLeadField, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (field === "name" || field === "phone" || field === "email" || field === "consent" || field === "instagram") {
      out[field] ??= issue.message;
    }
  }
  return out;
}

/** User agent curto (até 200), sem quebras de linha. */
export function shortUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const v = ua.replace(/[\r\n\t]+/g, " ").trim().slice(0, 200);
  return v || null;
}

// ---------------------------------------------------------------- admin
export type LaunchLeadRow = {
  id: string;
  kind: LaunchLeadKind;
  name: string;
  phone: string;
  email: string;
  instagram: string | null;
  consentAt: string;
  source: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LaunchLeadsPage = {
  totals: { publico: number; influenciador: number; all: number };
  filtered: number;
  rows: LaunchLeadRow[];
};

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const int = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number.parseInt(String(v ?? 0), 10) || 0);

/** Resposta da admin_launch_leads (jsonb) → tipos do app (linhas sem os campos obrigatórios caem fora). */
export function parseLaunchLeadsPage(data: unknown): LaunchLeadsPage {
  const obj = (data && typeof data === "object" && !Array.isArray(data) ? data : {}) as Record<string, unknown>;
  const totals = (obj.totals && typeof obj.totals === "object" ? obj.totals : {}) as Record<string, unknown>;
  const rows: LaunchLeadRow[] = [];
  for (const raw of Array.isArray(obj.rows) ? obj.rows : []) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const id = str(r.id);
    const kind = r.kind;
    const name = str(r.name);
    const phone = str(r.phone);
    const email = str(r.email);
    if (!id || !isLaunchLeadKind(kind) || !name || !phone || !email) continue;
    rows.push({
      id,
      kind,
      name,
      phone,
      email,
      instagram: str(r.instagram),
      consentAt: str(r.consent_at) ?? "",
      source: str(r.source),
      utmSource: str(r.utm_source),
      utmMedium: str(r.utm_medium),
      utmCampaign: str(r.utm_campaign),
      createdAt: str(r.created_at) ?? "",
      updatedAt: str(r.updated_at) ?? "",
    });
  }
  return {
    totals: { publico: int(totals.publico), influenciador: int(totals.influenciador), all: int(totals.all) },
    filtered: int(obj.filtered),
    rows,
  };
}

/** Filtro da lista no admin (?tipo=publico|influenciador; outro valor = todos). */
export function parseLeadKindFilter(value: unknown): LaunchLeadKind | null {
  return isLaunchLeadKind(value) ? value : null;
}

export const LAUNCH_LEADS_CSV_HEADER = [
  "tipo",
  "nome",
  "celular",
  "celular_e164",
  "email",
  "instagram",
  "aceite_em",
  "origem",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "criado_em",
  "atualizado_em",
] as const;

/** Planilha (CSV, vírgula, UTF-8 com BOM para o Excel abrir os acentos). Fórmulas ganham ' na frente (toCsv). */
export function launchLeadsCsv(rows: readonly LaunchLeadRow[]): string {
  return (
    "﻿" +
    toCsv(
      LAUNCH_LEADS_CSV_HEADER,
      rows.map((r) => [
        r.kind,
        r.name,
        formatE164ForDisplay(r.phone),
        r.phone,
        r.email,
        r.instagram ?? "",
        r.consentAt,
        r.source,
        r.utmSource,
        r.utmMedium,
        r.utmCampaign,
        r.createdAt,
        r.updatedAt,
      ]),
    )
  );
}

export function launchLeadsCsvFilename(kind: LaunchLeadKind | null, today: Date = new Date()): string {
  return `groscove-ultra-interessados${kind ? `-${kind}` : ""}-${today.toISOString().slice(0, 10)}.csv`;
}

/** ?utm_source=…&utm_medium=…&utm_campaign=… da página → campos ocultos do formulário (limpos). */
export function launchTagsFrom(params: Record<string, string | string[] | undefined>, source: string) {
  const one = (v: string | string[] | undefined) => cleanTag(Array.isArray(v) ? v[0] : v, 120);
  return { source, utmSource: one(params.utm_source), utmMedium: one(params.utm_medium), utmCampaign: one(params.utm_campaign) };
}
