import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { LoginForm } from "@/components/auth/LoginForm";
import { DemoAccess } from "@/components/demo/DemoAccess";
import { LOGIN_HOME, safeNext } from "@/lib/auth/safe-next";
import { getUser } from "@/lib/auth/session";
import { isAuthQueryError } from "@/lib/auth/types";

type SearchParams = Promise<{ next?: string; error?: string; demo?: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("title") };
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next: rawNext, error, demo } = await searchParams;
  const next = safeNext(rawNext, LOGIN_HOME);

  // Já autenticado: não faz sentido ver o login.
  const user = await getUser();
  if (user) redirect(next);

  const t = await getTranslations("auth.login");
  return (
    <div className="flex flex-col gap-4">
      <AuthCard title={t("title")} subtitle={t("subtitle")}>
        <LoginForm next={next} queryError={isAuthQueryError(error) ? error : undefined} />
      </AuthCard>
      {/* Contas de demonstração, uma por tipo de acesso: um toque e a pessoa entra. */}
      <DemoAccess from="login" failed={demo === "error"} />
    </div>
  );
}
