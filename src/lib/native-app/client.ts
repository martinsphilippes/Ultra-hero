// Lado da web da ponte com a casca das lojas (componentes de cliente).
import { NATIVE_EVENT, parseNativeToWeb, type NativeToWeb, type WebToNative } from "./bridge-contract";

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(message: string): void };
  }
}

/** Rodando dentro da WebView da casca (a ponte só existe lá). */
export function hasNativeBridge(): boolean {
  return typeof window !== "undefined" && typeof window.ReactNativeWebView?.postMessage === "function";
}

export function postToNative(message: WebToNative): boolean {
  if (!hasNativeBridge()) return false;
  window.ReactNativeWebView!.postMessage(JSON.stringify(message));
  return true;
}

/** Escuta as respostas da casca; devolve a função que para de escutar. */
export function onNativeMessage(handler: (message: NativeToWeb) => void): () => void {
  const listener = (event: Event) => {
    const message = parseNativeToWeb((event as CustomEvent).detail);
    if (message) handler(message);
  };
  window.addEventListener(NATIVE_EVENT, listener);
  return () => window.removeEventListener(NATIVE_EVENT, listener);
}

export type NativePushResult = { ok: true; token: string } | { ok: false; reason: "denied" | "unavailable" | "error" | "no_app" };

// a resposta vem pelo sistema (pedido de permissão pode ficar aberto); sem resposta, desiste
const PUSH_TIMEOUT_MS = 60_000;

/**
 * Pede à casca o token de push: `ask` abre o pedido do sistema se ainda não houve resposta; sem
 * `ask`, só devolve o token quando a permissão já existe.
 */
// Um pedido por vez: as respostas da casca não dizem a que pedido respondem, então um renovar
// silencioso em andamento (PushRegistrar) não pode tomar a resposta do pedido de permissão.
let queue: Promise<unknown> = Promise.resolve();

export function requestNativePush(ask: boolean): Promise<NativePushResult> {
  if (!hasNativeBridge()) return Promise.resolve({ ok: false, reason: "no_app" });
  const next = queue.then(() => askNative(ask));
  queue = next.catch(() => undefined);
  return next;
}

function askNative(ask: boolean): Promise<NativePushResult> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => finish({ ok: false, reason: "error" }), PUSH_TIMEOUT_MS);
    const stop = onNativeMessage((message) => {
      if (message.type === "push-token") finish({ ok: true, token: message.token });
      else if (message.type === "push-result") finish({ ok: false, reason: message.reason });
    });
    function finish(result: NativePushResult) {
      window.clearTimeout(timer);
      stop();
      resolve(result);
    }
    postToNative({ type: ask ? "push-permission" : "push-sync" });
  });
}
