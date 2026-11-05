// Página institucional (/conheca) e o destino do endereço principal "/". Módulo puro: usado pelo middleware, pela
// página e pelos testes.
//
// Decisões (etapa 7, D10 da auditoria da agenda):
// - "/" deixou de ser um redirect fixo do next.config: quem tem sessão continua indo direto à aba Hero
//   (/personalities, como sempre); visitante sem sessão vê a apresentação (/conheca).
// - App das lojas (casca nativa): sempre direto ao app, sem página de marketing dentro do app da loja (a casca já
//   abre em /personalities; e a página fala de portais e pagamentos que lá não existem). /conheca fica bloqueada lá.
// - "Pular e explorar" grava um cookie (EXPLORE_COOKIE): depois disso, o logo/"Início" ("/") leva ao app em vez
//   de devolver o visitante à apresentação a cada clique. Não é dado pessoal nem rastreio; só uma preferência.
// - O fluxo de autenticação não muda: os botões levam ao /login (cadastro rápido) e ao /login?mode=password.
import { LOGIN_HOME } from "@/lib/auth/safe-next";

export const INSTITUTIONAL_PATH = "/conheca";
/** "Conheça o Groscove Ultra": a apresentação completa (a antiga /conheca), para quem já está no app. */
export const ABOUT_PATH = "/sobre";
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

/** Para onde "/" leva cada visitante. */
export function rootDestination(visitor: RootVisitor): string {
  if (visitor.nativeApp || visitor.signedIn || visitor.explored) return LOGIN_HOME;
  return INSTITUTIONAL_PATH;
}

/** Só a sessão decide entre app e apresentação; app nativo e "já explorou" dispensam a checagem da sessão. */
export function rootNeedsSessionCheck(visitor: Pick<RootVisitor, "nativeApp" | "explored">): boolean {
  return !visitor.nativeApp && !visitor.explored;
}
