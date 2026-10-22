import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { DataTable, StatusBadge, type Column } from "@/components/admin";
import { Section } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { credentialsState } from "@/lib/recipes/credentials";
import { createClient } from "@/lib/supabase/server";
import { CredentialsDecision } from "./CredentialsDecision";

type RequestRow = { creator_id: string; text: string; updated_at: string; decision?: string | null };
type ProfileRow = { id: string; name: string; slug: string; credentials: string | null; credentials_approved_at: string | null };
type AuditRow = { resource_id: string | null; after_data: { approved?: boolean } | null; created_at: string };
type QueueRow = { creatorId: string; name: string; slug: string; text: string; updatedAt: string; state: "pending" | "approved" | "rejected" };

// Fila de credenciais do chef (P7) no /admin/creators: pedidos dos heróis com o texto, a situação e
// as decisões. O texto só chega ao perfil público (creator_profiles.credentials) quando aprovado.
export async function CredentialsQueue() {
  const [t, locale] = await Promise.all([getTranslations("recipes.admin.credentials"), getLocale()]);
  const supabase = await createClient();
  const query = (columns: string) => supabase.from("creator_credentials_requests").select(columns).order("updated_at", { ascending: false }).limit(100);
  let { data: requests, error } = await query("creator_id, text, updated_at, decision");
  // banco sem a 0032 (sem a coluna decision): a situação sai só da auditoria
  if (error) ({ data: requests, error } = await query("creator_id, text, updated_at"));
  // banco sem a 0027: a fila não aparece
  if (error) return null;
  const list = (requests ?? []) as unknown as RequestRow[];
  const ids = list.map((r) => r.creator_id);
  const [profilesRes, auditRes] = await Promise.all([
    ids.length ? supabase.from("creator_profiles").select("id, name, slug, credentials, credentials_approved_at").in("id", ids) : null,
    ids.length
      ? supabase.from("admin_audit").select("resource_id, after_data, created_at").eq("action", "creator.credentials").in("resource_id", ids).order("created_at", { ascending: false }).limit(500)
      : null,
  ]);
  const profiles = new Map(((profilesRes?.data ?? []) as ProfileRow[]).map((p) => [p.id, p]));
  const lastDecision = new Map<string, AuditRow>();
  for (const a of (auditRes?.data ?? []) as AuditRow[]) if (a.resource_id && !lastDecision.has(a.resource_id)) lastDecision.set(a.resource_id, a);
  const order = { pending: 0, rejected: 1, approved: 2 } as const;
  const rows: QueueRow[] = list
    .map((r) => {
      const profile = profiles.get(r.creator_id);
      return { creatorId: r.creator_id, name: profile?.name ?? r.creator_id, slug: profile?.slug ?? "", text: r.text, updatedAt: r.updated_at, state: credentialsState(r, profile, lastDecision.get(r.creator_id)) };
    })
    .sort((a, b) => order[a.state] - order[b.state]);
  const uiLocale = locale as Locale;

  const columns: Column<QueueRow>[] = [
    {
      key: "hero",
      header: t("hero"),
      cell: (r) => (
        <Link href={`/admin/creators/${r.creatorId}`} className="font-medium text-accent-text hover:underline">
          {r.name}
        </Link>
      ),
    },
    { key: "text", header: t("requested"), cell: (r) => <span className="whitespace-pre-line text-fg">{r.text}</span> },
    { key: "state", header: t("status"), cell: (r) => <StatusBadge status={r.state === "pending" ? "pending" : r.state === "approved" ? "approved" : "rejected"} label={r.state === "pending" ? t("pending") : r.state === "approved" ? t("approved") : t("rejected")} /> },
    { key: "updated", header: t("updated"), hideOnMobile: true, cell: (r) => <span className="text-fg-muted">{formatDateTime(r.updatedAt, uiLocale)}</span> },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => <CredentialsDecision creatorId={r.creatorId} name={r.name} text={r.text} canApprove={r.state !== "approved"} canReject={r.state !== "rejected"} />,
    },
  ];

  return (
    <Section id="credentials-queue" title={t("title")} description={t("description")}>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.creatorId} caption={t("caption")} emptyTitle={t("empty")} />
    </Section>
  );
}
