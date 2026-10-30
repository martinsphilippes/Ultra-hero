import "server-only";
import { after } from "next/server";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { dispatchPushOutbox } from "./dispatch";

// Depois da resposta (post publicado, conteúdo concluído), esvazia a fila de push que o banco acabou
// de encher. Dependência não crítica: falha é logada e engolida; o cron diário recolhe o que sobrar.
export function schedulePushDispatch(): void {
  if (!hasAdminClient()) return;
  try {
    after(async () => {
      try {
        await dispatchPushOutbox(createAdminClient());
      } catch (error) {
        console.warn("[push] dispatch após evento falhou; fica para o cron", error instanceof Error ? error.message : String(error));
      }
    });
  } catch (error) {
    // fora de um request (script, teste): a publicação segue; a fila sai no cron
    console.warn("[push] dispatch não agendado", error instanceof Error ? error.message : String(error));
  }
}
