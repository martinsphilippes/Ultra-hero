import { describe, expect, it } from "vitest";
import { withAutoplay } from "@/lib/video/autoplay";

describe("withAutoplay", () => {
  it("Cloudflare Stream: autoplay mudo", () => {
    const u = new URL(withAutoplay("https://customer-abc123.cloudflarestream.com/0123456789abcdef0123456789abcdef/iframe?token=x"));
    expect(u.searchParams.get("autoplay")).toBe("true");
    expect(u.searchParams.get("muted")).toBe("true");
    expect(u.searchParams.get("token")).toBe("x");
  });
  it("YouTube: autoplay=1, mute=1, playsinline=1 (mantém os outros parâmetros)", () => {
    const u = new URL(withAutoplay("https://www.youtube-nocookie.com/embed/abc?hl=pt"));
    expect([u.searchParams.get("autoplay"), u.searchParams.get("mute"), u.searchParams.get("playsinline"), u.searchParams.get("hl")]).toEqual(["1", "1", "1", "pt"]);
  });
  it("Vimeo: autoplay=1, muted=1", () => {
    const u = new URL(withAutoplay("https://player.vimeo.com/video/123"));
    expect([u.searchParams.get("autoplay"), u.searchParams.get("muted")]).toEqual(["1", "1"]);
  });
  it("outro host ou URL inválida: inalterada", () => {
    expect(withAutoplay("https://exemplo.com/v")).toBe("https://exemplo.com/v");
    expect(withAutoplay("nada")).toBe("nada");
  });
});
