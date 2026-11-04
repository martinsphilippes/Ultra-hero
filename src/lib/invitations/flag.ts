import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { invitesEnabledFrom } from "./flag-rules";

// Interruptor "Convites ativos" (0103, app_settings 'invites.enabled'). Quem decide é o banco (o gatilho recusa com
// 'invites_disabled'); aqui só a leitura para esconder os botões de criar convite. Lido uma vez por requisição.
// Sem a migração (RPC ausente) ou com erro: ligado, como antes — o banco continua barrando se estiver desligado.
export const getInvitesEnabled = cache(async (): Promise<boolean> => {
  try {
    const supabase = await createClient();
    return invitesEnabledFrom(await supabase.rpc("invites_enabled"));
  } catch {
    return true;
  }
});
