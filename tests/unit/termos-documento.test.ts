import { describe, expect, it } from "vitest";
import {
  applySuggestion,
  cleanExtractedText,
  combineConditions,
  detectTermsByRules,
  durationMonths,
  fitToLimit,
  prepareConditions,
  stripMoney,
  suggestionFound,
  termsImportFileIssue,
  termsImportKind,
  TERMS_IMPORT_MAX_BYTES,
} from "@/lib/deals/terms-import";
import { EMPTY_RIGHTS } from "@/lib/offer/rights";

// Preencher os termos a partir de um documento (05/11): limpeza, valores, limite e regras de palavras.

describe("tipo e tamanho do arquivo", () => {
  it("aceita PDF, DOCX e TXT pelo MIME ou pela extensão", () => {
    expect(termsImportKind("contrato.pdf", "application/pdf")).toBe("pdf");
    expect(termsImportKind("Termos.DOCX", "")).toBe("docx");
    expect(termsImportKind("notas.txt", "text/plain")).toBe("txt");
    expect(termsImportKind("planilha.xlsx", "application/vnd.ms-excel")).toBeNull();
    expect(termsImportKind("antigo.doc", "application/msword")).toBeNull();
  });
  it("confere tamanho", () => {
    expect(termsImportFileIssue({ name: "a.pdf", type: "application/pdf", size: 10 })).toBeNull();
    expect(termsImportFileIssue({ name: "a.pdf", type: "application/pdf", size: TERMS_IMPORT_MAX_BYTES + 1 })).toBe("size");
    expect(termsImportFileIssue({ name: "a.txt", type: "text/plain", size: 0 })).toBe("empty");
    expect(termsImportFileIssue({ name: "a.png", type: "image/png", size: 10 })).toBe("type");
  });
});

describe("limpeza do texto", () => {
  it("une palavras hifenizadas e frases quebradas, mantém parágrafos e listas", () => {
    const raw = "O influenciador fará 3 posts no Insta-\ngram e 2 vídeos\nno TikTok.\n\n\n\nEntregas:\n- 1 reels\n- 3 stories\nPágina 1 de 2\n";
    expect(cleanExtractedText(raw)).toBe("O influenciador fará 3 posts no Instagram e 2 vídeos no TikTok.\n\nEntregas:\n- 1 reels\n- 3 stories");
  });
  it("tira números de página, espaços e caracteres invisíveis", () => {
    expect(cleanExtractedText("Cláusula 1ª­   Objeto\r\n\f2\r\nCláusula 2ª  Prazo")).toBe("Cláusula 1ª Objeto\n\nCláusula 2ª Prazo");
  });
  it("não junta cláusulas numeradas", () => {
    expect(cleanExtractedText("1. Objeto do contrato\n2. Prazo de uso")).toBe("1. Objeto do contrato\n2. Prazo de uso");
  });
});

describe("valores fora de Condições", () => {
  it("tira frases com R$ e avisa quantas", () => {
    const r = stripMoney("Serão 3 posts no feed. O cachê total é de R$ 15.000,00. Pagamento em 30 dias.\nValor: R$ 2.000\nUso por 6 meses.");
    expect(r.text).toBe("Serão 3 posts no feed. Pagamento em 30 dias.\nUso por 6 meses.");
    expect(r.removed).toBe(2);
  });
  it("pega 'N reais' e 'mil reais'", () => {
    expect(stripMoney("Bônus de 500 reais por meta. Entrega em março.").text).toBe("Entrega em março.");
    expect(stripMoney("Investimento de 20 mil reais.").removed).toBe(1);
  });
  it("sem valores, nada muda", () => {
    expect(stripMoney("Entregas: 2 reels.")).toEqual({ text: "Entregas: 2 reels.", removed: 0 });
  });
});

describe("limite do campo", () => {
  it("corta com reticências sem partir a palavra", () => {
    const r = fitToLimit("palavra ".repeat(20).trim(), 30);
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(30);
    expect(r.text.endsWith("palavra…")).toBe(true);
  });
  it("prepareConditions junta limpeza, valores e corte", () => {
    const r = prepareConditions(`Entregas combinadas.\nCachê de R$ 9.000,00.\n${"Texto longo ".repeat(500)}`);
    expect(r.moneyRemoved).toBe(1);
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(4000);
    expect(r.text).not.toContain("R$");
  });
  it("substituir ou acrescentar", () => {
    expect(combineConditions("Antigo.", "Novo.", "replace").text).toBe("Novo.");
    expect(combineConditions("Antigo.", "Novo.", "append").text).toBe("Antigo.\n\nNovo.");
    expect(combineConditions("  ", "Novo.", "append").text).toBe("Novo.");
    expect(combineConditions("a".repeat(15), "b".repeat(15), "append", 20).truncated).toBe(true);
  });
});

describe("prazos", () => {
  it("meses, anos, dias e por extenso", () => {
    expect(durationMonths("uso por 6 meses")).toBe(6);
    expect(durationMonths("pelo prazo de 12 (doze) meses")).toBe(12);
    expect(durationMonths("por um ano")).toBe(12);
    expect(durationMonths("por 2 anos")).toBe(24);
    expect(durationMonths("durante 90 dias")).toBe(3);
    expect(durationMonths("por 45 dias")).toBe(2);
    expect(durationMonths("por 10 dias")).toBe(1);
    expect(durationMonths("por noventa dias")).toBe(3);
    expect(durationMonths("por três meses")).toBe(3);
    expect(durationMonths("sem prazo")).toBeNull();
  });
});

