import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.reset");
  return { title: t("title") };
}

// Exige a sessão de recuperação criada pelo link do e-mail.
export default async function ResetPasswordPage() {
  const [user, t] = await Promise.all([getUser(), getTranslations("auth.reset")]);

  if (!user) {
    return (
      <AuthCard title={t("title")}>
        <EmptyState
          icon={<KeyRound />}
          title={t("noSession")}
          action={
            <Button asChild variant="secondary">
              <Link href="/forgot-password">{t("requestNewLink")}</Link>
            </Button>
          }
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
