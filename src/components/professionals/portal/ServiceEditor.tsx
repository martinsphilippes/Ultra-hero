"use client";

import { Pencil, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { Badge, Button, Checkbox, Dialog, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatCurrency } from "@/i18n/format";
import type { ServiceView } from "@/lib/professionals/queries";
import { MAX_SERVICES_PER_PROFESSIONAL, parsePriceInput, SERVICE_MODES, type ServiceKind, type ServiceMode } from "@/lib/professionals/rules";
import type { ServiceValues } from "@/lib/professionals/schemas";

export type SaveServiceFn = (id: string | null, values: ServiceValues & { admin_disabled?: boolean; note?: string }) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;

type Props = {
  services: ServiceView[];
  onSave: SaveServiceFn;
  /** Admin: mostra "Desativado pela equipe" e a observação de auditoria. */
  admin?: boolean;
};

type Draft = { title: string; description: string; kind: ServiceKind; mode: ServiceMode; minutes: string; weeks: string; price: string; active: boolean; disabled: boolean; sort: string; note: string };

function toDraft(s: ServiceView | null): Draft {
  if (!s) return { title: "", description: "", kind: "session", mode: "online", minutes: "60", weeks: "4", price: "", active: true, disabled: false, sort: "100", note: "" };
  return {
    title: s.title,
    description: s.description,
    kind: s.kind,
    mode: s.mode,
    minutes: s.durationMinutes ? String(s.durationMinutes) : "",
    weeks: s.planWeeks ? String(s.planWeeks) : "4",
    price: String(s.priceCents / 100).replace(".", ","),
    active: s.isActive,
    disabled: s.adminDisabled,
    sort: String(s.sortOrder),
    note: "",
  };
}

// Serviços com preço (portal do profissional e admin): lista + diálogo de criar/editar.
export function ServiceEditor({ services, onSave, admin = false }: Props) {
  const t = useTranslations("professionals.portal.services");
  const tm = useTranslations("professionals");
  const te = useTranslations("professionals.errors");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState<ServiceView | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(toDraft(null));
  const [error, setError] = useState<string | null>(null);
  // id único por instância: a mesma página pode ter vários diálogos (o botão do rodapé aponta pelo atributo form)
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const canAdd = admin || services.length < MAX_SERVICES_PER_PROFESSIONAL;

  function open(s: ServiceView | null) {
    setDraft(toDraft(s));
    setError(null);
    setEditing(s ?? "new");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const price = parsePriceInput(draft.price);
    if (price === null) {
      setError(te("invalid_price"));
      return;
    }
    const values: ServiceValues & { admin_disabled?: boolean; note?: string } = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      kind: draft.kind,
      mode: draft.mode,
      duration_minutes: draft.kind === "session" ? Number(draft.minutes) || null : null,
      plan_weeks: draft.kind === "plan" ? Number(draft.weeks) || null : null,
      price_cents: price,
      is_active: draft.active,
      sort_order: Number(draft.sort) || 0,
      ...(admin ? { admin_disabled: draft.disabled, note: draft.note.trim() } : {}),
    };
    setError(null);
    startTransition(async () => {
      const result = await onSave(editing === "new" || editing === null ? null : editing.id, values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(null);
      toast({ title: result.message, variant: "success" });
      router.refresh();
    });
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className="flex flex-col gap-3" data-testid="service-editor">
      {services.length === 0 ? <p className="type-body-sm text-fg-muted">{t("empty")}</p> : null}
      <ul className="flex flex-col gap-2">
        {services.map((s) => (
          <li key={s.id} className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="service-editor-row">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="font-semibold text-fg">{s.title}</p>
              <p className="type-caption text-fg-muted">
                {[tm(`mode.${s.mode}`), s.kind === "session" && s.durationMinutes ? tm("format.minutes", { minutes: s.durationMinutes }) : null, s.kind === "plan" && s.planWeeks ? tm("format.weeks", { weeks: s.planWeeks }) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {!s.isActive ? <Badge size="sm">{t("inactive")}</Badge> : null}
                {s.adminDisabled ? (
                  <Badge size="sm" variant="warning">
                    {t("disabledByAdmin")}
                  </Badge>
                ) : null}
              </div>
            </div>
            <p className="type-numeric font-semibold text-fg">{formatCurrency(s.priceCents / 100, locale)}</p>
            <Button type="button" variant="ghost" size="sm" leadingIcon={<Pencil />} onClick={() => open(s)}>
              {t("edit")}
            </Button>
          </li>
        ))}
      </ul>
      {canAdd ? (
        <Button type="button" variant="secondary" leadingIcon={<Plus />} onClick={() => open(null)} className="self-start" data-testid="service-add">
          {t("add")}
        </Button>
      ) : null}

      <Dialog
        open={editing !== null}
        onOpenChange={(next) => (!next && !pending ? setEditing(null) : undefined)}
        title={editing === "new" ? t("add") : t("edit")}
        size="md"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>
              {t("form.cancel")}
            </Button>
            <Button type="submit" form={formId} loading={pending}>
              {t("form.save")}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <FormField label={t("form.title")} required>
            <Input value={draft.title} onChange={(e) => set("title", e.target.value)} maxLength={120} disabled={pending} />
          </FormField>
          <FormField label={t("form.description")}>
            <Textarea value={draft.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} rows={3} disabled={pending} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t("form.kind")} required>
              <Select value={draft.kind} onChange={(e) => set("kind", e.target.value as ServiceKind)} disabled={pending}>
                <option value="session">{t("form.kindSession")}</option>
                <option value="plan">{t("form.kindPlan")}</option>
              </Select>
            </FormField>
            <FormField label={t("form.mode")} required>
              <Select value={draft.mode} onChange={(e) => set("mode", e.target.value as ServiceMode)} disabled={pending}>
                {SERVICE_MODES.map((m) => (
                  <option key={m} value={m}>
                    {tm(`mode.${m}`)}
                  </option>
                ))}
              </Select>
            </FormField>
            {draft.kind === "session" ? (
              <FormField label={t("form.duration")} required>
                <Input type="number" inputMode="numeric" min={15} max={480} value={draft.minutes} onChange={(e) => set("minutes", e.target.value)} disabled={pending} />
              </FormField>
            ) : (
              <FormField label={t("form.weeks")} required>
                <Input type="number" inputMode="numeric" min={1} max={52} value={draft.weeks} onChange={(e) => set("weeks", e.target.value)} disabled={pending} />
              </FormField>
            )}
            <FormField label={t("form.price")} hint={t("form.priceHint")} required>
              <Input inputMode="decimal" value={draft.price} onChange={(e) => set("price", e.target.value)} disabled={pending} data-testid="service-price" />
            </FormField>
            <FormField label={t("form.sortOrder")}>
              <Input type="number" inputMode="numeric" min={0} max={1000} value={draft.sort} onChange={(e) => set("sort", e.target.value)} disabled={pending} />
            </FormField>
          </div>
          <Checkbox label={t("form.active")} checked={draft.active} onChange={(e) => set("active", e.currentTarget.checked)} disabled={pending} />
          {admin ? (
            <>
              <Checkbox label={t("form.adminDisabled")} checked={draft.disabled} onChange={(e) => set("disabled", e.currentTarget.checked)} disabled={pending} />
              <FormField label={t("form.note")}>
                <Input value={draft.note} onChange={(e) => set("note", e.target.value)} maxLength={500} disabled={pending} />
              </FormField>
            </>
          ) : null}
          {error ? (
            <p role="alert" className="type-body-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
        </form>
      </Dialog>
    </div>
  );
}
