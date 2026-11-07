"use client";

import { ArrowDown, ArrowUp, ImageUp, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand-universe/BrandLogo";
import { Button, FormField, Input, Select, Switch, Textarea } from "@/components/ui";
import {
  deleteOndaCaseAction,
  reorderOndaAction,
  saveOndaCaseAction,
  saveOndaPackageAction,
  saveOndaProfileAction,
  uploadOndaAvatarAction,
} from "@/lib/onda-digital/admin-actions";
import { formatCompact, parseCompactNumber, parsePercent, type OndaMetric } from "@/lib/onda-digital/format";
import type { OndaAdminCase, OndaAdminPackage, OndaAdminProfile } from "@/lib/onda-digital/queries";
import { cn } from "@/lib/utils";

// Editor da Onda Digital (0134): o que a Groscove muda aqui aparece na hora na página das marcas.

type Msg = { ok: boolean; text: string } | null;

function Feedback({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "type-caption text-success" : "type-caption text-danger"}>
      {msg.text}
    </p>
  );
}

function Card({ children, muted, testId }: { children: ReactNode; muted?: boolean; testId?: string }) {
  return (
    <li className={cn("flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4", muted && "opacity-70")} data-testid={testId}>
      {children}
    </li>
  );
}

/* ------------------------------------------------------------------ seguidores ------------------------------------------------------------------ */

function ProfileRow({ p, canEdit }: { p: OndaAdminProfile; canEdit: boolean }) {
  const t = useTranslations("ondaDigital.editor.profiles");
  const locale = useLocale();
  const router = useRouter();
  const [followers, setFollowers] = useState(formatCompact(p.followers, locale));
  const [active, setActive] = useState(p.active);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const parsed = parseCompactNumber(followers);
  const dirty = parsed !== p.followers || active !== p.active;
  return (
    <Card muted={!active} testId="onda-editor-profile">
      <div className="flex items-center gap-3">
        {p.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatar_url} alt="" className="size-12 shrink-0 object-contain" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-surface-hover text-xs font-bold text-fg-muted" aria-hidden="true">
            @
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold text-fg">@{p.handle}</span>
          <span className="type-caption text-fg-muted">{active ? t("visible") : t("hidden")}</span>
        </div>
        {canEdit ? (
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold text-fg hover:bg-surface-hover has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
            <ImageUp className="size-4" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{t("photo")}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label={t("photo")}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const fd = new FormData();
                fd.set("id", p.id);
                fd.set("file", file);
                start(async () => {
                  const r = await uploadOndaAvatarAction(fd);
                  setMsg(r.ok ? { ok: true, text: t("saved") } : { ok: false, text: r.error });
                  if (r.ok) router.refresh();
                });
              }}
            />
          </label>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <FormField label={t("followers")} hint={parsed === null ? t("invalid") : t("preview", { value: new Intl.NumberFormat(locale).format(parsed) })}>
          <Input value={followers} onChange={(e) => setFollowers(e.target.value)} disabled={!canEdit} inputMode="decimal" invalid={parsed === null} />
        </FormField>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <Switch checked={active} onCheckedChange={setActive} label={t("visibleSwitch")} />
            <Button
              size="sm"
              loading={pending}
              disabled={!dirty || parsed === null}
              onClick={() =>
                start(async () => {
                  const r = await saveOndaProfileAction({ id: p.id, followers: parsed ?? undefined, active });
                  setMsg(r.ok ? { ok: true, text: t("saved") } : { ok: false, text: r.error });
                  if (r.ok) router.refresh();
                })
              }
              data-testid="onda-editor-profile-save"
            >
              {t("save")}
            </Button>
          </div>
        ) : null}
      </div>
      <Feedback msg={msg} />
    </Card>
  );
}

