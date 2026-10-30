"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { setOrgProductAvailabilityAction, setOrgProductStockAction } from "@/app/admin/sellers/product-actions";
import { setProductDemoStock, toggleProductAvailability } from "@/app/seller/products/actions";
import { splitErrorString } from "@/components/commerce/lib/errors";
import { Button, Input, Switch, useToast } from "@/components/ui";

type Props = {
  productId: string;
  title: string;
  availability: "available" | "unavailable";
  demoStock: number | null;
  /** No admin (aba Produtos da organização): usa as ações do admin para esta organização. */
  adminOrgId?: string;
};

// Atalhos na listagem: alternar disponibilidade e ajustar estoque de demonstração.
export function ProductQuickToggles({ productId, title, availability, demoStock, adminOrgId }: Props) {
  const t = useTranslations("seller.products");
  const tf = useTranslations("commerce.productForm.errors");
  const router = useRouter();
  const { toast } = useToast();
  const id = useId();
  const [available, setAvailable] = useState(availability === "available");
  const [stock, setStock] = useState(demoStock === null ? "" : String(demoStock));
  const [pending, startTransition] = useTransition();

  function showError(error: string) {
    const { code, detail } = splitErrorString(error);
    if (code === "protected_column") toast({ title: tf("protected_column", { column: detail ?? "" }), variant: "error" });
    else toast({ title: t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"), variant: "error" });
  }

  function toggle(next: boolean) {
    setAvailable(next);
    startTransition(async () => {
      const availability = next ? "available" : "unavailable";
      const result = adminOrgId
        ? await setOrgProductAvailabilityAction({ orgId: adminOrgId, productId, availability })
        : await toggleProductAvailability({ productId, availability });
      if (result.ok) {
        toast({ title: t("availabilityUpdated"), variant: "success", duration: 2000 });
        router.refresh();
      } else {
        setAvailable(!next);
        showError(result.error);
      }
    });
  }

  function saveStock() {
    const value = stock.trim() === "" ? null : Number(stock);
    startTransition(async () => {
      const result = adminOrgId ? await setOrgProductStockAction({ orgId: adminOrgId, productId, demoStock: value }) : await setProductDemoStock({ productId, demoStock: value });
      if (result.ok) {
        toast({ title: t("stockUpdated"), variant: "success", duration: 2000 });
        router.refresh();
      } else showError(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3" aria-busy={pending || undefined}>
      <Switch id={`${id}-av`} checked={available} onCheckedChange={toggle} size="sm" disabled={pending} aria-label={`${t("quickAvailability")} · ${title}`} />
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          saveStock();
        }}
      >
        <label htmlFor={`${id}-stock`} className="sr-only">
          {t("quickStock", { title })}
        </label>
        <Input id={`${id}-stock`} value={stock} onChange={(e) => setStock(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" inputSize="sm" placeholder="∞" className="w-20" disabled={pending} />
        <Button type="submit" variant="ghost" size="sm" disabled={pending}>
          {t("quickStockSave")}
        </Button>
      </form>
    </div>
  );
}
