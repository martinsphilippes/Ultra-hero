import "server-only";
import { getPlatformEvent, type PlatformEvent } from "@/lib/platform-calendar/queries";

/**
 * Evento para abrir uma proposta a partir dele (0101): só evento da plataforma no ar (a RLS decide se a pessoa vê),
 * não cancelado e não encerrado. `requested` = veio ?evento= na URL (para avisar quando não serviu).
 */
export async function eventForProposal(id: string | undefined): Promise<{ requested: boolean; event: PlatformEvent | null }> {
  if (!id) return { requested: false, event: null };
  const event = await getPlatformEvent(id);
  const ok = event !== null && event.effective === "published" && new Date(event.endsAt).getTime() > Date.now();
  return { requested: true, event: ok ? event : null };
}
