// Página institucional (/conheca) e o destino do endereço principal "/". Módulo puro: usado pelo middleware, pela
// página e pelos testes.
//
// Decisões (etapa 7, D10 da auditoria da agenda):
// - "/" deixou de ser um redirect fixo do next.config: quem tem sessão continua indo direto à aba Hero
//   (/personalities, como sempre); visitante sem sessão vê a apresentação (/conheca).
// - App das lojas (casca nativa): sem sessão abre a apresentação (/sobre), como na web, e só entra com login; não há
//   "Pular e explorar" (decisão do responsável, 05/11/2026). /conheca fica bloqueada lá.
// - "Pular e explorar" grava um cookie (EXPLORE_COOKIE): depois disso, o logo/"Início" ("/") leva ao app em vez
//   de devolver o visitante à apresentação a cada clique. Não é dado pessoal nem rastreio; só uma preferência.
// - O fluxo de autenticação não muda: os botões levam ao /login (cadastro rápido) e ao /login?mode=password.
import { LOGIN_HOME } from "@/lib/auth/safe-next";

export const INSTITUTIONAL_PATH = "/conheca";
/** "Conheça o Groscove Ultra": a apresentação completa (a antiga /conheca), para quem já está no app. */
export const ABOUT_PATH = "/sobre";
/** Apresentação clássica (/sobre) no ar. */
export const ABOUT_ENABLED = true;
/** Teaser de lançamento (/conheca e /conheca/influenciador) oculto por decisão do responsável: as rotas respondem 404
 *  (o teaser vai morar no projeto separado "groscove"). Para reabrir aqui, troque para true. */
export const TEASER_ENABLED = false;
export const INSTITUTIONAL_EXPLORE_PATH = "/conheca/explorar";
export const EXPLORE_COOKIE = "uh-explorar";
/** 180 dias: tempo suficiente para não reaparecer a cada visita, sem ser permanente. */
export const EXPLORE_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export const INSTITUTIONAL_SIGNUP_HREF = "/login";
export const INSTITUTIONAL_LOGIN_HREF = "/login?mode=password";

export type RootVisitor = {
  /** Sessão válida (JWT conferido). */
  signedIn: boolean;
  /** Abriu pela casca das lojas (user agent GCHeroApp). */
  nativeApp: boolean;
  /** Já escolheu "Pular e explorar" neste navegador. */
  explored: boolean;
};

/** Porta de entrada do app das lojas para quem não entrou: o app só funciona com login. */
export const NATIVE_VISITOR_ENTRY = ABOUT_ENABLED ? ABOUT_PATH : "/login";

/** Para onde "/" leva cada visitante. */
export function rootDestination(visitor: RootVisitor): string {
  if (visitor.signedIn) return LOGIN_HOME;
  if (visitor.nativeApp) return NATIVE_VISITOR_ENTRY;
  if (visitor.explored) return LOGIN_HOME;
  if (TEASER_ENABLED) return INSTITUTIONAL_PATH;
  // teaser oculto: o visitante vê a apresentação clássica (/sobre) ou, se ela também estiver fechada, o app
  return ABOUT_ENABLED ? ABOUT_PATH : LOGIN_HOME;
}
