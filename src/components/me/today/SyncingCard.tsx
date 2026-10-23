import { ChevronRight, RefreshCw } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { PROVIDERS } from "@/lib/health/providers";
import type { HealthProvider } from "@/lib/health/types";
import { MODEL_INFO } from "@/lib/wearables/catalog";

// Conexão feita, nenhum dado ainda (§6.3): "Sincronizando…". Nada de número inventado nem botão de
// atualizar — os dados chegam quando o relógio sincroniza com o app da marca.
export async function SyncingCard({ provider, deviceName }: { provider: HealthProvider; deviceName: string }) {
  const [t, tw] = await Promise.all([getTranslations("me.today.syncing"), getTranslations("wearables")]);
  const app = tw(`syncApps.${MODEL_INFO[PROVIDERS[provider].model].syncApp}`);
  return (
    <section aria-labelledby="today-syncing-title" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5" data-testid="today-syncing">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-accent-text">
          <RefreshCw className="size-5 motion-safe:animate-spin [animation-duration:3s]" />
        </span>
        <div className="flex flex-col gap-1" aria-live="polite">
          <h3 id="today-syncing-title" className="type-h3 text-fg">
            {t("title")}
          </h3>
          <p className="type-body-sm max-w-prose text-fg-muted">{t("body", { device: deviceName, app })}</p>
        </div>
      </div>
      <Link href="/profile/devices" prefetch={false} className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-semibold text-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        {t("devicesLink")}
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
