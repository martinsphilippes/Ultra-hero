"use client";

import { ArrowRight, CheckCircle2, ChevronDown, Clock, Flag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { moveDealAction } from "@/app/agencia/negocios/actions";
import { Badge, Button, buttonBase, buttonSizes, buttonVariants, Dialog, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import { confirmContractAction } from "@/lib/execution/actions";
import type { FlowParty } from "@/lib/deals/next-step";
import { TURN_PREVIEW, type TurnItem } from "@/lib/deals/turn-queue";
import { cn } from "@/lib/utils";

type Props = { party: FlowParty; items: TurnItem[] };

// "Sua vez" no topo da tela inicial (agência, marca e Hero; pedido do responsável 05/11): o mesmo próximo passo do
// NextStepCard de cada negócio, juntado numa lista do mais urgente para o menos. Até 3 à vista e "Ver todos (N)" abre o
// resto aqui mesmo. "Confirmar a contratação" e "Encerrar como ganha" (agência, gestor+) rodam aqui, com confirmação
// curta; as demais levam direto à aba/âncora da ação. Sem nada esperando: uma linha discreta.
export function TurnCard({ party, items }: Props) {
  const t = useTranslations("nextStep");
  const [expanded, setExpanded] = useState(false);
  const [asking, setAsking] = useState<TurnItem | null>(null);
  const listId = useId();
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 type-body-sm text-fg-muted" data-testid="turn-card-empty">
        <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
        {t("turn.empty")}
      </p>
    );
  }

  const shown = expanded ? items : items.slice(0, TURN_PREVIEW);
  const rest = items.length - TURN_PREVIEW;

  function run(item: TurnItem) {
    start(async () => {
      const result =
        item.quick === "confirmContract"
          ? await confirmContractAction({ dealId: item.dealId })
          : await moveDealAction({ dealId: item.dealId, to: "closed", outcome: "won", note: "", force: false });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
      setAsking(null);
      if (result.ok) router.refresh();
    });
  }

  return (
    <section aria-labelledby="turn-card-title" className="flex flex-col gap-3 rounded-2xl border border-accent/50 bg-accent-soft/40 p-4 sm:p-5" data-testid="turn-card" data-party={party}>
      <div className="flex flex-wrap items-center gap-2">
        <Flag className="size-5 text-accent-text" aria-hidden="true" />
        <h2 id="turn-card-title" className="text-base font-semibold text-fg">
          {t("turn.title")}
        </h2>
        <Badge size="sm" variant="accent">
          {t("turn.count", { count: items.length })}
        </Badge>
      </div>
      <ul id={listId} className="flex flex-col gap-2" aria-label={t("turn.listLabel")}>
        {shown.map((item) => (
          <TurnRow key={item.key} item={item} onQuick={() => setAsking(item)} busy={pending && asking?.key === item.key} />
        ))}
      </ul>
      {rest > 0 ? (
        <Button type="button" variant="ghost" size="md" className="w-full sm:w-fit" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded((v) => !v)} trailingIcon={<ChevronDown className={cn("transition-transform", expanded && "rotate-180")} />} data-testid="turn-card-all">
          {expanded ? t("turn.seeLess") : t("turn.seeAll", { count: items.length })}
        </Button>
      ) : null}
      <Dialog
        open={asking !== null}
        onOpenChange={(open) => (!open && !pending ? setAsking(null) : undefined)}
        size="sm"
        title={asking ? t(`turn.confirm.${asking.quick ?? "confirmContract"}.title`, { deal: asking.title }) : ""}
        description={asking ? t(`turn.confirm.${asking.quick ?? "confirmContract"}.hint`) : undefined}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setAsking(null)} disabled={pending}>
              {t("turn.back")}
            </Button>
            <Button type="button" onClick={() => asking && run(asking)} loading={pending} data-testid="turn-card-run">
              {asking ? t(`actions.${asking.step.code}.cta`) : ""}
            </Button>
          </>
        }
      />
    </section>
  );
}

function TurnRow({ item, onQuick, busy }: { item: TurnItem; onQuick: () => void; busy: boolean }) {
  const t = useTranslations("nextStep");
  const tk = useTranslations("commercial.deliverableKinds");
  const locale = useLocale() as Locale;
  const p = item.step.params;
  const itemLabel = p.item || (p.kind ? (tk.has(p.kind) ? tk(p.kind) : p.kind) : "");
  const names = [p.brand ? t("theBrand") : null, ...(p.names ?? [])].filter(Boolean).join(", ");
  const title = t(`actions.${item.step.code}.title`, { hero: p.hero ?? "", item: itemLabel, names, count: p.count ?? 0 });
  const cta = t(`actions.${item.step.code}.cta`);
  const context = [item.counterpart, t(`steps.${item.flow}`)].filter(Boolean).join(" · ");
  const cls = cn(buttonBase, buttonVariants.primary, buttonSizes.md, "w-full sm:w-fit");

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4" data-testid="turn-item" data-code={item.step.code}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate type-caption text-fg-muted">
          <span className="font-medium text-fg">{item.title}</span>
          {context ? ` · ${context}` : null}
        </span>
        <span className="text-sm font-semibold leading-snug text-fg">{title}</span>
        {item.day ? (
          <span className={cn("flex items-center gap-1 type-caption font-medium", item.late ? "text-danger" : "text-fg-muted")}>
            <Clock className="size-3.5" aria-hidden="true" />
            {t(item.late ? "deadlineLate" : "deadline", { date: formatPlainDate(item.day, locale) })}
          </span>
        ) : null}
      </div>
      {item.quick ? (
        <Button type="button" size="md" leadingIcon={<CheckCircle2 />} onClick={onQuick} loading={busy} className="w-full shrink-0 sm:w-fit" aria-label={`${cta} · ${item.title}`} data-testid="turn-item-quick">
          {cta}
        </Button>
      ) : item.href ? (
        <Link href={item.href} className={cn(cls, "shrink-0")} aria-label={`${cta} · ${item.title}`} data-testid="turn-item-cta">
          {cta}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </li>
  );
}
