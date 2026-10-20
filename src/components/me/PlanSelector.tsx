"use client";

import { Check, Undo2, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { cancelSubscription, selectModules } from "@/app/(app)/profile/actions";
import { Badge, Button, Checkbox, DemoBadge, Dialog, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import { cn } from "@/lib/utils";
import { activeModuleIds, type SubscriptionInfo } from "./subscription";

export type PlanModule = { id: string; code: string; name: string; description: string | null; price_cents_demo: number };
export type PlanBundle = { id: string; code: string; name: string; description: string | null; is_free: boolean; moduleIds: string[] };
export type ModuleDependency = { module_id: string; requires_module_id: string };

type Props = { subscription: SubscriptionInfo; modules: PlanModule[]; bundles: PlanBundle[]; dependencies: ModuleDependency[] };

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function sameSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

// Pacotes + conjunto personalizado + cancelar/voltar ao gratuito. Toda regra (preço, dependência) vem do banco.
export function PlanSelector({ subscription, modules, bundles, dependencies }: Props) {
  const t = useTranslations("me.plan");
  const tc = useTranslations("common.actions");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { toast } = useToast();
  const [current, setCurrent] = useState<string[]>(() => activeModuleIds(subscription));
  const [status, setStatus] = useState(subscription.status);
  const [custom, setCustom] = useState<string[]>(() => activeModuleIds(subscription));
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"cancel" | "free" | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const moduleById = useMemo(() => new Map(modules.map((m) => [m.id, m])), [modules]);
  const requiresOf = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const dep of dependencies) map.set(dep.module_id, [...(map.get(dep.module_id) ?? []), dep.requires_module_id]);
    return map;
  }, [dependencies]);

  const price = (cents: number) => formatCurrency(cents / 100, locale);
  const totalOf = (ids: string[]) => ids.reduce((sum, id) => sum + (moduleById.get(id)?.price_cents_demo ?? 0), 0);
  const namesOf = (ids: string[]) => ids.map((id) => moduleById.get(id)?.name ?? id).join(", ");

  // Traduz o código devolvido pela RPC (ex.: "module_dependency_missing: <a> requires <b>").
  function describeError(raw: string): string {
    const code = raw.split(":")[0].trim();
    if (code === "module_dependency_missing") {
      const [a, b] = raw.match(UUID_RE) ?? [];
      return t("errors.module_dependency_missing", { module: moduleById.get(a ?? "")?.name ?? a ?? "?", required: moduleById.get(b ?? "")?.name ?? b ?? "?" });
    }
    return t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic");
  }

  function apply(moduleIds: string[], source: "bundle" | "custom" | "free", key: string) {
    setError(null);
    setBusyKey(key);
    startTransition(async () => {
      const result = await selectModules({ moduleIds, source });
      setBusyKey(null);
      setDialog(null);
      if (!result.ok) {
        setError(describeError(result.error));
        return;
      }
      setCurrent(activeModuleIds(result.subscription));
      setCustom(activeModuleIds(result.subscription));
      setStatus(result.subscription.status);
      toast({ title: t("actions.applied"), description: t("demoNote"), variant: "success" });
      router.refresh();
    });
  }

  function cancel() {
    setError(null);
    setBusyKey("cancel");
    startTransition(async () => {
      const result = await cancelSubscription();
      setBusyKey(null);
      setDialog(null);
      if (!result.ok) {
        setError(describeError(result.error));
        return;
      }
      setStatus(result.subscription.status);
      setCurrent(activeModuleIds(result.subscription));
      setCustom([]);
      toast({ title: t("actions.cancelled"), variant: "info" });
      router.refresh();
    });
  }

  function toggleCustom(id: string, checked: boolean) {
    setCustom((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
        for (const req of requiresOf.get(id) ?? []) next.add(req);
      } else {
        next.delete(id);
        // remove também quem depende deste módulo
        for (const [mod, reqs] of requiresOf) if (reqs.includes(id)) next.delete(mod);
      }
      return Array.from(next);
    });
  }

  const customUnchanged = sameSet(custom, current) && status === "active";
  const isFreeNow = current.length === 0;

  return (
    <div className="flex flex-col gap-8">
      {error ? (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-fg">
          {error}
        </p>
      ) : null}

      {/* Pacotes */}
      <section aria-labelledby="bundles-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="bundles-title" className="type-h2 text-fg">
            {t("bundles.title")}
          </h2>
          <DemoBadge size="sm" />
        </div>
        <p className="type-body-sm text-fg-muted">{t("bundles.description")}</p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bundles.map((bundle) => {
            const total = totalOf(bundle.moduleIds);
            const isCurrent = bundle.is_free ? isFreeNow : sameSet(bundle.moduleIds, current) && status === "active";
            return (
              <li key={bundle.id} className={cn("flex flex-col gap-3 rounded-2xl border p-4", isCurrent ? "border-accent bg-accent-soft/30" : "border-border bg-surface")}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="type-h3 text-fg">{bundle.name}</h3>
                  {isCurrent ? (
                    <Badge variant="accent" icon={<Check />}>
                      {t("bundles.current")}
                    </Badge>
                  ) : null}
                </div>
                {bundle.description ? <p className="type-body-sm text-fg-muted">{bundle.description}</p> : null}
                <p className="type-caption text-fg-muted">{bundle.is_free ? t("bundles.freeIncludes") : t("bundles.includes", { modules: namesOf(bundle.moduleIds) })}</p>
                <p className="mt-auto flex flex-col">
                  <span className="type-h3 type-numeric text-fg">{t("bundles.total", { price: price(total) })}</span>
                  <span className="type-caption text-fg-muted">{t("bundles.demoPrice")}</span>
                </p>
                {bundle.is_free ? (
                  <Button variant="secondary" disabled={isCurrent || pending} onClick={() => setDialog("free")} leadingIcon={<Undo2 />}>
                    {t("actions.backToFree")}
                  </Button>
                ) : (
                  <Button variant={isCurrent ? "secondary" : "primary"} disabled={isCurrent || pending} loading={busyKey === bundle.id} onClick={() => apply(bundle.moduleIds, "bundle", bundle.id)}>
                    {t("bundles.choose")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Conjunto personalizado */}
      <section aria-labelledby="custom-title" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <h2 id="custom-title" className="type-h2 text-fg">
          {t("custom.title")}
        </h2>
        <p className="type-body-sm text-fg-muted">{t("custom.description")}</p>
        <ul className="flex flex-col divide-y divide-border">
          {modules.map((module) => {
            const requires = requiresOf.get(module.id) ?? [];
            return (
              <li key={module.id} className="py-1">
                <Checkbox
                  id={`module-${module.id}`}
                  checked={custom.includes(module.id)}
                  onChange={(e) => toggleCustom(module.id, e.target.checked)}
                  disabled={pending}
                  aria-label={t("custom.moduleLabel", { name: module.name, price: price(module.price_cents_demo) })}
                  label={
                    <span className="flex flex-wrap items-center gap-2">
                      {module.name}
                      <span className="type-numeric text-sm font-normal text-fg-muted">
                        {price(module.price_cents_demo)} · {t("bundles.demoPrice")}
                      </span>
                    </span>
                  }
                  description={
                    <>
                      {module.description}
                      {requires.length > 0 ? <span className="block text-accent-text">{t("custom.requires", { modules: namesOf(requires) })}</span> : null}
                    </>
                  }
                />
              </li>
            );
          })}
        </ul>
        <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col">
            <span aria-live="polite" className="type-caption text-fg-muted">
              {t("custom.selected", { n: custom.length })}
              {customUnchanged ? ` · ${t("custom.unchanged")}` : ""}
            </span>
            <span className="type-h3 type-numeric text-fg">{t("custom.total", { price: price(totalOf(custom)) })}</span>
            <span className="type-caption text-fg-muted">{t("actions.downgradeHint")}</span>
          </div>
          <Button
            variant="primary"
            disabled={customUnchanged || pending}
            loading={busyKey === "custom"}
            onClick={() => (custom.length === 0 ? setDialog("free") : apply(custom, "custom", "custom"))}
          >
            {t("custom.apply")}
          </Button>
        </div>
      </section>

      {status === "active" ? (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" leadingIcon={<XCircle />} onClick={() => setDialog("cancel")} disabled={pending} className="text-danger">
            {t("actions.cancel")}
          </Button>
        </div>
      ) : null}

      <Dialog
        open={dialog === "cancel"}
        onOpenChange={(open) => !pending && setDialog(open ? "cancel" : null)}
        title={t("actions.cancelTitle")}
        description={t("actions.cancelDescription")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={pending}>
              {tc("back")}
            </Button>
            <Button variant="danger" onClick={cancel} loading={busyKey === "cancel"}>
              {t("actions.cancelConfirm")}
            </Button>
          </>
        }
      >
        <p className="type-caption text-fg-muted">{t("demoNote")}</p>
      </Dialog>

      <Dialog
        open={dialog === "free"}
        onOpenChange={(open) => !pending && setDialog(open ? "free" : null)}
        title={t("actions.backToFreeTitle")}
        description={t("actions.backToFreeDescription")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={pending}>
              {tc("back")}
            </Button>
            <Button variant="primary" onClick={() => apply([], "free", "free")} loading={busyKey === "free"}>
              {t("actions.backToFreeConfirm")}
            </Button>
          </>
        }
      >
        <p className="type-caption text-fg-muted">{t("demoNote")}</p>
      </Dialog>
    </div>
  );
}
