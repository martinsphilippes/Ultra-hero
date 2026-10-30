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
