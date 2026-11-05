"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveDeliverablesAction } from "@/app/agencia/negocios/actions";
import { Button, DatePicker, EntitySelect, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import type { DeliverableRow } from "@/lib/deals/queries";
import { toggleIn } from "@/lib/deals/deliverable-groups";
import type { DeliverableItemInput } from "@/lib/deals/schemas";
import { DELIVERABLE_KINDS, type DeliverableKind } from "@/lib/deals/vocab";
import { NETWORKS, type Network } from "@/lib/talent/vocab";
import { talentOption, type TalentPickFields } from "@/lib/ui/entity";
import { ChoiceChips } from "./DeliverableGroupsEditor";
import { DeliverableStatusBadge } from "./StatusBadges";

type Talent = { dealTalentId: string; name: string } & TalentPickFields;
// Linha nova: vários tipos e várias redes (pedido do responsável, 04/11); ao salvar vira um entregável por
// tipo × rede, todos com o mesmo Hero, título, orientações e datas. Linhas já salvas são registros com histórico
// próprio e seguem com um tipo e uma rede.
type Item = DeliverableItemInput & { status: DeliverableRow["status"] | "new"; kinds: DeliverableKind[]; networks: Network[] };
/** Teto de itens enviados (o mesmo de deliverablesSchema). */
const MAX_ITEMS = 60;
const isNew = (i: Item) => i.id === null;
const newCount = (i: Item) => i.kinds.length * i.networks.length;

// Entregáveis planejados por creator. Os que já saíram de "planejado" ficam só leitura; remover da lista
// cancela o planejado (histórico fica). A aprovação por versão chega na P2.
export function DeliverablesEditor({ dealId, talents, items, canEdit }: { dealId: string; talents: Talent[]; items: DeliverableRow[]; canEdit: boolean }) {
  const t = useTranslations("agency.deal.deliverables");
  const tk = useTranslations("commercial.deliverableKinds");
  const tn = useTranslations("mediaKit.networks");
  const tp = useTranslations("pickers");
  const locale = useLocale();
  const talentOptions = talents.map((x) => talentOption(tp, { ...x, id: x.dealTalentId }));
  const { toast } = useToast();
  const fromProps = () =>
    items.map((d): Item => ({ id: d.id, dealTalentId: d.dealTalentId, kind: d.kind, network: (d.network ?? "") as DeliverableItemInput["network"], title: d.title, brief: d.brief, dueAt: d.dueAt?.slice(0, 10) ?? "", publishAt: d.publishAt?.slice(0, 10) ?? "", status: d.status, kinds: [], networks: [] }));
  const [list, setList] = useState<Item[]>(fromProps);
  const router = useRouter();
  // depois de salvar, a página recarrega os dados: as linhas novas viram registros com id (não são enviadas de novo)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setList(fromProps()), [items]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editable = (i: Item) => i.status === "new" || i.status === "planned" || i.status === "in_production";
  const update = (index: number, patch: Partial<Item>) => setList((cur) => cur.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  function add() {
    if (talents.length === 0) return;
    setList((cur) => [...cur, { id: null, dealTalentId: talents[0].dealTalentId, kind: "post", network: "", title: "", brief: "", dueAt: "", publishAt: "", status: "new", kinds: ["post"], networks: [] }]);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const bad = list.findIndex((i) => isNew(i) && (i.kinds.length === 0 || i.networks.length === 0));
    if (bad >= 0) return setError(t("rowProblem", { n: bad + 1, problem: t(list[bad].kinds.length === 0 ? "kindRequired" : "networkRequired") }));
    // linha nova → um item por tipo × rede; os que não podem mais ser editados vão como estão (a RPC ignora a mudança deles)
    const items = list.flatMap((i) => {
      const base = { id: i.id, dealTalentId: i.dealTalentId, title: i.title, brief: i.brief, dueAt: i.dueAt, publishAt: i.publishAt };
      if (!isNew(i)) return [{ ...base, kind: i.kind, network: i.network }];
      return i.kinds.flatMap((kind) => i.networks.map((network) => ({ ...base, kind, network })));
    });
    if (items.length > MAX_ITEMS) return setError(t("tooMany", { count: items.length, max: MAX_ITEMS }));
    start(async () => {
      const result = await saveDeliverablesAction({ dealId, items });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      router.refresh();
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
              {isNew(item) && !locked ? (
                <div className="flex flex-col gap-3">
                  <ChoiceChips
                    legend={t("kinds")}
                    options={DELIVERABLE_KINDS.map((k) => ({ value: k, label: tk(k) }))}
                    selected={item.kinds}
                    onToggle={(k) => update(index, { kinds: toggleIn(DELIVERABLE_KINDS, item.kinds, k) })}
                    disabled={pending}
                    invalid={item.kinds.length === 0}
                    describedBy={`deliv-new-${index}`}
                    testId={`deliverable-kinds-${index}`}
                  />
                  <ChoiceChips
                    legend={t("networks")}
                    options={NETWORKS.map((n) => ({ value: n, label: tn(n) }))}
                    selected={item.networks}
                    onToggle={(n) => update(index, { networks: toggleIn(NETWORKS, item.networks, n) })}
                    disabled={pending}
                    invalid={item.networks.length === 0}
                    describedBy={`deliv-new-${index}`}
                    testId={`deliverable-networks-${index}`}
                  />
                  <p id={`deliv-new-${index}`} aria-live="polite" className={newCount(item) === 0 ? "type-body-sm text-danger" : "type-body-sm text-fg-muted"}>
                    {item.kinds.length === 0
                      ? t("kindRequired")
                      : item.networks.length === 0
                        ? t("networkRequired")
                        : t("newSummary", {
                            count: newCount(item),
                            kinds: item.kinds.map((k) => tk(k)).join(" + "),
                            networks: new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(item.networks.map((n) => tn(n))),
                          })}
                  </p>
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <FormField label={t("talent")} hint={tp("hints.deliverableTalent")}>
                  <EntitySelect value={item.dealTalentId} onChange={(e) => update(index, { dealTalentId: e.target.value })} disabled={locked || pending} roleInOption={false} options={talentOptions} />
                </FormField>
                {isNew(item) ? null : (
                  <>
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
                  </>
                )}
                <FormField label={t("title")}>
                  <Input value={item.title} maxLength={120} onChange={(e) => update(index, { title: e.target.value })} disabled={locked || pending} />
                </FormField>
                <FormField label={t("dueAt")}>
                  <DatePicker value={item.dueAt} onChange={(value) => update(index, { dueAt: value })} disabled={locked || pending} />
                </FormField>
                <FormField label={t("publishAt")}>
                  <DatePicker value={item.publishAt} onChange={(value) => update(index, { publishAt: value })} disabled={locked || pending} />
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
