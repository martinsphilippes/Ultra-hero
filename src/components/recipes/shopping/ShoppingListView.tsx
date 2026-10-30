"use client";

import { Pencil, ShoppingCart, Trash2, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import {
  clearCheckedShoppingItems,
  clearShoppingList,
  removeShoppingItem,
  setShoppingItemChecked,
  updateShoppingItemAmount,
} from "@/app/(app)/profile/lista-de-compras/actions";
import { QuickAddToCart } from "@/components/commerce/QuickAddToCart";
import { Badge, Button, Checkbox, Dialog, IconButton, Input, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import { SHOPPING_LIST_PATH } from "@/lib/recipes/shopping";
import type { ShoppingListData, ShoppingListItemView, ShoppingOffer } from "./load-shopping-list";

const linkClass = "font-medium text-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** Produto ligado no estado da seção 4.4: botão do carrinho de teste, selo de indisponível ou nada. */
function OfferBlock({ offer, compact = false }: { offer: ShoppingOffer; compact?: boolean }) {
  const t = useTranslations("shopping.kit");
  const locale = useLocale() as Locale;
  if (offer.state === "none") return <p className="type-caption text-fg-muted" data-testid="shopping-offer-none">{t("none")}</p>;
  const product = offer.product;
  const title = product?.title ?? t("hiddenProduct");
  const name = product ? (
    <Link href={`/shop/${product.slug}`} className={linkClass}>
      {title}
    </Link>
  ) : (
    <span className="font-medium text-fg">{title}</span>
  );
  return (
    <div className="flex flex-col gap-2 native:hidden" data-testid={`shopping-offer-${offer.state}`}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg">
        {compact ? <span className="text-fg-muted">{t("productLabel")}</span> : null}
        {name}
        {product && offer.state !== "unavailable" ? <span className="type-caption text-fg-muted type-numeric">{formatCurrency(product.priceCents / 100, locale)}</span> : null}
        {offer.state === "unavailable" ? (
          <Badge variant="warning" size="sm">
            {t("unavailable")}
          </Badge>
        ) : null}
      </p>
      {offer.state === "available" && product ? (
        <div className="flex max-w-sm flex-col gap-1">
          <QuickAddToCart
            productId={product.id}
            productTitle={product.title}
            priceCents={product.priceCents}
            maxQuantity={product.maxQuantity}
            purchasable
            isLoggedIn
            inCart={product.inCart}
            nextPath={SHOPPING_LIST_PATH}
            source="content_link"
          />
          <p className="type-caption text-fg-muted">{t("note")}</p>
        </div>
      ) : null}
    </div>
  );
}

type ItemProps = {
  item: ShoppingListItemView;
  checked: boolean;
  onToggle: (item: ShoppingListItemView, next: boolean) => void;
  onRemove: (item: ShoppingListItemView) => void;
  onAnnounce: (message: string) => void;
};

function ShoppingItem({ item, checked, onToggle, onRemove, onAnnounce }: ItemProps) {
  const t = useTranslations("shopping.page");
  const te = useTranslations("shopping.errors");
  const fieldId = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.amountInput);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // devolve o foco ao lápis que abriu a edição (o formulário com o foco desmonta)
  const focusEdit = () => window.setTimeout(() => document.getElementById(`${fieldId}-edit`)?.focus(), 0);

  function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateShoppingItemAmount({ id: item.id, amount: value });
      if (!result.ok) {
        setError(te.has(result.error) ? te(result.error) : te("generic"));
        return;
      }
      // a action revalida a página: a resposta já traz a lista nova (sem um segundo refresh)
      setEditing(false);
      onAnnounce(t("saved"));
      focusEdit();
    });
  }

  return (
    <li className="flex flex-col gap-2 py-2" data-testid="shopping-item" data-item-id={item.id} data-checked={checked ? "true" : "false"}>
      <div className="flex items-start justify-between gap-2">
        <div className={checked ? "min-w-0 flex-1 [&_.font-medium]:line-through [&_.font-medium]:decoration-fg-muted" : "min-w-0 flex-1"}>
          <Checkbox id={`${fieldId}-check`} checked={checked} onChange={(e) => onToggle(item, e.target.checked)} label={item.name} description={item.amount ?? t("noAmount")} data-testid="shopping-item-check" />
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton
            id={`${fieldId}-edit`}
            label={t("edit", { name: item.name })}
            icon={<Pencil />}
            onClick={() => {
              setValue(item.amountInput);
              setError(null);
              setEditing((v) => !v);
            }}
            aria-expanded={editing}
            data-testid="shopping-item-edit"
          />
          <IconButton label={t("remove", { name: item.name })} icon={<Trash2 />} onClick={() => onRemove(item)} data-testid="shopping-item-remove" />
        </div>
      </div>
      {editing ? (
        <form onSubmit={save} className="flex flex-col gap-2 pl-12" data-testid="shopping-item-form">
          <label htmlFor={`${fieldId}-amount`} className="text-sm font-semibold text-fg">
            {t("amountLabel", { name: item.name })}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={`${fieldId}-amount`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={60}
              autoComplete="off"
              enterKeyHint="done"
              aria-describedby={`${fieldId}-hint`}
              aria-invalid={error ? true : undefined}
              className="w-40"
              autoFocus
            />
            <Button type="submit" loading={pending} data-testid="shopping-item-save">
              {t("save")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                focusEdit();
              }}
              disabled={pending}
            >
              {t("cancel")}
            </Button>
          </div>
          <p id={`${fieldId}-hint`} className="type-caption text-fg-muted">
            {t("amountHint")}
          </p>
          {error ? (
            <p role="alert" className="type-caption font-medium text-danger">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
      {/* produto avulso validado do ingrediente nos mesmos 4 estados; sem vínculo: "Sem produto correspondente" */}
      <div className="pl-12">
        <OfferBlock offer={item.offer} compact />
      </div>
      {item.alsoIn.length > 0 ? (
        <p className="pl-12 type-caption text-fg-muted" data-testid="shopping-also-in">
          {t("alsoIn", { recipes: item.alsoIn.map((r) => r.title).join(", ") })}
        </p>
      ) : null}
    </li>
  );
}

// Lista agrupada por receita com as ações: marcar comprado (otimista, anunciado em aria-live), editar
// a quantidade, remover, "Limpar comprados" e "Limpar lista" (ambos com confirmação). O servidor confirma
// cada ação; se falhar, a marcação volta e o erro é anunciado.
export function ShoppingListView({ data }: { data: ShoppingListData }) {
  const t = useTranslations("shopping");
  const { toast } = useToast();
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [announce, setAnnounce] = useState("");
  // confirmação antes de apagar: "Limpar comprados" e "Limpar lista" (nenhum dos dois tem desfazer)
  // o tipo fica guardado ao fechar, para o texto não trocar durante a animação de saída
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmKind, setConfirmKind] = useState<"checked" | "all">("all");
  const openConfirm = (kind: "checked" | "all") => {
    setConfirmKind(kind);
    setConfirmOpen(true);
  };
  const [pending, startTransition] = useTransition();
  const countRef = useRef<HTMLParagraphElement>(null);

  const errorText = (code: string) => (t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"));
  const isChecked = (item: ShoppingListItemView) => overrides[item.id] ?? item.checked;
  const groups = data.groups.map((g) => ({ ...g, items: g.items.filter((i) => !removed.has(i.id)) })).filter((g) => g.items.length > 0);
  const all = groups.flatMap((g) => g.items);
  const checkedCount = all.filter(isChecked).length;

  function toggle(item: ShoppingListItemView, next: boolean) {
    setOverrides((o) => ({ ...o, [item.id]: next }));
    setAnnounce(next ? t("page.announceChecked", { name: item.name }) : t("page.announceUnchecked", { name: item.name }));
    void setShoppingItemChecked({ id: item.id, checked: next }).then((result) => {
      if (result.ok) return;
      // volta ao que estava e avisa
      setOverrides((o) => ({ ...o, [item.id]: !next }));
      setAnnounce(errorText(result.error));
      toast({ title: errorText(result.error), variant: "error" });
    });
  }

  function remove(item: ShoppingListItemView) {
    // o <li> com o botão focado desmonta: o foco vai para o item seguinte (ou o anterior, ou o contador)
    const index = all.findIndex((i) => i.id === item.id);
    const target = all[index + 1] ?? all[index - 1] ?? null;
    setRemoved((s) => new Set(s).add(item.id));
    window.setTimeout(() => {
      const box = target ? document.querySelector<HTMLInputElement>(`[data-item-id="${target.id}"] input[type="checkbox"]`) : null;
      (box ?? countRef.current)?.focus();
    }, 0);
    setAnnounce(t("page.removed", { name: item.name }));
    void removeShoppingItem({ id: item.id }).then((result) => {
      if (result.ok) return;
      setRemoved((s) => {
        const next = new Set(s);
        next.delete(item.id);
        return next;
      });
      toast({ title: errorText(result.error), variant: "error" });
    });
  }

  function clearChecked() {
    if (checkedCount === 0) return;
    startTransition(async () => {
      const result = await clearCheckedShoppingItems();
      if (!result.ok) {
        toast({ title: errorText(result.error), variant: "error" });
        return;
      }
      setConfirmOpen(false);
      const message = t("page.clearedChecked", { n: result.removed });
      setAnnounce(message);
      toast({ title: message, variant: "success" });
    });
  }

  function clearAll() {
    startTransition(async () => {
      const result = await clearShoppingList({ confirm: true });
      if (!result.ok) {
        toast({ title: errorText(result.error), variant: "error" });
        return;
      }
      setConfirmOpen(false);
      setAnnounce(t("page.cleared"));
      toast({ title: t("page.cleared"), variant: "success" });
    });
  }

  return (
    <div className="flex flex-col gap-6" data-testid="shopping-list">
      {!data.commerceEnabled ? (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft/40 p-4" data-testid="shopping-commerce-off">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-fg">{t("page.commerceOffTitle")}</p>
            <p className="type-body-sm text-fg-muted">{t("page.commerceOffDescription")}</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p ref={countRef} tabIndex={-1} className="type-caption text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" data-testid="shopping-count">
          {t("page.count", { n: all.length, checked: checkedCount })}
        </p>
        <div className="flex flex-wrap gap-2">
          {/* aria-disabled: sem comprados o botão continua focável e não some do teclado */}
          <Button
            type="button"
            variant="secondary"
            onClick={() => checkedCount > 0 && openConfirm("checked")}
            aria-disabled={checkedCount === 0 || undefined}
            className="aria-disabled:opacity-55"
            data-testid="shopping-clear-checked"
          >
            {t("page.clearChecked")}
          </Button>
          <Button type="button" variant="ghost" leadingIcon={<Trash2 />} onClick={() => openConfirm("all")} data-testid="shopping-clear-all">
            {t("page.clearAll")}
          </Button>
        </div>
      </div>

      <p className="sr-only" aria-live="polite" data-testid="shopping-announce">
        {announce}
      </p>

      {groups.map((group) => {
        const headingId = `shopping-group-${group.key}`;
        const title = group.title ?? (group.contentId ? t("page.recipeUnavailable") : t("page.otherItems"));
        return (
          <section key={group.key} aria-labelledby={headingId} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="shopping-group" data-recipe={group.slug ?? ""}>
            <h2 id={headingId} className="type-h3 text-fg">
              {group.slug ? (
                <Link href={`/content/${group.slug}`} className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                  {title}
                </Link>
              ) : (
                title
              )}
            </h2>
            <ul className="flex flex-col divide-y divide-border" aria-label={t("page.itemsLabel", { title })}>
              {group.items.map((item) => (
                <ShoppingItem key={item.id} item={item} checked={isChecked(item)} onToggle={toggle} onRemove={remove} onAnnounce={setAnnounce} />
              ))}
            </ul>
            {group.contentId ? (
              <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border-strong p-3" data-testid="shopping-kit">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
                  <ShoppingCart className="size-4 text-accent-text" aria-hidden="true" />
                  {t("kit.title")}
                </h3>
                {group.kits.length === 0 ? (
                  <OfferBlock offer={{ state: "none", product: null }} />
                ) : (
                  group.kits.map((kit, index) => <OfferBlock key={kit.product?.id ?? index} offer={kit} />)
                )}
              </div>
            ) : null}
          </section>
        );
      })}

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => !pending && setConfirmOpen(open)}
        title={confirmKind === "checked" ? t("page.clearCheckedTitle") : t("page.clearAllTitle")}
        description={confirmKind === "checked" ? t("page.clearCheckedDescription", { n: checkedCount }) : t("page.clearAllDescription")}
        size="sm"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)} disabled={pending}>
              {t("page.cancel")}
            </Button>
            {confirmKind === "checked" ? (
              <Button type="button" variant="danger" onClick={clearChecked} loading={pending} data-testid="shopping-clear-checked-confirm">
                {t("page.clearCheckedConfirm")}
              </Button>
            ) : (
              <Button type="button" variant="danger" onClick={clearAll} loading={pending} data-testid="shopping-clear-all-confirm">
                {t("page.clearAllConfirm")}
              </Button>
            )}
          </>
        }
      />
    </div>
  );
}
