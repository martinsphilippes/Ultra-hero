import type { Metadata } from "next";
import { ChevronRight, Info } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { DisconnectButton, ReduceCategoriesForm, RevokeConsentButton } from "@/components/me/devices/DeviceActions";
import { Badge, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { availableProviders, wearablesRealEnabled } from "@/lib/health/config";
import { BRAND_NAMES } from "@/lib/health/snapshot";
import { isHealthProvider } from "@/lib/health/types";
import { myConnections, myConsent } from "@/lib/health/user";
import { createClient } from "@/lib/supabase/server";
import { CONNECT_BRANDS } from "@/lib/wearables/catalog";
import { isDemoUser } from "@/lib/wearables/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("devices");
  return { title: t("metaTitle") };
}

const ERROR_KEYS = new Set(["generic", "demo", "unavailable", "denied", "state", "provider", "inUse", "noConsent"]);
const NATIVE_ONLY = new Set(["apple", "samsung", "google"]);
const linkClass = "inline-flex min-h-11 w-fit items-center gap-1 text-sm font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// Relógios e anéis (RF-07): conectar (só contas reais, só marcas ligadas no ambiente), ver o estado,
// desconectar e apagar, retirar categorias ou o consentimento inteiro. Contas demo continuam com o
// relógio simulado e não veem o fluxo. Com a chave desligada, tudo segue "Em breve".
export default async function DevicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("/profile/devices");
  const [t, tw, locale, search] = await Promise.all([getTranslations("devices"), getTranslations("wearables"), getLocale(), searchParams]);
  const errorKey = typeof search.erro === "string" && ERROR_KEYS.has(search.erro) ? search.erro : null;
  const header = <PageHeader title={t("title")} description={t("description")} backHref="/profile" backLabel={t("back")} />;
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  if (isDemoUser(user) || !wearablesRealEnabled()) {
    return (
      <div className="flex flex-col gap-6" data-testid="devices-page" data-state={isDemoUser(user) ? "demo" : "off"}>
        {header}
        <p role="note" className="flex items-start gap-2 rounded-2xl border border-border bg-surface p-5 type-body-sm text-fg">
          <Info className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
          {isDemoUser(user) ? t("demo") : t("off")}
        </p>
        <Link href="/profile" className={linkClass}>
          {t("back")}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const [consent, connections] = await Promise.all([myConsent(supabase), myConnections(supabase)]);
  if (consent === "unavailable" || connections === "unavailable") {
    return (
      <div className="flex flex-col gap-6" data-testid="devices-page" data-state="unavailable">
        {header}
        <p role="note" className="rounded-2xl border border-border bg-surface p-5 type-body-sm text-fg">
          {t("unavailable")}
        </p>
      </div>
    );
  }
  const available = new Set<string>(availableProviders());
  const connectedProviders = new Set(connections.filter((c) => c.status !== "revoked_by_provider").map((c) => c.provider));

  return (
    <div className="flex flex-col gap-6" data-testid="devices-page" data-state="on">
      {header}
      {errorKey ? (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 type-body-sm text-fg">
          {t(`errors.${errorKey}`)}
        </p>
      ) : null}

      <section aria-labelledby="devices-connected" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <h2 id="devices-connected" className="type-h3 text-fg">
          {t("connectedTitle")}
        </h2>
        {connections.length === 0 ? <p className="type-body-sm text-fg-muted">{t("noConnections")}</p> : null}
        <ul className="flex flex-col divide-y divide-border">
          {connections.map((c) => {
            const brand = isHealthProvider(c.provider) ? BRAND_NAMES[c.provider] : c.provider;
            const statusKey = ["pending", "active", "token_expired", "consent_outdated", "revoked_by_provider", "error"].includes(c.status) ? c.status : "error";
            return (
              <li key={c.id} className="flex flex-col gap-2 py-3" data-testid="device-connection" data-provider={c.provider} data-status={c.status}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="type-body font-semibold text-fg">{c.device_name || brand}</span>
                  <Badge variant={c.status === "active" ? "success" : "neutral"} size="sm">
                    {t(`status.${statusKey}`)}
                  </Badge>
                </div>
                <p className="type-caption text-fg-muted">
                  {t("connectedAt", { date: dateFmt.format(new Date(c.connected_at)) })}
                  {" · "}
                  {c.last_data_at ? t("lastData", { date: dateFmt.format(new Date(c.last_data_at)) }) : t("noDataYet")}
                </p>
                {c.status === "revoked_by_provider" ? <p className="type-caption text-fg">{t("revokedHint")}</p> : null}
                <div className="flex flex-wrap items-center gap-3">
                  {(c.status === "token_expired" || c.status === "revoked_by_provider" || c.status === "consent_outdated") && available.has(c.provider) ? (
                    <Link href={`/profile/devices/connect/${c.provider}`} prefetch={false} className={linkClass}>
                      {t("reconnect")}
                    </Link>
                  ) : null}
                  <DisconnectButton connectionId={c.id} brand={brand} />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="type-caption text-fg-muted">{t("historyNote")}</p>
      </section>

      <section aria-labelledby="devices-brands" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <h2 id="devices-brands" className="type-h3 text-fg">
          {t("brandsTitle")}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {CONNECT_BRANDS.map((brand) => {
            const canConnect = available.has(brand) && !connectedProviders.has(brand as never);
            return (
              <li key={brand}>
                {canConnect ? (
                  <Link
                    href={`/profile/devices/connect/${brand}`}
                    prefetch={false}
                    className="flex min-h-11 items-center gap-2 rounded-xl border border-accent/40 bg-surface-elevated px-3 py-2 hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    data-testid={`devices-connect-${brand}`}
                  >
                    <span className="text-sm font-semibold text-fg">{tw(`brands.${brand}`)}</span>
                    <span className="text-xs font-semibold text-accent-text">{t("connect")}</span>
                  </Link>
                ) : (
                  <span className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-elevated px-3 py-2">
                    <span className="text-sm font-semibold text-fg">{tw(`brands.${brand}`)}</span>
                    {connectedProviders.has(brand as never) ? null : (
                      <Badge variant="neutral" size="sm">
                        {NATIVE_ONLY.has(brand) ? t("nativeOnly") : t("soon")}
                      </Badge>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="devices-consent" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5" data-testid="devices-consent">
        <h2 id="devices-consent" className="type-h3 text-fg">
          {t("consentPanel.title")}
        </h2>
        {consent ? (
          <>
            <p className="type-caption text-fg-muted">{t("consentPanel.version", { version: consent.version, date: dateFmt.format(new Date(consent.grantedAt)) })}</p>
            {consent.outdated ? (
              <p role="status" className="rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 type-body-sm text-fg">
                {t("consentPanel.outdated")}
              </p>
            ) : null}
            <ReduceCategoriesForm granted={consent.categories} />
            <div>
              <RevokeConsentButton />
            </div>
          </>
        ) : (
          <p className="type-body-sm text-fg-muted">{t("consentPanel.none")}</p>
        )}
      </section>

      <Link href="/profile/today/about" className={linkClass}>
        {t("aboutLink")}
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
