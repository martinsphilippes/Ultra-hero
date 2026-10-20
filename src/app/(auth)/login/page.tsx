import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { LoginForm } from "@/components/auth/LoginForm";
import { safeNext } from "@/lib/auth/safe-next";
import { getUser } from "@/lib/auth/session";
import { isAuthQueryError } from "@/lib/auth/types";

type SearchParams = Promise<{ next?: string; error?: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("title") };
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNext(rawNext);

  // Já autenticado: não faz sentido ver o login.
  const user = await getUser();
  if (user) redirect(next);

  const t = await getTranslations("auth.login");
  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <LoginForm next={next} queryError={isAuthQueryError(error) ? error : undefined} />
    </AuthCard>
  );
}
