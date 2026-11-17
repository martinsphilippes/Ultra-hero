import { describe, expect, it } from "vitest";
import { accessPhoneSchema } from "@/lib/agency/access-contact";
import { formatE164ForDisplay, formatPhoneInput, formatUsPhoneInput, normalizeMobileFor, normalizeUsPhone } from "@/lib/auth/phone";
import { castingCountryFromParam, castingCountryParam, isCastingCountry, statesFor, withCastingCountry } from "@/lib/talent/country";
import { talentSchema } from "@/lib/talent/schemas";
import { UFS, US_STATES } from "@/lib/talent/vocab";

// 0144: casting por país (Brasil | EUA) — seletor da tela, Hero dos EUA com estado e celular americanos.

describe("país do casting no endereço", () => {
  it("sem ?pais (ou com qualquer outro valor) é o Brasil; ?pais=us é os EUA", () => {
    expect(castingCountryFromParam(undefined)).toBe("BR");
    expect(castingCountryFromParam("")).toBe("BR");
    expect(castingCountryFromParam("br")).toBe("BR");
    expect(castingCountryFromParam("xx")).toBe("BR");
    expect(castingCountryFromParam("us")).toBe("US");
    expect(castingCountryFromParam(" US ")).toBe("US");
    expect(castingCountryFromParam(["us", "br"])).toBe("US");
  });

  it("o endereço só leva o parâmetro para os EUA e mantém os outros", () => {
    expect(castingCountryParam("BR")).toBeUndefined();
    expect(castingCountryParam("US")).toBe("us");
    expect(withCastingCountry("/agencia/casting", "BR")).toBe("/agencia/casting");
    expect(withCastingCountry("/agencia/casting", "US")).toBe("/agencia/casting?pais=us");
    expect(withCastingCountry("/agencia/casting?status=arquivados", "US")).toBe("/agencia/casting?status=arquivados&pais=us");
    expect(isCastingCountry("US") && isCastingCountry("BR") && !isCastingCountry("AR")).toBe(true);
  });

  it("estados da ficha seguem o país (50 estados + DC nos EUA)", () => {
    expect(statesFor("BR")).toBe(UFS);
    expect(statesFor(null)).toBe(UFS);
    expect(statesFor("US")).toBe(US_STATES);
    expect(US_STATES).toHaveLength(51);
    expect(new Set(US_STATES).size).toBe(51);
    expect(US_STATES).toContain("CA");
    expect(US_STATES).toContain("DC");
  });
});

describe("celular do acesso conforme o país", () => {
  it("EUA: aceita os formatos comuns e guarda em E.164", () => {
    for (const input of ["(212) 555-0100", "212-555-0100", "2125550100", "+1 212 555 0100", "1 (212) 555-0100", "+1 (212) 555-0100"]) {
      expect(normalizeUsPhone(input)).toBe("+12125550100");
      expect(normalizeMobileFor("US", input)).toBe("+12125550100");
    }
  });

  it("EUA: recusa código de área ou prefixo começando com 0/1 e tamanho errado", () => {
    expect(normalizeUsPhone("(112) 555-0100")).toBeNull();
    expect(normalizeUsPhone("(212) 155-0100")).toBeNull();
    expect(normalizeUsPhone("212555010")).toBeNull();
    expect(normalizeUsPhone("+55 11 91234-5678")).toBeNull();
    expect(normalizeUsPhone(12125550100)).toBeNull();
  });

  it("Brasil continua igual; número americano só com +1 na frente; fixo brasileiro nunca vira americano", () => {
    expect(normalizeMobileFor("BR", "(11) 91234-5678")).toBe("+5511912345678");
    expect(normalizeMobileFor(null, "(11) 91234-5678")).toBe("+5511912345678");
    expect(normalizeMobileFor("BR", "+1 (212) 555-0100")).toBe("+12125550100");
    expect(normalizeMobileFor("BR", "(21) 3456-7890")).toBeNull();
    expect(normalizeMobileFor("BR", "2125550100")).toBeNull();
    expect(normalizeMobileFor("US", "(11) 91234-5678")).toBeNull();
  });

  it("o schema do contato (painel de acesso) aceita Brasil e EUA com +1", () => {
    expect(accessPhoneSchema.safeParse("(11) 91234-5678")).toMatchObject({ success: true, data: "+5511912345678" });
    expect(accessPhoneSchema.safeParse("+1 (212) 555-0100")).toMatchObject({ success: true, data: "+12125550100" });
    expect(accessPhoneSchema.safeParse("(21) 3456-7890").success).toBe(false);
  });

  it("máscara dos EUA enquanto digita e exibição do número", () => {
    expect(formatUsPhoneInput("2")).toBe("+1 (2");
    expect(formatUsPhoneInput("2125")).toBe("+1 (212) 5");
    expect(formatUsPhoneInput("2125550100")).toBe("+1 (212) 555-0100");
    expect(formatUsPhoneInput("+1 (212) 555-01009")).toBe("+1 (212) 555-0100");
    expect(formatUsPhoneInput("+1 212 555 0100")).toBe("+1 (212) 555-0100");
    // apagando: "+1" sozinho fica; sem dígito nenhum, o campo esvazia
    expect(formatUsPhoneInput("+1 (")).toBe("+1");
    expect(formatUsPhoneInput("+")).toBe("");
    expect(formatUsPhoneInput("")).toBe("");
    expect(formatPhoneInput("11912345678", "BR")).toBe("(11) 91234-5678");
    expect(formatPhoneInput("+1 2125550100", "BR")).toBe("+1 (212) 555-0100");
    expect(formatPhoneInput("2125550100", "US")).toBe("+1 (212) 555-0100");
    expect(formatE164ForDisplay("+12125550100")).toBe("+1 (212) 555-0100");
    expect(formatE164ForDisplay("+5511912345678")).toBe("(11) 91234-5678");
  });
});

describe("ficha do Hero com país", () => {
  const base = {
    displayName: "Hero dos EUA",
    city: "Los Angeles",
    managerId: "",
    commercialStatus: "active",
    availability: "available",
    availabilityNote: "",
    contactEmail: "",
    contactPhone: "",
    internalNotes: "",
    lastContactAt: "",
  } as const;

  it("aceita estado americano e UF; o país é opcional (ausente, o banco mantém)", () => {
    expect(talentSchema.safeParse({ ...base, state: "CA", country: "US" }).success).toBe(true);
    expect(talentSchema.safeParse({ ...base, state: "SP", country: "BR" }).success).toBe(true);
    expect(talentSchema.safeParse({ ...base, state: "SP" }).success).toBe(true);
    expect(talentSchema.safeParse({ ...base, state: "ZZ", country: "US" }).success).toBe(false);
    expect(talentSchema.safeParse({ ...base, state: "", country: "AR" }).success).toBe(false);
  });
});
