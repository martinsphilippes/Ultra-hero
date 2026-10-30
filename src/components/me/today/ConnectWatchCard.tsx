import { ChevronRight, Eye, ShieldCheck, Watch } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, Button } from "@/components/ui";
import type { HealthProvider } from "@/lib/health/types";
import { CONNECT_BRANDS } from "@/lib/wearables/catalog";

// Conta real sem relógio. Com a chave desligada (padrão) nenhuma marca está ligada: nada de botão
// que finja conectar, só "Em breve" e um "Ver um exemplo" bem visível (relógio simulado em outra
// tela, rótulo "Exemplo"). Com WEARABLES_REAL_ENABLED=1, as marcas ligadas no ambiente viram
// "Conectar" (consentimento por categoria antes do OAuth); as que exigem app nativo seguem "Em breve".
export async function ConnectWatchCard({ headingLevel = "h3", providers = [] }: { headingLevel?: "h2" | "h3"; providers?: readonly HealthProvider[] }) {
  const [t, tw] = await Promise.all([getTranslations("me.today.connect"), getTranslations("wearables")]);
  const ta = await getTranslations("me.today");
  const Heading = headingLevel;
  const available = new Set<string>(providers);
  const anyAvailable = available.size > 0;
  return (
    <section aria-labelledby="connect-watch-title" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5" data-testid="connect-watch">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-accent-text">
          <Watch className="size-5" />
        </span>
        <div className="flex flex-col gap-1">
          <Heading id="connect-watch-title" className="type-h3 text-fg">
            {t("title")}
          </Heading>
          <p className="type-body-sm max-w-prose text-fg-muted">{anyAvailable ? t("bodyAvailable") : t("body")}</p>
        </div>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label={t("brandsLabel")}>
        {CONNECT_BRANDS.map((brand) =>
          available.has(brand) ? (
            <li key={brand}>
              <Link
                href={`/profile/devices/connect/${brand}`}
                prefetch={false}
                className="flex min-h-11 items-center gap-2 rounded-xl border border-accent/40 bg-surface-elevated px-3 py-2 hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                data-testid={`connect-brand-${brand}`}
              >
                <span className="text-sm font-semibold text-fg">{tw(`brands.${brand}`)}</span>
                <span className="text-xs font-semibold text-accent-text">{t("connectCta")}</span>
              </Link>
            </li>
          ) : (
            <li key={brand} className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-elevated px-3 py-2">
              <span className="text-sm font-semibold text-fg">{tw(`brands.${brand}`)}</span>
              <Badge variant="neutral" size="sm">
                {t("soon")}
              </Badge>
            </li>
          ),
        )}
      </ul>
      <p className="flex items-start gap-2 type-caption text-fg-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {anyAvailable ? t("privacyAvailable") : t("privacy")}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center native:hidden">
        <Button asChild variant="primary" size="lg" leadingIcon={<Eye />}>
          <Link href="/profile/today?exemplo=1" data-testid="watch-example-link">
            {t("exampleCta")}
          </Link>
        </Button>
        <span className="type-caption text-fg-muted">{t("exampleHint")}</span>
      </div>
      <div className="flex flex-wrap gap-x-4">
        <Link href="/profile/today/about" className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          {ta("aboutLink")}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
        {anyAvailable ? (
          <Link href="/profile/devices" prefetch={false} className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            {t("devicesLink")}
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}
