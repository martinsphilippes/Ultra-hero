"use client";

import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ChangeEvent } from "react";
import { uploadAvatar } from "@/app/(app)/profile/avatar-actions";
import { Button, Dialog, useToast } from "@/components/ui";
import { toAvatarError, type AvatarError } from "@/lib/avatar/constants";
import { AvatarPrepareError, prepareAvatar, type PreparedAvatar } from "@/lib/avatar/resize";
import { validateSourceFile } from "@/lib/avatar/validation";
import { UPLOAD_RIGHTS_REQUIRED } from "@/lib/partner-terms/version";
import { UploadRightsDialog } from "./UploadRightsDialog";

type Preview = PreparedAvatar & { url: string };

/**
 * Lápis sobre a foto do Hero na página pública (pedido de 08/11/2026: "editar rápido a foto"): só o dono da página vê.
 * Um toque abre a câmera ou a galeria do celular, a foto é recortada e reduzida no aparelho, aparece a prévia e
 * "Usar esta foto" salva — o mesmo envio do Perfil (uploadAvatar): vale no avatar do app e na página do Hero.
 */
export function AvatarQuickEdit() {
  const t = useTranslations("me.profile.photo");
  const { toast } = useToast();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<AvatarError | null>(null);
  const [rightsOpen, setRightsOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = preparing || pending;

  // a URL da prévia (blob) é liberada quando a prévia some
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    const problem = validateSourceFile(file);
    if (problem) {
      toast({ title: t(`errors.${problem}`), variant: "error" });
      return;
    }
    setPreparing(true);
    try {
      const prepared = await prepareAvatar(file);
      setPreview({ ...prepared, url: URL.createObjectURL(prepared.blob) });
    } catch (err) {
      toast({ title: t(`errors.${err instanceof AvatarPrepareError ? err.code : "decode_failed"}`), variant: "error" });
    } finally {
      setPreparing(false);
    }
  }

  function confirmUpload() {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const form = new FormData();
      const ext = preview.mime === "image/webp" ? "webp" : "jpg";
      form.append("file", new File([preview.blob], `avatar.${ext}`, { type: preview.mime }));
      let result: Awaited<ReturnType<typeof uploadAvatar>>;
      try {
        result = await uploadAvatar(form);
      } catch {
        result = { ok: false, error: "upload_failed" };
      }
      if (!result.ok) {
        // Termos do Parceiro: a primeira foto de um Hero pede a declaração de direitos e depois segue
        if (result.error === UPLOAD_RIGHTS_REQUIRED) setRightsOpen(true);
        else setError(toAvatarError(result.error));
        return;
      }
      setPreview(null);
      toast({ title: t("uploaded"), variant: "success" });
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={t("quickEdit")}
        title={t("quickEdit")}
        className="absolute -bottom-0.5 -right-0.5 inline-flex size-8 items-center justify-center rounded-full border-2 border-bg bg-fg text-bg shadow-sm transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60 sm:size-9"
        data-testid="hero-avatar-edit"
      >
        <Pencil className={busy ? "size-4 animate-pulse" : "size-4"} aria-hidden="true" />
      </button>
      {/* sem "capture": o celular oferece tirar foto ou escolher da galeria */}
      <input ref={inputRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile} data-testid="hero-avatar-edit-input" />

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setPreview(null);
            setError(null);
          }
        }}
        title={t("previewTitle")}
        description={t("previewDescription")}
        size="sm"
        dismissible={!pending}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPreview(null);
                setError(null);
              }}
              disabled={pending}
            >
              {t("cancel")}
            </Button>
            <Button type="button" variant="primary" onClick={confirmUpload} loading={pending} data-autofocus>
              {t("use")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-3 py-2" aria-busy={pending || undefined}>
          {preview ? (
            // prévia local (blob): o otimizador de imagens não se aplica
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt={t("previewAlt")} className="size-48 rounded-full border border-border object-cover shadow-sm" />
          ) : null}
          {error ? (
            <p role="alert" className="text-center type-caption font-medium text-danger">
              {t(`errors.${error}`)}
            </p>
          ) : null}
        </div>
      </Dialog>
      <UploadRightsDialog open={rightsOpen} onOpenChange={setRightsOpen} onConfirmed={confirmUpload} />
    </>
  );
}
