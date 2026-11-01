// Contratos dos formulários compartilhados entre portais (personalidade, fornecedor) e admin.
import type { ActionResult } from "@/components/admin/ConfirmActionDialog";
import type { ComposerOptions } from "@/lib/post-blocks/queries";
import type { BlockDrafts, PillarBlock, ProgramBlock } from "@/lib/post-blocks/schema";
import type { ContentType, LocaleCode, Pillar } from "@/lib/supabase/helpers";

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
  /** Campo editável só pelo admin (o app é gratuito, 0069: não há regra de acesso a escolher). */
  completion_mode?: "manual" | "auto" | null;
  /** Blocos do conteúdo estruturado (0075/0076) e produtos vinculados; ausente = o formulário não os edita. */
  blocks?: ContentBlocksPayload;
};

/** O que o formulário manda gravar junto do conteúdo: bloco do pilar, programa e produtos vinculados. */
export type ContentBlocksPayload = {
  pillar: PillarBlock | null;
  program: ProgramBlock | null;
  /** IDs dos produtos que ficam vinculados (validados); os demais vínculos validados saem. */
  products: string[];
};

/** Estado inicial e opções dos blocos no formulário (admin). */
export type ContentBlocksProps = {
  drafts: BlockDrafts;
  products: string[];
  options: ComposerOptions;
  /** Carregamento das opções em andamento (troca de herói). */
  loading?: boolean;
  /** Atalhos: cadastro de receita, vínculos e novo programa. */
  hrefs: { newRecipe: string; links: string; newProgram: string };
};

export type ContentFormProps = {
  mode: "create" | "edit";
  initial?: Partial<ContentFormValues>;
  /** Admin pode definir o modo de conclusão; personalidade não. */
  canEditAccess: boolean;
  /** Só leitura (conteúdo em revisão ou publicado para a personalidade). */
  readOnly?: boolean;
  /** Capa enviada do celular: estado do envio (servidor) e herói em nome de quem a foto é reservada. */
  cover: { state: "ready" | "disabled" | "not_configured"; creatorId: string | null };
  /** Blocos (pilar, programa) e produtos vinculados; sem a prop, o formulário fica como antes. */
  blocks?: ContentBlocksProps;
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
