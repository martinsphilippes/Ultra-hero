import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adjacentTab, isTabSwipe, PULL_TRIGGER, pullDistance } from "@/lib/native-app/gestures";

const TABS = ["/personalities", "/inicio", "/explore", "/profile"];
const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

describe("gestos do app das lojas", () => {
  it("puxar: com resistência, dispara depois de um arrasto firme e tem limite", () => {
    expect(pullDistance(-10)).toBe(0);
    expect(pullDistance(40)).toBeLessThan(PULL_TRIGGER);
    expect(pullDistance(140)).toBeGreaterThanOrEqual(PULL_TRIGGER);
    expect(pullDistance(1000)).toBe(96);
  });
  it("arrastar de lado: só horizontal e longo o bastante", () => {
    expect(isTabSwipe(-80, 10)).toBe(true);
    expect(isTabSwipe(80, 10)).toBe(true);
    expect(isTabSwipe(-40, 0)).toBe(false);
    expect(isTabSwipe(-80, 60)).toBe(false);
  });
  it("aba vizinha: esquerda vai à próxima, direita à anterior; pontas e subpáginas não trocam", () => {
    expect(adjacentTab("/inicio", -80, TABS)).toBe("/explore");
    expect(adjacentTab("/inicio", 80, TABS)).toBe("/personalities");
    expect(adjacentTab("/personalities", 80, TABS)).toBeNull();
    expect(adjacentTab("/profile", -80, TABS)).toBeNull();
    expect(adjacentTab("/profile/account", -80, TABS)).toBeNull();
  });
});

describe("casca do app só muda no app", () => {
  it("zoom, gestos e contêiner de rolagem dependem do app; a web fica como está", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain("...(nativeApp ? { maximumScale: 1, userScalable: false } : {})");
    expect(layout).toContain("{nativeApp ? <NativeGestures /> : null}");
    const css = read("src/app/globals.css");
    expect(css).toMatch(/\[data-native-app\] \.uh-native-scroller \{\n\s+position: fixed;/);
    expect(css).not.toMatch(/^\.uh-native-scroller/m);
  });
});
