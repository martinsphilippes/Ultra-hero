import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge, PageHeader } from "@/components/ui";
import { DETAIL_SECTIONS, EXCLUDED_MANUAL, EXCLUDED_ON_DEMAND, EXCLUDED_REGULATED, metricsForModel, VENDOR_ONLY_BRANDS } from "@/lib/wearables/catalog";
import { loadWatchView, wantsExample } from "../view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.today.about");
  return { title: t("metaTitle") };
}

const linkClass = "font-semibold text-accent-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// "Sobre seus dados": regra do Hoje, o que o modelo (simulado) mede, o que cada marca não
// compartilha, as funções médicas reguladas que o app não lê e o que nunca entra por ser digitado.
export default async function TodayAboutPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = await searchParams;
  const example = wantsExample(search.exemplo);
  const path = example ? "/profile/today/about?exemplo=1" : "/profile/today/about";
  // Relógio conectado (chave ligada): o modelo real. Sem relógio (ou ainda sincronizando), a lista
  // do modelo do exemplo, rotulada "Exemplo".
  let view = await loadWatchView(path, example);
  if (view.kind === "connect" || view.kind === "syncing") view = await loadWatchView(path, true);
  const [t, tt, tw] = await Promise.all([getTranslations("me.today.about"), getTranslations("me.today"), getTranslations("wearables")]);
  if (view.kind === "connect" || view.kind === "syncing") return null;
  const snapshot = view.snapshot;
  const real = view.kind === "real";
  const measured = metricsForModel(snapshot.model);
  const backHref = view.kind === "example" && example ? "/profile/today?exemplo=1" : "/profile";

  return (
    <div className="flex flex-col gap-6" data-testid="today-about">
      <PageHeader title={t("title")} eyebrow={tt("title")} backHref={backHref} backLabel={tt("detail.back")} />
      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
        <p className="type-body max-w-prose text-fg">{real ? tt("real.aboutIntro", { device: snapshot.deviceName }) : t("intro")}</p>
        <p className="type-body-sm max-w-prose text-fg-muted">{t("rule")}</p>
      </section>

      <section aria-labelledby="about-model" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="about-model" className="type-h3 text-fg">
            {t("modelTitle", { device: snapshot.deviceName })}
          </h2>
          {real ? null : (
            <Badge variant="demo" size="sm">
              {view.kind === "demo" ? tt("demo.tag") : tt("example.tag")}
            </Badge>
          )}
        </div>
        <p className="type-caption text-fg-muted">{t("modelHidden")}</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          {DETAIL_SECTIONS.map((section) => {
            const items = measured.filter((d) => d.section === section);
            if (items.length === 0) return null;
            return (
              <div key={section} className="flex flex-col gap-1">
                <dt className="type-body-sm font-semibold text-fg">{tw(`sections.${section}`)}</dt>
                <dd className="type-caption text-fg-muted">{items.map((d) => tw(`metrics.${d.code}`)).join(" · ")}</dd>
              </div>
            );
          })}
        </dl>
      </section>

      <section aria-labelledby="about-vendor" className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
        <h2 id="about-vendor" className="type-h3 text-fg">
          {t("vendorTitle")}
        </h2>
        <p className="type-body-sm text-fg-muted">{t("vendorIntro")}</p>
        <ul className="flex list-disc flex-col gap-1 pl-5 type-body-sm text-fg">
          {VENDOR_ONLY_BRANDS.map((brand) => (
            <li key={brand}>{tw(`vendorOnly.${brand}`)}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="about-regulated" className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5" data-testid="about-regulated">
        <h2 id="about-regulated" className="type-h3 text-fg">
          {t("regulatedTitle")}
        </h2>
        <p className="type-body-sm text-fg-muted">{t("regulatedIntro")}</p>
        <ul className="flex list-disc flex-col gap-1 pl-5 type-body-sm text-fg">
          {EXCLUDED_REGULATED.map((key) => (
            <li key={key}>{tw(`regulated.${key}`)}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="about-ondemand" className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
        <h2 id="about-ondemand" className="type-h3 text-fg">
          {t("onDemandTitle")}
        </h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 type-body-sm text-fg">
          {EXCLUDED_ON_DEMAND.map((key) => (
            <li key={key}>{tw(`onDemand.${key}`)}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="about-manual" className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
        <h2 id="about-manual" className="type-h3 text-fg">
          {t("manualTitle")}
        </h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 type-body-sm text-fg">
          {EXCLUDED_MANUAL.map((key) => (
            <li key={key}>{tw(`manual.${key}`)}</li>
          ))}
        </ul>
      </section>

      {real ? (
        <section aria-labelledby="about-manage" className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5" data-testid="about-manage">
          <h2 id="about-manage" className="type-h3 text-fg">
            {tt("real.manageTitle")}
          </h2>
          <p className="type-body-sm max-w-prose text-fg">{tt("real.manageBody")}</p>
          <Link href="/profile/devices" className={linkClass}>
            {tt("real.devicesLink")}
          </Link>
        </section>
      ) : null}

      <section aria-labelledby="about-privacy" className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-5">
        <h2 id="about-privacy" className="type-h3 text-fg">
          {t("privacyTitle")}
        </h2>
        <p className="type-body-sm max-w-prose text-fg">
          {t.rich("privacyBody", {
            privacy: (chunks) => (
              <Link href="/legal/privacy" className={linkClass}>
                {chunks}
              </Link>
            ),
          })}
        </p>
        <p className="type-caption text-fg-muted">{tt("wellness")}</p>
      </section>
    </div>
  );
}
