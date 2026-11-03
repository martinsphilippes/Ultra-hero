import type { Metadata } from "next";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SponsorshipRespond } from "@/components/sponsorship/SponsorshipRespond";
import { SponsorshipFacts, SponsorshipStatusBadge } from "@/components/sponsorship/SponsorshipView";
import { Avatar, Button, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { getBrandContext } from "@/lib/brand-portal/server";
import { listBrandSponsorships } from "@/lib/sponsorship/queries";
import { brandCanRespond } from "@/lib/sponsorship/vocab";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("brandPortal.meta");
  return { title: t("sponsorship") };
}

type Props = { params: Promise<{ id: string }> };

// Oportunidade de patrocínio para a marca (0085): o que é, quando, onde, alcance e o que a marca recebe; "Quero
// patrocinar" (cria a campanha em rascunho e segue o fluxo normal) ou "Não tenho interesse". Sem valores.
export default async function BrandSponsorshipPage({ params }: Props) {
  const ctx = await getBrandContext();
  if (ctx.state !== "ok") return null;
  const { id } = await params;
  const [t, locale, list] = await Promise.all([getTranslations("sponsorship.brand"), getLocale() as Promise<Locale>, listBrandSponsorships(ctx.brand.id)]);
  const o = list.items.find((x) => x.id === id);
  if (!o) notFound();
  const can = brandCanRespond(o);
  const mine = o.myResponse;
  const statusHint = o.status === "expired" ? t("expiredHint") : o.status === "won" ? t("wonHint") : o.status === "closed" ? t("closedHint") : o.status === "cancelled" ? t("cancelledHint") : null;

  return (
    <div className="flex flex-col gap-5" data-testid="brand-sponsorship">
      <Link href="/marca/oportunidades" className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium text-accent-text underline-offset-2 hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("back")}
      </Link>
      <PageHeader title={o.title} description={t("offeredBy", { agency: o.agencyName })} actions={<SponsorshipStatusBadge status={o.status} />} />
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center gap-3">
          <Avatar src={o.talent.photoUrl} name={o.talent.name} size="md" alt="" />
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold text-fg">{o.talent.name}</span>
            {o.talent.inCatalog ? (
              <Link href={`/marca/creators/${o.talent.id}`} className="type-caption font-medium text-accent-text underline-offset-2 hover:underline">
                {t("seeCreator")}
              </Link>
            ) : null}
          </span>
        </div>
        <SponsorshipFacts o={o} timeZone={o.timezone} showDeadline={o.status === "open" || o.status === "expired"} />
        <p className="type-caption text-fg-muted">{t("noValues")}</p>
      </section>
      {statusHint ? <p className="rounded-xl border border-border bg-surface px-3 py-2 type-body-sm text-fg">{statusHint}</p> : null}
      {mine ? (
        <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4" data-testid="sponsorship-my-response">
          <p className="type-body-sm text-fg">
            {t(mine.response === "interested" ? "myInterest" : "myDecline", { name: mine.respondedLabel || "—", date: mine.respondedAt ? formatDateTime(mine.respondedAt, locale, o.timezone) : "" })}
          </p>
          {mine.message ? <p className="type-body-sm text-fg-muted">“{mine.message}”</p> : null}
          {mine.requestId ? (
            <Button asChild size="lg" variant="secondary" trailingIcon={<ArrowRight />} className="self-start">
              <Link href={`/marca/campanhas/${mine.requestId}`}>{t("openCampaign")}</Link>
            </Button>
          ) : null}
          {can.interested ? <p className="type-caption text-fg-muted">{t("changeToInterest")}</p> : null}
        </section>
      ) : null}
      {ctx.role && (can.interested || can.declined) ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <p className="type-body-sm text-fg-muted">{t("respondHint", { date: formatDateTime(o.respondBy, locale, o.timezone) })}</p>
          <SponsorshipRespond id={o.id} canInterest={can.interested} canDecline={can.declined} />
        </section>
      ) : !ctx.role && o.status === "open" ? (
        <p className="type-caption text-fg-muted">{t("readOnly")}</p>
      ) : null}
    </div>
  );
}
