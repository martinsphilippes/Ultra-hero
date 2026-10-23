"use client";

import { Camera, Images, Trash2, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ChangeEvent, type MouseEvent } from "react";
import { removeAvatar, uploadAvatar } from "@/app/(app)/profile/avatar-actions";
import { Avatar, Button, Dialog, useToast } from "@/components/ui";
import type { AvatarPhotoState } from "@/lib/avatar/availability";
import { toAvatarError, type AvatarError } from "@/lib/avatar/constants";
import { isStoredAvatarUrl, supabaseBaseUrl } from "@/lib/avatar/paths";
import { AvatarPrepareError, prepareAvatar, type PreparedAvatar } from "@/lib/avatar/resize";
import { validateSourceFile } from "@/lib/avatar/validation";

type Props = {
  /** Avatar atual (foto enviada, ilustração ou nenhum). */
  value: string | null;
  /** Nome exibido: escolhe a ilustração de reserva e fica ao lado do círculo. */
  name: string;
  state: AvatarPhotoState;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  /** Texto de apoio próprio da tela (ex.: perfil de herói). */
  hint?: string;
};

type Preview = PreparedAvatar & { url: string };

// Foto de perfil pelo celular: "Tirar foto" (câmera frontal) ou "Escolher da galeria", recorte e
// redução no aparelho, prévia em círculo e confirmação. Uma foto só por pessoa: vale no avatar do
// app e, se a pessoa é herói, no perfil público. Usado em /profile e /creator/profile.
export function AvatarPhotoPicker({ value, name, state, onChange, disabled = false, hint }: Props) {
  const t = useTranslations("me.profile.photo");
  const { toast } = useToast();
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const takeRef = useRef<HTMLButtonElement>(null);
  // Botão que abriu o fluxo: durante o preparo ele fica desabilitado e o foco cai no body; ao fim
  // (prévia fechada, erro, foto enviada ou removida) o foco volta para cá, não para o topo da página.
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [focusBack, setFocusBack] = useState<"trigger" | "take" | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<AvatarError | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pending, startTransition] = useTransition();

  const isPhoto = isStoredAvatarUrl(value, supabaseBaseUrl());
  const ready = state.upload === "ready";
  const busy = disabled || preparing || pending;

  // Devolve o foco quando nada mais o segura (sem preparo/envio e sem diálogo aberto). Roda depois
  // do Dialog, que ao fechar devolve o foco ao que estava ativo ao abrir (o body, no preparo).
  useEffect(() => {
    if (!focusBack || busy || preview || confirmRemove) return;
    const wanted = focusBack === "take" ? takeRef.current : triggerRef.current;
    setFocusBack(null);
    requestAnimationFrame(() => {
      const target = wanted && !wanted.disabled && wanted.isConnected ? wanted : rootRef.current;
      target?.focus();
    });
  }, [focusBack, busy, preview, confirmRemove]);

  function openPicker(event: MouseEvent<HTMLButtonElement>, input: HTMLInputElement | null) {
    triggerRef.current = event.currentTarget;
    input?.click();
  }

  // a URL da prévia (blob) é liberada quando a prévia some ou o componente sai da tela
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  function message(code: AvatarError) {
    return t(`errors.${code}`);
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // limpa o input: escolher o mesmo arquivo de novo precisa disparar onChange
    event.target.value = "";
    if (!file) return;
    setError(null);
    setFocusBack("trigger");
    const problem = validateSourceFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setPreparing(true);
    setAnnouncement(t("preparing"));
    try {
      const prepared = await prepareAvatar(file);
      setPreview({ ...prepared, url: URL.createObjectURL(prepared.blob) });
      setAnnouncement("");
    } catch (err) {
      setError(err instanceof AvatarPrepareError ? err.code : "decode_failed");
      setAnnouncement("");
    } finally {
      setPreparing(false);
    }
  }

  function closePreview(open: boolean) {
    if (open || pending) return;
    setPreview(null);
    setError(null);
  }

  function confirmUpload() {
    if (!preview) return;
    setError(null);
    setAnnouncement(t("uploading"));
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
        setError(toAvatarError(result.error));
        setAnnouncement("");
        return;
      }
      setPreview(null);
      onChange(result.avatarUrl);
      setAnnouncement(t("uploaded"));
      toast({ title: t("uploaded"), variant: "success" });
      router.refresh();
    });
  }

  function confirmRemoval() {
    setError(null);
    startTransition(async () => {
      // falha de rede rejeita a promessa da action: sem o catch, o erro derrubaria a página inteira
      let result: Awaited<ReturnType<typeof removeAvatar>>;
      try {
        result = await removeAvatar();
      } catch {
        result = { ok: false, error: "generic" };
      }
      if (!result.ok) {
        setError(toAvatarError(result.error));
        return;
      }
      // "Remover foto" some junto com a foto: o foco vai para "Tirar foto"
      setFocusBack("take");
      setConfirmRemove(false);
      onChange(result.avatarUrl);
      setAnnouncement(t("removed"));
      toast({ title: t("removed"), variant: "success" });
      router.refresh();
    });
  }

  const inlineError = error && !preview && !confirmRemove;

  return (
    <div ref={rootRef} tabIndex={-1} className="flex flex-col gap-3 rounded-xl border border-border bg-surface-elevated p-4 outline-none" data-testid="avatar-photo">
      <div className="flex items-center gap-4">
        <Avatar src={value} name={name} size="xl" alt="" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-semibold text-fg">{t("title")}</p>
          <p className="type-caption text-fg-muted">{hint ?? t("hint")}</p>
        </div>
      </div>

      {!ready && (
        <p role="status" data-testid="avatar-photo-unavailable" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-fg">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          {state.upload === "disabled" ? t("disabled") : t("unavailable")}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="secondary" size="lg" leadingIcon={<Camera />} disabled={!ready || busy} loading={preparing} ref={takeRef} onClick={(e) => openPicker(e, cameraRef.current)}>
          {t("take")}
        </Button>
        <Button type="button" variant="secondary" size="lg" leadingIcon={<Images />} disabled={!ready || busy} onClick={(e) => openPicker(e, galleryRef.current)}>
          {t("gallery")}
        </Button>
      </div>
      {/* Inputs escondidos: o botão é o alvo de toque; capture="user" abre a câmera frontal no celular. */}
      <input ref={cameraRef} type="file" accept="image/*" capture="user" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile} data-testid="avatar-camera-input" />
      <input ref={galleryRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile} data-testid="avatar-gallery-input" />
      {isPhoto && (
        <Button type="button" variant="ghost" leadingIcon={<Trash2 />} disabled={!state.canRemove || busy} onClick={() => setConfirmRemove(true)} className="self-start">
          {t("remove")}
        </Button>
      )}
      <p className="type-caption text-fg-subtle">{t("limits")}</p>
      {inlineError && (
        <p role="alert" className="type-caption font-medium text-danger">
          {message(error)}
        </p>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <Dialog
        open={preview !== null}
        onOpenChange={closePreview}
        title={t("previewTitle")}
        description={t("previewDescription")}
        size="sm"
        dismissible={!pending}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => closePreview(false)} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="button" variant="primary" onClick={confirmUpload} loading={pending} data-autofocus>
              {t("use")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col items-center gap-3 py-2" aria-busy={pending || undefined}>
          {preview && (
            // prévia local (blob): o otimizador de imagens não se aplica
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt={t("previewAlt")} className="size-48 rounded-full border border-border object-cover shadow-sm" />
          )}
          {error && preview && (
            <p role="alert" className="text-center type-caption font-medium text-danger">
              {message(error)}
            </p>
          )}
        </div>
      </Dialog>

      <Dialog
        open={confirmRemove}
        onOpenChange={(open) => {
          if (!pending) {
            setConfirmRemove(open);
            setError(null);
          }
        }}
        title={t("removeConfirmTitle")}
        description={t("removeConfirmBody")}
        size="sm"
        dismissible={!pending}
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                // o Dialog não avisa onOpenChange quando o fechamento vem do estado: limpa o erro aqui
                setConfirmRemove(false);
                setError(null);
              }}
              disabled={pending}
            >
              {t("cancel")}
            </Button>
            <Button type="button" variant="danger" onClick={confirmRemoval} loading={pending}>
              {t("removeConfirm")}
            </Button>
          </>
        }
      >
        {error && confirmRemove ? (
          <p role="alert" className="type-caption font-medium text-danger">
            {message(error)}
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
