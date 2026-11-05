"use client";

import { ImageUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { replacePostPhoto } from "@/app/heroi/post/photo-actions";
import { Button, useToast } from "@/components/ui";

// Foto do post em rascunho (depois de despublicar ou desarquivar): mostra a atual e troca por outra da galeria ou da
// câmera. O servidor confere tudo de novo (tipo, tamanho, direitos de uso) e a capa acompanha a foto.
export function ReplacePostPhoto({ contentId, photoUrl }: { contentId: string; photoUrl: string | null }) {
  const t = useTranslations("creator.publish.photo");
  const te = useTranslations("creator.errors");
  const { toast } = useToast();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const form = new FormData();
    form.set("contentId", contentId);
    form.set("file", file);
    startTransition(async () => {
      const result = await replacePostPhoto(form);
      if (input.current) input.current.value = "";
      if (result.ok) {
        toast({ title: t("changed"), variant: "success" });
        router.refresh();
      } else {
        const key = result.error.split(":")[0].trim();
        setError(te.has(key) ? te(key) : te("generic"));
      }
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="replace-post-photo">
      <div>
        <h2 className="type-h3 text-fg">{t("title")}</h2>
        <p className="type-body-sm text-fg-muted">{t("description")}</p>
      </div>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto do próprio post (bucket público), prévia simples
        <img src={photoUrl} alt="" className="max-h-64 w-full rounded-xl object-cover" />
      ) : null}
      <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} aria-label={t("change")} />
      <div>
        <Button type="button" variant="secondary" leadingIcon={<ImageUp />} loading={pending} onClick={() => input.current?.click()}>
          {pending ? t("changing") : t("change")}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
