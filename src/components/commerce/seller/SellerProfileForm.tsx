"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { updateSellerProfile } from "@/app/seller/profile/actions";
import { splitErrorString } from "@/components/commerce/lib/errors";
import { ImagePicker } from "@/components/editors/product/ImagePicker";
import { PRODUCT_IMAGES } from "@/components/editors/product/schema";
import { Button, FormField, Textarea, useToast } from "@/components/ui";

type Props = { orgId: string; description: string; logoUrl: string | null };

// Edição do perfil da organização (descrição + logotipo entre imagens de demonstração).
export function SellerProfileForm({ orgId, description: initialDescription, logoUrl: initialLogo }: Props) {
  const t = useTranslations("seller.profile");
  const tf = useTranslations("commerce.productForm.errors");
  const router = useRouter();
  const { toast } = useToast();
  const id = useId();
  const [description, setDescription] = useState(initialDescription);
  const [logo, setLogo] = useState<string | null>(initialLogo && (PRODUCT_IMAGES as readonly string[]).includes(initialLogo) ? initialLogo : null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateSellerProfile({ orgId, description, logoUrl: logo });
      if (result.ok) {
        toast({ title: t("saved"), variant: "success" });
        router.refresh();
        return;
      }
      const { code, detail } = splitErrorString(result.error);
      if (code === "protected_column") setError(t("errors.protected_column", { column: detail ?? "" }));
      else if (code === "forbidden_claim") setError(tf("forbidden_claim", { term: detail ?? "" }));
      else setError(t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"));
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" aria-busy={pending || undefined}>
      <FormField label={t("descriptionField")} hint={t("descriptionHint")} id={`${id}-description`}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 600))} rows={4} maxLength={600} disabled={pending} />
      </FormField>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold text-fg">{t("logo")}</p>
        <ImagePicker options={PRODUCT_IMAGES} value={logo} onChange={(v) => setLogo(v || null)} label={t("logo")} optionLabel={(n) => t("logoOption", { n })} allowNone noneLabel={t("logoNone")} disabled={pending} />
        <p className="type-caption text-fg-muted">{t("logoHint")}</p>
      </div>
      {error ? (
        <p role="alert" className="type-body-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
