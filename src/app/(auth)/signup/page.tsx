import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { SignupForm } from "@/components/auth/SignupForm";
import { safeNext } from "@/lib/auth/safe-next";
import { getUser } from "@/lib/auth/session";

type SearchParams = Promise<{ next?: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signup");
  return { title: t("title") };
}

// Cadastro público: cria apenas consumidores.
export default async function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  const { next: rawNext } = await searchParams;
  const next = safeNext(rawNext);

  const user = await getUser();
  if (user) redirect(next);

  const t = await getTranslations("auth.signup");
  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <SignupForm next={next} />
    </AuthCard>
  );
}
