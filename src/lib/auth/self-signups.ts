// Novos cadastros por autosserviço (0103, admin_self_signups): leitura pura do retorno e o atalho de cada um para as
// telas do admin que já existem (agência: lista com editar/suspender; marca: ficha; Hero: ficha com aprovar/suspender).
export type SelfSignupKind = "agency" | "brand" | "hero";
export type SelfSignupRow = {
  id: string;
  kind: SelfSignupKind;
  createdAt: string;
  completed: boolean;
  cancelled: boolean;
  email: string;
  resultId: string | null;
  name: string | null;
  status: string | null;
};

const KINDS: readonly string[] = ["agency", "brand", "hero"];

export function parseSelfSignups(data: unknown): SelfSignupRow[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((raw) => {
    const x = (raw ?? {}) as Record<string, unknown>;
    if (typeof x.id !== "string" || typeof x.kind !== "string" || !KINDS.includes(x.kind)) return [];
    return [
      {
        id: x.id,
        kind: x.kind as SelfSignupKind,
        createdAt: typeof x.created_at === "string" ? x.created_at : "",
        completed: typeof x.completed_at === "string" && x.cancelled !== true,
        cancelled: x.cancelled === true,
        email: typeof x.email === "string" ? x.email : "",
        resultId: typeof x.result_id === "string" ? x.result_id : null,
        name: typeof x.name === "string" ? x.name : null,
        status: typeof x.status === "string" ? x.status : null,
      },
    ];
  });
}

/** Onde o admin vê/suspende (ou aprova, no Hero) o que nasceu. Sem resultado ainda: nenhum. */
export function adminHrefFor(row: Pick<SelfSignupRow, "kind" | "resultId">): string | null {
  if (!row.resultId) return null;
  if (row.kind === "agency") return "/admin/agencia";
  if (row.kind === "brand") return `/admin/marcas/${row.resultId}`;
  return `/admin/herois/${row.resultId}`;
}

/** Estado curto da linha: em andamento, desistiu ou o status do que nasceu. */
export function selfSignupState(row: SelfSignupRow): "inProgress" | "cancelled" | "pending" | "active" | "inactive" | "suspended" | "other" {
  if (row.cancelled) return "cancelled";
  if (!row.completed) return "inProgress";
  if (row.status === "pending" || row.status === "active" || row.status === "inactive" || row.status === "suspended") return row.status;
  return "other";
}
