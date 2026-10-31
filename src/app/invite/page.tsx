import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { InviteAcceptCard } from "@/components/admin-ops/InviteAcceptCard";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button, EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";

type SearchParams = Promise<{ token?: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminOps.invite");
  return { title: t("title") };
}

// /invite?token=…: exige sessão (visitante volta ao login com next=/invite?token=…).
// O que será concedido só é revelado após o aceite (o token não é consultável pela API).
export default async function InvitePage({ searchParams }: { searchParams: SearchParams }) {
  const { token } = await searchParams;
  const clean = typeof token === "string" ? token.trim() : "";
  const next = clean ? `/invite?token=${encodeURIComponent(clean)}` : "/invite";
  const user = await requireUser(next);
  const t = await getTranslations("adminOps.invite");

  if (!clean) {
    return (
      <AuthCard title={t("title")}>
        <EmptyState
          size="sm"
          title={t("missingToken")}
          description={t("missingTokenDescription")}
          action={
            <Button asChild variant="secondary">
              <Link href="/">{t("goHome")}</Link>
            </Button>
          }
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-fg-muted">
        <li>{t("grantCreator")}</li>
        <li>{t("grantSeller")}</li>
        <li>{t("grantAgency")}</li>
        <li>{t("grantBrand")}</li>
      </ul>
      <InviteAcceptCard token={clean} email={user.email ?? null} />
    </AuthCard>
  );
}
