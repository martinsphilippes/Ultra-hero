// Roda na página antes do conteúdo. A WebView do Android não tem navigator.share: a casca oferece a
// folha de compartilhar do sistema pela ponte (contrato em ../../src/lib/native-app/bridge-contract.ts).
export const BEFORE_CONTENT_SCRIPT = `
(function () {
  if (!window.ReactNativeWebView || typeof navigator.share === "function") return;
  navigator.share = function (data) {
    data = data || {};
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "share", title: data.title, text: data.text, url: data.url }));
    return Promise.resolve();
  };
  navigator.canShare = function () { return true; };
})();
true;
`;

/** Entrega uma mensagem da casca para a web (evento que a web escuta em src/lib/native-app/client.ts). */
export function dispatchToWeb(eventName: string, detail: unknown): string {
  return `window.dispatchEvent(new CustomEvent(${JSON.stringify(eventName)}, { detail: ${JSON.stringify(detail)} })); true;`;
}
