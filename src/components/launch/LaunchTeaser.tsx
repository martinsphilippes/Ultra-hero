import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ComingSoonCountdown } from "@/components/commerce/coming-soon/ComingSoonCountdown";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { Logo } from "@/components/layout/Logo";
import { LEGAL_PRIVACY_HREF, LEGAL_TERMS_HREF } from "@/components/legal/rich-tags";
import { INSTITUTIONAL_LOGIN_HREF, INSTITUTIONAL_PATH } from "@/lib/institutional/root";
import { launchDateLabel, resolveLaunchAt } from "@/lib/launch";
import type { LaunchLeadKind } from "@/lib/launch-leads";
import { haveAccessHref, isMarketingHost, marketingAppUrl, parseMarketingHosts, requestHost } from "@/lib/marketing-host";
import { LaunchLeadForm, type LaunchLeadTags } from "./LaunchLeadForm";
import "@/components/commerce/coming-soon/coming-soon.css";
import "./teaser.css";

type Props = {
  kind: LaunchLeadKind;
  tags: LaunchLeadTags;
  /** Tema sazonal da área institucional (0100), quando houver. */
  seasonal?: ReactNode;
};

export const INFLUENCER_TEASER_PATH = "/conheca/influenciador";

const delay = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

// Teaser oficial de lançamento (pedido do dono, 04/11): marketing de luxo, quase sem texto, que gera curiosidade e não
// explica o produto. Logo grande, uma frase, a contagem até o MESMO lançamento da loja (src/lib/launch.ts) e o
// formulário curto "Seja o primeiro a saber". A porta do influenciador traz 3 linhas a mais e o @ do Instagram. Não
// existe porta para empresas. Sempre escuro (teaser.css), nos dois temas; "reduzir movimento" desliga as animações.
export async function LaunchTeaser({ kind, tags, seasonal }: Props) {
  const [t, tl, headerStore] = await Promise.all([getTranslations("institutional"), getTranslations("legal.links"), headers()]);
  const opensAt = resolveLaunchAt();
  const serverNow = Date.now();
  const marketing = isMarketingHost(requestHost(headerStore), parseMarketingHosts());
  // no domínio do teaser não há /login: o "Já tenho acesso" vai ao app configurado (ou some)
  const accessHref = haveAccessHref({ marketing, appUrl: marketingAppUrl(), loginPath: INSTITUTIONAL_LOGIN_HREF });
  const homeHref = marketing ? "/" : INSTITUTIONAL_PATH;
  const date = launchDateLabel(opensAt);
  const year = new Date(serverNow).getFullYear();
  const influencer = kind === "influenciador";
  const title = influencer ? t("influencer.title") : t("teaser.title");
  // o ponto final vira o ponto laranja da marca
  const titleBody = title.endsWith(".") ? title.slice(0, -1) : title;

  return (
    <div className="uh-tz" data-kind={kind} data-testid="launch-teaser">
      <div aria-hidden="true" className="uh-tz-aura">
        <span className="uh-tz-grain" />
      </div>

      <header className="uh-tz-top">
        <LocaleSwitcher />
        {influencer ? (
          <Link href={homeHref} className="uh-tz-pill" aria-label={t("teaser.backLabel")} data-testid="teaser-back">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t("teaser.back")}
          </Link>
        ) : (
          <Link href={INFLUENCER_TEASER_PATH} className="uh-tz-pill" data-testid="teaser-influencer">
            {t("teaser.influencer")}
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </header>

      {seasonal ? <div className="mx-auto w-full max-w-[64rem] px-4 pt-3 empty:hidden">{seasonal}</div> : null}

      <main id="main" tabIndex={-1} className="uh-tz-main">
        <section aria-labelledby="tz-title" className="uh-tz-hero">
          <span className="uh-tz-logo uh-tz-in" style={delay(0)}>
            <Logo size="xl" />
          </span>
          <p className="uh-tz-eyebrow uh-tz-mono uh-tz-in" style={delay(500)}>
            {t("teaser.eyebrow", { date })}
          </p>
          {influencer ? (
            <p className="uh-tz-tag uh-tz-mono uh-tz-in" style={delay(600)}>
              {t("influencer.eyebrow")}
            </p>
          ) : null}
          <h1 id="tz-title" className="uh-tz-title" style={delay(700)}>
            {titleBody}
            {titleBody !== title ? (
              <span aria-hidden="true" className="uh-tz-dot">
                .
              </span>
            ) : null}
          </h1>
          {influencer ? (
            <ul aria-label={t("influencer.benefitsTitle")} className="uh-tz-benefits uh-tz-in" style={delay(900)}>
              <li>{t("influencer.benefits.brands")}</li>
              <li>{t("influencer.benefits.work")}</li>
              <li>{t("influencer.benefits.page")}</li>
            </ul>
          ) : null}
          <div className="uh-tz-countdown uh-tz-in" style={delay(influencer ? 1050 : 900)}>
            <h2 className="sr-only">{t("teaser.countdownTitle")}</h2>
            <ComingSoonCountdown opensAt={opensAt} serverNow={serverNow} ns="institutional.countdown" />
          </div>
        </section>

        <section aria-labelledby="tz-form-title" className="uh-tz-card uh-tz-in" style={delay(influencer ? 1200 : 1100)}>
          <h2 id="tz-form-title" className="uh-tz-card-title">
            {t("form.title")}
          </h2>
          <LaunchLeadForm kind={kind} tags={tags} />
        </section>
      </main>

      <footer className="uh-tz-foot">
        <nav aria-label={tl("nav")} className="uh-tz-foot-row">
          {accessHref ? (
            <a href={accessHref} className="uh-tz-link" data-testid="teaser-have-access">
              {t("teaser.haveAccess")}
            </a>
          ) : null}
          <Link href={LEGAL_TERMS_HREF} className="uh-tz-link">
            {tl("terms")}
          </Link>
          <Link href={LEGAL_PRIVACY_HREF} className="uh-tz-link">
            {tl("privacy")}
          </Link>
        </nav>
        <p className="uh-tz-rights uh-tz-mono">{t("teaser.rights", { year })}</p>
      </footer>
    </div>
  );
}
