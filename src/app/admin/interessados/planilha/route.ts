import { NextResponse, type NextRequest } from "next/server";
import { getUser, hasRole } from "@/lib/auth/session";
import { launchLeadsCsv, launchLeadsCsvFilename, parseLaunchLeadsPage, parseLeadKindFilter, type LaunchLeadRow } from "@/lib/launch-leads";
import { createClient } from "@/lib/supabase/server";

// Planilha (CSV) dos interessados do teaser (0117). Somente admin; a RPC também recusa quem não é admin. Pagina de 1000
// em 1000 (teto de 50 mil linhas por arquivo, folgado para a lista de lançamento).
const PAGE = 1000;
const MAX_ROWS = 50_000;

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user || !(await hasRole("admin"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const kind = parseLeadKindFilter(request.nextUrl.searchParams.get("tipo"));
  const supabase = await createClient();
  const rows: LaunchLeadRow[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const { data, error } = await supabase.rpc("admin_launch_leads", { p_kind: kind, p_limit: PAGE, p_offset: offset });
    if (error) return NextResponse.json({ error: "launch_leads_unavailable" }, { status: 500 });
    const page = parseLaunchLeadsPage(data);
    rows.push(...page.rows);
    if (page.rows.length < PAGE) break;
  }
  return new NextResponse(launchLeadsCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${launchLeadsCsvFilename(kind)}"`,
      "Cache-Control": "no-store",
    },
  });
}
