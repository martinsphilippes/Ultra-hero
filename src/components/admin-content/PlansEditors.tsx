"use client";

import { Pencil, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveDependenciesAction, saveModuleAction, savePlanAction, type ModuleInput, type PlanInput } from "@/app/admin/plans/actions";
import { Badge, Button, Checkbox, Dialog, FormField, IconButton, Input, Switch, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";

export type ModuleRow = { id: string; code: string; name: string; description: string | null; price_cents_demo: number; is_active: boolean; sort_order: number };
export type PlanRow = { id: string; code: string; name: string; description: string | null; is_free: boolean; is_active: boolean; sort_order: number };
export type DependencyRow = { module_id: string; requires_module_id: string };
export type BundleRow = { plan_id: string; module_id: string };

const headCell = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-fg-muted";

// ---------------------------------------------------------------- módulos ----
export function ModulesEditor({ modules }: { modules: ModuleRow[] }) {
  const t = useTranslations("adminContent.plans.modules");
  const tc = useTranslations("adminContent.common");
  const ts = useTranslations("adminCommon.table");
  const locale = useLocale() as Locale;
  const [editing, setEditing] = useState<ModuleRow | null | "new">(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button type="button" size="sm" leadingIcon={<Plus />} onClick={() => setEditing("new")}>
          {t("new")}
        </Button>
      </div>
      {modules.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <caption className="sr-only">{t("caption")}</caption>
            <thead className="bg-surface-elevated">
              <tr>
                <th scope="col" className={`${headCell} hidden sm:table-cell`}>{t("code")}</th>
                <th scope="col" className={headCell}>{t("name")}</th>
                <th scope="col" className={`${headCell} text-right`}>{t("price")}</th>
                <th scope="col" className={`${headCell} hidden md:table-cell`}>{t("active")}</th>
                <th scope="col" className={`${headCell} text-right`}>{ts("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {modules.map((m) => (
                <tr key={m.id}>
                  {/* no celular o código vai para baixo do nome e libera espaço para o preço */}
                  <td className="hidden px-4 py-2 font-mono text-xs text-fg-muted sm:table-cell">{m.code}</td>
                  <td className="px-4 py-2 text-fg">
                    <span className="font-medium">{m.name}</span>
                    <span className="block font-mono text-xs text-fg-muted sm:hidden">{m.code}</span>
                    {m.description && <span className="block text-xs text-fg-muted">{m.description}</span>}
                  </td>
                  <td className="type-numeric whitespace-nowrap px-4 py-2 text-right text-fg">{formatCurrency(m.price_cents_demo / 100, locale)}</td>
                  <td className="hidden px-4 py-2 md:table-cell">
                    <Badge size="sm" variant={m.is_active ? "success" : "neutral"}>
                      {m.is_active ? tc("yes") : tc("no")}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <IconButton icon={<Pencil />} label={`${t("edit")} · ${m.name}`} size="sm" onClick={() => setEditing(m)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="type-caption text-fg-muted">{tc("demoCurrency")}</p>
      {editing !== null && <ModuleDialog module={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ModuleDialog({ module, onClose }: { module: ModuleRow | null; onClose: () => void }) {
  const t = useTranslations("adminContent.plans.modules");
  const tc = useTranslations("adminContent.common");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: module?.code ?? "",
    name: module?.name ?? "",
    description: module?.description ?? "",
    price: module ? String(module.price_cents_demo) : "0",
    is_active: module?.is_active ?? true,
    sort_order: module ? String(module.sort_order) : "100",
  });

  function submit() {
    setError(null);
    const input: ModuleInput = {
      id: module?.id ?? null,
      code: form.code,
      name: form.name,
      description: form.description,
      price_cents_demo: Number(form.price) || 0,
      is_active: form.is_active,
      sort_order: Number(form.sort_order) || 100,
    };
    startTransition(async () => {
      const result = await saveModuleAction(input);
      if (result.ok) {
        toast({ title: result.message ?? tc("saved"), variant: "success" });
        router.refresh();
        onClose();
      } else setError(result.error);
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => !next && !pending && onClose()}
      title={module ? t("edit") : t("new")}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {tc("cancel")}
          </Button>
          <Button type="button" onClick={submit} loading={pending}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormField label={t("code")} hint={t("codeHint")} required>
          <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={Boolean(module)} maxLength={40} pattern="[a-z][a-z0-9_]*" />
        </FormField>
        <FormField label={t("name")} required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} />
        </FormField>
        <FormField label={t("description")}>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} maxLength={400} />
        </FormField>
        <FormField label={t("price")} hint={t("priceHint")} required>
          <Input type="number" min={0} step={1} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </FormField>
        <FormField label={t("sort")}>
          <Input type="number" min={0} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
        </FormField>
        <Switch id="module-active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} label={t("active")} />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- dependências
export function DependenciesEditor({ modules, dependencies }: { modules: ModuleRow[]; dependencies: DependencyRow[] }) {
  const t = useTranslations("adminContent.plans.dependencies");
  return (
    <div className="flex flex-col gap-3">
      <p className="type-caption text-fg-muted">{t("selfHint")}</p>
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
        {modules.map((m) => (
          <DependencyRowEditor key={m.id} module={m} others={modules.filter((o) => o.id !== m.id)} initial={dependencies.filter((d) => d.module_id === m.id).map((d) => d.requires_module_id)} />
        ))}
      </ul>
    </div>
  );
}

function DependencyRowEditor({ module, others, initial }: { module: ModuleRow; others: ModuleRow[]; initial: string[] }) {
  const t = useTranslations("adminContent.plans.dependencies");
  const tc = useTranslations("adminContent.common");
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));
  const [pending, startTransition] = useTransition();
  const dirty = selected.size !== initial.length || initial.some((id) => !selected.has(id));

  function save() {
    startTransition(async () => {
      const result = await saveDependenciesAction(module.id, Array.from(selected));
      if (result.ok) {
        toast({ title: result.message ?? tc("saved"), variant: "success" });
        router.refresh();
      } else toast({ title: result.error, variant: "error" });
    });
  }

  return (
    <li className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
      <fieldset className="flex min-w-0 flex-col gap-1">
        <legend className="text-sm font-semibold text-fg">{t("requires", { name: module.name })}</legend>
        <div className="flex flex-wrap gap-x-4">
          {others.map((o) => (
            <Checkbox
              key={o.id}
              id={`dep-${module.id}-${o.id}`}
              label={o.name}
              checked={selected.has(o.id)}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(o.id);
                else next.delete(o.id);
                setSelected(next);
              }}
            />
          ))}
        </div>
        {selected.size === 0 && <span className="type-caption text-fg-muted">{t("noneRequired")}</span>}
      </fieldset>
      <Button type="button" size="sm" variant={dirty ? "primary" : "secondary"} onClick={save} loading={pending} disabled={!dirty}>
        {tc("save")}
      </Button>
    </li>
  );
}

// ---------------------------------------------------------------- planos (pacotes)
export function BundlesEditor({ plans, modules, bundles }: { plans: PlanRow[]; modules: ModuleRow[]; bundles: BundleRow[] }) {
  const t = useTranslations("adminContent.plans.bundles");
  const tc = useTranslations("adminContent.common");
  const ts = useTranslations("adminCommon.table");
  const [editing, setEditing] = useState<PlanRow | null | "new">(null);
  const moduleName = (id: string) => modules.find((m) => m.id === id)?.name ?? id;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button type="button" size="sm" leadingIcon={<Plus />} onClick={() => setEditing("new")}>
          {t("new")}
        </Button>
      </div>
      {plans.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <caption className="sr-only">{t("caption")}</caption>
            <thead className="bg-surface-elevated">
              <tr>
                <th scope="col" className={headCell}>{t("code")}</th>
                <th scope="col" className={headCell}>{t("name")}</th>
                <th scope="col" className={`${headCell} hidden md:table-cell`}>{t("modules")}</th>
                <th scope="col" className={`${headCell} hidden md:table-cell`}>{t("active")}</th>
                <th scope="col" className={`${headCell} text-right`}>{ts("actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {plans.map((p) => {
                const ids = bundles.filter((b) => b.plan_id === p.id).map((b) => b.module_id);
                return (
                  <tr key={p.id}>
                    <td className="px-4 py-2 font-mono text-xs text-fg-muted">{p.code}</td>
                    <td className="px-4 py-2 text-fg">
                      <span className="font-medium">{p.name}</span>
                      {p.is_free && (
                        <Badge size="sm" variant="free" className="ml-2">
                          {t("isFree")}
                        </Badge>
                      )}
                    </td>
                    <td className="hidden px-4 py-2 text-fg-muted md:table-cell">{ids.length ? ids.map(moduleName).join(", ") : t("noModules")}</td>
                    <td className="hidden px-4 py-2 md:table-cell">
                      <Badge size="sm" variant={p.is_active ? "success" : "neutral"}>
                        {p.is_active ? tc("yes") : tc("no")}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <IconButton icon={<Pencil />} label={`${t("edit")} · ${p.name}`} size="sm" onClick={() => setEditing(p)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing !== null && (
        <PlanDialog
          plan={editing === "new" ? null : editing}
          modules={modules}
          initialModules={editing === "new" ? [] : bundles.filter((b) => b.plan_id === editing.id).map((b) => b.module_id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function PlanDialog({ plan, modules, initialModules, onClose }: { plan: PlanRow | null; modules: ModuleRow[]; initialModules: string[]; onClose: () => void }) {
  const t = useTranslations("adminContent.plans.bundles");
  const tc = useTranslations("adminContent.common");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: plan?.code ?? "",
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    is_free: plan?.is_free ?? false,
    is_active: plan?.is_active ?? true,
    sort_order: plan ? String(plan.sort_order) : "100",
    modules: new Set<string>(initialModules),
  });

  function submit() {
    setError(null);
    const input: PlanInput = {
      id: plan?.id ?? null,
      code: form.code,
      name: form.name,
      description: form.description,
      is_free: form.is_free,
      is_active: form.is_active,
      sort_order: Number(form.sort_order) || 100,
      module_ids: Array.from(form.modules),
    };
    startTransition(async () => {
      const result = await savePlanAction(input);
      if (result.ok) {
        toast({ title: result.message ?? tc("saved"), variant: "success" });
        router.refresh();
        onClose();
      } else setError(result.error);
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => !next && !pending && onClose()}
      title={plan ? t("edit") : t("new")}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
            {tc("cancel")}
          </Button>
          <Button type="button" onClick={submit} loading={pending}>
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormField label={t("code")} required>
          <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={Boolean(plan)} maxLength={40} pattern="[a-z][a-z0-9_]*" />
        </FormField>
        <FormField label={t("name")} required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} />
        </FormField>
        <FormField label={t("description")}>
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} maxLength={400} />
        </FormField>
        <FormField label={t("sort")}>
          <Input type="number" min={0} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
        </FormField>
        <Switch id="plan-free" checked={form.is_free} onCheckedChange={(v) => setForm({ ...form, is_free: v })} label={t("isFree")} description={t("isFreeHint")} />
        <Switch id="plan-active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} label={t("active")} />
        <fieldset className="flex flex-col gap-1" disabled={form.is_free}>
          <legend className="text-sm font-semibold text-fg">{t("modules")}</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {modules.map((m) => (
              <Checkbox
                key={m.id}
                id={`plan-mod-${m.id}`}
                label={m.name}
                description={m.code}
                checked={form.modules.has(m.id)}
                onChange={(e) => {
                  const next = new Set(form.modules);
                  if (e.target.checked) next.add(m.id);
                  else next.delete(m.id);
                  setForm({ ...form, modules: next });
                }}
              />
            ))}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
