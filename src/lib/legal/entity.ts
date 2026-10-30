// Quem responde pelo GC Hero — num lugar só. Termos de Uso e Política de Privacidade repetem estes
// dados em vários pontos ({company}, {cnpj}, {address}, {email}, {dpo}, {app} nas mensagens legal.json);
// espalhados, o dia em que algo mudar deixa metade certa e metade errada.
// Decisão do responsável (30/10/2026): a mesma empresa do Quantso, e o mesmo contato responde como
// canal do encarregado (DPO). A razão social vai na forma registrada: é a string que a loja confere
// contra o CNPJ (lição do Quantso, attilasm/quantso apps/web/src/lib/identidade-legal.ts).

export const LEGAL_ENTITY = {
  app: "GC Hero",
  company: "QUANTSO TRANSPORTE LOGISTICA LTDA",
  cnpj: "35.176.948/0001-87",
  address: "Rua Jardim Federação, 439, sala 07 — Condomínio Estúdio Centro, Federação, Salvador/BA, CEP 40231-060",
  email: "suporte@quantsobrasil.com.br",
  // encarregado pelo tratamento de dados (LGPD art. 41): identidade e contato publicados
  dpo: "Attila Martins",
} as const;
