import "server-only";
import { createClient } from "@/lib/supabase/server";
import { parseCartIssues, type CartIssue } from "@/components/commerce/lib/errors";
import { expectedToRpcArg, readDestinationCookie, readExpectedPrices, type ExpectedPrices } from "./cookies";

// Carregadores do comércio demonstrativo (sempre sob RLS do usuário da request).

export type CartProduct = {
  id: string;
  slug: string;
  title: string;
  image_url: string;
  price_cents_demo: number;
  availability: "available" | "unavailable";
  demo_stock: number | null;
  status: "draft" | "published" | "archived";
  moderation_status: "clear" | "hidden" | "suspended";
  seller: { id: string; slug: string; name: string; status: "pending" | "active" | "suspended" } | null;
};

export type CartLine = {
  product_id: string;
  quantity: number;
  added_at: string;
  /** null quando o produto deixou de ser visível (oculto/suspenso/arquivado). */
  product: CartProduct | null;
};

export type SellerGroup = {
  sellerId: string;
  sellerName: string;
  lines: CartLine[];
  subtotalCents: number;
};

export type Destination = {
  id: string;
  code: string;
  name: Record<string, string>;
  zone: "local" | "regional" | "national";
  description: Record<string, string> | null;
};

export type ShippingRule = { zone: string; base_cents: number; per_seller_cents: number; eta_days_min: number; eta_days_max: number; free_over_cents: number | null };

export type CartSnapshot = {
  lines: CartLine[];
  groups: SellerGroup[];
  subtotalCents: number;
  sellerCount: number;
  destinations: Destination[];
  destination: Destination | null;
  rule: ShippingRule | null;
  shippingCents: number | null;
  totalCents: number | null;
  issues: CartIssue[];
  expected: ExpectedPrices;
};

const CART_SELECT =
  "product_id, quantity, added_at, product:products(id, slug, title, image_url, price_cents_demo, availability, demo_stock, status, moderation_status, seller:seller_organizations(id, slug, name, status))";

export async function loadCartLines(): Promise<CartLine[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("cart_items").select(CART_SELECT).order("added_at", { ascending: true });
  return ((data ?? []) as unknown as CartLine[]).map((l) => ({ ...l, product: l.product ?? null }));
}

export function groupBySeller(lines: CartLine[]): SellerGroup[] {
  const map = new Map<string, SellerGroup>();
  for (const line of lines) {
    const sellerId = line.product?.seller?.id ?? "unknown";
    const sellerName = line.product?.seller?.name ?? "";
    const group = map.get(sellerId) ?? { sellerId, sellerName, lines: [], subtotalCents: 0 };
    group.lines.push(line);
    if (line.product) group.subtotalCents += line.product.price_cents_demo * line.quantity;
    map.set(sellerId, group);
  }
  return Array.from(map.values());
}

export async function loadDestinations(): Promise<Destination[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("demo_destinations").select("id, code, name, zone, description").eq("is_active", true).order("sort_order");
  return (data ?? []) as unknown as Destination[];
}

export async function loadShippingRule(zone: string): Promise<ShippingRule | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("demo_shipping_rules").select("zone, base_cents, per_seller_cents, eta_days_min, eta_days_max, free_over_cents").eq("zone", zone).maybeSingle();
  return (data as ShippingRule | null) ?? null;
}

// Cotação pela função SQL (mesma regra do checkout).
export async function quoteShipping(zone: string, sellerCount: number, subtotalCents: number): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quote_shipping", { p_zone: zone, p_seller_count: sellerCount, p_subtotal: subtotalCents });
  if (error || typeof data !== "number") return null;
  return data;
}

export async function validateCart(expected: ExpectedPrices): Promise<CartIssue[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cart_validate", { p_expected: expectedToRpcArg(expected) });
  if (error) return [];
  return parseCartIssues(data);
}

// Snapshot completo para /cart e /checkout.
export async function loadCartSnapshot(): Promise<CartSnapshot> {
  const [lines, destinations, destinationId, expected] = await Promise.all([loadCartLines(), loadDestinations(), readDestinationCookie(), readExpectedPrices()]);
  const groups = groupBySeller(lines);
  const sellerCount = groups.filter((g) => g.sellerId !== "unknown").length;
  const subtotalCents = groups.reduce((sum, g) => sum + g.subtotalCents, 0);
  const destination = destinations.find((d) => d.id === destinationId) ?? null;

  const [rule, shippingCents, issues] = await Promise.all([
    destination ? loadShippingRule(destination.zone) : Promise.resolve(null),
    destination && lines.length > 0 ? quoteShipping(destination.zone, sellerCount, subtotalCents) : Promise.resolve(null),
    lines.length > 0 ? validateCart(expected) : Promise.resolve([] as CartIssue[]),
  ]);

  return {
    lines,
    groups,
    subtotalCents,
    sellerCount,
    destinations,
    destination,
    rule,
    shippingCents,
    totalCents: shippingCents === null ? null : subtotalCents + shippingCents,
    issues,
    expected,
  };
}

// Avança a simulação de transporte antes de listar pedidos. Idempotente; falha silenciosa
// (se o grant estiver ausente, a lista continua funcionando).
export async function advanceTransportSimulation(): Promise<void> {
  const supabase = await createClient();
  let minutes = 10;
  try {
    const { data } = await supabase.rpc("public_settings");
    const raw = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>)["transport.minutes_per_step"] : undefined;
    if (typeof raw === "number" && raw >= 1 && raw <= 1440) minutes = Math.floor(raw);
  } catch {
    // mantém o padrão
  }
  try {
    await supabase.rpc("advance_simulated_transport", { p_minutes_per_step: minutes });
  } catch {
    // simulação é cortesia; nunca bloqueia a página
  }
}
