import { createHash } from "node:crypto";

/** Réplica de public.seed_uuid (0008): ids determinísticos do seed (iguais no banco local e no remoto). */
export function seedUuid(key: string): string {
  const h = createHash("md5").update(`ultra-hero:${key}`).digest("hex");
  const variant = "89ab"[parseInt(h[16], 16) % 4];
  const x = `${h.slice(0, 12)}4${h.slice(13, 16)}${variant}${h.slice(17)}`;
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
