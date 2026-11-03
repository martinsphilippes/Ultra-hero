// Leitura da equipe do herói (hero_team_list / my_hero_team, 0091): JSON do banco → tipos da tela. Pura.

export type HeroTeamRole = "owner" | "member";
export type HeroTeamMember = { userId: string; role: HeroTeamRole; name: string; email: string | null; since: string; me: boolean };
export type HeroTeamInvite = { id: string; email: string; expiresAt: string };
export type HeroTeam = { myRole: HeroTeamRole | "admin" | null; members: HeroTeamMember[]; invites: HeroTeamInvite[] };
export type MyHero = { creatorId: string; role: HeroTeamRole; status: string; name: string; slug: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");

export function parseHeroTeam(data: unknown): HeroTeam {
  const o = isObj(data) ? data : {};
  const myRole = o.my_role === "owner" || o.my_role === "member" || o.my_role === "admin" ? o.my_role : null;
  const members = (Array.isArray(o.members) ? o.members : []).filter(isObj).map((m) => ({
    userId: str(m.user_id),
    role: (m.role === "owner" ? "owner" : "member") as HeroTeamRole,
    name: str(m.name),
    email: typeof m.email === "string" ? m.email : null,
    since: str(m.since),
    me: m.me === true,
  }));
  const invites = (Array.isArray(o.invites) ? o.invites : []).filter(isObj).map((i) => ({ id: str(i.id), email: str(i.email), expiresAt: str(i.expires_at) }));
  return { myRole, members: members.filter((m) => m.userId), invites: invites.filter((i) => i.id) };
}

export function parseMyHero(data: unknown): MyHero | null {
  if (!isObj(data) || typeof data.creator_id !== "string") return null;
  return { creatorId: data.creator_id, role: data.role === "owner" ? "owner" : "member", status: str(data.status), name: str(data.name), slug: str(data.slug) };
}

/** Quem pode gerir a equipe (convidar, remover, transferir): titular ou admin. */
export function canManageTeam(team: Pick<HeroTeam, "myRole">): boolean {
  return team.myRole === "owner" || team.myRole === "admin";
}

/** Ações possíveis sobre um membro: o titular não é removido (transfere antes); a si mesmo, nada. */
export function memberActions(team: Pick<HeroTeam, "myRole">, member: Pick<HeroTeamMember, "role" | "me">): { remove: boolean; transfer: boolean } {
  if (!canManageTeam(team) || member.role === "owner") return { remove: false, transfer: false };
  return { remove: !member.me || team.myRole === "admin", transfer: true };
}
