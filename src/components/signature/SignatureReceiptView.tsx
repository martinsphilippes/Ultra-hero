import { BadgeCheck, ShieldAlert } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { PrintButton } from "@/components/media/PrintButton";
import { Badge } from "@/components/ui";
import { BackLink } from "@/components/ui/back-link";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { formatTaxId } from "@/lib/signature/tax-id";
import type { SignatureReceipt } from "@/lib/signature/queries";

// Comprovante de assinatura eletrônica simples (0084): quem assinou, documento, e-mail da conta, IP, navegador,
// data/hora, versão dos termos e o hash SHA-256 do texto exato — com o texto assinado logo abaixo. "Íntegro" =
// o hash recalculado agora bate com o gravado. Imprimível (window.print → "Salvar como PDF").
export async function SignatureReceiptView({ receipt, backHref }: { receipt: SignatureReceipt; backHref: string }) {
  const [t, locale] = await Promise.all([getTranslations("commercial.signature"), getLocale() as Promise<Locale>]);
  const row = (label: string, value: string, mono = false) => (
    <div className="flex flex-col gap-0.5 border-b border-border py-2 last:border-b-0">
      <dt className="type-caption text-fg-muted">{label}</dt>
      <dd className={mono ? "break-all font-mono text-sm text-fg" : "text-sm text-fg"}>{value || "—"}</dd>
    </div>
  );
  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-4" data-testid="signature-receipt">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <BackLink href={backHref}>{t("backToTerms")}</BackLink>
        <PrintButton label={t("print")} />
      </div>
      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fg-muted">{t("eyebrow")}</p>
        <h1 className="text-xl font-bold text-fg sm:text-2xl">{t("receiptTitle")}</h1>
        <p className="type-body-sm text-fg-muted">{t("receiptLegal")}</p>
        <div className="flex flex-wrap gap-2">
          {receipt.intact ? (
            <Badge variant="success" size="sm">
              <BadgeCheck className="size-3.5" aria-hidden="true" /> {t("intact")}
            </Badge>
          ) : (
            <Badge variant="danger" size="sm">
              <ShieldAlert className="size-3.5" aria-hidden="true" /> {t("notIntact")}
            </Badge>
          )}
          {receipt.termsStatus === "superseded" ? (
            <Badge variant="neutral" size="sm">
              {t("superseded")}
            </Badge>
          ) : null}
        </div>
      </header>
      <section className="rounded-2xl border border-border bg-surface p-4" aria-label={t("dataTitle")}>
        <dl className="flex flex-col">
          {row(t("party"), receipt.party === "brand" ? t("partyBrand", { brand: receipt.brand }) : t("partyTalent", { name: receipt.talent ?? "" }))}
          {row(t("signerName"), receipt.signerName)}
          {row(receipt.taxKind === "cnpj" ? t("cnpj") : t("cpf"), formatTaxId(receipt.taxId), true)}
          {row(t("email"), receipt.email)}
          {row(t("signedAt"), formatDateTime(receipt.signedAt, locale))}
          {row(t("ip"), receipt.ip ?? t("ipUnknown"), true)}
          {row(t("userAgent"), receipt.userAgent)}
          {row(t("campaign"), `${receipt.deal} · ${receipt.brand} · ${receipt.agency}`)}
          {row(t("termsVersion"), t("version", { n: receipt.termsVersion }))}
          {row(t("hash"), receipt.sha256, true)}
        </dl>
      </section>
      <section className="flex flex-col gap-2" aria-labelledby="signed-text">
        <h2 id="signed-text" className="text-sm font-semibold text-fg">
          {t("signedText")}
        </h2>
        <p className="type-caption text-fg-muted">{t("signedTextHint")}</p>
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-border bg-bg p-4 font-mono text-xs leading-relaxed text-fg print:max-h-none" data-testid="signed-text">
          {receipt.text}
        </pre>
      </section>
    </article>
  );
}
