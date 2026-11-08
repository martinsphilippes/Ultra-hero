import "server-only";
import { createClient } from "@/lib/supabase/server";
import { type ActionInterest, type Formats, type IdeaStatus, isActionInterest, isIdeaStatus, parseFormats } from "./format";

// Como trabalhamos (0136): leituras do creator (o que ele já disse) e da equipe (ficha do casting e respostas da ação).

export type CreatorAction = {
  key: string;
  title: string;
  summary: string;
  starts_on: string;
  ends_on: string;
  event_id: string | null;
  response: { interest: ActionInterest; categories: string; availability: string; notes: string; updated_at: string } | null;
};
export type IdeaSummary = { id: string; title: string; status: IdeaStatus; created_at: string; updated_at: string };
export type CreatorGuide = {
  talentId: string;
  groscove: boolean;
  formats: Formats;
  universes: string[];
  brandsKnown: string[];
  brandsExplore: string[];
  actions: CreatorAction[];
  ideas: IdeaSummary[];
};

export type UniverseCatalog = {
  categories: { slug: string; name: string }[];
  brands: { id: string; name: string; logo_url: string | null; category: string }[];
};

export type TeamIdea = IdeaSummary & {
  concept: string;
  audience: string;
  format: string;
  location: string;
  timeline: string;
  stage: string;
  partners: string;
  needs: string;
  team_note: string;
};
export type TeamRelationship = {
  formats: Formats;
  universes: { slug: string; name: string }[];
  brandsKnown: { id: string; name: string; logo_url: string | null }[];
  brandsExplore: { id: string; name: string; logo_url: string | null }[];
  updatedAt: string | null;
  actions: { key: string; title: string; ends_on: string; interest: ActionInterest; categories: string; availability: string; notes: string; updated_at: string }[];
  ideas: TeamIdea[];
  canManage: boolean;
};

export type ActionAnswers = {
  action: { key: string; title: string; summary: string; starts_on: string; ends_on: string; active: boolean; event_id: string | null };
  /** from_meeting (0138): resposta registrada pela equipe na ata da reunião (o Hero não respondeu no portal). */
  answers: { talent_id: string; name: string; photo_url: string | null; interest: ActionInterest; categories: string; availability: string; notes: string; updated_at: string; from_meeting?: boolean }[];
};

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const strs = (v: unknown): string[] => arr<unknown>(v).filter((x): x is string => typeof x === "string");

/** O que o creator do casting já disse (null quando a pessoa não está num casting). */
export async function loadCreatorGuide(): Promise<CreatorGuide | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("creator_guide_mine");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  return {
    talentId: String(d.talent_id),
    groscove: d.groscove === true,
    formats: parseFormats(d.formats),
    universes: strs(d.universes),
    brandsKnown: strs(d.brands_known),
    brandsExplore: strs(d.brands_explore),
    actions: arr<CreatorAction>(d.actions).map((a) => ({
      ...a,
      response: a.response && isActionInterest(a.response.interest) ? a.response : null,
    })),
    ideas: arr<IdeaSummary>(d.ideas).filter((i) => isIdeaStatus(i.status)),
  };
}

/** Os universos (categorias) e as marcas aprovadas, sem nenhum dado interno. */
export async function loadUniverseCatalog(): Promise<UniverseCatalog | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("creator_universe_catalog");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  return { categories: arr(d.categories), brands: arr(d.brands) };
}

/** Ficha de relacionamento de um creator para a equipe da agência dele. */
export async function loadTalentRelationship(talentId: string): Promise<TeamRelationship | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("talent_relationship_team", { p_talent: talentId });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  return {
    formats: parseFormats(d.formats),
    universes: arr(d.universes),
    brandsKnown: arr(d.brands_known),
    brandsExplore: arr(d.brands_explore),
    updatedAt: typeof d.updated_at === "string" ? d.updated_at : null,
    actions: arr<TeamRelationship["actions"][number]>(d.actions).filter((a) => isActionInterest(a.interest)),
    ideas: arr<TeamIdea>(d.ideas).filter((i) => isIdeaStatus(i.status)),
    canManage: d.can_manage === true,
  };
}

/** Quem respondeu uma ação (sim primeiro, depois "depende" e "não"). */
export async function loadActionAnswers(key: string): Promise<ActionAnswers | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("creator_action_answers", { p_action: key });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (!d.action || typeof d.action !== "object") return null;
  return { action: d.action as ActionAnswers["action"], answers: arr<ActionAnswers["answers"][number]>(d.answers).filter((a) => isActionInterest(a.interest)) };
}
