"use client";

import { FilePenLine, Send, ShieldAlert, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, Dialog, useToast } from "@/components/ui";
import { discardSponsorshipDraftAction, publishSponsorshipAction } from "@/lib/sponsorship/actions";
import { fichaLinks, publishBlock, type HeroInfo } from "@/lib/sponsorship/hero-pick";

type Props = { id: string; hero: HeroInfo };

// Rascunho da oportunidade (0095): as marcas e o Hero ainda não veem. Publicar exige o consentimento do Hero (o banco
// confere de novo); sem ele, o aviso e os atalhos da ficha e dos Documentos. Descartar cancela sem avisar ninguém.
export function SponsorshipDraftPanel({ id, hero }: Props) {
  const t = useTranslations("sponsorship.agency.draft");
  const tf = useTranslations("sponsorship.agency.form");
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const block = publishBlock({ consent: hero.consent }, hero.heroActive || !hero.hasHero);
  const links = fichaLinks(hero.talentId || null);

  function publish() {
    setError(null);
    start(async () => {
      const result = await publishSponsorshipAction({ id });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      router.refresh();
    });
  }
  function discard() {
    setError(null);
    start(async () => {
      const result = await discardSponsorshipDraftAction({ id });
      setConfirm(false);
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      router.push("/agencia/oportunidades");
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="sponsorship-draft" className="flex flex-col gap-3 rounded-2xl border border-info/40 bg-info-soft/40 p-4" data-testid="sponsorship-draft">
      <div className="flex flex-col gap-1">
        <h2 id="sponsorship-draft" className="flex items-center gap-2 text-base font-semibold text-fg">
          <FilePenLine className="size-4 text-info" aria-hidden="true" />
          {t("title")}
        </h2>
        <p className="type-body-sm text-fg-muted">{t("hint")}</p>
      </div>
      {block === "consent" ? (
        <div className="flex flex-col gap-2" role="status" data-testid="draft-consent-notice">
          <p className="flex items-start gap-2 type-body-sm text-fg">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <span>{tf("consentNotice")}</span>
          </p>
          {links ? (
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              <Link href={links.ficha} className="inline-flex min-h-11 items-center text-sm font-medium text-accent-text underline-offset-2 hover:underline" data-testid="draft-open-ficha">
                {tf("openFicha")}
              </Link>
              <Link href={links.documents} className="inline-flex min-h-11 items-center text-sm font-medium text-accent-text underline-offset-2 hover:underline">
                {tf("openDocuments")}
              </Link>
            </span>
          ) : null}
        </div>
      ) : null}
      {block === "inactive" ? <p className="type-body-sm text-danger">{t("inactive")}</p> : null}
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" size="lg" leadingIcon={<Send />} onClick={publish} disabled={pending || block !== null} data-testid="sponsorship-publish">
          {t("publish")}
        </Button>
        <Button type="button" size="lg" variant="ghost" leadingIcon={<Trash2 />} onClick={() => setConfirm(true)} disabled={pending} data-testid="sponsorship-discard">
          {t("discard")}
        </Button>
      </div>
      <Dialog
        open={confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(false);
        }}
        title={t("confirmTitle")}
        description={t("confirm")}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setConfirm(false)} disabled={pending}>
              {t("back")}
            </Button>
            <Button type="button" variant="danger" onClick={discard} disabled={pending}>
              {t("discard")}
            </Button>
          </div>
        }
      />
    </section>
  );
}
