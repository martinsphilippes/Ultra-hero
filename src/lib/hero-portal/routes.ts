// Portal do Herói (0097): o "creator" era o próprio herói, então as duas áreas (o portal do herói em /creator e o
// escritório em /creator/escritorio) viraram um portal só, em /heroi. Módulo puro (middleware e testes).
//
// Os endereços antigos continuam valendo para sempre: links de e-mails já enviados, avisos do sino gravados no
// banco (inbox_notifications.link, que as funções do banco ainda escrevem com /creator/escritorio/...), push,
// favoritos e o histórico do navegador. O middleware responde 308 (permanente, mantém a query) para o endereço
// novo antes de checar a sessão. Também saíram do endereço as listas "creators" da marca, do negócio da agência
// e do admin (viraram "herois").

export const HERO_PORTAL_ROOT = "/heroi";

type Rule = { from: RegExp; to: (m: RegExpExecArray) => string };

// Ordem importa: do mais específico para o mais geral. Cada regra casa o caminho inteiro (com ou sem "/" no fim).
const RULES: Rule[] = [
  // escritório (portal do creator, 0087)
  { from: /^\/creator\/escritorio\/ganhos$/, to: () => "/heroi/financeiro" },
  { from: /^\/creator\/escritorio\/notificacoes$/, to: () => "/heroi/avisos" },
  { from: /^\/creator\/escritorio(\/.*)?$/, to: (m) => `/heroi${m[1] ?? ""}` },
  // área do herói (0045/0087/0092/0094)
  { from: /^\/creator\/post\/new$/, to: () => "/heroi/post/novo" },
  { from: /^\/creator\/content\/new$/, to: () => "/heroi/conteudos/novo" },
  { from: /^\/creator\/content\/([^/]+)\/edit$/, to: (m) => `/heroi/conteudos/${m[1]}/editar` },
  { from: /^\/creator\/content(\/.*)?$/, to: (m) => `/heroi/conteudos${m[1] ?? ""}` },
  { from: /^\/creator\/recipes\/new$/, to: () => "/heroi/receitas/nova" },
  { from: /^\/creator\/recipes\/([^/]+)\/edit$/, to: (m) => `/heroi/receitas/${m[1]}/editar` },
  { from: /^\/creator\/recipes\/([^/]+)\/preview$/, to: (m) => `/heroi/receitas/${m[1]}/previa` },
  { from: /^\/creator\/recipes\/([^/]+)\/versions$/, to: (m) => `/heroi/receitas/${m[1]}/versoes` },
  { from: /^\/creator\/recipes(\/.*)?$/, to: (m) => `/heroi/receitas${m[1] ?? ""}` },
  { from: /^\/creator\/links(\/.*)?$/, to: (m) => `/heroi/vinculos${m[1] ?? ""}` },
  { from: /^\/creator\/profile(\/.*)?$/, to: (m) => `/heroi/pagina${m[1] ?? ""}` },
  // equipe, agenda, financeiro e o resto mantêm o nome
  { from: /^\/creator(\/.*)?$/, to: (m) => `/heroi${m[1] ?? ""}` },
  // listas "creators" (marca, negócio da agência, admin)
  { from: /^\/marca\/creators(\/.*)?$/, to: (m) => `/marca/herois${m[1] ?? ""}` },
  { from: /^\/agencia\/negocios\/([^/]+)\/creators(\/.*)?$/, to: (m) => `/agencia/negocios/${m[1]}/herois${m[2] ?? ""}` },
  { from: /^\/admin\/creators(\/.*)?$/, to: (m) => `/admin/herois${m[1] ?? ""}` },
];

/** Caminho novo para um endereço antigo do creator (sem query); null quando o caminho não é antigo. */
export function legacyHeroPortalTarget(pathname: string): string | null {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  for (const rule of RULES) {
    const m = rule.from.exec(path);
    if (m) return rule.to(m);
  }
  return null;
}

/** Link de aviso do lado do herói (escritório antigo ou portal novo): o push e o sino tratam igual. */
export function isHeroPortalLink(link: string | null | undefined): boolean {
  if (!link) return false;
  return link === HERO_PORTAL_ROOT || link.startsWith(`${HERO_PORTAL_ROOT}/`) || link.startsWith("/creator/escritorio");
}
