// Aviso do cronômetro sem notificação: bipes pelo Web Audio (o contexto é criado no toque que inicia
// o cronômetro, porque o navegador só libera áudio depois de um gesto) e vibração quando existe.

type AudioCtor = typeof AudioContext;

export type Alarm = {
  /** Chamar dentro do gesto (clique em "Iniciar"): cria/retoma o contexto de áudio. */
  prime: () => void;
  ring: (options: { sound: boolean }) => void;
  /** Corta a vibração em curso (o som de cada toque já é curto). */
  stop: () => void;
  dispose: () => void;
};

export const VIBRATION_PATTERN = [400, 200, 400, 200, 400];

/** Intervalo entre os toques e o limite: quem está longe da tela ouve de novo, sem tocar para sempre. */
export const ALARM_REPEAT_MS = 5_000;
export const ALARM_REPEAT_LIMIT_MS = 2 * 60 * 1000;

/**
 * Repete o toque a cada 5 s até ser dispensado, por no máximo 2 min (o primeiro toque é de quem chama).
 * Devolve a função que para; "Parar o alarme" chega aqui pela limpeza do efeito.
 */
export function repeatAlarm(ring: () => void, every = ALARM_REPEAT_MS, limit = ALARM_REPEAT_LIMIT_MS): () => void {
  let elapsed = 0;
  const id = setInterval(() => {
    elapsed += every;
    if (elapsed > limit) {
      clearInterval(id);
      return;
    }
    ring();
  }, every);
  return () => clearInterval(id);
}

export function createAlarm(): Alarm {
  let ctx: AudioContext | null = null;

  const audio = (): AudioContext | null => {
    if (ctx) return ctx;
    const w = typeof window === "undefined" ? undefined : (window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor });
    const Ctor = w?.AudioContext ?? w?.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      ctx = null;
    }
    return ctx;
  };

  return {
    prime: () => {
      const c = audio();
      if (c && c.state === "suspended") void c.resume().catch(() => undefined);
    },
    ring: ({ sound }) => {
      try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(VIBRATION_PATTERN);
      } catch {
        // vibração é um extra
      }
      if (!sound) return;
      const c = audio();
      if (!c) return;
      if (c.state === "suspended") void c.resume().catch(() => undefined);
      // três bipes curtos e audíveis de longe
      for (let i = 0; i < 3; i += 1) {
        const start = c.currentTime + i * 0.45;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
        osc.connect(gain).connect(c.destination);
        osc.start(start);
        osc.stop(start + 0.32);
      }
    },
    stop: () => {
      try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(0);
      } catch {
        // vibração é um extra
      }
    },
    dispose: () => {
      const c = ctx;
      ctx = null;
      if (c) void c.close().catch(() => undefined);
    },
  };
}
