// Tipos e normalização do jsonb devolvido por my_subscription / select_modules / cancel_subscription.

export type SubscriptionModule = {
  module_id: string;
  code: string;
  name: string;
  price_cents_demo: number;
  status: "active" | "scheduled_removal";
  removal_at: string | null;
};

export type SubscriptionStatus = "anonymous" | "free" | "active" | "cancelled" | "expired";

export type SubscriptionInfo = {
  status: SubscriptionStatus;
  simulated: true;
  current_period_start: string | null;
  current_period_end: string | null;
  auto_renew: boolean;
  cancelled_at: string | null;
  modules: SubscriptionModule[];
};

const STATUSES: SubscriptionStatus[] = ["anonymous", "free", "active", "cancelled", "expired"];

export function parseSubscription(value: unknown): SubscriptionInfo {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const status = STATUSES.includes(raw.status as SubscriptionStatus) ? (raw.status as SubscriptionStatus) : "free";
  const modules = Array.isArray(raw.modules)
    ? (raw.modules as Record<string, unknown>[]).map((m) => ({
        module_id: String(m.module_id ?? ""),
        code: String(m.code ?? ""),
        name: String(m.name ?? ""),
        price_cents_demo: Number(m.price_cents_demo ?? 0),
        status: m.status === "scheduled_removal" ? ("scheduled_removal" as const) : ("active" as const),
        removal_at: typeof m.removal_at === "string" ? m.removal_at : null,
      }))
    : [];
  return {
    status,
    simulated: true,
    current_period_start: typeof raw.current_period_start === "string" ? raw.current_period_start : null,
    current_period_end: typeof raw.current_period_end === "string" ? raw.current_period_end : null,
    auto_renew: Boolean(raw.auto_renew),
    cancelled_at: typeof raw.cancelled_at === "string" ? raw.cancelled_at : null,
    modules,
  };
}

// Módulos com direito vigente (ativos ou agendados para remoção até o fim do período).
export function activeModuleIds(subscription: SubscriptionInfo): string[] {
  if (subscription.status !== "active" && subscription.status !== "cancelled") return [];
  return subscription.modules.filter((m) => m.status === "active").map((m) => m.module_id);
}

export const DELETE_CONFIRM_WORD = "EXCLUIR";
