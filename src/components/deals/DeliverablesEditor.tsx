"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { saveDeliverablesAction } from "@/app/agencia/negocios/actions";
import { Button, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import type { DeliverableRow } from "@/lib/deals/queries";
import type { DeliverableItemInput } from "@/lib/deals/schemas";
import { DELIVERABLE_KINDS, type DeliverableKind } from "@/lib/deals/vocab";
import { NETWORKS } from "@/lib/talent/vocab";
import { DeliverableStatusBadge } from "./StatusBadges";

type Talent = { dealTalentId: string; name: string };
type Item = DeliverableItemInput & { status: DeliverableRow["status"] | "new" };

// Entregáveis planejados por creator. Os que já saíram de "planejado" ficam só leitura; remover da lista
// cancela o planejado (histórico fica). A aprovação por versão chega na P2.
export function DeliverablesEditor({ dealId, talents, items, canEdit }: { dealId: string; talents: Talent[]; items: DeliverableRow[]; canEdit: boolean }) {
  const t = useTranslations("agency.deal.deliverables");
  const tk = useTranslations("commercial.deliverableKinds");
  const tn = useTranslations("mediaKit.networks");
  const { toast } = useToast();
  const [list, setList] = useState<Item[]>(
    items.map((d) => ({ id: d.id, dealTalentId: d.dealTalentId, kind: d.kind, network: (d.network ?? "") as DeliverableItemInput["network"], title: d.title, brief: d.brief, dueAt: d.dueAt?.slice(0, 10) ?? "", publishAt: d.publishAt?.slice(0, 10) ?? "", status: d.status })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editable = (i: Item) => i.status === "new" || i.status === "planned" || i.status === "in_production";
  const update = (index: number, patch: Partial<Item>) => setList((cur) => cur.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  function add() {
    if (talents.length === 0) return;
    setList((cur) => [...cur, { id: null, dealTalentId: talents[0].dealTalentId, kind: "post", network: "", title: "", brief: "", dueAt: "", publishAt: "", status: "new" }]);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    start(async () => {
      // os que não podem mais ser editados vão como estão (a RPC ignora a mudança deles)
      const result = await saveDeliverablesAction({ dealId, items: list.map((i) => ({ id: i.id, dealTalentId: i.dealTalentId, kind: i.kind, network: i.network, title: i.title, brief: i.brief, dueAt: i.dueAt, publishAt: i.publishAt })) });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate data-testid="deliverables-editor">
      {list.length === 0 ? <p className="rounded-2xl border border-border bg-surface p-4 type-body-sm text-fg-muted">{talents.length === 0 ? t("noTalents") : t("empty")}</p> : null}
      <ul className="flex flex-col gap-3">
        {list.map((item, index) => {
          const locked = !canEdit || !editable(item);
          return (
            <li key={item.id ?? `new-${index}`} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-fg">
                  {t("item", { n: index + 1 })}
                  {item.status !== "new" ? <DeliverableStatusBadge status={item.status} /> : null}
                </span>
                {!locked ? (
                  <Button type="button" size="sm" variant="ghost" leadingIcon={<Trash2 />} onClick={() => setList((cur) => cur.filter((_, i) => i !== index))} disabled={pending} aria-label={t("removeLabel", { n: index + 1 })}>
                    <span className="sr-only sm:not-sr-only">{t("remove")}</span>
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <FormField label={t("talent")}>
                  <Select value={item.dealTalentId} onChange={(e) => update(index, { dealTalentId: e.target.value })} disabled={locked || pending}>
                    {talents.map((tal) => (
                      <option key={tal.dealTalentId} value={tal.dealTalentId}>
                        {tal.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label={t("kind")}>
                  <Select value={item.kind} onChange={(e) => update(index, { kind: e.target.value as DeliverableKind })} disabled={locked || pending}>
                    {DELIVERABLE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {tk(k)}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label={t("network")}>
                  <Select value={item.network ?? ""} onChange={(e) => update(index, { network: e.target.value as DeliverableItemInput["network"] })} disabled={locked || pending}>
                    <option value="">—</option>
                    {NETWORKS.map((n) => (
                      <option key={n} value={n}>
                        {tn(n)}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label={t("title")}>
                  <Input value={item.title} maxLength={120} onChange={(e) => update(index, { title: e.target.value })} disabled={locked || pending} />
                </FormField>
                <FormField label={t("dueAt")}>
                  <Input type="date" value={item.dueAt} onChange={(e) => update(index, { dueAt: e.target.value })} disabled={locked || pending} />
                </FormField>
                <FormField label={t("publishAt")}>
                  <Input type="date" value={item.publishAt} onChange={(e) => update(index, { publishAt: e.target.value })} disabled={locked || pending} />
                </FormField>
                <FormField label={t("brief")} className="sm:col-span-2">
                  <Textarea value={item.brief} maxLength={1000} rows={2} onChange={(e) => update(index, { brief: e.target.value })} disabled={locked || pending} />
                </FormField>
              </div>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" leadingIcon={<Plus />} onClick={add} disabled={pending || talents.length === 0}>
            {t("add")}
          </Button>
          <Button type="submit" size="sm" leadingIcon={<Save />} loading={pending} data-testid="deliverables-save">
            {t("save")}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
