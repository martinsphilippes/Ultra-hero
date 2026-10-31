"use client";

import { Ban, Flag } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Dialog, FormField, Select, Textarea, useToast } from "@/components/ui";
import { blockHeroAction, reportAction } from "@/lib/moderation/actions";
import { REPORT_DETAILS_MAX, REPORT_REASONS, type ReportReason } from "@/lib/moderation/reasons";

type Props = {
  creatorId: string;
  heroName: string;
  /** Denúncia de um conteúdo; sem ele, a denúncia é do herói. */
  contentId?: string | null;
  signedIn: boolean;
  /** Caminho atual, para voltar depois do login. */
  path: string;
};

// Denunciar o conteúdo (ou o herói) e bloquear o herói (0071, diretriz 1.2 da App Store). Bloquear some com o
// herói e com o que ele publica para esta conta, em todo o app; desbloquear fica em Perfil › Heróis.
export function ReportBlockActions({ creatorId, heroName, contentId = null, signedIn, path }: Props) {
  const t = useTranslations("moderation");
  const router = useRouter();
  const { toast } = useToast();
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("offensive");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!signedIn) {
    return (
      <p className="type-caption text-fg-muted" data-testid="report-block-signin">
        <Link href={`/login?next=${encodeURIComponent(path)}`} className="underline underline-offset-2 hover:text-fg">
          {t("signInToReport")}
        </Link>
      </p>
    );
  }

  function sendReport() {
    setError(null);
    startTransition(async () => {
      const result = await reportAction({ contentId, creatorId: contentId ? null : creatorId, reason, details });
      if (!result.ok) {
        setError(t(`errors.${result.error}`));
        return;
      }
      setReportOpen(false);
      setDetails("");
      toast({ title: t("reported"), description: t("reportedHint"), variant: "success" });
    });
  }

  function block() {
    setError(null);
    startTransition(async () => {
      const result = await blockHeroAction(creatorId);
      if (!result.ok) {
        setError(t(`errors.${result.error}`));
        return;
      }
      setBlockOpen(false);
      toast({ title: t("blocked", { name: heroName }), description: t("blockedHint"), variant: "success" });
      router.push("/personalities");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2 print:hidden" data-testid="report-block">
      <Button type="button" variant="ghost" size="sm" leadingIcon={<Flag />} onClick={() => setReportOpen(true)}>
        {contentId ? t("reportContent") : t("reportHero")}
      </Button>
      <Button type="button" variant="ghost" size="sm" leadingIcon={<Ban />} onClick={() => setBlockOpen(true)}>
        {t("block", { name: heroName })}
      </Button>

      <Dialog
        open={reportOpen}
        onOpenChange={(open) => !pending && setReportOpen(open)}
        title={contentId ? t("reportContent") : t("reportHero")}
        description={t("reportDescription")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReportOpen(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button onClick={sendReport} loading={pending}>
              {t("send")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <FormField label={t("reason")}>
            <Select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
              {REPORT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(`reasons.${r}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t("details")} optionalLabel={t("optional")}>
            <Textarea value={details} maxLength={REPORT_DETAILS_MAX} rows={4} onChange={(e) => setDetails(e.target.value)} />
          </FormField>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        open={blockOpen}
        onOpenChange={(open) => !pending && setBlockOpen(open)}
        title={t("blockTitle", { name: heroName })}
        description={t("blockDescription")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBlockOpen(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button variant="danger" onClick={block} loading={pending}>
              {t("blockConfirm")}
            </Button>
          </>
        }
      >
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
