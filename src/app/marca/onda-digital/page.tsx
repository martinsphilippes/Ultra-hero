import type { Metadata } from "next";
import { Check, Mail, MessageCircle } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-universe/BrandLogo";
import { OndaCaseList, OndaProfileGrid } from "@/components/onda-digital/OndaLists";
import { OndaRequestButton, OndaRequestProvider } from "@/components/onda-digital/OndaRequest";
import {
  OndaBlock,
  OndaPill,
  OndaWindow,
  Sticker,
  hl,
  hlPink,
  hlPurple,
  ondaButtonCream,
  ondaButtonPink,
  strong,
} from "@/components/onda-digital/primitives";
import { EmptyState } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate, formatPlainDate } from "@/i18n/format";
import { requireBrand } from "@/lib/brand-portal/server";
import {
  GROSCOVE_EMAIL,
  GROSCOVE_WHATSAPP_LABEL,
  ONDA_AREAS,
  ONDA_PURPOSES,
  ONDA_STEPS,
  ondaStepIndex,
  orderCasesForCategory,
  whatsappHref,
} from "@/lib/onda-digital/format";
import { listBrandOndaRequests, loadOndaContent } from "@/lib/onda-digital/queries";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ondaDigital.meta");
  return { title: t("title") };
}

const PACKAGE_TONES = ["bg-[#ffd84d]", "bg-[#ff7f73]", "bg-[#ff9fb2]", "bg-[#7fe6d8]"];
const STEP_TONES = ["bg-[#ffd84d]", "bg-[#ff9fb2]", "bg-[#7fe6d8]", "bg-[#ff7f73]"];
const FRONT_LABELS = ["memes", "news", "x", "portal", "creator"] as const;

