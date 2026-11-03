import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { OnboardingWizard } from "@/components/invites/OnboardingWizard";
import { Button, EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { isOnboardingKind, type OnboardingKind } from "@/lib/invitations/rules";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invites.onboarding");
  return { title: t("metaTitle") };
}

type Pending = { id: string; kind: OnboardingKind; agency: string | null };

// /primeiro-acesso (0091): o convidado de agência, marca, fornecedor ou profissional cria a empresa/perfil.
// Um passo em aberto por vez (o mais antigo); sem nenhum, explica e volta ao app.
export default async function FirstAccessPage() {
  await requireUser("/primeiro-acesso");
  const [t, supabase] = await Promise.all([getTranslations("invites.onboarding"), createClient()]);
  const { data } = await supabase.rpc("onboarding_pending");
  const items = (Array.isArray(data) ? data : [])
    .map((x) => x as { id?: string; kind?: string; agency?: string | null })
    .filter((x): x is Pending => typeof x.id === "string" && isOnboardingKind(x.kind));
  const current = items[0];
  return (
    <AuthCard title={t("title")} subtitle={current ? t("subtitle") : undefined}>
      {current ? (
        <div className="flex flex-col gap-4">
          <OnboardingWizard key={current.id} kind={current.kind} agencyName={current.agency} />
          {items.length > 1 ? <p className="type-caption text-fg-muted">{t("more", { count: items.length - 1 })}</p> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <EmptyState size="sm" title={t("noneTitle")} description={t("noneText")} />
          <Button asChild size="lg" block>
            <Link href="/">{t("goHome")}</Link>
          </Button>
        </div>
      )}
    </AuthCard>
  );
}
