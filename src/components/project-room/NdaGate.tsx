"use client";

import { FileSignature, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { Button, Checkbox, FormField, Input, Spinner, useToast } from "@/components/ui";
import { ndaPreviewAction, ndaSignAction, type NdaPreview } from "@/lib/project-room/actions";
import type { RoomPortal } from "@/lib/project-room/vocab";
import { cleanSignerName, formatTaxId, taxIdKind } from "@/lib/signature/tax-id";

type Props = { portal: RoomPortal; dealId: string; dealTitle: string; agency: string };

// NDA antes de ver a sala (0110, D5): o texto exato (NDA + normas) e o hash dele; nome completo + CPF/CNPJ conferidos
// aqui e no banco, que grava e-mail da conta, IP, navegador, data/hora e o hash. Mesma assinatura simples dos termos.
export function NdaGate({ portal, dealId, dealTitle, agency }: Props) {
  const t = useTranslations("projectRoom.nda");
  const router = useRouter();
  const { toast } = useToast();
  const [preview, setPreview] = useState<NdaPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [doc, setDoc] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    ndaPreviewAction({ dealId }).then((result) => {
      if (!alive) return;
      if (result.ok) setPreview(result.preview);
      else setLoadError(result.error);
    });
    return () => {
      alive = false;
    };
  }, [dealId]);

  function sign() {
    setError(null);
    if (!preview) return;
    if (!cleanSignerName(name)) return setError(t("nameInvalid"));
    if (!taxIdKind(doc)) return setError(t("docInvalid"));
    if (!agree) return setError(t("agreeRequired"));
    start(async () => {
      const result = await ndaSignAction({ portal, dealId, fullName: name, taxId: doc, expectedHash: preview.sha256 });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5" data-testid="nda-gate">
      <header className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-6 shrink-0 text-accent-text" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-fg">{t("title")}</h2>
          <p className="type-body-sm text-fg-muted">{t("hint", { deal: dealTitle, agency })}</p>
        </div>
      </header>
      {loadError ? (
        <p role="alert" className="type-body-sm text-danger">
          {loadError}
        </p>
      ) : !preview ? (
        <p className="flex items-center gap-2 type-body-sm text-fg-muted">
          <Spinner size="sm" /> {t("loading")}
        </p>
      ) : (
        <>
          <div className="max-h-80 overflow-auto rounded-xl border border-border bg-bg p-3">
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-fg" data-testid="nda-text">
              {preview.text}
            </pre>
          </div>
          <p className="break-all type-caption text-fg-muted">
            {t("hashLabel", { version: preview.version })}: <span className="font-mono">{preview.sha256}</span>
          </p>
          <FormField label={t("name")} hint={t("nameHint")} required>
            <Input value={name} autoComplete="name" maxLength={120} onChange={(e) => setName(e.target.value)} disabled={pending} />
          </FormField>
          <FormField label={t("doc")} hint={doc.trim() ? (taxIdKind(doc) ? t(`docKind.${taxIdKind(doc)}`) : t("docInvalid")) : t("docHint")} required>
            <Input value={doc} inputMode="numeric" maxLength={20} onChange={(e) => setDoc(formatTaxId(e.target.value))} disabled={pending} />
          </FormField>
          <Checkbox checked={agree} onChange={(e) => setAgree(e.target.checked)} label={t("agree")} disabled={pending} />
          {error ? (
            <p role="alert" className="type-body-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="button" size="lg" block onClick={sign} loading={pending} leadingIcon={<FileSignature />} data-testid="nda-sign">
            {t("sign")}
          </Button>
          <p className="type-caption text-fg-subtle">{t("legal")}</p>
        </>
      )}
    </section>
  );
}
