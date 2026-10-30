// Remessas (test_fulfillments): status, transições do admin e contagens (lógica pura).

export const FULFILLMENT_STATUSES = ["awaiting", "preparing", "ready_for_dispatch", "in_transit", "delivered", "cancelled", "failed"] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];
export type FulfillmentTarget = Exclude<FulfillmentStatus, "awaiting">;

/** Remessas que ainda dependem da operação (o que o painel do fornecedor mostrava). */
export const OPEN_FULFILLMENT_STATUSES = ["awaiting", "preparing", "ready_for_dispatch"] as const satisfies readonly FulfillmentStatus[];

// Transições permitidas ao admin (espelha fulfillment_transition no SQL, 0005): inclui as do
// fornecedor (aguardando → preparação → pronta, cancelar antes de expedir) e as do sistema.
export const ADMIN_FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, readonly FulfillmentTarget[]> = {
  awaiting: ["preparing", "cancelled"],
  preparing: ["ready_for_dispatch", "cancelled"],
  ready_for_dispatch: ["in_transit", "cancelled"],
  in_transit: ["delivered", "failed"],
  delivered: [],
  cancelled: [],
  failed: [],
};

export function isFulfillmentStatus(value: unknown): value is FulfillmentStatus {
  return typeof value === "string" && (FULFILLMENT_STATUSES as readonly string[]).includes(value);
}

export function adminTargetsFor(status: string): readonly FulfillmentTarget[] {
  return isFulfillmentStatus(status) ? ADMIN_FULFILLMENT_TRANSITIONS[status] : [];
}

/** Destrutivas pedem justificativa (vira a observação do evento e da auditoria). */
export function transitionNeedsJustification(to: FulfillmentTarget): boolean {
  return to === "cancelled" || to === "failed";
}

/** Conta linhas por status, só das chaves pedidas (as demais são ignoradas). */
export function countByStatus<K extends string>(rows: readonly { status: string }[] | null | undefined, keys: readonly K[]): Record<K, number> {
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  for (const row of rows ?? []) if ((keys as readonly string[]).includes(row.status)) out[row.status as K] += 1;
  return out;
}

/** Identificador curto exibido (#ABCD1234). */
export function shortShipmentId(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}
