// Abertura animada (marca → atleta → app). Decidida pelo script inicial, antes da primeira pintura:
// ele marca data-intro="play" no <html> e o CSS (intro.css) só mostra o overlay com esse atributo.
// Sem o atributo nada é pintado. Nenhum JS de React: o mesmo script cuida de pular e encerrar.

/** Chave do sessionStorage (uma vez por sessão) e do localStorage (carimbo da última exibição). */
export const INTRO_STORAGE_KEY = "uh-intro";
/** Intervalo mínimo entre duas aberturas no mesmo aparelho. */
export const INTRO_COOLDOWN_MS = 12 * 60 * 60 * 1000;
/** Duração da abertura completa (marca 0,8 s + atleta 1,23 s + marca 0,2 s + saída 0,36 s). */
export const INTRO_DURATION_MS = 2600;
/** Cookie dos navegadores de E2E: com ele a abertura nunca aparece. */
export const INTRO_E2E_COOKIE = "uh-e2e";

// Entrada pública (home, login, cadastro) e telas do app. Portais (admin, creator, seller), checkout,
// páginas legais e de verificação ficam de fora.
export const INTRO_PATH_RE = /^\/(?:|login|signup|explore|programs|personalities|profile|recipes|shop|content|cart|orders)(?:\/.*)?$/;

// Robôs e prévias de link (o HTML do app continua inteiro por baixo; isto só evita pintar o overlay).
export const INTRO_BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse|pagespeed|headlesschrome|googleother/i;

// Ordem: cookie de E2E → automação (navigator.webdriver) → robô → movimento reduzido → rota → sessão → 12 h.
// Armazenamento indisponível também desliga (sem como limitar, melhor não repetir a cada página).
// Pular (botão, toque, Esc) faz um fade de 0,25 s; o fim natural vem do animationend da saída
// (com uma rede de segurança de 3,4 s contados do DOMContentLoaded, quando o overlay já foi pintado), e então o atributo sai e o overlay volta a display:none.
export const INTRO_INIT_SCRIPT = `(function(){try{var d=document,h=d.documentElement,w=window,n=navigator;if(/(?:^|; )${INTRO_E2E_COOKIE}=/.test(d.cookie))return;if(n.webdriver)return;if(${INTRO_BOT_RE.toString()}.test(n.userAgent||""))return;if(w.matchMedia&&w.matchMedia("(prefers-reduced-motion: reduce)").matches)return;if(!${INTRO_PATH_RE.toString()}.test(w.location.pathname))return;var s=w.sessionStorage,l=w.localStorage,k="${INTRO_STORAGE_KEY}",now=Date.now();if(s.getItem(k))return;var last=Number(l.getItem(k))||0;if(last<=now&&now-last<${INTRO_COOLDOWN_MS})return;s.setItem(k,"1");l.setItem(k,String(now));h.setAttribute("data-intro","play");var over=false;function off(){over=true;d.removeEventListener("keydown",key,true);d.removeEventListener("click",tap,true);d.removeEventListener("animationend",anim,true)}function end(){h.removeAttribute("data-intro")}function skip(){if(over)return;off();h.setAttribute("data-intro","out");w.setTimeout(end,260)}function finish(){if(over)return;off();end()}function key(e){if(e.key==="Escape"||e.key==="Esc")skip()}function tap(e){var t=e.target;if(t&&t.closest&&t.closest(".uh-intro")){e.preventDefault();e.stopPropagation();skip()}}function anim(e){if(e.animationName==="uh-intro-exit")finish()}d.addEventListener("keydown",key,true);d.addEventListener("click",tap,true);d.addEventListener("animationend",anim,true);w.addEventListener("DOMContentLoaded",function(){w.setTimeout(finish,${INTRO_DURATION_MS + 800})})}catch(e){}})();`;
