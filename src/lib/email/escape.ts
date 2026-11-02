/** Escapa texto para o HTML do e-mail (nomes e assuntos vêm de cadastro). Puro: usado também nos testes. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
