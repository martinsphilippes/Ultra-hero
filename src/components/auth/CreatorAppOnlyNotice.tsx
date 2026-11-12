import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Smartphone } from "lucide-react";
import { buttonBase, buttonSizes, buttonVariants } from "@/components/ui";
import { NATIVE_SCHEME } from "@/lib/native-app/surface";
import { cn } from "@/lib/utils";

/** Links oficiais das lojas, quando o app estiver publicado (variáveis de ambiente; sem elas os botões não aparecem). */
function storeLinks(): { appStore: string | null; playStore: string | null } {
  const valid = (value: string | undefined) => (value && /^https:\/\/(apps\.apple\.com|play\.google\.com)\//.test(value) ? value : null);
  return { appStore: valid(process.env.NEXT_PUBLIC_APP_STORE_URL), playStore: valid(process.env.NEXT_PUBLIC_PLAY_STORE_URL) };
}

// "O acesso de Creators é exclusivo pelo aplicativo Ultra Hero. Abra o app para continuar." (0141): botão que abre o app
// instalado (esquema próprio da casca, gchero://open?path=) e os links das lojas quando existirem.
export async function CreatorAppOnlyNotice({ backHref, backLabel }: { backHref: string; backLabel?: string }) {
  const t = await getTranslations("access.appOnly");
  const { appStore, playStore } = storeLinks();
  const primary = cn(buttonBase, buttonSizes.lg, buttonVariants.primary, "w-full");
  const secondary = cn(buttonBase, buttonSizes.lg, buttonVariants.secondary, "w-full");
  return (
    <div className="flex flex-col gap-3" data-testid="creator-app-only">
      <p className="rounded-xl border border-info/30 bg-info-soft p-3 text-sm font-medium text-fg" role="status" data-testid="creator-app-only-message">
        {t("message")}
      </p>
      <a href={`${NATIVE_SCHEME}://open?path=${encodeURIComponent("/heroi")}`} className={primary} data-testid="creator-app-open">
        <Smartphone className="size-5" aria-hidden="true" />
        {t("open")}
      </a>
      {appStore ? (
        <a href={appStore} className={secondary} rel="noopener noreferrer" data-testid="creator-app-store">
          {t("appStore")}
        </a>
      ) : null}
      {playStore ? (
        <a href={playStore} className={secondary} rel="noopener noreferrer" data-testid="creator-play-store">
          {t("playStore")}
        </a>
      ) : null}
      {!appStore && !playStore ? <p className="type-body-sm text-fg-muted">{t("noApp")}</p> : null}
      <Link href={backHref} className="mt-1 self-center text-sm font-semibold text-accent-text hover:underline">
        {backLabel ?? t("back")}
      </Link>
    </div>
  );
}
