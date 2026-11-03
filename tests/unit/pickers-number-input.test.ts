import { describe, expect, it } from "vitest";
import { parseReferenceInput } from "@/lib/heroes/compare";
import { parseMetricInput } from "@/lib/media/metrics";
import { groupInt, intFromText, maskInt, parseIntText, typeInt } from "@/lib/numbers/int-input";
import { parseCount } from "@/lib/talent/schemas";
import { entityDetails, entityOptionLabel, heroOption, maskEmail, memberOption, talentOption } from "@/lib/ui/entity";

describe("int-input (contagens com ponto de milhar)", () => {
  it("agrupa enquanto digita", () => {
    expect(groupInt("10000")).toBe("10.000");
    expect(typeInt("1.000", "1.0000")).toBe("10.000");
    expect(typeInt("", "1")).toBe("1");
    expect(typeInt("999", "9999")).toBe("9.999");
    expect(typeInt("10", "10a")).toBe("10");
    expect(typeInt("", "007")).toBe("7");
  });
  it("respeita o limite de dígitos", () => {
    expect(typeInt("99.999", "999999", { maxDigits: 5 })).toBe("99.999");
  });
  it("aceita colar com ou sem pontos", () => {
    expect(maskInt("10.000")).toBe("10.000");
    expect(maskInt("10000")).toBe("10.000");
    expect(maskInt("10 000")).toBe("10.000");
    expect(maskInt("1,234,567")).toBe("1.234.567");
    expect(maskInt("10.000,50")).toBe("10.000");
    expect(maskInt("8000.5")).toBe("8.000");
    expect(maskInt(12345)).toBe("12.345");
    expect(maskInt(null)).toBe("");
    expect(typeInt("", "10.000", { pasted: true })).toBe("10.000");
  });
  it("converte texto em número", () => {
    expect(intFromText("10.000")).toBe(10000);
    expect(intFromText("")).toBeNull();
  });
  it("parser tolerante para servidores", () => {
    expect(parseIntText("10.000")).toBe(10000);
    expect(parseIntText("10000")).toBe(10000);
    expect(parseIntText(" 1.234.567 ")).toBe(1234567);
    expect(parseIntText("")).toBeNull();
    expect(parseIntText(undefined)).toBeNull();
    expect(parseIntText("1,5")).toBeUndefined();
    expect(parseIntText("10.00")).toBeUndefined();
    expect(parseIntText("-5")).toBeUndefined();
    expect(parseIntText("abc")).toBeUndefined();
    expect(parseIntText("2.000", 1000)).toBeUndefined();
  });
  it("o texto mascarado passa nos parsers que já existiam", () => {
    expect(parseCount("10.000")).toBe(10000);
    expect(parseMetricInput("1.234.567")).toBe(1234567);
    expect(parseReferenceInput("steps_day", "12.000")).toEqual({ ok: true, value: 12000 });
    expect(parseReferenceInput("steps_day", "12000")).toEqual({ ok: true, value: 12000 });
    expect(parseReferenceInput("sleep_hours", "7,5")).toEqual({ ok: true, value: 7.5 });
    expect(parseReferenceInput("sleep_hours", "7.5")).toEqual({ ok: true, value: 7.5 });
  });
});

describe("entity (cartão abaixo das caixas de seleção)", () => {
  const tp = (key: string, values?: Record<string, string | number>) => (values ? `${key}:${JSON.stringify(values)}` : key);
  it("mascara e-mail", () => {
    expect(maskEmail("grupoquantso@gmail.com")).toBe("g•••@gmail.com");
    expect(maskEmail("a@b.co")).toBe("a•••@b.co");
    expect(maskEmail("sem-arroba")).toBeNull();
    expect(maskEmail("@x.com")).toBeNull();
    expect(maskEmail(null)).toBeNull();
  });
  it("monta rótulo e detalhes", () => {
    expect(entityOptionLabel("Ana", "Gestor")).toBe("Ana (Gestor)");
    expect(entityOptionLabel(" Ana ", null)).toBe("Ana");
    expect(entityDetails(["Gestor", null, "", "Gestor", "ana@x.com"])).toBe("Gestor · ana@x.com");
  });
  it("membro, creator e herói", () => {
    expect(memberOption(tp, { userId: "u1", name: "grupoquantso", role: "admin", jobTitle: "Sócio" })).toMatchObject({ value: "u1", name: "grupoquantso", role: "roles.agencyAdmin", detail: "Sócio" });
    expect(memberOption(tp, { userId: "u2", name: "Bia", role: "outro" }).role).toBeNull();
    const c = talentOption(tp, { id: "t1", name: "Lia", city: "Recife", state: "PE", hasLogin: false });
    expect(c).toMatchObject({ value: "t1", role: "roles.creator", detail: "Recife/PE · details.noLogin" });
    expect(talentOption(tp, { id: "t1", name: "Lia" }, "dt9").value).toBe("dt9");
    expect(heroOption(tp, { id: "h1", name: "Chef", slug: "chef" })).toMatchObject({ role: "roles.hero", detail: "/personalities/chef" });
  });
});
