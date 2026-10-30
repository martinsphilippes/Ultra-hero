// Constantes de tema compartilhadas entre servidor, cliente e middleware.
export const THEME_COOKIE = "uh-theme";
/** Validade do cookie do tema (1 ano), a mesma no botão (cliente) e na action (servidor). */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const DEMO_BANNER_COOKIE = "uh-demo-dismissed";

export const themes = ["dark", "light", "system"] as const;
export type Theme = (typeof themes)[number];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (themes as readonly string[]).includes(value);
}

/** Tema efetivamente aplicado na interface. */
export type ResolvedTheme = "light" | "dark";

// O app sempre abre no escuro (decisão do responsável). Só fica claro quando a pessoa escolheu "claro"
// no botão ou no perfil; preferências antigas ("system", ausente ou inválida) caem no escuro.
export function resolveTheme(value: unknown): ResolvedTheme {
  return value === "light" ? "light" : "dark";
}

// Script inline (sem flash): aplica data-theme antes da hidratação.
// Cookie tem prioridade; localStorage cobre páginas servidas pelo service worker. Sem escolha: escuro.
export const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);var t=m?decodeURIComponent(m[1]):null;if(!t){t=localStorage.getItem("${THEME_COOKIE}")}var d=document.documentElement;d.setAttribute("data-theme",t==="light"?"light":"dark")}catch(e){}})();`;
