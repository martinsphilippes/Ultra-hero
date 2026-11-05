// Quem é o cliente do negócio × quem trabalha na campanha (lógica pura, testável).
//
// Decisões (04/11, depois de o dono escolher o Hero no campo de cliente achando que o escalava):
// - Hero cliente (deals.client_talent_id, 0107) é quem CONTRATA a agência (ex.: assessoria artística). Ele aparece
//   sempre com o rótulo "(cliente)" — "Marca · Philippe Martins (cliente)" — para não ser lido como Hero escalado.
// - Heros da campanha são os escalados (deal_talents) e aparecem à parte: "2 Heros escalados" / "sem Heros escalados".
// - Negócio só do Hero (sem marca) não tem a aba Heros, então o formulário só escala Heros quando há marca.

/** Tradutor com valores (next-intl): só a chave do rótulo do Hero cliente ("{name} (cliente)"). */
export type ClientLabelT = (key: "clientHero", values: { name: string }) => string;

/** "Marca · Philippe Martins (cliente)"; só marca: "Marca"; só Hero: "Philippe Martins (cliente)"; nada: "". */
export function dealClientLabel(t: ClientLabelT, brandName: string | null | undefined, clientTalentName: string | null | undefined): string {
  const brand = (brandName ?? "").trim();
  const hero = (clientTalentName ?? "").trim();
  return [brand, hero ? t("clientHero", { name: hero }) : ""].filter(Boolean).join(" · ");
}

/** Lista de Heros da campanha para enviar: ids únicos, na ordem escolhida, até `max` (o banco aceita 30 por vez). */
export function campaignHeroIds(ids: readonly string[], max = 30): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || out.includes(id)) continue;
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

/** Nomes dos Heros que não entraram (para o aviso "Negócio criado; não foi possível adicionar X"). */
export function heroNames(ids: readonly string[], talents: readonly { id: string; name: string }[]): string[] {
  const byId = new Map(talents.map((x) => [x.id, x.name.trim()]));
  return ids.map((id) => byId.get(id) ?? "").filter(Boolean);
}
