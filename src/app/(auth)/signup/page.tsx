import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthAlert } from "@/components/auth/AuthAlert";
import { AuthCard } from "@/components/auth/AuthCard";
import { SignupForm } from "@/components/auth/SignupForm";
import { readExperimentOpen } from "@/lib/auth/experiment";
import { LOGIN_HOME, safeNext } from "@/lib/auth/safe-next";
import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{ next?: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signup");
  return { title: t("title") };
}

// Cadastro público: cria apenas consumidores. Com o kill switch "experiment.open" desligado,
// o banco só aceita convidados (ou bootstrap); o formulário continua disponível para eles.
export default async function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  const { next: rawNext } = await searchParams;
  const next = safeNext(rawNext, LOGIN_HOME);

  const user = await getUser();
  if (user) redirect(next);

  const [t, open] = await Promise.all([getTranslations("auth.signup"), createClient().then(readExperimentOpen)]);
  // Veio do link de convite (/invite?token=…): o cadastro segue liberado para o e-mail convidado.
  const fromInvitation = next === "/invite" || next.startsWith("/invite?");

  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      {!open && (
        <AuthAlert tone="info" className="mb-5">
          <span className="block font-semibold">{t("closedTitle")}</span>
          <span className="mt-0.5 block">{fromInvitation ? t("closedInvited") : t("closedDescription")}</span>
        </AuthAlert>
      )}
      <SignupForm next={next} />
    </AuthCard>
  );
}
