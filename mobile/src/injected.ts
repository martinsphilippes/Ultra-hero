// Roda na página antes do conteúdo. A WebView do Android não tem navigator.share: a casca oferece a
// folha de compartilhar do sistema pela ponte. E avisa a casca do tema, para a barra de status (contrato em ../../src/lib/native-app/bridge-contract.ts).
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
(function () {
  // tema da página (data-theme no <html>) → barra de status do sistema
  if (!window.ReactNativeWebView) return;
  var last = null;
  function send() {
    var root = document.documentElement;
    var theme = root && root.getAttribute("data-theme") === "light" ? "light" : "dark";
    if (theme === last) return;
    last = theme;
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "theme", theme: theme }));
  }
  document.addEventListener("DOMContentLoaded", function () {
    send();
    new MutationObserver(send).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  });
})();
true;
`;

/** Entrega uma mensagem da casca para a web (evento que a web escuta em src/lib/native-app/client.ts). */
export function dispatchToWeb(eventName: string, detail: unknown): string {
  return `window.dispatchEvent(new CustomEvent(${JSON.stringify(eventName)}, { detail: ${JSON.stringify(detail)} })); true;`;
}
