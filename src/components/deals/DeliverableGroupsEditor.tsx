"use client";

import { Check, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";
import { Button, FormField, QuantityInput } from "@/components/ui";
import {
  expandGroup,
  groupPieces,
  groupProblem,
  MAX_DELIVERABLE_COMBOS,
  MAX_DELIVERABLE_QUANTITY,
  newGroup,
  toggleIn,
  type DeliverableGroup,
  type GroupsResult,
} from "@/lib/deals/deliverable-groups";
import { DELIVERABLE_KINDS, type DeliverableKind } from "@/lib/deals/vocab";
import { NETWORKS, type Network } from "@/lib/talent/vocab";
import { cn } from "@/lib/utils";

// Editor de entregáveis em linhas (marca: campanha e chamada; agência: proposta, contraproposta e realinhamento).
// Cada linha tem vários tipos, uma quantidade e várias redes; ao salvar, a tela chama expandDeliverableGroups e
// manda os itens tipo × rede no formato de sempre (src/lib/deals/deliverable-groups.ts). Mobile first: chips de
// 44px que quebram linha, um grupo com legenda por seleção, aria-pressed em cada chip.

type ChipOption<T extends string> = { value: T; label: string };

/** Grupo de chips de seleção múltipla (fieldset + legenda; cada chip é um botão com aria-pressed). */
export function ChoiceChips<T extends string>({
  legend,
  options,
  selected,
  onToggle,
  disabled = false,
  invalid = false,
  describedBy,
  testId,
}: {
  legend: string;
  options: ChipOption<T>[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  testId?: string;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5" aria-describedby={describedBy} data-testid={testId}>
      <legend className={cn("mb-1 text-sm font-medium", invalid ? "text-danger" : "text-fg")}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onToggle(o.value)}
              data-value={o.value}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50",
                on ? "border-accent bg-accent-soft text-fg" : "border-border bg-surface text-fg-muted hover:bg-surface-hover hover:text-fg",
              )}
            >
              {on ? <Check className="size-4 text-accent-text" aria-hidden="true" /> : null}
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** "Gera 4 entregas: 2 Post + 2 Reels em Instagram e TikTok" (ou null se a linha ainda não está completa). */
export function useGroupSummary() {
  const t = useTranslations("brandPortal.campaigns.form.groups");
  const tk = useTranslations("commercial.deliverableKinds");
  const tn = useTranslations("mediaKit.networks");
  const locale = useLocale();
  return (g: DeliverableGroup): string | null => {
    if (groupProblem(g) !== null) return null;
    const items = expandGroup(g);
    const kinds = DELIVERABLE_KINDS.filter((k) => g.kinds.includes(k))
      .map((k) => `${items[0].quantity} ${tk(k)}`)
      .join(" + ");
    const networks = new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(NETWORKS.filter((n) => g.networks.includes(n)).map((n) => tn(n)));
    return t("summary", { count: groupPieces(g), kinds, networks });
  };
}

/** Mensagem para um resultado com problema de expandDeliverableGroups. */
export function useGroupsError() {
  const t = useTranslations("brandPortal.campaigns.form.groups");
  return (result: Extract<GroupsResult, { ok: false }>, groups: readonly DeliverableGroup[]): string => {
    if (result.problem === "tooMany") return t("tooMany", { count: groups.reduce((acc, g) => acc + expandGroup(g).length, 0), max: MAX_DELIVERABLE_COMBOS });
    return t("rowProblem", { n: (result.row ?? 0) + 1, problem: t(result.problem) });
  };
}

type EditorProps = {
  value: DeliverableGroup[];
  onChange: (next: DeliverableGroup[]) => void;
  idPrefix: string;
  disabled?: boolean;
  /** false = só leitura (sem chips clicáveis, sem adicionar/remover) */
  canEdit?: boolean;
  /** tipo marcado numa linha nova */
  defaultKind?: DeliverableKind;
  /** redes marcadas numa linha nova (ex.: as redes já escolhidas na campanha) */
  defaultNetworks?: readonly Network[];
  /** limite de linhas */
  maxRows?: number;
};

export function DeliverableGroupsEditor({ value, onChange, idPrefix, disabled = false, canEdit = true, defaultKind = "post", defaultNetworks = [], maxRows = MAX_DELIVERABLE_COMBOS }: EditorProps) {
  const t = useTranslations("brandPortal.campaigns.form");
  const tg = useTranslations("brandPortal.campaigns.form.groups");
  const tk = useTranslations("commercial.deliverableKinds");
  const tn = useTranslations("mediaKit.networks");
  const summary = useGroupSummary();
  const baseId = useId();
  const locked = disabled || !canEdit;
  const patch = (i: number, p: Partial<DeliverableGroup>) => onChange(value.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const kindOptions = DELIVERABLE_KINDS.map((k) => ({ value: k, label: tk(k) }));
  const networkOptions = NETWORKS.map((n) => ({ value: n, label: tn(n) }));
  const combos = value.reduce((acc, g) => acc + expandGroup(g).length, 0);
  const pieces = value.reduce((acc, g) => acc + groupPieces(g), 0);
  const over = combos > MAX_DELIVERABLE_COMBOS;

  return (
    <div className="flex flex-col gap-3" data-testid={`${idPrefix}-deliverables`}>
      {value.length === 0 ? <p className="type-body-sm text-fg-muted">{t("deliverablesEmpty")}</p> : null}
      <ul className="flex flex-col gap-3">
        {value.map((g, i) => {
          const problem = groupProblem(g);
          const line = summary(g);
          const noteId = `${baseId}-row-${i}`;
          return (
            <li key={i} className="flex flex-col gap-3 rounded-xl border border-border p-3" data-testid={`${idPrefix}-deliverable-row`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-fg">{tg("item", { n: i + 1 })}</span>
                {canEdit ? (
                  <Button type="button" size="sm" variant="ghost" leadingIcon={<Trash2 />} onClick={() => onChange(value.filter((_, j) => j !== i))} disabled={disabled} aria-label={t("removeDeliverable", { n: i + 1 })}>
                    <span className="sr-only sm:not-sr-only">{t("remove")}</span>
                  </Button>
                ) : null}
              </div>
              <ChoiceChips
                legend={tg("kinds")}
                options={kindOptions}
                selected={g.kinds}
                onToggle={(k) => patch(i, { kinds: toggleIn(DELIVERABLE_KINDS, g.kinds, k) })}
                disabled={locked}
                invalid={problem === "kindRequired"}
                describedBy={noteId}
                testId={`${idPrefix}-kinds-${i}`}
              />
              <FormField label={t("quantity")} hint={tg("quantityHint")} className="w-fit">
                <QuantityInput min={1} max={MAX_DELIVERABLE_QUANTITY} value={g.quantity} onValueChange={(n) => patch(i, { quantity: n })} disabled={locked} />
              </FormField>
              <ChoiceChips
                legend={tg("networks")}
                options={networkOptions}
                selected={g.networks}
                onToggle={(n) => patch(i, { networks: toggleIn(NETWORKS, g.networks, n) })}
                disabled={locked}
                invalid={problem === "networkRequired"}
                describedBy={noteId}
                testId={`${idPrefix}-networks-${i}`}
              />
              <p id={noteId} aria-live="polite" className={cn("type-body-sm", problem ? "text-danger" : "text-fg-muted")} data-testid={`${idPrefix}-deliverable-summary`}>
                {problem && problem !== "tooMany" ? tg(problem) : line}
              </p>
            </li>
          );
        })}
      </ul>
      {value.length > 0 ? (
        <p className={cn("type-caption", over ? "text-danger" : "text-fg-muted")} aria-live="polite" data-testid={`${idPrefix}-deliverables-total`}>
          {over ? tg("tooMany", { count: combos, max: MAX_DELIVERABLE_COMBOS }) : tg("total", { count: pieces, combos, max: MAX_DELIVERABLE_COMBOS })}
        </p>
      ) : null}
      {canEdit ? (
        <Button type="button" size="sm" variant="secondary" leadingIcon={<Plus />} onClick={() => onChange([...value, newGroup(defaultKind, defaultNetworks)])} disabled={disabled || value.length >= maxRows || combos >= MAX_DELIVERABLE_COMBOS} className="w-fit">
          {t("addDeliverable")}
        </Button>
      ) : null}
    </div>
  );
}
