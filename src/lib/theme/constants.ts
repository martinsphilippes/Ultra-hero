// Constantes de tema compartilhadas entre servidor, cliente e middleware.
export const THEME_COOKIE = "uh-theme";
export const DEMO_BANNER_COOKIE = "uh-demo-dismissed";

export const themes = ["dark", "light", "system"] as const;
export type Theme = (typeof themes)[number];

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (themes as readonly string[]).includes(value);
}

/** Tema efetivamente aplicado na interface. */
export type ResolvedTheme = "light" | "dark";

// O app sempre abre no claro. Só fica escuro quando a pessoa escolheu "escuro" no botão ou no perfil;
// preferências antigas ("system", ausente ou inválida) caem no claro, sem seguir o tema do aparelho.
export function resolveTheme(value: unknown): ResolvedTheme {
  return value === "dark" ? "dark" : "light";
}

// Script inline (sem flash): aplica data-theme antes da hidratação.
// Cookie tem prioridade; localStorage cobre páginas servidas pelo service worker. Sem escolha: claro.
export const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);var t=m?decodeURIComponent(m[1]):null;if(!t){t=localStorage.getItem("${THEME_COOKIE}")}var d=document.documentElement;d.setAttribute("data-theme",t==="dark"?"dark":"light")}catch(e){}})();`;
