import { NextResponse, type NextRequest } from "next/server";
import { getUser, hasRole } from "@/lib/auth/session";
import { csvFilename, parseIndicatorPeriod, parseIndicatorSection, sectionCsv } from "@/lib/indicators";
import { loadIndicatorSection } from "@/lib/indicators/load";

// CSV de uma seção dos Indicadores (0060): só agregados (nada de pessoa). Somente admin; a RPC
// também recusa quem não é admin.
export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user || !(await hasRole("admin"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const section = parseIndicatorSection(request.nextUrl.searchParams.get("secao"));
  const period = parseIndicatorPeriod(request.nextUrl.searchParams.get("days"));
  const result = await loadIndicatorSection(section, period);
  if (result.state === "missing") return NextResponse.json({ error: "indicators_unavailable" }, { status: 404 });
  if (result.state === "error") return NextResponse.json({ error: result.message ?? "error" }, { status: 500 });

  return new NextResponse(sectionCsv(section, result.data), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(section, period)}"`,
      "Cache-Control": "no-store",
    },
  });
}
