import { runCronJob } from "../_lib/cron";

// Avança o transporte simulado (ready_for_dispatch → in_transit → delivered) após N minutos por etapa.
// Vercel Hobby só permite cron diário; o transporte TAMBÉM avança sob demanda ao abrir as páginas de pedidos.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_MINUTES_PER_STEP = 10;

async function handler(request: Request) {
  return runCronJob(request, "transport", async (admin) => {
    const { data: setting } = await admin.from("app_settings").select("value").eq("key", "transport.minutes_per_step").maybeSingle();
    const minutes = Number(setting?.value);
    const minutesPerStep = Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : DEFAULT_MINUTES_PER_STEP;
    const { data, error } = await admin.rpc("advance_simulated_transport", { p_minutes_per_step: minutesPerStep });
    if (error) throw new Error(error.message);
    return { advanced: Number(data ?? 0), minutes_per_step: minutesPerStep };
  });
}

export { handler as GET, handler as POST };
