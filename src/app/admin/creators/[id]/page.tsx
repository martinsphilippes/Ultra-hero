import { Mail } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/admin";
import { CreatorForm } from "@/components/admin-ops/CreatorForm";
import { CreatorStatusButton } from "@/components/admin-ops/StatusActions";
import { Badge, Button, PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ id: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminOps.creators");
  return { title: t("editTitle") };
}

// Edição da personalidade + status (RPC auditada) + atalho para convidar o usuário.
export default async function EditCreatorPage({ params }: { params: Params }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const [t, tc, ts, tn, { data: creator, error }] = await Promise.all([
    getTranslations("adminOps.creators"),
    getTranslations("adminOps.common"),
    getTranslations("adminCommon.status"),
    getTranslations("nav"),
    supabase.from("creator_profiles").select("*").eq("id", id).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  if (!creator) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={creator.name}
        description={creator.headline ?? undefined}
        eyebrow={tn("admin.creators")}
        backHref="/admin/creators"
        backLabel={tn("admin.creators")}
        actions={
          <>
            <StatusBadge status={creator.status} label={ts(creator.status)} size="md" />
            <CreatorStatusButton id={creator.id} status={creator.status} />
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-elevated p-3 text-sm">
        {creator.is_fictional && <Badge variant="demo">{tc("fictional")}</Badge>}
        {creator.user_id ? (
          <Link href={`/admin/users/${creator.user_id}`} className="font-mono text-xs text-accent-text hover:underline">
            {creator.user_id}
          </Link>
        ) : (
          <span className="text-fg-muted">{tc("noUser")}</span>
        )}
        <Button asChild variant="secondary" size="sm" className="ml-auto">
          <Link href={`/admin/invitations?new=1&role=creator&creator=${creator.id}`}>
            <Mail className="size-4" aria-hidden="true" />
            {t("invite")}
          </Link>
        </Button>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-4 md:p-6">
        <CreatorForm
          id={creator.id}
          initial={{
            name: creator.name,
            slug: creator.slug,
            headline: creator.headline ?? "",
            bio: creator.bio ?? "",
            pillars: creator.pillars,
            avatarUrl: creator.avatar_url ?? "/placeholders/avatar-1.svg",
            coverUrl: creator.cover_url ?? "/placeholders/cover-routine-1.svg",
            isFictional: creator.is_fictional,
            rightsNote: creator.rights_note ?? "",
            sortOrder: creator.sort_order,
          }}
        />
      </div>
    </div>
  );
}
