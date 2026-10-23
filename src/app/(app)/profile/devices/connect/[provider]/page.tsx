import type { Metadata } from "next";
import { Info } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { ConsentForm } from "@/components/me/devices/ConsentForm";
import { Button, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { providerReady } from "@/lib/health/config";
import { recentlyAuthenticated } from "@/lib/health/oauth";
import { providerCategories } from "@/lib/health/providers";
import { BRAND_NAMES } from "@/lib/health/snapshot";
import { isHealthProvider } from "@/lib/health/types";
import { consentText, myConsent } from "@/lib/health/user";
import { createClient } from "@/lib/supabase/server";
import { isDemoUser } from "@/lib/wearables/context";
import { reauthenticate } from "../../actions";

type Params = { provider: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { provider } = await params;
  const t = await getTranslations("devices.consent");
  return { title: isHealthProvider(provider) ? t("metaTitle", { brand: BRAND_NAMES[provider] }) : undefined };
}

// Tela de consentimento por categoria (RF-08, LGPD art. 11): o texto mostrado é o ARQUIVADO no
// servidor (versão e hash calculado lá), a idade mínima vem da configuração do banco (Q7) e o
// aceite exige login recente. Conta demo nunca chega aqui; marca desligada responde 404.
export default async function ConnectProviderPage({ params }: { params: Promise<Params> }) {
  const { provider } = await params;
  if (!isHealthProvider(provider)) notFound();
  const path = `/profile/devices/connect/${provider}`;
  const user = await requireUser(path);
  if (isDemoUser(user)) redirect("/profile/devices?erro=demo");
  if (!providerReady(provider)) notFound();

  const [t, locale] = await Promise.all([getTranslations("devices"), getLocale()]);
  const brand = BRAND_NAMES[provider];
  const supabase = await createClient();
  const [text, consent] = await Promise.all([consentText(supabase, locale), myConsent(supabase)]);
  const header = <PageHeader title={t("consent.title", { brand })} backHref="/profile/devices" backLabel={t("back")} />;
  if (!text || consent === "unavailable") {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="rounded-2xl border border-border bg-surface p-5 type-body-sm text-fg">{t("unavailable")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6" data-testid="consent-page" data-provider={provider}>
      {header}
      <p className="type-body max-w-prose text-fg">{t("consent.intro", { brand })}</p>

      {recentlyAuthenticated(user.last_sign_in_at) ? (
        <>
          <section aria-labelledby="consent-text-title" className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
            <h2 id="consent-text-title" className="type-h3 text-fg">
              {t("consent.textTitle")}
            </h2>
            <div className="max-h-80 overflow-y-auto rounded-xl bg-surface-elevated p-4 type-body-sm whitespace-pre-line text-fg" tabIndex={0} data-testid="consent-text">
              {text.body}
            </div>
            <p className="type-caption text-fg-muted">{t("consent.textVersion", { version: text.version })}</p>
          </section>
          <ConsentForm
            provider={provider}
            brand={brand}
            version={text.version}
            locale={text.locale}
            minAge={text.minAge}
            minAgePending={text.minAgeRulePending}
            categories={providerCategories(provider)}
            alreadyGranted={consent?.categories ?? []}
          />
        </>
      ) : (
        <section aria-labelledby="reauth-title" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5" data-testid="consent-reauth">
          <h2 id="reauth-title" className="type-h3 text-fg">
            {t("consent.reauthTitle")}
          </h2>
          <p className="type-body-sm max-w-prose text-fg">{t("consent.reauthBody")}</p>
          <form action={reauthenticate}>
            <input type="hidden" name="next" value={path} />
            <Button type="submit" variant="primary">
              {t("consent.reauthCta")}
            </Button>
          </form>
        </section>
      )}

      <p className="flex items-start gap-2 type-caption text-fg-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {t("consent.wellness")}
      </p>
    </div>
  );
}
