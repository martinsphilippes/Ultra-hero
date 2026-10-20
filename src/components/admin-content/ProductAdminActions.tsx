"use client";

import { CheckCircle2, EyeOff, Pause } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { moderateProductAction, saveOwnProductAction } from "@/app/admin/products/actions";
import { ConfirmActionDialog } from "@/components/admin";
import { ProductForm } from "@/components/editors/ProductForm";
import type { ProductFormProps, ProductFormValues } from "@/components/editors/types";
import { useToast } from "@/components/ui";

type ModerationProps = { productId: string; moderation: "clear" | "hidden" | "suspended" };

// Moderação: ocultar/suspender (motivo obrigatório) e liberar.
export function ProductModerationActions({ productId, moderation }: ModerationProps) {
  const t = useTranslations("adminContent.products.moderation");
  return (
    <div className="flex flex-wrap gap-2">
      {moderation !== "hidden" && (
        <ConfirmActionDialog
          triggerLabel={
            <>
              <EyeOff className="size-4" aria-hidden="true" /> {t("hide")}
            </>
          }
          title={t("hideTitle")}
          description={t("description")}
          requireJustification
          action={(reason) => moderateProductAction(productId, "hide", reason)}
        />
      )}
      {moderation !== "suspended" && (
        <ConfirmActionDialog
          triggerLabel={
            <>
              <Pause className="size-4" aria-hidden="true" /> {t("suspend")}
            </>
          }
          triggerVariant="danger"
          destructive
          title={t("suspendTitle")}
          description={t("description")}
          requireJustification
          action={(reason) => moderateProductAction(productId, "suspend", reason)}
        />
      )}
      {moderation !== "clear" && (
        <ConfirmActionDialog
          triggerLabel={
            <>
              <CheckCircle2 className="size-4" aria-hidden="true" /> {t("clear")}
            </>
          }
          triggerVariant="primary"
          title={t("clearTitle")}
          description={t("description")}
          action={(reason) => moderateProductAction(productId, "clear", reason)}
        />
      )}
    </div>
  );
}

type EditorProps = Omit<ProductFormProps, "action"> & { productId: string | null };

// Envolve o ProductForm compartilhado: salva pela ação do admin e navega após criar.
export function AdminProductEditor({ productId, ...formProps }: EditorProps) {
  const router = useRouter();
  const { toast } = useToast();
  const tc = useTranslations("adminContent.common");
  const action = useCallback(
    async (values: ProductFormValues) => {
      const result = await saveOwnProductAction(productId, values);
      if (result.ok) {
        toast({ title: result.message ?? tc("saved"), variant: "success" });
        if (!productId && result.id) router.push(`/admin/products/${result.id}`);
        else router.refresh();
      }
      return result;
    },
    [productId, router, toast, tc],
  );
  return <ProductForm {...formProps} action={action} />;
}