export function OndaProfilesEditor({ network, profiles, canEdit }: { network: "instagram" | "x"; profiles: OndaAdminProfile[]; canEdit: boolean }) {
  const t = useTranslations("ondaDigital.editor.profiles");
  const locale = useLocale();
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [followers, setFollowers] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const parsed = parseCompactNumber(followers);
  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <form
          className="flex flex-col gap-3 rounded-2xl border border-dashed border-border-strong bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await saveOndaProfileAction({ network, handle, followers: parsed ?? undefined, active: true });
              if (!r.ok) return setMsg({ ok: false, text: r.error });
              setMsg({ ok: true, text: t("added") });
              setHandle("");
              setFollowers("");
              router.refresh();
            });
          }}
        >
          <h2 className="text-sm font-semibold text-fg">{network === "x" ? t("addX") : t("add")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t("handle")}>
              <Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@" autoCapitalize="none" spellCheck={false} required />
            </FormField>
            <FormField
              label={t("followers")}
              hint={followers && parsed === null ? t("invalid") : parsed !== null ? t("preview", { value: new Intl.NumberFormat(locale).format(parsed) }) : t("followersHint")}
            >
              <Input value={followers} onChange={(e) => setFollowers(e.target.value)} inputMode="decimal" required />
            </FormField>
          </div>
          <Button type="submit" size="sm" leadingIcon={<Plus />} loading={pending} disabled={!handle.trim() || parsed === null} className="self-start">
            {network === "x" ? t("addX") : t("add")}
          </Button>
          <Feedback msg={msg} />
        </form>
      ) : null}
      <p className="type-caption text-fg-muted">{t("order")}</p>
      <ul className="grid gap-3 lg:grid-cols-2">
        {profiles.map((p) => (
          <ProfileRow key={p.id} p={p} canEdit={canEdit} />
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ cases ------------------------------------------------------------------ */

type MetricDraft = { k: OndaMetric["k"]; value: string; plus: boolean };
const METRIC_KINDS: OndaMetric["k"][] = ["reach", "impressions", "impacts", "feed_reach"];

function metricToDraft(m: OndaMetric, locale: string): MetricDraft {
  return { k: m.k, value: m.k === "feed_reach" ? new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(m.v) : formatCompact(m.v, locale), plus: Boolean(m.plus) };
}
function draftToMetric(d: MetricDraft): OndaMetric | null {
  const v = d.k === "feed_reach" ? parsePercent(d.value) : parseCompactNumber(d.value);
  if (v === null) return null;
  return d.plus ? { k: d.k, v, plus: true } : { k: d.k, v };
}

function CaseForm({
  initial,
  categories,
  canEdit,
  onDone,
  extra,
}: {
  initial: { id?: string; brand: string; logo_url?: string | null; category: string | null; description: string; metrics: OndaMetric[]; active: boolean };
  categories: Array<{ slug: string; name: string }>;
  canEdit: boolean;
  onDone?: () => void;
  extra?: ReactNode;
}) {
  const t = useTranslations("ondaDigital.editor.cases");
  const tm = useTranslations("ondaDigital.cases.metrics");
  const locale = useLocale();
  const router = useRouter();
  const [brand, setBrand] = useState(initial.brand);
  const [category, setCategory] = useState(initial.category ?? "");
  const [description, setDescription] = useState(initial.description);
  const [metrics, setMetrics] = useState<MetricDraft[]>(initial.metrics.map((m) => metricToDraft(m, locale)));
  const [active, setActive] = useState(initial.active);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const parsedMetrics = metrics.map(draftToMetric);
  const invalid = parsedMetrics.some((m) => m === null) || !brand.trim() || !description.trim();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveOndaCaseAction({
            id: initial.id,
            brandName: brand,
            category,
            description,
            metrics: parsedMetrics.filter((m): m is OndaMetric => m !== null),
            active,
          });
          if (!r.ok) return setMsg({ ok: false, text: r.error });
          setMsg({ ok: true, text: t("saved") });
          router.refresh();
          onDone?.();
        });
      }}
    >
      <div className="flex items-center gap-3">
        <BrandLogo name={brand || "?"} url={initial.logo_url ?? null} />
        <p className="type-caption text-fg-muted">{initial.id ? (initial.logo_url ? t("logoFound") : t("noLogo")) : t("brandHint")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("brand")}>
          <Input value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={60} disabled={!canEdit} required />
        </FormField>
        <FormField label={t("category")}>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} disabled={!canEdit}>
            <option value="">{t("noCategory")}</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField label={t("description")}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={3} disabled={!canEdit} required />
      </FormField>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-fg">{t("metrics")}</legend>
        {metrics.map((m, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-2">
            <FormField label={t("metricKind")} className="min-w-36 flex-1">
              <Select
                value={m.k}
                onChange={(e) => setMetrics((all) => all.map((x, j) => (j === i ? { ...x, k: e.target.value as OndaMetric["k"] } : x)))}
                disabled={!canEdit}
                selectSize="sm"
              >
                {METRIC_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {tm(k)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t("metricValue")} className="w-32" error={parsedMetrics[i] === null ? t("invalidValue") : undefined}>
              <Input
                value={m.value}
                onChange={(e) => setMetrics((all) => all.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                disabled={!canEdit}
                inputMode="decimal"
                inputSize="sm"
              />
            </FormField>
            {m.k !== "feed_reach" ? (
              <label className="inline-flex min-h-9 items-center gap-1.5 text-sm text-fg">
                <input type="checkbox" checked={m.plus} onChange={(e) => setMetrics((all) => all.map((x, j) => (j === i ? { ...x, plus: e.target.checked } : x)))} disabled={!canEdit} />
                {t("metricPlus")}
              </label>
            ) : null}
            {canEdit ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setMetrics((all) => all.filter((_, j) => j !== i))}>
                {t("removeMetric")}
              </Button>
            ) : null}
          </div>
        ))}
        {canEdit && metrics.length < 4 ? (
          <Button type="button" size="sm" variant="secondary" leadingIcon={<Plus />} className="self-start" onClick={() => setMetrics((all) => [...all, { k: "reach", value: "", plus: false }])}>
            {t("addMetric")}
          </Button>
        ) : null}
        <p className="type-caption text-fg-muted">{t("valueHint")}</p>
      </fieldset>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Switch checked={active} onCheckedChange={setActive} label={t("visible")} />
          <Button type="submit" size="sm" loading={pending} disabled={invalid} data-testid="onda-editor-case-save">
            {initial.id ? t("save") : t("create")}
          </Button>
          {extra}
        </div>
      ) : null}
      <Feedback msg={msg} />
    </form>
  );
}

