// Templates visuais ("Aparência"): só mudam a apresentação. A escolha fica no próprio aparelho
// (cookie + localStorage), nunca no banco. Compartilhado entre servidor, cliente e testes.
export const TEMPLATE_COOKIE = "uh-template";
/** Validade do cookie do template (1 ano), igual à do tema. */
export const TEMPLATE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const templates = ["original", "impact", "essential", "performance", "urban"] as const;
export type Template = (typeof templates)[number];
export const DEFAULT_TEMPLATE: Template = "original";

export function isTemplate(value: unknown): value is Template {
  return typeof value === "string" && (templates as readonly string[]).includes(value);
}

/** Preferência ausente ou inválida cai no Ultra Original. */
export function resolveTemplate(value: unknown): Template {
  return isTemplate(value) ? value : DEFAULT_TEMPLATE;
}

/** Ordem de leitura: cookie válido, depois localStorage válido, senão Original. */
export function pickTemplate(cookieValue: unknown, storedValue: unknown): Template {
  if (isTemplate(cookieValue)) return cookieValue;
  return resolveTemplate(storedValue);
}

// Script inline (sem flash): aplica data-template antes da pintura e da hidratação.
// Mesmo padrão do tema: cookie primeiro; localStorage cobre páginas servidas pelo service worker.
export const TEMPLATE_INIT_SCRIPT = `(function(){var v=${JSON.stringify(templates)},t=null;try{var m=document.cookie.match(/(?:^|; )${TEMPLATE_COOKIE}=([^;]*)/);if(m){t=decodeURIComponent(m[1])}if(v.indexOf(t)<0){t=localStorage.getItem("${TEMPLATE_COOKIE}")}}catch(e){}document.documentElement.setAttribute("data-template",v.indexOf(t)<0?"${DEFAULT_TEMPLATE}":t)})();`;

/** Aplica o template na hora (só troca o atributo do <html>) e guarda no aparelho. */
export function applyTemplate(value: Template) {
  if (!isTemplate(value)) return;
  document.documentElement.setAttribute("data-template", value);
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${TEMPLATE_COOKIE}=${value}; path=/; max-age=${TEMPLATE_COOKIE_MAX_AGE}; samesite=lax${secure}`;
  try {
    localStorage.setItem(TEMPLATE_COOKIE, value);
  } catch {
    // armazenamento indisponível (modo privado): o cookie cobre.
  }
}

/** Template aplicado agora no <html> (Original se não houver). */
export function currentTemplate(): Template {
  return resolveTemplate(document.documentElement.getAttribute("data-template"));
}
