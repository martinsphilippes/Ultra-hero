"use client";

import { PackageSearch } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { searchIngredientProducts, suggestIngredientProduct, withdrawIngredientProduct } from "@/app/creator/recipes/ingredient-product-actions";
import { SearchPicker, type PickItem } from "@/components/admin-content/SearchPicker";
import { Badge, Button } from "@/components/ui";
import { ingredientLinkDisplay, suspensionReasonKey, type IngredientLink, type IngredientLinkSummary } from "@/lib/recipes/ingredient-products";

type Props = {
  ingredientId: string;
  ingredientName: string;
  /** Ingrediente já gravado no banco (a RPC só aceita ingrediente existente da própria receita). */
  saved: boolean;
  summary: IngredientLinkSummary | undefined;
  onLinked: (link: IngredientLink, replaced: string | null) => void;
  onWithdrawn: (linkId: string) => void;
  disabled?: boolean;
};

const STATUS_VARIANT = { pending: "info", validated: "success", suspended: "warning", rejected: "danger" } as const;

function LinkLine({ link, kind }: { link: IngredientLink; kind: "validatedLine" | "pendingLine" | "lastLine" }) {
  const t = useTranslations("shopping.editor");
  const tr = useTranslations("shopping.suspension");
  const display = ingredientLinkDisplay(link);
  // motivo automático do banco traduzido; texto livre do admin aparece como está
  const reasonKey = suspensionReasonKey(link.suspendedReason);
  const title = link.product?.title ?? t("hiddenProduct");
  return (
    <div className="flex flex-col gap-1" data-testid="ingredient-product-link" data-status={display.status}>
      <p className="flex flex-wrap items-center gap-2 text-sm text-fg">
        <span className="font-medium">{t(kind, { title })}</span>
        <Badge size="sm" variant={STATUS_VARIANT[display.status]}>
          {t(`status.${display.status}`)}
        </Badge>
        {display.unavailable && display.status !== "rejected" ? (
          <Badge size="sm" variant="warning">
            {t("status.unavailable")}
          </Badge>
        ) : null}
      </p>
      {link.status === "rejected" && link.note ? <p className="type-caption text-fg-muted">{t("reason", { reason: link.note })}</p> : null}
      {link.status === "suspended" && link.suspendedReason ? <p className="type-caption text-fg-muted">{t("reason", { reason: reasonKey ? tr(reasonKey) : link.suspendedReason })}</p> : null}
    </div>
  );
}

// "Produto correspondente" de um ingrediente (etapa 2 do editor): busca nos produtos ativos, envia a
// sugestão para a fila do admin e mostra a situação ao lado (pendente, validado, indisponível,
// suspenso ou recusado com o motivo). O vínculo só vale na lista de compras depois de validado.
export function IngredientProductField({ ingredientId, ingredientName, saved, summary, onLinked, onWithdrawn, disabled }: Props) {
  const t = useTranslations("shopping.editor");
  const groupId = useId();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [pending, startTransition] = useTransition();
  const pickerRef = useRef<HTMLDivElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const errorText = (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"));
  const hasAny = Boolean(summary?.validated || summary?.pending);

  // abrir a busca leva o foco ao campo (o botão focado some); fechar, escolher ou retirar devolve o
  // foco ao botão — só depois da transição, porque durante ela o botão fica desabilitado
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (picking) pickerRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    else if (!pending && restoreFocus.current) {
      restoreFocus.current = false;
      chooseRef.current?.focus();
    }
  }, [picking, pending]);
  const focusChoose = () => {
    restoreFocus.current = true;
  };
  function closePicker() {
    focusChoose();
    setPicking(false);
  }

  function choose(item: PickItem | null) {
    if (!item) return;
    setError(null);
    startTransition(async () => {
      const replaced = summary?.pending?.id ?? null;
      const result = await suggestIngredientProduct({ ingredientId, productId: item.id, replaceLinkId: replaced });
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      onLinked(result.link, replaced);
      closePicker();
      // a action só devolve ok com uma sugestão nova pendente; mesmo assim, anuncia só nesse caso
      if (result.link.status === "suggested") setStatus(t("suggested"));
    });
  }

  function withdraw(linkId: string) {
    setError(null);
    startTransition(async () => {
      const result = await withdrawIngredientProduct({ linkId });
      if (!result.ok) {
        setError(errorText(result.error));
        return;
      }
      onWithdrawn(linkId);
      setStatus(t("withdrawn"));
      // a linha pendente (com o botão focado) desmontou
      focusChoose();
    });
  }

  return (
    <div role="group" aria-labelledby={`${groupId}-label`} className="flex flex-col gap-2 rounded-xl border border-dashed border-border-strong p-3" data-testid="ingredient-product">
      <p id={`${groupId}-label`} className="flex items-center gap-2 text-sm font-semibold text-fg">
        <PackageSearch className="size-4 text-accent-text" aria-hidden="true" />
        {t("label")} <span className="font-normal text-fg-muted">({t("optional")})</span>
      </p>
      <p className="type-caption text-fg-muted">{t("hint")}</p>
      {!saved ? (
        <p className="type-caption text-fg-muted" data-testid="ingredient-product-save-first">
          {t("saveFirst")}
        </p>
      ) : (
        <>
          {summary?.validated ? <LinkLine link={summary.validated} kind="validatedLine" /> : null}
          {summary?.pending ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <LinkLine link={summary.pending} kind="pendingLine" />
              <Button type="button" variant="ghost" onClick={() => withdraw(summary.pending!.id)} disabled={disabled || pending}>
                {t("withdraw")}
              </Button>
            </div>
          ) : null}
          {summary?.last ? <LinkLine link={summary.last} kind="lastLine" /> : null}
          {picking ? (
            <div className="flex flex-col gap-2" ref={pickerRef}>
              <SearchPicker label={t("search", { name: ingredientName || "…" })} search={searchIngredientProducts} value={null} onChange={choose} disabled={disabled || pending} />
              <div>
                <Button type="button" variant="ghost" onClick={closePicker} disabled={pending}>
                  {t("cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <Button ref={chooseRef} type="button" variant="secondary" onClick={() => setPicking(true)} disabled={disabled || pending} loading={pending} data-testid="ingredient-product-choose">
                {hasAny ? t("change") : t("choose")}
              </Button>
            </div>
          )}
        </>
      )}
      {error ? (
        <p role="alert" className="type-caption font-medium text-danger">
          {error}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
