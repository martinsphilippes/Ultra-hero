// Contratos dos formulários compartilhados entre portais (personalidade, fornecedor) e admin.
import type { ActionResult } from "@/components/admin/ConfirmActionDialog";
import type { AccessLevel, ContentType, LocaleCode, Pillar } from "@/lib/supabase/helpers";

export type { ActionResult };

export type ContentMedia = {
  provider: "none" | "embed_youtube" | "embed_vimeo" | "cloudflare_stream" | "mux" | "upload";
  ref: string | null;
  captions_url: string | null;
};

export type ContentFormValues = {
  id?: string;
  title: string;
  summary: string;
  pillar: Pillar;
  type: ContentType;
  source_locale: LocaleCode;
  cover_url: string;
  duration_minutes: number | null;
  difficulty: "beginner" | "intermediate" | "advanced" | null;
  tags: string[];
  has_captions: boolean;
  disclaimer_kind: "general" | "training" | "nutrition" | "none" | null;
  /** Corpo estruturado por tipo (ver seed e docs/architecture). */
  body: Record<string, unknown>;
  media: ContentMedia;
  /** Licença da mídia (RF-008): coerente com o provedor (validado no formulário e no banco). */
  media_license_kind: "platform_demo" | "own" | "licensed" | "third_party_embed";
  /** Referência interna da licença/contrato (nunca exibida ao público). */
  media_license_ref: string;
  /** Crédito exibido ao público na página do conteúdo. */
  media_credit: string;
  /** Campos editáveis só pelo admin. */
  access_level?: AccessLevel | null;
  required_module_id?: string | null;
  completion_mode?: "manual" | "auto" | null;
};

export type ContentFormProps = {
  mode: "create" | "edit";
  initial?: Partial<ContentFormValues>;
  /** Admin pode definir regra de acesso/módulo/conclusão; personalidade não. */
  canEditAccess: boolean;
  /** Opções de módulos (id, nome) para o admin. */
  modules?: { id: string; name: string; code: string }[];
  /** Só leitura (conteúdo em revisão ou publicado para a personalidade). */
  readOnly?: boolean;
  action: (values: ContentFormValues) => Promise<ActionResult & { id?: string }>;
};

export type ProductFormValues = {
  id?: string;
  seller_org_id: string;
  category_id: string;
  title: string;
  description: string;
  image_url: string;
  price_cents_demo: number;
  product_type: "physical" | "kit" | "digital";
  attributes: Record<string, unknown>;
  food_info: { ingredients: string[]; allergens: string[]; storage: string } | null;
  status: "draft" | "published" | "archived";
  availability: "available" | "unavailable";
  demo_stock: number | null;
};

export type ProductFormProps = {
  mode: "create" | "edit";
  initial?: Partial<ProductFormValues>;
  sellerOrgs: { id: string; name: string }[];
  categories: { id: string; code: string; name: Record<string, string>; is_food: boolean }[];
  /** Status de moderação atual (somente leitura; só admin altera via moderação). */
  moderation?: { status: "clear" | "hidden" | "suspended"; reason: string | null };
  action: (values: ProductFormValues) => Promise<ActionResult & { id?: string }>;
};
