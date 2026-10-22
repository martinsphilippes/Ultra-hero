import { describe, expect, it, vi } from "vitest";
import { createWakeLock, isWakeLockSupported, type WakeLockStatus } from "@/lib/recipes/wake-lock";

// Tela acesa no Modo Cozinha: pede o bloqueio, pede de novo quando a aba volta (o navegador solta
// sozinho ao esconder), avisa quando não há suporte ou o pedido é recusado e solta ao sair.

function fakeDoc(initial: "visible" | "hidden" = "visible") {
  const listeners = new Set<() => void>();
  return {
    visibilityState: initial as string,
    addEventListener: (_: "visibilitychange", cb: () => void) => void listeners.add(cb),
    removeEventListener: (_: "visibilitychange", cb: () => void) => void listeners.delete(cb),
    fire(state: "visible" | "hidden") {
      this.visibilityState = state;
      for (const cb of [...listeners]) cb();
    },
    listeners,
  };
}

function fakeNav(options: { reject?: boolean } = {}) {
  const sentinels: { released: boolean; release: () => Promise<void>; onRelease?: () => void; addEventListener: (t: "release", cb: () => void) => void; systemRelease: () => void }[] = [];
  const request = vi.fn(async () => {
    if (options.reject) throw new Error("NotAllowedError");
    const s = {
      released: false,
      onRelease: undefined as (() => void) | undefined,
      release: async () => {
        s.released = true;
        s.onRelease?.();
      },
      addEventListener: (_: "release", cb: () => void) => {
        s.onRelease = cb;
      },
      // o navegador soltou (aba escondida, economia de bateria)
      systemRelease: () => {
        s.released = true;
        s.onRelease?.();
      },
    };
    sentinels.push(s);
    return s;
  });
  return { nav: { wakeLock: { request } }, request, sentinels };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("wake lock", () => {
  it("sem suporte: avisa e nunca pede", async () => {
    const changes: WakeLockStatus[] = [];
    const doc = fakeDoc();
    const wl = createWakeLock({}, doc, (s) => changes.push(s));
    expect(isWakeLockSupported({})).toBe(false);
    expect(isWakeLockSupported(undefined)).toBe(false);
    expect(wl.supported).toBe(false);
    expect(wl.status()).toBe("unsupported");
    expect(await wl.enable()).toBe("unsupported");
    expect(doc.listeners.size).toBe(0);
  });

  it("liga, e quando o navegador solta ao esconder a aba, pede de novo ao voltar", async () => {
    const { nav, request, sentinels } = fakeNav();
    const doc = fakeDoc();
    const changes: WakeLockStatus[] = [];
    const wl = createWakeLock(nav, doc, (s) => changes.push(s));
    expect(await wl.enable()).toBe("active");
    expect(request).toHaveBeenCalledWith("screen");

    doc.fire("hidden");
    sentinels[0].systemRelease();
    expect(wl.status()).toBe("off");
    doc.fire("visible");
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    expect(wl.status()).toBe("active");
    expect(changes).toEqual(["active", "off", "active"]);
  });

  it("com a aba escondida não pede; pede quando ela aparece", async () => {
    const { nav, request } = fakeNav();
    const doc = fakeDoc("hidden");
    const wl = createWakeLock(nav, doc, () => undefined);
    expect(await wl.enable()).toBe("off");
    expect(request).not.toHaveBeenCalled();
    doc.fire("visible");
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    expect(wl.status()).toBe("active");
  });

  it("pedido recusado (economia de bateria, permissão) vira 'denied'", async () => {
    const { nav } = fakeNav({ reject: true });
    const wl = createWakeLock(nav, fakeDoc(), () => undefined);
    expect(await wl.enable()).toBe("denied");
  });

  it("desligar solta e para de pedir ao voltar; desmontar remove o ouvinte", async () => {
    const { nav, request, sentinels } = fakeNav();
    const doc = fakeDoc();
    const wl = createWakeLock(nav, doc, () => undefined);
    await wl.enable();
    await wl.disable();
    expect(sentinels[0].released).toBe(true);
    expect(wl.status()).toBe("off");
    doc.fire("visible");
    await flush();
    expect(request).toHaveBeenCalledTimes(1);

    await wl.enable();
    wl.dispose();
    expect(sentinels[1].released).toBe(true);
    expect(doc.listeners.size).toBe(0);
  });

  it("não pede de novo enquanto o bloqueio atual está valendo", async () => {
    const { nav, request } = fakeNav();
    const doc = fakeDoc();
    const wl = createWakeLock(nav, doc, () => undefined);
    await wl.enable();
    doc.fire("visible");
    await flush();
    await wl.enable();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
