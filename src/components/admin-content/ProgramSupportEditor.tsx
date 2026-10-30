"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveProgramProductsAction, setProgramProfessionalAction, setProgramProfessionalServiceAction } from "@/app/admin/programs/actions";
import type { ActionResult } from "@/components/admin";
import { Button, FormField, IconButton, Input, Select, useToast } from "@/components/ui";
import { MAX_PROGRAM_PRODUCTS, PROGRAM_PRODUCT_NOTE_MAX } from "@/lib/programs/support";

// Etapa 4 (0059): produto(s) e profissional(is) do programa, no admin do programa. Produtos: lista
// editada localmente e salva de uma vez (até 3, ordem e nota). Profissionais: sugerir/tirar
// (professional_suggestions da 0058) e escolher o serviço mostrado. Tudo auditado no banco.

type Option = { id: string; label: string };
export type SupportProductItem = { productId: string; label: string; note: string };
export type SupportProfessionalItem = { id: string; label: string; serviceId: string | null; services: Option[] };

type Props = {
  programId: string;
  /** false = banco sem a 0059 (só os profissionais funcionam, sem escolher serviço). */
  available: boolean;
  products: SupportProductItem[];
  productOptions: Option[];
  professionals: SupportProfessionalItem[];
  professionalOptions: Option[];
};

function useRun() {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(fn: () => Promise<ActionResult>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.message) toast({ title: result.message, variant: "success" });
      after?.();
      router.refresh();
    });
  }
  return { pending, error, run };
}

export function ProgramSupportEditor({ programId, available, products, productOptions, professionals, professionalOptions }: Props) {
  const t = useTranslations("adminContent.programs.support");
  const { pending, error, run } = useRun();
  const [list, setList] = useState<SupportProductItem[]>(products);
  const [pickedProduct, setPickedProduct] = useState("");
  const [pickedPro, setPickedPro] = useState("");
  const taken = new Set(list.map((p) => p.productId));
  const suggested = new Set(professionals.map((p) => p.id));
  const full = list.length >= MAX_PROGRAM_PRODUCTS;

  const move = (index: number, delta: number) =>
    setList((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });

  return (
    <div className="flex flex-col gap-5" data-testid="admin-program-support">
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      {!available ? <p className="type-body-sm text-fg-muted">{t("unavailable")}</p> : null}

      {available ? (
        <section aria-labelledby="program-support-products" className="flex flex-col gap-3">
          <h3 id="program-support-products" className="text-sm font-semibold text-fg">
            {t("products")}
          </h3>
          {list.length === 0 ? <p className="type-caption text-fg-muted">{t("productsNone")}</p> : null}
          <ol className="flex flex-col gap-3">
            {list.map((item, i) => (
              <li key={item.productId} className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-3" data-testid="admin-program-product">
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 text-sm font-medium text-fg">
                    {i + 1}. {item.label}
                  </span>
                  <IconButton label={`${t("moveUp")}: ${item.label}`} icon={<ArrowUp />} size="sm" disabled={pending || i === 0} onClick={() => move(i, -1)} />
                  <IconButton label={`${t("moveDown")}: ${item.label}`} icon={<ArrowDown />} size="sm" disabled={pending || i === list.length - 1} onClick={() => move(i, 1)} />
                  <IconButton label={`${t("remove")}: ${item.label}`} icon={<X />} size="sm" disabled={pending} onClick={() => setList((c) => c.filter((p) => p.productId !== item.productId))} />
                </div>
                <FormField label={t("note")} hint={t("noteHint")}>
                  <Input
                    value={item.note}
                    maxLength={PROGRAM_PRODUCT_NOTE_MAX}
                    disabled={pending}
                    onChange={(e) => {
                      const note = e.target.value;
                      setList((c) => c.map((p) => (p.productId === item.productId ? { ...p, note } : p)));
                    }}
                  />
                </FormField>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-end gap-2">
            <Select aria-label={t("selectProduct")} value={pickedProduct} onChange={(e) => setPickedProduct(e.target.value)} disabled={pending || full} className="min-w-0 flex-1">
              <option value="">{t("selectProduct")}</option>
              {productOptions
                .filter((o) => !taken.has(o.id))
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
            </Select>
            <Button
              type="button"
              variant="secondary"
              leadingIcon={<Plus />}
              disabled={pending || full || !pickedProduct}
              onClick={() => {
                const option = productOptions.find((o) => o.id === pickedProduct);
                if (!option) return;
                setList((c) => [...c, { productId: option.id, label: option.label, note: "" }]);
                setPickedProduct("");
              }}
            >
              {t("addProduct")}
            </Button>
          </div>
          <Button
            type="button"
            className="self-start"
            loading={pending}
            onClick={() => run(() => saveProgramProductsAction(programId, list.map((p) => ({ productId: p.productId, note: p.note }))))}
            data-testid="admin-program-products-save"
          >
            {t("saveProducts")}
          </Button>
        </section>
      ) : null}

      <section aria-labelledby="program-support-pros" className="flex flex-col gap-3">
        <h3 id="program-support-pros" className="text-sm font-semibold text-fg">
          {t("professionals")}
        </h3>
        {professionals.length === 0 ? <p className="type-caption text-fg-muted">{t("professionalsNone")}</p> : null}
        <ul className="flex flex-col gap-3">
          {professionals.map((pro) => (
            <li key={pro.id} className="flex flex-col gap-2 rounded-xl border border-border bg-bg p-3" data-testid="admin-program-professional">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-sm font-medium text-fg">{pro.label}</span>
                <IconButton label={`${t("remove")}: ${pro.label}`} icon={<X />} size="sm" disabled={pending} onClick={() => run(() => setProgramProfessionalAction(programId, pro.id, false))} />
              </div>
              {available ? (
                <FormField label={t("service")}>
                  <Select
                    value={pro.serviceId ?? ""}
                    disabled={pending}
                    onChange={(e) => {
                      const value = e.target.value || null;
                      run(() => setProgramProfessionalServiceAction(programId, pro.id, value));
                    }}
                  >
                    <option value="">{t("serviceAuto")}</option>
                    {pro.services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </FormField>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-2">
          <Select aria-label={t("selectProfessional")} value={pickedPro} onChange={(e) => setPickedPro(e.target.value)} disabled={pending} className="min-w-0 flex-1">
            <option value="">{t("selectProfessional")}</option>
            {professionalOptions
              .filter((o) => !suggested.has(o.id))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
          </Select>
          <Button
            type="button"
            variant="secondary"
            leadingIcon={<Plus />}
            disabled={pending || !pickedPro}
            onClick={() => run(() => setProgramProfessionalAction(programId, pickedPro, true), () => setPickedPro(""))}
          >
            {t("addProfessional")}
          </Button>
        </div>
      </section>
    </div>
  );
}
