import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StaffInviteAccept } from "@/components/project-room/StaffInviteAccept";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projectRoom.invite");
  return { title: t("title") };
}

// /projetos/convite?token=…: convite de staff externo (0110). Exige login com o MESMO e-mail do convite; o que o convite
// dá (a sala daquele projeto) só aparece depois do aceite e do NDA.
export default async function StaffInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const clean = typeof token === "string" ? token.trim().toLowerCase() : "";
  const user = await requireUser(clean ? `/projetos/convite?token=${encodeURIComponent(clean)}` : "/projetos/convite");
  const t = await getTranslations("projectRoom.invite");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("title")} description={t("description")} />
      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        {/^[0-9a-f]{64}$/.test(clean) ? <StaffInviteAccept token={clean} email={user.email ?? null} /> : <EmptyState title={t("missing")} description={t("missingHint")} />}
      </section>
    </div>
  );
}
