// Tela acesa no Modo Cozinha (Screen Wake Lock). O navegador solta o bloqueio sozinho quando a aba
// some (outra aba, tela bloqueada), então ele é pedido de novo ao voltar (visibilitychange). Sem
// suporte ou com recusa, a tela mostra um aviso em vez de fingir que está acesa. Puro: os testes
// passam um navigator/document falsos.

export type WakeLockStatus = "unsupported" | "off" | "active" | "denied";

type Sentinel = { released?: boolean; release: () => Promise<void>; addEventListener?: (type: "release", cb: () => void) => void };
type WakeLockNavigator = { wakeLock?: { request: (type: "screen") => Promise<Sentinel> } };
type WakeLockDocument = {
  visibilityState: string;
  addEventListener: (type: "visibilitychange", cb: () => void) => void;
  removeEventListener: (type: "visibilitychange", cb: () => void) => void;
};

export type WakeLockController = {
  readonly supported: boolean;
  /** Quer a tela acesa (liga e mantém pedindo de novo quando a aba volta). */
  enable: () => Promise<WakeLockStatus>;
  /** Não quer mais (solta e para de pedir). */
  disable: () => Promise<void>;
  /** Desmonta: solta e remove o ouvinte. */
  dispose: () => void;
  status: () => WakeLockStatus;
};

export function isWakeLockSupported(nav: WakeLockNavigator | undefined | null): boolean {
  return Boolean(nav?.wakeLock && typeof nav.wakeLock.request === "function");
}

export function createWakeLock(nav: WakeLockNavigator | undefined | null, doc: WakeLockDocument, onChange: (status: WakeLockStatus) => void): WakeLockController {
  const supported = isWakeLockSupported(nav);
  let wanted = false;
  let sentinel: Sentinel | null = null;
  let current: WakeLockStatus = supported ? "off" : "unsupported";
  let disposed = false;

  const set = (next: WakeLockStatus) => {
    if (next === current) return;
    current = next;
    if (!disposed) onChange(next);
  };

  async function acquire(): Promise<WakeLockStatus> {
    if (!supported || !wanted || disposed) return current;
    // pedido com a aba escondida é recusado; o visibilitychange tenta de novo quando ela voltar
    if (doc.visibilityState !== "visible") return current;
    if (sentinel && !sentinel.released) return current;
    try {
      const s = await nav!.wakeLock!.request("screen");
      if (!wanted || disposed) {
        await s.release().catch(() => undefined);
        return current;
      }
      sentinel = s;
      s.addEventListener?.("release", () => {
        // soltou sozinho (aba escondida, economia de bateria): fica "off" até o próximo pedido
        if (sentinel === s) sentinel = null;
        if (wanted) set("off");
      });
      set("active");
    } catch {
      set("denied");
    }
    return current;
  }

  const onVisibility = () => {
    if (doc.visibilityState === "visible" && wanted) void acquire();
  };
  if (supported) doc.addEventListener("visibilitychange", onVisibility);

  return {
    supported,
    enable: async () => {
      if (!supported) return "unsupported";
      wanted = true;
      return acquire();
    },
    disable: async () => {
      wanted = false;
      const s = sentinel;
      sentinel = null;
      if (s) await s.release().catch(() => undefined);
      if (supported) set("off");
    },
    dispose: () => {
      wanted = false;
      disposed = true;
      if (supported) doc.removeEventListener("visibilitychange", onVisibility);
      const s = sentinel;
      sentinel = null;
      if (s) void s.release().catch(() => undefined);
    },
    status: () => current,
  };
}
