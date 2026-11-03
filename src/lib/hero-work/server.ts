import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { chosenHeroId, getMyCreator, listMyHeroesAll, type MyHero } from "@/app/creator/(hero)/_lib/creator";
import { getRoles, getUser } from "@/lib/auth/session";
import { hasHeroRole } from "@/lib/auth/talent-scope";
import { heroSelectable } from "@/lib/creator-content/rules";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { getTalentContext } from "@/lib/talent/server";
import { toHeroEvent, type HeroEvent, type ServiceDate } from "./agenda";
import { toHeroService, type HeroService } from "./finance";
import { heroRights, type HeroRights } from "./rules";

// Leituras e contexto da agenda/financeiro do herói independente (0094). Quem pode o quê vem do banco (RLS);
// as regras daqui (rules.ts) só escolhem o que mostrar.

export type HeroWorkspace = HeroRights & {
  hero: MyHero;
  /** O herói em uso é o ligado ao casting da agência: agenda e ganhos moram no escritório (/creator/escritorio). */
  hasAgency: boolean;
};

/**
 * Herói em uso pela pessoa (titular ou membro): o escolhido no cartão "Você trabalha para" (cookie, revalidado) ou o
 * padrão. Sem papel de herói ou sem herói: volta ao Perfil. O admin só consulta pela RLS (sem tela própria aqui).
 */
export const getHeroWorkspace = cache(async (): Promise<HeroWorkspace> => {
  const user = await getUser();
  if (!user) redirect("/login?next=/profile");
  if (!hasHeroRole(await getRoles())) redirect("/profile");
  const [heroes, base] = await Promise.all([listMyHeroesAll(), getMyCreator()]);
  const selectable = heroes.filter((h) => heroSelectable(h.status));
  const chosen = selectable.length > 1 ? await chosenHeroId(selectable, base.creatorId) : (selectable[0]?.id ?? null);
  const hero = selectable.find((h) => h.id === chosen) ?? selectable[0] ?? heroes[0] ?? null;
  if (!hero) redirect("/profile");
  const talent = await getTalentContext();
  return { hero, ...heroRights(hero.role, hero.status), hasAgency: talent.state === "ok" && talent.talent.creatorId === hero.id };
});

const EVENT_SELECT = "id, creator_profile_id, kind, title, starts_at, ends_at, all_day, location, notes, client, service_id, checklist, updated_at";
const SERVICE_SELECT = "id, creator_profile_id, title, client, service_on, amount_cents, due_on, status, received_on, payment_note, proof_path, proof_mime";

/** Compromissos que tocam o intervalo (os de vários dias em curso também). */
export async function listHeroEvents(creatorId: string, from: string, to: string): Promise<{ available: boolean; items: HeroEvent[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("hero_events").select(EVENT_SELECT).eq("creator_profile_id", creatorId).lt("starts_at", to).gte("ends_at", from).order("starts_at").limit(500);
  if (error) return { available: !isMissingSchema(error), items: [] };
  return { available: true, items: (data ?? []).map((r) => toHeroEvent(r)) };
}

/** Datas de serviço (sem valor) para a agenda: o titular e a equipe leem pela mesma função (hero_service_dates). */
export async function listServiceDates(creatorId: string, from: string, to: string): Promise<ServiceDate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hero_service_dates", { p_creator: creatorId, p_from: from, p_to: to });
  if (error || !Array.isArray(data)) return [];
  return (data as { id: string; title: string; client: string; service_on: string }[]).map((r) => ({ id: r.id, title: r.title, client: r.client, serviceOn: r.service_on }));
}

/** Todos os serviços do herói (só o titular lê; para a equipe a RLS devolve vazio). */
export async function listHeroServices(creatorId: string): Promise<{ available: boolean; items: HeroService[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("hero_services").select(SERVICE_SELECT).eq("creator_profile_id", creatorId).order("service_on", { ascending: false }).limit(500);
  if (error) return { available: !isMissingSchema(error), items: [] };
  return { available: true, items: (data ?? []).map((r) => toHeroService(r)) };
}

/** Serviços que ainda não foram recebidos (a receber), para o resumo do Perfil. */
export async function listOpenServices(creatorId: string): Promise<HeroService[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("hero_services").select(SERVICE_SELECT).eq("creator_profile_id", creatorId).eq("status", "receivable").order("due_on", { nullsFirst: false }).limit(500);
  if (error) return [];
  return (data ?? []).map((r) => toHeroService(r));
}

/** Compromissos a partir de agora (resumo do Perfil). */
export async function listUpcomingHeroEvents(creatorId: string, nowIso: string, limit = 5): Promise<HeroEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("hero_events").select(EVENT_SELECT).eq("creator_profile_id", creatorId).gte("ends_at", nowIso).order("starts_at").limit(limit);
  if (error) return [];
  return (data ?? []).map((r) => toHeroEvent(r));
}
