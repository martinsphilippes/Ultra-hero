import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { OnboardingWizard } from "@/components/invites/OnboardingWizard";
import { AgencyAccessPanel } from "@/components/team/AgencyAccessPanel";
import { HeroClaimStep } from "@/components/casting-open/HeroClaimStep";
import type { ClaimCandidate } from "@/lib/casting-open/actions";
import { BrandClaimStep } from "@/components/brand-universe/BrandClaimStep";
import type { BrandCandidate } from "@/lib/brand-universe/actions";
import { Clock } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { isWizardKind, type WizardKind } from "@/lib/invitations/rules";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invites.onboarding");
  return { title: t("metaTitle") };
}

type Pending = { id: string; kind: WizardKind; agency: string | null; source?: string };

// /primeiro-acesso (0091): o convidado de agência, marca, fornecedor ou profissional cria a empresa/perfil.
// 0103: também quem escolheu Hero, Marca ou Agência no cadastro (a escolha fica no banco; voltar aqui retoma).
// Um passo em aberto por vez (o mais antigo); sem nenhum, explica e volta ao app.
export default async function FirstAccessPage() {
  const user = await requireUser("/primeiro-acesso");
  const [t, supabase] = await Promise.all([getTranslations("invites.onboarding"), createClient()]);
  const { data } = await supabase.rpc("onboarding_pending");
  const items = (Array.isArray(data) ? data : [])
    .map((x) => x as { id?: string; kind?: string; agency?: string | null; source?: string })
    .filter((x): x is Pending => typeof x.id === "string" && isWizardKind(x.kind));
  const current = items[0];
  // 0125: agência por autosserviço vira pedido de acesso (só o admin da plataforma ainda cria agência aqui)
  const byRequest = current?.kind === "agency" && current.source === "self" ? (await supabase.rpc("onboarding_agency_by_request")).data !== false : false;
  // 0126: "É você?" — quem escolheu Hero e já existe no casting pede o próprio perfil em vez de criar outro
  const heroSelf = current?.kind === "hero" && current.source === "self";
  const claim = heroSelf ? ((await supabase.rpc("my_hero_claim")).data as { status?: string; talent?: string; agency?: string } | null) : null;
  const fullName = typeof user.user_metadata?.full_name === "string" ? (user.user_metadata.full_name as string) : "";
  const candidates = heroSelf && claim?.status !== "pending" && fullName.trim().length >= 4
    ? (((await supabase.rpc("hero_claim_candidates", { p_name: fullName })).data as ClaimCandidate[] | null) ?? [])
    : [];
  const th = heroSelf ? await getTranslations("heroClaim") : null;
  // 0129: "Você é da X?" — quem escolheu Marca vê as marcas do domínio do e-mail antes de cadastrar outra
  const brandSelf = current?.kind === "brand" && current.source === "self";
  const brandReq = brandSelf ? ((await supabase.rpc("my_brand_login_request")).data as { status?: string; brand?: string } | null) : null;
  const brandCandidates = brandSelf && brandReq?.status !== "pending" ? (((await supabase.rpc("brand_login_candidates", {})).data as BrandCandidate[] | null) ?? []) : [];
  const tb = brandSelf ? await getTranslations("brandUniverse.claim") : null;
  return (
    <AuthCard title={current?.source === "self" ? t("selfTitle") : t("title")} subtitle={current ? (current.kind === "hero" ? t("heroSubtitle") : t("subtitle")) : undefined}>
      {current ? (
        <div className="flex flex-col gap-4">
          {byRequest ? (
            <AgencyAccessPanel />
          ) : heroSelf && claim?.status === "pending" && th ? (
            <div className="flex items-start gap-3 rounded-2xl border-2 border-accent bg-accent-soft p-4" data-testid="hero-claim-pending">
              <Clock className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-fg">{th("pendingTitle")}</p>
                <p className="type-body-sm text-fg-muted">{th("pendingBody", { talent: claim.talent ?? "", agency: claim.agency ?? "" })}</p>
              </div>
            </div>
          ) : brandSelf && brandReq?.status === "pending" && tb ? (
            <div className="flex items-start gap-3 rounded-2xl border-2 border-accent bg-accent-soft p-4" data-testid="brand-claim-pending">
              <Clock className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-fg">{tb("pendingTitle")}</p>
                <p className="type-body-sm text-fg-muted">{tb("pendingBody", { brand: brandReq.brand ?? "" })}</p>
              </div>
            </div>
          ) : brandSelf && tb ? (
            <BrandClaimStep initial={brandCandidates} initialName={fullName}>
              {brandReq?.status === "rejected" ? <p className="type-body-sm text-fg-muted">{tb("rejected", { brand: brandReq.brand ?? "" })}</p> : null}
              <OnboardingWizard key={current.id} kind={current.kind} agencyName={current.agency} selfService />
            </BrandClaimStep>
          ) : heroSelf ? (
            <HeroClaimStep initial={candidates} initialName={fullName}>
              {claim?.status === "rejected" && th ? <p className="type-body-sm text-fg-muted">{th("rejected", { talent: claim.talent ?? "" })}</p> : null}
              <OnboardingWizard key={current.id} kind={current.kind} agencyName={current.agency} selfService />
            </HeroClaimStep>
          ) : (
            <OnboardingWizard key={current.id} kind={current.kind} agencyName={current.agency} selfService={current.source === "self"} />
          )}
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