function DeleteCase({ id }: { id: string }) {
  const t = useTranslations("ondaDigital.editor.cases");
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant={confirm ? "danger" : "ghost"}
      leadingIcon={<Trash2 />}
      loading={pending}
      onClick={() => {
        if (!confirm) return setConfirm(true);
        start(async () => {
          const r = await deleteOndaCaseAction(id);
          if (r.ok) router.refresh();
          setConfirm(false);
        });
      }}
    >
      {confirm ? t("confirmDelete") : t("delete")}
    </Button>
  );
}

function MoveButtons({ index, total, onMove }: { index: number; total: number; onMove: (from: number, to: number) => void }) {
  const t = useTranslations("ondaDigital.editor");
  return (
    <span className="flex gap-1">
      <Button type="button" size="sm" variant="ghost" aria-label={t("up")} disabled={index === 0} onClick={() => onMove(index, index - 1)}>
        <ArrowUp className="size-4" aria-hidden="true" />
      </Button>
      <Button type="button" size="sm" variant="ghost" aria-label={t("down")} disabled={index === total - 1} onClick={() => onMove(index, index + 1)}>
        <ArrowDown className="size-4" aria-hidden="true" />
      </Button>
    </span>
  );
}

function useReorder<T>(kind: "cases" | "packages", items: T[], key: (x: T) => string) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const move = (from: number, to: number) => {
    const next = [...items];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it!);
    start(async () => {
      const r = await reorderOndaAction({ kind, keys: next.map(key) });
      if (r.ok) router.refresh();
    });
  };
  return { move, pending };
}

