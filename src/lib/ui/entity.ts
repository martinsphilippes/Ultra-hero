// Apoio do cartão de entidade abaixo das caixas de seleção (EntitySelect): lógica pura, testável.
//
// Decisões:
// - E-mail completo só onde a tela já tem permissão de vê-lo; nos outros casos, mascarado
//   ("grupoquantso@gmail.com" → "g•••@gmail.com"). Sem dado, a linha não aparece.
// - A opção do select mostra o nome legível e, quando ajuda a distinguir, o papel entre parênteses.

/** Uma opção de EntitySelect (o cartão mostra avatar, nome e a linha papel · empresa · e-mail · extra). */
export type EntityOption = {
  value: string;
  /** Nome legível (nunca só o login/handle quando há nome). */
  name: string;
  /** Papel ou tipo, já traduzido: "Adm da agência", "Gestor", "Creator", "Marca"… */
  role?: string | null;
  /** Empresa: agência ou marca a que pertence. */
  org?: string | null;
  /** E-mail completo só onde a tela já pode vê-lo; senão mascarado (maskEmail) ou omitido. */
  email?: string | null;
  /** Linha extra curta (cargo, cidade, endereço da página…). */
  detail?: string | null;
  avatarUrl?: string | null;
  /** Agrupa as opções em <optgroup> (na ordem em que os grupos aparecem). */
  group?: string | null;
  disabled?: boolean;
};

/** Tradutor do namespace "pickers" (useTranslations/getTranslations). */
export type PickerT = (key: string, values?: Record<string, string | number>) => string;

/** "grupoquantso@gmail.com" → "g•••@gmail.com"; texto que não é e-mail → null. */
export function maskEmail(email: string | null | undefined): string | null {
  const text = (email ?? "").trim();
  const at = text.lastIndexOf("@");
  if (at < 1 || at === text.length - 1) return null;
  return `${text[0]}•••${text.slice(at)}`;
}

/** Rótulo da opção: "Ana Souza (Gestor)"; sem papel, só o nome. */
export function entityOptionLabel(name: string, role?: string | null): string {
  const n = name.trim();
  return role ? `${n} (${role})` : n;
}

/** Linha de detalhes do cartão: papel · empresa · e-mail · extra, sem vazios nem repetidos. */
export function entityDetails(parts: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const v = (p ?? "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out.join(" · ");
}

/** Chave de pickers.roles para o papel na agência (agency_members.role). */
export const AGENCY_ROLE_KEY = { admin: "agencyAdmin", manager: "agencyManager", staff: "agencyStaff" } as const;
/** Chave de pickers.roles para o papel na marca (brand_members.role). */
export const BRAND_ROLE_KEY = { owner: "brandOwner", staff: "brandStaff" } as const;

export function agencyRoleKey(role: string | null | undefined): (typeof AGENCY_ROLE_KEY)[keyof typeof AGENCY_ROLE_KEY] | null {
  return role && role in AGENCY_ROLE_KEY ? AGENCY_ROLE_KEY[role as keyof typeof AGENCY_ROLE_KEY] : null;
}

/** Membro da agência (listTeam/listManagers) → opção com papel e cargo. */
export function memberOption(tp: PickerT, m: { userId: string; name: string; role?: string | null; jobTitle?: string | null; email?: string | null }): EntityOption {
  const key = agencyRoleKey(m.role);
  return { value: m.userId, name: m.name, role: key ? tp(`roles.${key}`) : null, detail: m.jobTitle ?? null, email: m.email ?? null };
}

/** Creator do casting → opção com cidade/UF e se tem login (o escritório só funciona com login). */
export function talentOption(
  tp: PickerT,
  x: { id: string; name: string; city?: string | null; state?: string | null; hasLogin?: boolean | null; avatarUrl?: string | null; managerName?: string | null },
  value: string = x.id,
): EntityOption {
  const place = [x.city, x.state].filter(Boolean).join("/");
  const login = x.hasLogin === true ? tp("details.hasLogin") : x.hasLogin === false ? tp("details.noLogin") : null;
  return {
    value,
    name: x.name,
    role: tp("roles.creator"),
    detail: entityDetails([place, login, x.managerName ? tp("details.managedBy", { name: x.managerName }) : null]) || null,
    avatarUrl: x.avatarUrl ?? null,
  };
}

/** Marca → opção (logo como avatar). */
export function brandOption(tp: PickerT, b: { id: string; name: string; logoUrl?: string | null; detail?: string | null }): EntityOption {
  return { value: b.id, name: b.name, role: tp("roles.brand"), avatarUrl: b.logoUrl ?? null, detail: b.detail ?? null };
}

/** Hero (página pública, creator_profiles) → opção com o endereço da página. */
export function heroOption(
  tp: PickerT,
  h: { id: string; name: string; slug?: string | null; avatarUrl?: string | null; detail?: string | null },
): EntityOption {
  return {
    value: h.id,
    name: h.name,
    role: tp("roles.hero"),
    detail: entityDetails([h.slug ? `/personalities/${h.slug}` : null, h.detail]) || null,
    avatarUrl: h.avatarUrl ?? null,
  };
}

/** Negócio → opção com a marca (logo da marca como avatar). */
export function dealOption(tp: PickerT, d: { id: string; name: string; brand?: string | null; logoUrl?: string | null }): EntityOption {
  return { value: d.id, name: d.name, role: tp("roles.deal"), org: d.brand ?? null, avatarUrl: d.logoUrl ?? null };
}

/** Campos opcionais que as telas mandam junto de {id, name} para o cartão do creator. */
export type TalentPickFields = { city?: string | null; state?: string | null; hasLogin?: boolean | null; avatarUrl?: string | null; managerName?: string | null };
