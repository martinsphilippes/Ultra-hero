"use client";

import { FileSignature, ReceiptText } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { Button, Checkbox, Dialog, FormField, Input, Spinner, useToast } from "@/components/ui";
import { signTermsAction, termsSignPreviewAction, type SignPreview } from "@/lib/signature/actions";
import { cleanSignerName, formatTaxId, taxIdKind } from "@/lib/signature/tax-id";

type Props = {
  portal: "brand" | "office";
  termsId: string;
  dealId: string;
  requestId?: string | null;
  dealTalentId?: string | null;
  receiptBase: string;
  onClose: () => void;
};

// Assinatura eletrônica simples dos termos (0084): mostra o texto exato e o hash dele, pede nome completo e
// CPF/CNPJ (conferidos aqui e no banco), e assina. Ao final, o link do comprovante.
export function SignDialog({ portal, termsId, dealId, requestId, dealTalentId, receiptBase, onClose }: Props) {
  const t = useTranslations("commercial.signature");
  const { toast } = useToast();
  const [preview, setPreview] = useState<SignPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [doc, setDoc] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedId, setSignedId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    termsSignPreviewAction(portal, { termsId }).then((result) => {
      if (!alive) return;
      if (result.ok) setPreview(result.preview);
      else setLoadError(result.error);
    });
    return () => {
      alive = false;
    };
  }, [portal, termsId]);

  const kind = doc.trim() ? taxIdKind(doc) : null;

  function run() {
    setError(null);
    if (!preview) return;
    if (!cleanSignerName(name)) return setError(t("nameInvalid"));
    if (!kind) return setError(t("docInvalid"));
    if (!agree) return setError(t("agreeRequired"));
    start(async () => {
      const result = await signTermsAction(portal, { termsId, fullName: name, taxId: doc, expectedHash: preview.sha256, dealId, requestId: requestId ?? null, dealTalentId: dealTalentId ?? null });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setSignedId(result.id);
    });
  }

  if (signedId) {
    return (
      <Dialog
        open
        onOpenChange={(o) => (!o ? onClose() : null)}
        title={t("doneTitle")}
        description={t("doneHint")}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("close")}
            </Button>
            <Button asChild leadingIcon={<ReceiptText />}>
              <Link href={`${receiptBase}/${signedId}`} data-testid="sign-receipt-open">
                {t("openReceipt")}
              </Link>
            </Button>
          </>
        }
      />
    );
  }

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(o) => (!o ? onClose() : null)}
      title={t("title")}
      description={t("hint")}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t("back")}
          </Button>
          <Button type="button" onClick={run} loading={pending} disabled={!preview} leadingIcon={<FileSignature />} data-testid="terms-sign-run">
            {t("sign")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="sign-dialog">
        {loadError ? (
          <p role="alert" className="type-body-sm text-danger">
            {loadError}
          </p>
        ) : !preview ? (
          <p className="flex items-center gap-2 type-body-sm text-fg-muted">
            <Spinner size="sm" /> {t("loading")}
          </p>
        ) : (
          <details className="rounded-xl border border-border bg-bg p-3">
            <summary className="cursor-pointer text-sm font-medium text-fg">{t("readText", { n: preview.version })}</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-fg" data-testid="sign-text">
              {preview.text}
            </pre>
            <p className="mt-2 break-all type-caption text-fg-muted">
              {t("hashLabel")}: <span className="font-mono">{preview.sha256}</span>
            </p>
          </details>
        )}
        <FormField label={t("fullName")} hint={t("fullNameHint")} required>
          <Input value={name} maxLength={120} autoComplete="name" onChange={(e) => setName(e.target.value)} disabled={pending} data-testid="sign-name" />
        </FormField>
        <FormField label={t("taxId")} hint={kind ? t(kind === "cpf" ? "taxIdCpf" : "taxIdCnpj", { doc: formatTaxId(doc) }) : t("taxIdHint")} required>
          <Input value={doc} maxLength={20} inputMode="text" autoCapitalize="characters" onChange={(e) => setDoc(e.target.value)} disabled={pending} data-testid="sign-doc" />
        </FormField>
        <Checkbox label={t("agree")} checked={agree} onChange={(e) => setAgree(e.target.checked)} disabled={pending} data-testid="sign-agree" />
        <p className="type-caption text-fg-muted">{t("evidence")}</p>
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
