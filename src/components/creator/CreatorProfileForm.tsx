"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { updateCreatorProfile } from "@/app/creator/profile/actions";
import { useValidationMessage } from "@/components/editors/content/fields";
import { AvatarPhotoPicker } from "@/components/me/AvatarPhotoPicker";
import { Avatar, Button, FormField, Input, Textarea, useToast } from "@/components/ui";
import type { AvatarPhotoState } from "@/lib/avatar/availability";
import type { HeroCoverState } from "@/lib/hero-cover/availability";
import { useRevealHeroEditor } from "./HeroEditorDisclosure";
import { HeroCoverImage } from "./HeroCoverImage";
import { HeroCoverPicker } from "./HeroCoverPicker";
import { creatorProfilePayload, parseCreatorProfile, type CreatorProfileValues } from "./profile-schema";

type Props = {
  initial: CreatorProfileValues;
  /** Avatar e capa salvos (do servidor): só foto real, com envio e remoção próprios. */
  avatarUrl: string | null;
  coverUrl: string | null;
  readOnly?: boolean;
  name: string;
  /** Mostra o envio de foto e de capa (perfil ativo): a foto daqui vale no app e na página pública. */
  showPhotoPicker?: boolean;
  photoState?: AvatarPhotoState;
  coverState?: HeroCoverState;
};

// Formulário do perfil da personalidade: headline, bio e redes (salvos aqui) + foto e capa, que são
// fotos reais com envio e remoção próprios (já aplicados no servidor; "Salvar" nunca os regrava).
export function CreatorProfileForm({ initial, avatarUrl, coverUrl, readOnly = false, name, showPhotoPicker = true, photoState, coverState }: Props) {
  const t = useTranslations("creator.profile");
  const te = useTranslations("creator.errors");
  const tc = useTranslations("common");
  const tv = useValidationMessage();
  const { toast } = useToast();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const revealEditor = useRevealHeroEditor();
  const [values, setValues] = useState<CreatorProfileValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const errorCount = Object.keys(errors).length;

  // Foto e capa acompanham o servidor (router.refresh depois de enviar/remover): ajusta durante a
  // renderização, sem efeito. O que o picker aplicou já está no servidor; nada fica pendente aqui.
  const [avatar, setAvatar] = useState(avatarUrl);
  const [cover, setCover] = useState(coverUrl);
  const [server, setServer] = useState({ avatarUrl, coverUrl });
  if (server.avatarUrl !== avatarUrl || server.coverUrl !== coverUrl) {
    setServer({ avatarUrl, coverUrl });
    setAvatar(avatarUrl);
    setCover(coverUrl);
  }

  useEffect(() => {
    if (errorCount === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errorCount, errors]);

  // erro com o editor recolhido (fechado durante o envio): abre para a pessoa ver e corrigir
  useEffect(() => {
    if (errorCount > 0 || serverError) revealEditor();
  }, [errorCount, serverError, revealEditor]);

  function patch(p: Partial<CreatorProfileValues>) {
    setValues((v) => ({ ...v, ...p }));
  }
  function patchSocial(p: Partial<CreatorProfileValues["socials"]>) {
    setValues((v) => ({ ...v, socials: { ...v.socials, ...p } }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (readOnly || pending) return;
    // avatar e capa nunca vão juntos: a action mantém os do banco
    const parsed = parseCreatorProfile(creatorProfilePayload(values));
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await updateCreatorProfile(parsed.data);
      if (result.ok) {
        setServerError(null);
        toast({ title: tc("states.saved"), description: t("savedDescription"), variant: "success" });
        router.refresh();
      } else {
        const key = result.error.split(":")[0].trim();
        const message = key === "protected_column" ? te("protected_column", { column: result.error.split(":")[1]?.trim() ?? "?" }) : te.has(key) ? te(key) : te("generic");
        setServerError(message);
        toast({ title: tc("states.error"), description: message, variant: "error" });
      }
    });
  }

  const showPickers = showPhotoPicker && !readOnly;

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-5" aria-busy={pending || undefined}>
      {(errorCount > 0 || serverError) && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-fg">
          {serverError ?? t("fixFields", { count: errorCount })}
        </div>
      )}
      <fieldset disabled={readOnly || pending} className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <FormField label={t("headline")} hint={t("headlineHint")} error={tv(errors.headline)}>
            <Input value={values.headline} maxLength={120} onChange={(e) => patch({ headline: e.target.value })} />
          </FormField>
          <FormField label={t("bio")} hint={t("bioHint")} error={tv(errors.bio)}>
            <Textarea value={values.bio} rows={5} maxLength={1200} onChange={(e) => patch({ bio: e.target.value })} />
          </FormField>
        </div>

        <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          {/* Um avatar só para o herói: a foto (enviada e removida pelas actions próprias, que já gravam
              o app e a página pública). Sem foto: as iniciais. */}
          <fieldset className="flex min-w-0 flex-col gap-3" data-testid="hero-avatar">
            <legend className="text-base font-semibold text-fg">{t("avatarTitle")}</legend>
            <p className="-mt-1 type-body-sm text-fg-muted">{showPickers ? t("avatarShared") : t("avatarReadOnly")}</p>
            {showPickers && photoState ? (
              <AvatarPhotoPicker value={avatar} name={name} state={photoState} onChange={setAvatar} disabled={pending} hint={t("photoHint")} />
            ) : (
              <Avatar src={avatar} name={name} size="xl" alt="" />
            )}
          </fieldset>

          {/* Capa: só foto real, enviada aqui (0042). Sem capa: superfície lisa. */}
          {showPickers && coverState ? (
            <HeroCoverPicker value={cover} state={coverState} onChange={setCover} disabled={pending} />
          ) : (
            <div className="flex flex-col gap-2" data-testid="hero-cover-readonly">
              <p className="text-base font-semibold text-fg">{t("cover.title")}</p>
              <HeroCoverImage src={cover} ratio="video" sizes="(min-width: 640px) 560px, 100vw" className="rounded-xl border border-border" />
            </div>
          )}
        </div>

        <fieldset className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <legend className="px-1 text-base font-semibold text-fg">{t("socials")}</legend>
          <p className="-mt-2 type-body-sm text-fg-muted">{t("socialsHint")}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Instagram" error={tv(errors["socials.instagram"])}>
              <Input value={values.socials.instagram} maxLength={80} placeholder="@perfil" onChange={(e) => patchSocial({ instagram: e.target.value })} />
            </FormField>
            <FormField label="YouTube" error={tv(errors["socials.youtube"])}>
              <Input value={values.socials.youtube} maxLength={120} placeholder="@canal" onChange={(e) => patchSocial({ youtube: e.target.value })} />
            </FormField>
            <FormField label={t("site")} error={tv(errors["socials.site"])}>
              <Input value={values.socials.site} maxLength={200} placeholder="https://" onChange={(e) => patchSocial({ site: e.target.value })} />
            </FormField>
          </div>
        </fieldset>
      </fieldset>

      {!readOnly && (
        <div className="flex justify-end">
          <Button type="submit" loading={pending} size="lg">
            {tc("actions.save")}
          </Button>
        </div>
      )}
    </form>
  );
}
