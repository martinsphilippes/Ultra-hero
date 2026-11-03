// Novo conteúdo do creator (0092): regras puras (cliente e servidor), testadas em tests/unit/creator-content.test.ts.
//
// Decisões (pedido do responsável, 03/11): o creator — titular e membros da equipe do herói ativo — cria conteúdo
// estruturado pelo próprio portal (/creator/content/new) com o MESMO editor por blocos do admin. Ficam só com o admin:
//   • escolher outro herói como autor (o creator escreve pelo herói dele; com vários heróis, um seletor simples);
//   • direitos/licença editorial (tipo de licença, referência do contrato e crédito): o creator publica conteúdo
//     próprio — a licença é calculada (own; vídeo por link do YouTube/Vimeo = third_party_embed);
//   • modo de conclusão (campo de acesso), destaque, agendamento administrativo e status forçado (o editor não os
//     tem para ninguém; destaque/agendamento/revisão seguem nas telas do admin);
//   • criar programa (o cadastro de programas é do admin; o creator só aponta um programa publicado no bloco).
// Publicação: segue a regra que já existe para o herói (0025/0043): publica direto; quando o admin liga "Exigir
// revisão" para o tipo (content_review_required), o creator salva o rascunho e "Envia para revisão".
// Tirar do ar, arquivar e excluir o que já esteve no ar: só titular e admin (o banco responde owner_only ao membro).

export const ADMIN_CONTENT_KINDS = ["structured", "post", "recipe", "program"] as const;
/** Programa fica fora: o cadastro de programas é do admin (RLS de programs só admin). */
export const CREATOR_CONTENT_KINDS = ["structured", "post", "recipe"] as const;
export type ContentKind = (typeof ADMIN_CONTENT_KINDS)[number];
export type ContentAudience = "admin" | "creator";

export function contentKindsFor(audience: ContentAudience): readonly ContentKind[] {
  return audience === "admin" ? ADMIN_CONTENT_KINDS : CREATOR_CONTENT_KINDS;
}

/**
 * Para onde o tipo escolhido leva o creator: o estruturado fica no editor (null); post rápido vai ao composer e
 * receita ao Portal do Chef (editor próprio). Programa não é do creator (null).
 */
export function creatorKindHref(kind: ContentKind): string | null {
  switch (kind) {
    case "post":
      return "/creator/post/new";
    case "recipe":
      return "/creator/recipes/new";
    default:
      return null;
  }
}

/** Campos do editor de conteúdo por público (true = aparece). */
export type ContentEditorFields = {
  /** Escolher o herói autor (admin escolhe qualquer um; creator só troca entre os heróis dele). */
  authorPicker: boolean;
  /** Licença da mídia, referência do contrato e crédito. */
  license: boolean;
  /** Modo de conclusão (seção "Acesso"). */
  completionMode: boolean;
  /** Atalho "Criar programa" no bloco Programa. */
  newProgramLink: boolean;
  /** Tipo "Programa" no seletor de tipo. */
  programKind: boolean;
};

export function contentEditorFields(audience: ContentAudience): ContentEditorFields {
  const admin = audience === "admin";
  return { authorPicker: admin, license: admin, completionMode: admin, newProgramLink: admin, programKind: admin };
}

/** Licença do conteúdo do creator (sem o campo): conteúdo próprio; vídeo de terceiros por link = embed. */
export function creatorLicenseKind(provider: string): "own" | "third_party_embed" {
  return provider === "embed_youtube" || provider === "embed_vimeo" ? "third_party_embed" : "own";
}

export type PublishStep = "publish" | "submit" | "in_review" | "published" | "archived";

/** Próximo passo do conteúdo no editor do creator. */
export function creatorPublishStep(input: { status: string; reviewStatus: string; reviewRequired: boolean }): PublishStep {
  if (input.status === "archived") return "archived";
  if (input.status === "published") return "published";
  if (input.reviewStatus === "in_review") return "in_review";
  return input.reviewRequired ? "submit" : "publish";
}

/** Tirar do ar, arquivar ou excluir o que já esteve no ar: titular ou admin (o banco confere de novo). */
export function canRemovePublished(input: { teamRole: "owner" | "member" | null | undefined; isAdmin: boolean }): boolean {
  return input.isAdmin || input.teamRole === "owner";
}

/** Rascunho editável: rascunho fora de revisão e que não é receita (receita tem editor próprio). */
export function creatorCanEdit(input: { status: string; reviewStatus: string; type: string }): boolean {
  return input.status === "draft" && input.reviewStatus !== "in_review" && input.type !== "recipe";
}

/** Destino de um item de "Meus conteúdos": receita no Portal do Chef; o resto no editor estruturado. */
export function creatorContentHref(row: { id: string; type: string }): string {
  return row.type === "recipe" ? `/creator/recipes/${row.id}/edit` : `/creator/content/${row.id}/edit`;
}

/** Cookie com o herói escolhido por quem está em mais de uma equipe (o servidor sempre revalida). */
export const MY_HERO_COOKIE = "uh_my_hero";
/** Cabeçalho que o servidor manda ao PostgREST; o banco só honra para membro ativo da equipe (0092). */
export const MY_HERO_HEADER = "x-my-hero";

/** Herói em uso: o escolhido (se ainda é um dos heróis da pessoa) ou o padrão do banco (titular primeiro). */
export function pickMyHero(heroes: readonly { id: string }[], chosen: string | null | undefined, fallback: string | null): string | null {
  if (chosen && heroes.some((h) => h.id === chosen)) return chosen;
  return fallback;
}

/** Situação do herói no cartão "Você trabalha para" (creator_profiles.status). */
export type HeroStatus = "active" | "pending" | "suspended";

/** Dá para criar pelo herói? Ativo (publica) e pendente (só rascunho até aprovar); suspenso nunca. */
export function heroSelectable(status: string): boolean {
  return status === "active" || status === "pending";
}

/** Cartão compacto: titular de um único herói (nada a escolher). Com mais de um, lista com "Trabalhar neste herói". */
export function heroCardCompact(heroes: readonly { id: string }[]): boolean {
  return heroes.length <= 1;
}

/** O botão "Trabalhar neste herói" aparece no herói selecionável que ainda não é o em uso, havendo mais de um. */
export function showWorkOnHero(heroes: readonly { id: string; status: string }[], hero: { id: string; status: string }, currentId: string | null): boolean {
  return heroes.length > 1 && heroSelectable(hero.status) && hero.id !== currentId;
}
