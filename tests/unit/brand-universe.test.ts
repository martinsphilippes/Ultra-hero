import { describe, expect, it } from "vitest";
import { brandInitials, sniffLogo } from "@/lib/brand-universe/logo";
import { brandSearchKey } from "@/lib/brand-universe/search";

describe("universo de marcas (0129/0131)", () => {
  it("logo enviado: o tipo vem dos bytes; SVG e HTML não entram", () => {
    expect(sniffLogo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])))?.toEqual({ mime: "image/png", ext: "png" });
    expect(sniffLogo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(sniffLogo(new TextEncoder().encode("RIFF0000WEBPVP8 "))?.ext).toBe("webp");
    expect(sniffLogo(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffLogo(new TextEncoder().encode("<html>"))).toBeNull();
  });
  it("iniciais quando a marca não tem logo", () => {
    expect(brandInitials("Mercado Livre")).toBe("ML");
    expect(brandInitials("O Boticário")).toBe("OB");
    expect(brandInitials("Natura")).toBe("NA");
    expect(brandInitials("C&A")).toBe("CA");
    expect(brandInitials("  ")).toBe("?");
  });
  it("busca pelo nome ignora acento, maiúscula e símbolos", () => {
    expect(brandSearchKey("O Boticário")).toBe("oboticario");
    expect(brandSearchKey("C&A")).toBe("ca");
    expect(brandSearchKey("boticario")).toBe("boticario");
  });
});
