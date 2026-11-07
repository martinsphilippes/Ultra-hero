import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** SQL da migração mais recente que recria o check de tipos de aviso (inbox_notifications_kind_check). Os testes
 *  conferem os tipos do código contra ela, sem precisar mudar o número da migração a cada aviso novo. */
export function latestInboxCheckSql(): string {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files.reverse()) {
    const sql = readFileSync(path.join(dir, file), "utf8");
    if (sql.includes("add constraint inbox_notifications_kind_check")) return sql;
  }
  throw new Error("nenhuma migração recria inbox_notifications_kind_check");
}