// Onda Digital (0132): o produto da Groscove explicado para a marca, com os textos da apresentação, e o pedido
// "Quero entrar na onda" (vira negócio no funil da Groscove).
export default async function OndaDigitalPage() {
  const ctx = await requireBrand();
  const [t, locale, content, requests, supabase] = await Promise.all([
    getTranslations("ondaDigital"),
    getLocale() as Promise<Locale>,
    loadOndaContent(),
    listBrandOndaRequests(ctx.brand.id),
    createClient(),
  ]);
  if (!content) {
    return (
      <div className="rounded-2xl border border-border bg-surface">
        <EmptyState title={t("meta.title")} />
      </div>
    );
  }
  const { data: brandRow } = await supabase.from("brands").select("category").eq("id", ctx.brand.id).maybeSingle();
  const category = (brandRow?.category as string | null | undefined) ?? null;
  const instagram = content.profiles.filter((p) => p.network === "instagram");
  const x = content.profiles.filter((p) => p.network === "x");
  const cases = orderCasesForCategory(content.cases, category);
  const pkgName = (slug: string | null) => content.packages.find((p) => p.slug === slug)?.name ?? t("agency.noPackage");
  const brandName = ctx.brand.name;
  const wa = whatsappHref(t("request.whatsappText", { brand: brandName, package: "none" }));

  return (
    <OndaRequestProvider
      brandId={ctx.brand.id}
      brandName={brandName}
      canRequest={Boolean(ctx.role)}
      packages={content.packages.map((p) => ({ slug: p.slug, name: p.name, scope: p.scope }))}
      profiles={content.profiles.map((p) => ({ id: p.id, network: p.network, handle: p.handle }))}
    >
      <div className="flex flex-col gap-6 pb-6" data-testid="onda-digital">
        {/* Tela 1 — topo */}
        <OndaBlock tone="blue" labelledBy="onda-title" className="pb-40 sm:pb-12">
          <Sticker src="estrela-amarela" className="right-4 top-4 w-12 sm:w-16" />
          <Sticker src="sereia" className="bottom-0 right-2 w-28 sm:right-6 sm:w-40" />
          <p className="inline-block rounded-full border-2 border-[#0c0c20] bg-[#fff6ea] px-3 py-1 text-sm font-extrabold text-[#0c0c20]">{t("hero.eyebrow")}</p>
          <h1 id="onda-title" className="mt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/onda-digital/wordmark.webp" alt={t("hero.title")} className="w-full max-w-md" width={1400} height={849} />
          </h1>
          <OndaWindow bar="pink" className="mt-5 max-w-xl bg-[#ff7f73]" bodyClassName="flex flex-col gap-2">
            <p className="text-lg font-extrabold leading-snug sm:text-xl">{t("hero.lead")}</p>
            <p className="text-base">{t("hero.text")}</p>
          </OndaWindow>
          <div className="relative z-10 mt-6 flex flex-wrap gap-3">
            <OndaRequestButton testId="onda-cta-top">{t("hero.cta")}</OndaRequestButton>
            <a href="#como-funciona" className={ondaButtonCream}>
              {t("hero.how")}
            </a>
          </div>
        </OndaBlock>

        {/* Seus pedidos (a marca acompanha o andamento) */}
        {requests.length > 0 ? (
          <section id="pedidos" aria-labelledby="onda-mine" className="scroll-mt-20 rounded-3xl border-2 border-[#0c0c20] bg-[#fff6ea] p-4 text-[#0c0c20] sm:p-6" data-testid="onda-my-requests">
            <h2 id="onda-mine" className="text-xl font-extrabold">
              {t("mine.title")}
            </h2>
            <ul className="mt-4 flex flex-col gap-4">
              {requests.map((r) => {
                const step = ondaStepIndex(r.status);
                return (
                  <li key={r.id} className="rounded-2xl border-2 border-[#0c0c20] bg-white p-4 shadow-[4px_4px_0_#0c0c20]">
                    <p className="font-extrabold">{pkgName(r.package)}</p>
                    <p className="text-sm">
                      {t(`purposes.${r.purpose}`)} ·{" "}
                      {r.when_kind === "now"
                        ? t("mine.whenNow")
                        : r.when_kind === "date" && r.when_date
                          ? t("mine.whenDate", { date: formatPlainDate(r.when_date, locale) })
                          : t("mine.whenTbd")}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-[#3d3d55]">{r.subject}</p>
                    {r.status === "closed" ? (
                      <p className="mt-3 text-sm font-semibold">{t("mine.closed")}</p>
                    ) : (
                      <ol className="mt-3 flex flex-wrap items-center gap-2" aria-label={t("agency.status")}>
                        {ONDA_STEPS.map((s, i) => (
                          <li
                            key={s}
                            aria-current={i === step ? "step" : undefined}
                            className={cn(
                              "inline-flex min-h-8 items-center gap-1 rounded-full border-2 px-3 text-xs font-bold",
                              i < step && "border-[#0c0c20] bg-[#7fe6d8]",
                              i === step && "border-[#0c0c20] bg-[#ffd84d]",
                              i > step && "border-[#0c0c20]/30 text-[#0c0c20]/60",
                            )}
                          >
                            {i < step ? <Check className="size-3.5" aria-hidden="true" /> : null}
                            {t(`statuses.${s}`)}
                          </li>
                        ))}
                      </ol>
                    )}
                    <p className="mt-2 text-xs text-[#3d3d55]">{t("mine.sentOn", { date: formatDate(r.created_at, locale) })}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {/* Tela 2 — por que funciona */}
        <OndaBlock tone="coral" labelledBy="onda-why">
          <Sticker src="concha-amarela" className="-bottom-3 -left-3 w-20 sm:w-24" />
          <h2 id="onda-why" className="max-w-2xl text-2xl font-extrabold leading-tight text-[#2a1040] sm:text-4xl">
            {t("why.line1")}
          </h2>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <OndaWindow bar="pink" className="bg-white">
              <p className="text-lg font-extrabold">{t("why.line2")}</p>
            </OndaWindow>
            <OndaWindow bar="purple" className="bg-[#3a14c9] text-white" bodyClassName="flex flex-col gap-2 text-white">
              <p className="text-lg font-extrabold">{t("why.question")}</p>
              <p className="text-2xl font-extrabold leading-tight">{t.rich("why.answer", { hl })}</p>
              <p className="text-sm">{t("why.formula")}</p>
            </OndaWindow>
          </div>
          <p className="mt-6 pl-20 text-xl font-extrabold text-[#2a1040] sm:pl-24 sm:text-2xl">{t.rich("why.tide", { hl: hlPurple })}</p>
        </OndaBlock>

        {/* Tela 3 — o que é */}
        <OndaBlock tone="cream" labelledBy="onda-what">
          <Sticker src="estrela-branca" className="right-3 top-3 w-12 sm:w-16" />
          <h2 id="onda-what" className="sr-only">
            {t("hero.title")}
          </h2>
          <div className="flex flex-col gap-5">
            <OndaWindow bar="teal" className="max-w-xl">
              <p className="text-xl font-extrabold leading-snug">{t("what.line1")}</p>
            </OndaWindow>
            <OndaWindow bar="purple" className="max-w-xl self-center bg-[#3a14c9]" bodyClassName="text-white">
              <p className="text-2xl font-extrabold leading-tight">{t("what.line2")}</p>
            </OndaWindow>
            <OndaWindow bar="pink" className="max-w-xl self-end bg-[#ffd84d]">
              <p className="text-xl font-extrabold leading-snug">{t("what.line3")}</p>
            </OndaWindow>
          </div>
          <p className="mt-8 text-center text-3xl font-extrabold text-[#0b6f87] sm:text-4xl">{t("what.wave")}</p>
          <p className="mx-auto mt-2 max-w-xl text-center text-base">{t("hero.text")}</p>
        </OndaBlock>

        {/* Tela 4 — como funciona */}
        <OndaBlock tone="purple" id="como-funciona" labelledBy="onda-how">
          <Sticker src="pente" className="right-4 top-4 w-14 sm:w-20" />
          <h2 id="onda-how" className="text-3xl font-extrabold sm:text-4xl">
            {t("how.title")}
          </h2>
          <ol className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((n, i) => (
              <li key={n} className={cn("flex flex-col gap-2 border-2 border-[#0c0c20] p-4 text-[#0c0c20] shadow-[5px_5px_0_#0c0c20]", STEP_TONES[i])}>
                <span className="flex size-9 items-center justify-center rounded-full border-2 border-[#0c0c20] bg-white text-lg font-extrabold">{n}</span>
                <h3 className="text-lg font-extrabold leading-tight">{t(`how.s${n}Title`)}</h3>
                <p className="text-sm">{t(`how.s${n}Text`)}</p>
              </li>
            ))}
          </ol>
        </OndaBlock>

        {/* Tela 5 — veja a sua marca na onda (simulação) */}
        <OndaBlock tone="navy" labelledBy="onda-sim">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="onda-sim" className="text-2xl font-extrabold sm:text-3xl">
              {t("simulation.title")}
            </h2>
            <span className="rounded-full border-2 border-[#0c0c20] bg-[#ffd84d] px-3 py-1 text-xs font-extrabold text-[#0c0c20]">{t("simulation.label")}</span>
          </div>
          <p className="mt-2 text-base">{t("simulation.text", { brand: brandName })}</p>
          <ul className="-mx-4 mt-5 flex snap-x gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0" aria-hidden="true">
            {FRONT_LABELS.map((f) => (
              <li key={f} className="w-40 shrink-0 snap-start sm:w-auto">
                <div className="flex flex-col overflow-hidden rounded-[20px] border-[3px] border-[#0c0c20] bg-white text-[#0c0c20] shadow-[4px_4px_0_#0c0c20]">
                  <div className="flex items-center justify-between bg-[#0c0c20] px-3 py-1 text-[10px] font-bold text-white">
                    <span>{t("simulation.time")}</span>
                    <span className="truncate">{t(`simulation.fronts.${f}`)}</span>
                  </div>
                  <div className="flex flex-col items-center gap-2 p-3 motion-safe:animate-onda-pop">
                    <BrandLogo name={brandName} url={ctx.brand.logoUrl} size="lg" />
                    <p className="text-center text-xs font-bold leading-snug">{t("simulation.post", { brand: brandName })}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </OndaBlock>

        {/* Tela 6 — as frentes */}
        <OndaBlock tone="cream" labelledBy="onda-fronts">
          <h2 id="onda-fronts" className="text-2xl font-extrabold sm:text-4xl">
            {t("fronts.title")}
          </h2>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            <OndaWindow bar="yellow" className="bg-[#ffd84d]" bodyClassName="flex flex-col gap-1">
              <h3 className="text-2xl font-extrabold">{t("fronts.press.title")}</h3>
              <p>{t("fronts.press.text")}</p>
            </OndaWindow>
            <OndaWindow bar="pink" className="bg-[#ff9fb2]" bodyClassName="flex flex-col gap-1">
              <h3 className="text-2xl font-extrabold">{t("fronts.pages.title")}</h3>
              <p>{t("fronts.pages.text")}</p>
            </OndaWindow>
            <OndaWindow bar="teal" className="bg-[#7fe6d8]" bodyClassName="flex flex-col gap-2">
              <h3 className="text-2xl font-extrabold">{t("fronts.creators.title")}</h3>
              <p>{t("fronts.creators.text")}</p>
              <Link href="/marca/herois" className={cn(ondaButtonCream, "mt-1 min-h-11 self-start px-4 text-sm")}>
                {t("fronts.creators.cta")}
              </Link>
            </OndaWindow>
          </div>

          {/* Páginas */}
          <div className="relative mt-10">
            <Sticker src="lupa" className="right-0 -top-4 w-10 sm:w-14" />
            <OndaPill as="h3">{t("fronts.pages.list")}</OndaPill>
            <div className="mt-6">
              <OndaProfileGrid profiles={instagram} locale={locale} moreLabel={t("fronts.pages.more", { count: instagram.length })} testId="onda-pages" />
            </div>
            <p className="mt-4 text-xs text-[#3d3d55]">{t("fronts.pages.note")}</p>
          </div>
        </OndaBlock>

        {/* Onda X */}
        <OndaBlock tone="yellow" labelledBy="onda-x">
          <div className="grid gap-5 md:grid-cols-2">
            <OndaWindow bar="purple" className="bg-white">
              <p className="text-lg font-extrabold leading-snug">{t("fronts.x.intro")}</p>
            </OndaWindow>
            <OndaWindow bar="pink" className="bg-[#fff6ea]" bodyClassName="flex flex-col gap-2">
              <h2 id="onda-x" className="text-3xl font-extrabold">
                {t("fronts.x.title")}
              </h2>
              <p className="text-lg font-bold">{t("fronts.x.text")}</p>
              <p className="text-base font-extrabold text-[#f0185f]">{t("fronts.x.fast")}</p>
            </OndaWindow>
          </div>
          <div className="mt-8 rounded-3xl border-2 border-[#0c0c20] bg-[#fff6ea] p-4 sm:p-6">
            <OndaPill as="h3">{t("fronts.x.list")}</OndaPill>
            <div className="mt-6">
              <OndaProfileGrid profiles={x} locale={locale} moreLabel={t("fronts.x.more", { count: x.length })} testId="onda-x-profiles" />
            </div>
            <p className="mt-4 text-xs text-[#3d3d55]">{t("fronts.x.note")}</p>
          </div>
        </OndaBlock>

        {/* Imprensa */}
        <OndaBlock tone="cream" labelledBy="onda-press">
          <Sticker src="nota" className="right-4 top-4 w-10 sm:w-14" />
          <OndaPill id="onda-press">{t("fronts.press.heading")}</OndaPill>
          <dl className="mt-6 grid gap-x-8 gap-y-4 md:grid-cols-2" data-testid="onda-portals">
            {ONDA_AREAS.map((area) => {
              const names = content.portals.filter((p) => p.area === area).map((p) => p.name);
              if (names.length === 0) return null;
              return (
                <div key={area} className="border-t-2 border-[#0c0c20] pt-3">
                  <dt className="text-lg font-extrabold text-[#f0185f]">{t(`areas.${area}`)}</dt>
                  <dd className="text-base">{names.join(" · ")}</dd>
                </div>
              );
            })}
          </dl>
          <OndaWindow bar="pink" className="mt-8 max-w-xl bg-white">
            <p className="text-lg font-extrabold">{t("fronts.press.mass")}</p>
          </OndaWindow>
        </OndaBlock>

        {/* Tela 7 — o tamanho da onda */}
        <OndaBlock tone="pink" labelledBy="onda-size">
          <div className="grid items-center gap-6 md:grid-cols-2">
            <OndaWindow bar="pink" className="bg-white">
              <h2 id="onda-size" className="text-3xl font-extrabold leading-tight">
                {t.rich("size.impacts", { hl: hlPurple })}
              </h2>
            </OndaWindow>
            <p className="text-2xl font-extrabold">{t("size.fastest")}</p>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <div className="flex flex-col justify-center border-2 border-[#0c0c20] bg-[#1295b9] p-5 text-white shadow-[5px_5px_0_#0c0c20]">
              <h3 className="text-3xl font-extrabold">{t("size.compareTitle")}</h3>
            </div>
            <div className="flex flex-col gap-4">
              <p className="rounded-2xl border-2 border-[#0c0c20] bg-[#fff6ea] p-4 text-[#0c0c20] shadow-[4px_4px_0_#0c0c20]">{t.rich("size.veja", { b: strong })}</p>
              <div className="rounded-2xl border-2 border-[#0c0c20] bg-[#ffe1e6] p-4 text-[#0c0c20] shadow-[4px_4px_0_#0c0c20]">
                <p>{t.rich("size.vejaDigital", { b: strong })}</p>
                <p className="mt-1 text-xs">{t("size.source")}</p>
              </div>
            </div>
          </div>
          <OndaWindow bar="pink" className="mt-8 bg-[#fff6ea]">
            <p className="text-center text-2xl font-extrabold leading-tight sm:text-3xl">{t.rich("size.onePage", { hl: hlPink })}</p>
          </OndaWindow>
        </OndaBlock>

        {/* Tela 8 — diferença para influenciadores */}
        <OndaBlock tone="yellow" labelledBy="onda-diff">
          <h2 id="onda-diff" className="text-2xl font-extrabold sm:text-4xl">
            {t("influencer.title")}
          </h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <OndaWindow bar="pink" className="bg-[#ff7f73]" bodyClassName="flex flex-col gap-2">
              <h3 className="text-2xl font-extrabold">{t("influencer.influencer")}</h3>
              <ul className="flex flex-col gap-1 text-lg">
                {(["personal", "association", "analysis", "match"] as const).map((k) => (
                  <li key={k}>{t(`influencer.${k}`)}</li>
                ))}
              </ul>
            </OndaWindow>
            <OndaWindow bar="purple" className="bg-[#3a14c9]" bodyClassName="flex flex-col gap-2 text-white">
              <h3 className="text-2xl font-extrabold">{t("influencer.onda")}</h3>
              <ul className="flex flex-col gap-1 text-lg">
                {(["instant", "impersonal", "noAssociation"] as const).map((k) => (
                  <li key={k}>{t(`influencer.${k}`)}</li>
                ))}
              </ul>
            </OndaWindow>
          </div>
        </OndaBlock>

        {/* Tela 9 — ideal para */}
        <OndaBlock tone="pink" labelledBy="onda-ideal">
          <Sticker src="concha-amarela" className="-right-4 bottom-4 hidden w-28 sm:block" />
          <OndaPill id="onda-ideal">{t("ideal.title")}</OndaPill>
          <ul className="mt-6 flex max-w-2xl flex-col divide-y divide-white/40 border-y border-white/40">
            {ONDA_PURPOSES.map((p) => (
              <li key={p} className="flex items-start gap-3 py-3 text-xl font-bold">
                <Check className="mt-1 size-5 shrink-0 text-[#ffd84d]" aria-hidden="true" />
                {t(`purposes.${p}`)}
              </li>
            ))}
          </ul>
          <OndaWindow bar="yellow" className="mt-8 max-w-xl bg-[#ffd84d]">
            <p className="text-xl font-extrabold leading-snug">{t("ideal.closing")}</p>
          </OndaWindow>
        </OndaBlock>

        {/* Tela 10 — cases */}
        <OndaBlock tone="coral" labelledBy="onda-cases">
          <Sticker src="estrela-branca" className="right-4 top-4 w-10 sm:w-14" />
          <h2 id="onda-cases" className="text-3xl font-extrabold text-[#2a1040] sm:text-5xl">
            {t("cases.title")}
          </h2>
          <div className="mt-6">
            <OndaCaseList cases={cases} locale={locale} category={category} />
          </div>
        </OndaBlock>

        {/* Tela 11 — escolha a sua onda */}
        <OndaBlock tone="blue" id="ondas" labelledBy="onda-packages">
          <Sticker src="concha-rosa" className="right-3 top-3 w-14 sm:w-20" />
          <h2 id="onda-packages" className="text-3xl font-extrabold [text-shadow:0_2px_0_#0c0c20] sm:text-5xl">
            {t("packages.title")}
          </h2>
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" data-testid="onda-packages">
            {content.packages.map((p, i) => (
              <li key={p.slug} className={cn("flex flex-col gap-3 border-2 border-[#0c0c20] p-5 text-[#0c0c20] shadow-[5px_5px_0_#0c0c20]", PACKAGE_TONES[i % PACKAGE_TONES.length])}>
                <h3 className="text-2xl font-extrabold leading-tight">{p.name}</h3>
                <p className="text-base font-extrabold">{p.scope}</p>
                <p className="text-sm">{p.description}</p>
                <span className="mt-auto rounded-full border-2 border-[#0c0c20] bg-white px-4 py-2 text-center text-sm font-extrabold">{t("packages.price")}</span>
                <OndaRequestButton pkg={p.slug} className={cn(ondaButtonPink, "min-h-11 text-sm")}>
                  {t("packages.cta")}
                </OndaRequestButton>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <p className="text-lg font-extrabold [text-shadow:0_2px_0_#0c0c20]">{t("packages.help")}</p>
            <OndaRequestButton pkg="" className={ondaButtonCream}>
              {t("packages.helpCta")}
            </OndaRequestButton>
          </div>
        </OndaBlock>

        {/* Tela 12 — perguntas frequentes */}
        <OndaBlock tone="cream" labelledBy="onda-faq">
          <OndaPill id="onda-faq">{t("faq.title")}</OndaPill>
          <div className="mt-6 flex flex-col gap-3" data-testid="onda-faq">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <details key={n} className="group border-2 border-[#0c0c20] bg-white shadow-[4px_4px_0_#0c0c20] open:bg-[#fff2c4]">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-base font-extrabold">
                  {t(`faq.q${n}`)}
                  <span className="text-xl leading-none transition-transform group-open:rotate-45" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p className="px-4 pb-4 text-base">{t(`faq.a${n}`)}</p>
              </details>
            ))}
          </div>
        </OndaBlock>

        {/* Tela 13 — fim */}
        <OndaBlock tone="navy" labelledBy="onda-end" className="pb-24 sm:pb-10">
          <Sticker src="concha-rosa" className="bottom-3 right-3 w-16 sm:w-24" />
          <div className="grid items-center gap-6 md:grid-cols-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/onda-digital/wordmark.webp" alt="" aria-hidden="true" className="w-full max-w-sm" width={1400} height={849} loading="lazy" />
            <div className="flex flex-col gap-4">
              <h2 id="onda-end" className="text-3xl font-extrabold sm:text-4xl">
                {t("end.title")}
              </h2>
              <div className="flex flex-wrap gap-3">
                <OndaRequestButton testId="onda-cta-end">{t("end.cta")}</OndaRequestButton>
                <a href={wa} target="_blank" rel="noopener noreferrer" className={ondaButtonCream}>
                  <MessageCircle className="size-5" aria-hidden="true" />
                  {t("end.whatsapp")}
                </a>
              </div>
              <ul className="flex flex-col gap-1 text-base">
                <li className="flex items-center gap-2">
                  <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="text-[#ffd84d] underline">
                    {GROSCOVE_WHATSAPP_LABEL}
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <Mail className="size-4 shrink-0" aria-hidden="true" />
                  <a href={`mailto:${GROSCOVE_EMAIL}`} className="underline">
                    {GROSCOVE_EMAIL}
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <p className="mt-8 text-sm">
            <strong>{t("end.hello")}</strong> {t("end.about")}
          </p>
        </OndaBlock>
      </div>
    </OndaRequestProvider>
  );
}