describe("regras de palavras", () => {
  const segments = [
    { id: "s-beb", name: "Bebidas" },
    { id: "s-cos", name: "Cosméticos" },
    { id: "s-x", name: "TI" },
  ];

  it("contrato típico de influência", () => {
    const text = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE PUBLICIDADE
Cláusula 1 – O CONTRATADO produzirá 2 reels e 4 stories no Instagram e 1 vídeo no TikTok.
Cláusula 4 – Fica autorizado o uso da imagem do CONTRATADO nas redes sociais, no site e no e-commerce da marca pelo prazo de 6 (seis) meses.
Cláusula 5 – A CONTRATANTE poderá impulsionar o conteúdo (mídia paga) durante o período de uso.
Cláusula 6 – O CONTRATADO terá exclusividade no segmento de bebidas por 3 meses.`;
    const s = detectTermsByRules(text, segments);
    expect(s.channels).toEqual(["social", "website", "paid_media", "ecommerce"]);
    expect(s.usageMonths).toBe(6);
    expect(s.perpetual).toBe(false);
    expect(s.boost).toBe(true);
    expect(s.exclusive).toBe(true);
    expect(s.exclusivityMonths).toBe(3);
    expect(s.segmentIds).toEqual(["s-beb"]);
    expect(s.category).toBe("bebidas");
  });

  it("perpétuo, PDV, mídia exterior, TV e newsletter", () => {
    const text = "A cessão dos direitos de imagem é por prazo indeterminado, incluindo materiais de ponto de venda (PDV), outdoor, televisão e newsletter.";
    const s = detectTermsByRules(text);
    expect(s.perpetual).toBe(true);
    expect(s.usageMonths).toBeNull();
    expect(s.channels).toEqual(["pos", "email", "ooh", "tv"]);
  });

  it("negações não marcam", () => {
    const text = "Sem exclusividade. Não é permitido impulsionamento. O conteúdo não será veiculado em TV. Uso em redes sociais por 30 dias.";
    const s = detectTermsByRules(text);
    expect(s.exclusive).toBe(false);
    expect(s.exclusivityMonths).toBeNull();
    expect(s.boost).toBe(false);
    expect(s.channels).toEqual(["social"]);
    expect(s.usageMonths).toBe(1);
  });

  it("prazo de entrega não vira prazo de uso; e-mail de contato não vira canal", () => {
    const text = "Prazo de entrega: 10 dias após aprovação do roteiro. Dúvidas por e-mail: contato@marca.com.br. Veiculação permitida no site oficial por 1 ano.";
    const s = detectTermsByRules(text);
    expect(s.usageMonths).toBe(12);
    expect(s.channels).toEqual(["website"]);
  });

  it("exclusividade sem prazo fica sem prazo (a pessoa preenche)", () => {
    const s = detectTermsByRules("O influenciador concorda com exclusividade na categoria de cosméticos.", segments);
    expect(s.exclusive).toBe(true);
    expect(s.exclusivityMonths).toBeNull();
    expect(s.segmentIds).toEqual(["s-cos"]);
    expect(s.category).toBe("cosméticos");
  });

  it("limites de prazo", () => {
    const s = detectTermsByRules("Licença de uso por 20 anos. Exclusividade por 10 anos.");
    expect(s.usageMonths).toBe(120);
    expect(s.exclusivityMonths).toBe(60);
  });

  it("texto sem nada", () => {
    const s = detectTermsByRules("Reunião de alinhamento na segunda-feira.");
    expect(suggestionFound(s)).toBe(false);
  });

  it("whitelisting/dark post contam como impulsionamento e mídia paga; OOH e loja online", () => {
    const s = detectTermsByRules("Autorizado dark post via whitelisting. Uso em mídia OOH e loja online.");
    expect(s.boost).toBe(true);
    expect(s.channels).toEqual(["paid_media", "ecommerce", "ooh"]);
  });
});

describe("aplicar ao formulário", () => {
  it("só acrescenta, não desmarca", () => {
    const current = { ...EMPTY_RIGHTS, channels: ["tv" as const], boost: false, category: "Já tinha" };
    const next = applySuggestion(current, { channels: ["social"], usageMonths: 6, perpetual: false, boost: true, exclusive: true, exclusivityMonths: null, segmentIds: ["a"], category: "bebidas" });
    expect(next.channels).toEqual(["social", "tv"]);
    expect(next.usageMonths).toBe(6);
    expect(next.boost).toBe(true);
    expect(next.exclusive).toBe(true);
    expect(next.exclusivityMonths).toBeNull();
    expect(next.segmentIds).toEqual(["a"]);
    expect(next.category).toBe("Já tinha");
  });
  it("perpétuo limpa os meses", () => {
    const next = applySuggestion({ ...EMPTY_RIGHTS, usageMonths: 3 }, { channels: [], usageMonths: null, perpetual: true, boost: false, exclusive: false, exclusivityMonths: null, segmentIds: [], category: "" });
    expect(next.perpetual).toBe(true);
    expect(next.usageMonths).toBeNull();
  });
});
