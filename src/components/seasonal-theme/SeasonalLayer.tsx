"use client";

import { Eye, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { stopPreviewAction } from "@/lib/seasonal-theme/actions";
import { backgroundLayerStyle, buildSeasonCss } from "@/lib/seasonal-theme/css";
import type { DecorPosition, PublicSeasonTheme } from "@/lib/seasonal-theme/vocab";
import { DECOR_SIZE_PX, isSeasonExcludedPath, localized } from "@/lib/seasonal-theme/vocab";
import { isBlockedInNativeApp } from "@/lib/native-app/surface";

// Camada do tema sazonal (0100), montada pelos layouts das áreas (app, portais, entrada). Tudo por cima do template de
// Aparência: <style> com a lista fechada de --uh-*, fundo e decorativos ATRÁS do conteúdo (fixos, z negativo,
// aria-hidden, sem clique) — nunca cobrem texto nem botões e não mexem no layout (sem salto). Animação só sem
// "reduzir movimento". Checkout, carrinho, plano e pagamentos ficam sem tema (lista fixa), inclusive na navegação.

const POSITION: Record<DecorPosition, string> = {
  "top-left": "left-2 top-[calc(var(--spacing-topbar)+env(safe-area-inset-top,0px)+0.5rem)]",
  "top-right": "right-2 top-[calc(var(--spacing-topbar)+env(safe-area-inset-top,0px)+0.5rem)]",
  "bottom-left": "left-2 bottom-[calc(var(--spacing-bottomnav)+env(safe-area-inset-bottom,0px)+0.75rem)]",
  "bottom-right": "right-2 bottom-[calc(var(--spacing-bottomnav)+env(safe-area-inset-bottom,0px)+0.75rem)]",
};

type Props = { theme: PublicSeasonTheme; preview: { name: string; outOfArea: boolean } | null; native: boolean; locale: string };

export function SeasonalLayer({ theme, preview, native, locale }: Props) {
  const pathname = usePathname();
  const t = useTranslations("seasonalTheme.layer");
  const excluded = isSeasonExcludedPath(pathname);
  if (excluded && !preview) return null;

  const css = excluded ? "" : buildSeasonCss(theme.tokens, theme.animations, theme.background);
  const bgStyle = excluded ? null : backgroundLayerStyle(theme.background);
  const bannerText = localized(theme.banner.text, locale);
  const href = theme.banner.href;
  // app das lojas: nada que leve a compra (as rotas bloqueadas lá) nem para fora
  const showLink = Boolean(href) && !(native && (href!.startsWith("https://") || isBlockedInNativeApp(href!.split("?")[0])));
  const label = localized(theme.banner.label, locale) || t("bannerLink");

  return (
    <>
      {css ? <style data-season={theme.id} dangerouslySetInnerHTML={{ __html: css }} /> : null}
      {bgStyle ? (
        <div aria-hidden="true" className="uh-season-bg pointer-events-none fixed inset-0 -z-10 print:hidden" style={bgStyle} data-testid="season-background">
          {theme.background.type === "image" && theme.background.fit === "cover" ? <Image src={theme.background.url} alt="" fill sizes="100vw" className="object-cover" loading="lazy" /> : null}
        </div>
      ) : null}
      {!excluded && theme.decorations.length ? (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 print:hidden" data-testid="season-decorations">
          {theme.decorations.map((d, i) => {
            const px = DECOR_SIZE_PX[d.size];
            return (
              <span key={`${d.url}-${i}`} className={`uh-season-decor absolute ${POSITION[d.position]}`} style={{ width: px, height: px }}>
                <Image src={d.url} alt="" width={px} height={px} sizes={`${px * 2}px`} loading="lazy" className="h-full w-full object-contain" />
              </span>
            );
          })}
        </div>
      ) : null}
      {preview ? <PreviewPill name={preview.name} note={excluded ? t("previewExcluded") : preview.outOfArea ? t("previewOutOfArea") : null} /> : null}
      {!excluded && bannerText ? (
        // superfície opaca + véu do acento suave: decorativos e fundo nunca aparecem através do texto
        <div
          className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-fg print:hidden"
          style={{ backgroundImage: "linear-gradient(var(--uh-accent-soft), var(--uh-accent-soft))" }}
          role="note"
          data-testid="season-banner"
        >
          <span className="min-w-0 flex-1">{bannerText}</span>
          {showLink ? (
            href!.startsWith("https://") ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent-text underline-offset-2 hover:underline">
                {label}
              </a>
            ) : (
              <Link href={href!} className="font-semibold text-accent-text underline-offset-2 hover:underline">
                {label}
              </Link>
            )
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function PreviewPill({ name, note }: { name: string; note: string | null }) {
  const t = useTranslations("seasonalTheme.layer");
  const [pending, start] = useTransition();
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface px-3 py-2 text-sm print:hidden" data-testid="season-preview-pill">
      <Eye className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {t("previewing", { name })}
        {note ? <span className="block text-xs text-fg-muted">{note}</span> : null}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => void (await stopPreviewAction()))}
        className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 font-semibold text-fg hover:bg-surface-hover disabled:opacity-60"
      >
        <X className="size-4" aria-hidden="true" />
        {t("exitPreview")}
      </button>
    </div>
  );
}
