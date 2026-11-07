// Som de aviso do Ultra (reunião Groscove: "um som marcante, que as pessoas reconheçam"). É um assobio curto e
// próprio — duas notas subindo e uma escorregada no fim —, feito na hora pelo navegador (Web Audio), sem arquivo e
// sem trecho de obra protegida (o "assobio do Pica-Pau" é da Universal). Só toca com a aba visível e depois que a
// pessoa já tocou na tela (regra dos navegadores); quem desliga o som do aparelho não ouve.
let ctx: AudioContext | null = null;
let lastAt = 0;

export const CHIME_STORAGE_KEY = "uh-chime-off";

export function chimeEnabled(): boolean {
  try {
    return window.localStorage.getItem(CHIME_STORAGE_KEY) !== "1";
  } catch {
    return true;
  }
}

export function setChimeEnabled(on: boolean): void {
  try {
    if (on) window.localStorage.removeItem(CHIME_STORAGE_KEY);
    else window.localStorage.setItem(CHIME_STORAGE_KEY, "1");
  } catch {
    /* sem armazenamento: segue o padrão (ligado) */
  }
}

/** Notas do assobio: [frequência inicial, final, início (s), duração (s)]. Puro, para teste. */
export const CHIME_NOTES: ReadonlyArray<readonly [number, number, number, number]> = [
  [880, 1175, 0, 0.12],
  [1175, 1568, 0.14, 0.12],
  [1568, 1046, 0.3, 0.22],
];

export function playChime(): void {
  if (typeof window === "undefined" || document.visibilityState !== "visible" || !chimeEnabled()) return;
  const now = Date.now();
  if (now - lastAt < 1500) return; // vários avisos juntos tocam uma vez só
  lastAt = now;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + 0.02;
    for (const [from, to, at, dur] of CHIME_NOTES) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(from, t0 + at);
      osc.frequency.exponentialRampToValueAtTime(to, t0 + at + dur);
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + dur + 0.02);
    }
  } catch {
    /* sem áudio: o aviso continua no sino */
  }
}
