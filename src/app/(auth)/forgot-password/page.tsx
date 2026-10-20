import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { getUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.forgot");
  return { title: t("title") };
}

export default async function ForgotPasswordPage() {
  const user = await getUser();
  if (user) redirect("/");

  const t = await getTranslations("auth.forgot");
  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <ForgotPasswordForm />
    </AuthCard>
  );
}
