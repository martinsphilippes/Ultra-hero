import { NextResponse, type NextRequest } from "next/server";
import { getUser, hasRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// CSV de analytics_events agregado por dia + evento (sem ids de usuário). Somente admin.
export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user || !(await hasRole("admin"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const raw = Number.parseInt(request.nextUrl.searchParams.get("days") ?? "14", 10);
  const days = Number.isFinite(raw) ? Math.min(90, Math.max(1, raw)) : 14;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = await createClient();
  // RLS: admin lê analytics_events. Trazemos só data+nome e agregamos aqui (nada de PII).
  const totals = new Map<string, number>();
  const PAGE = 1000;
  for (let from = 0; from < 50_000; from += PAGE) {
    const { data, error } = await supabase
      .from("analytics_events")
      .select("event_name, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const row of data ?? []) {
      const key = `${row.created_at.slice(0, 10)},${row.event_name}`;
      totals.set(key, (totals.get(key) ?? 0) + 1);
    }
    if (!data || data.length < PAGE) break;
  }

  const lines = ["day,event_name,count", ...Array.from(totals.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => `${key},${count}`)];
  const body = `${lines.join("\n")}\n`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="groscove-ultra-events-${days}d.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
