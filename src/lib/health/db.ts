import "server-only";
import postgres from "postgres";

// Conexão do papel health_ingest (§8, §15.1): a ÚNICA credencial que escreve no schema health.
// Só existe nas rotas de ingestão, OAuth e cron de wearables (fronteira de import no eslint).
// Pooler em modo transação (Supavisor): sem prepared statements. Sem a variável, nada liga.

let client: postgres.Sql | null = null;

export function hasHealthDb(): boolean {
  return Boolean(process.env.HEALTH_INGEST_DATABASE_URL);
}

export function healthDb(): postgres.Sql {
  const url = process.env.HEALTH_INGEST_DATABASE_URL;
  if (!url) throw new Error("health_ingest_not_configured");
  if (!client) {
    client = postgres(url, {
      max: 3,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10,
      // nunca logar parâmetros (valores de saúde, tokens cifrados)
      debug: false,
      onnotice: () => {},
    });
  }
  return client;
}