export function OndaCasesEditor({ cases, categories, canEdit }: { cases: OndaAdminCase[]; categories: Array<{ slug: string; name: string }>; canEdit: boolean }) {
  const t = useTranslations("ondaDigital.editor.cases");
  const [adding, setAdding] = useState(false);
  const { move } = useReorder("cases", cases, (c) => c.id);
  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        adding ? (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface p-4">
            <CaseForm
              initial={{ brand: "", category: null, description: "", metrics: [{ k: "reach", v: 0 }], active: true }}
              categories={categories}
              canEdit
              onDone={() => setAdding(false)}
            />
          </div>
        ) : (
          <Button size="sm" leadingIcon={<Plus />} className="self-start" onClick={() => setAdding(true)}>
            {t("add")}
          </Button>
        )
      ) : null}
      <ul className="flex flex-col gap-3">
        {cases.map((c, i) => (
          <Card key={c.id} muted={!c.active} testId="onda-editor-case">
            <div className="flex items-center justify-between gap-2">
              <span className="type-caption text-fg-muted">#{i + 1}</span>
              {canEdit ? <MoveButtons index={i} total={cases.length} onMove={move} /> : null}
            </div>
            <CaseForm
              initial={{ id: c.id, brand: c.brand, logo_url: c.logo_url, category: c.category, description: c.description, metrics: c.metrics, active: c.active }}
              categories={categories}
              canEdit={canEdit}
              extra={<DeleteCase id={c.id} />}
            />
          </Card>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ ondas ------------------------------------------------------------------ */

function PackageForm({ initial, canEdit, onDone }: { initial: { slug?: string; name: string; scope: string; description: string; active: boolean }; canEdit: boolean; onDone?: () => void }) {
  const t = useTranslations("ondaDigital.editor.packages");
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [scope, setScope] = useState(initial.scope);
  const [description, setDescription] = useState(initial.description);
  const [active, setActive] = useState(initial.active);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveOndaPackageAction({ slug: initial.slug, name, scope, description, active });
          if (!r.ok) return setMsg({ ok: false, text: r.error });
          setMsg({ ok: true, text: t("saved") });
          router.refresh();
          onDone?.();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} disabled={!canEdit} required />
        </FormField>
        <FormField label={t("scope")} hint={t("scopeHint")}>
          <Input value={scope} onChange={(e) => setScope(e.target.value)} maxLength={120} disabled={!canEdit} required />
        </FormField>
      </div>
      <FormField label={t("description")}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} disabled={!canEdit} required />
      </FormField>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Switch checked={active} onCheckedChange={setActive} label={t("visible")} />
          <Button type="submit" size="sm" loading={pending} disabled={name.trim().length < 2 || scope.trim().length < 2 || description.trim().length < 2} data-testid="onda-editor-package-save">
            {initial.slug ? t("save") : t("create")}
          </Button>
        </div>
      ) : null}
      <Feedback msg={msg} />
    </form>
  );
}

export function OndaPackagesEditor({ packages, canEdit }: { packages: OndaAdminPackage[]; canEdit: boolean }) {
  const t = useTranslations("ondaDigital.editor.packages");
  const [adding, setAdding] = useState(false);
  const { move } = useReorder("packages", packages, (p) => p.slug);
  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        adding ? (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface p-4">
            <PackageForm initial={{ name: "", scope: "", description: "", active: true }} canEdit onDone={() => setAdding(false)} />
          </div>
        ) : (
          <Button size="sm" leadingIcon={<Plus />} className="self-start" onClick={() => setAdding(true)}>
            {t("add")}
          </Button>
        )
      ) : null}
      <p className="type-caption text-fg-muted">{t("keepHint")}</p>
      <ul className="flex flex-col gap-3">
        {packages.map((p, i) => (
          <Card key={p.slug} muted={!p.active} testId="onda-editor-package">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-fg">{p.name}</span>
              {canEdit ? <MoveButtons index={i} total={packages.length} onMove={move} /> : null}
            </div>
            <PackageForm initial={{ slug: p.slug, name: p.name, scope: p.scope, description: p.description, active: p.active }} canEdit={canEdit} />
          </Card>
        ))}
      </ul>
    </div>
  );
}
