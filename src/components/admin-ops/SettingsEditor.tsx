"use client";

import { Plus, TriangleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { setSetting, type EditableSettingKey } from "@/app/admin/ops-actions";
import { ConfirmActionDialog } from "@/components/admin";
import { Badge, FormField, IconButton, Input, Select, Switch } from "@/components/ui";
import type { Json } from "@/lib/supabase/database.types";

export type SettingRow = { key: string; value: Json; description: string | null; updated_at: string | null };

type Props = { settings: SettingRow[]; updatedAtLabels: Record<string, string> };

// Especificação tipada das chaves conhecidas (o servidor valida de novo).
type Spec =
  | { key: EditableSettingKey; kind: "switch"; kill?: boolean }
  | { key: EditableSettingKey; kind: "number"; min: number; max: number }
  | { key: EditableSettingKey; kind: "select"; options: string[] }
  | { key: "bootstrap_admin_emails"; kind: "emails" }
  | { key: "retention.days"; kind: "readonly" };

const SPECS: Spec[] = [
  { key: "commerce.enabled", kind: "switch", kill: true },
  { key: "ai.enabled", kind: "switch", kill: true },
  { key: "experiment.open", kind: "switch", kill: true },
  { key: "ai.provider", kind: "select", options: ["deterministic", "openai", "gemini"] },
  { key: "ai.rate_limit_per_hour", kind: "number", min: 0, max: 1000 },
  { key: "transport.minutes_per_step", kind: "number", min: 0, max: 10080 },
  { key: "video.provider", kind: "select", options: ["embed", "cloudflare_stream", "mux"] },
  { key: "retention.days", kind: "readonly" },
  { key: "bootstrap_admin_emails", kind: "emails" },
];

const msgKey = (key: string) => key.replace(/\./g, "_") as "commerce_enabled";

function display(value: Json | undefined): string {
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

// Editor de app_settings: controles tipados por chave; salvar passa pelo diálogo com justificativa.
export function SettingsEditor({ settings, updatedAtLabels }: Props) {
  const t = useTranslations("adminOps.settings");
  const byKey = new Map(settings.map((s) => [s.key, s]));

  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
      {SPECS.map((spec) => {
        const row = byKey.get(spec.key);
        return (
          <li key={spec.key} className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                  {t(`keys.${msgKey(spec.key)}`)}
                  <code className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-[0.6875rem] font-normal text-fg-muted">{spec.key}</code>
                  {"kill" in spec && spec.kill && (
                    <Badge variant="danger" size="sm">
                      kill switch
                    </Badge>
                  )}
                </p>
                <p className="type-caption text-fg-muted">{t(`keys.${msgKey(spec.key)}_desc`)}</p>
                {row ? (
                  <p className="type-caption text-fg-subtle">{t("updatedAt", { date: updatedAtLabels[spec.key] ?? "—" })}</p>
                ) : (
                  <p className="type-caption text-warning">{t("keys.missing")}</p>
                )}
              </div>
            </div>
            <SettingControl spec={spec} current={row?.value} />
          </li>
        );
      })}
    </ul>
  );
}

function SettingControl({ spec, current }: { spec: Spec; current: Json | undefined }) {
  const t = useTranslations("adminOps.settings");
  const label = t(`keys.${msgKey(spec.key)}`);

  if (spec.kind === "readonly") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-elevated px-3 py-2">
        <code className="font-mono text-xs text-fg">{display(current)}</code>
        <Badge variant="neutral" size="sm">
          {t("readOnly")}
        </Badge>
      </div>
    );
  }

  if (spec.kind === "switch") {
    const enabled = current === true;
    const next = !enabled;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Interruptor somente-leitura mostra o estado; a mudança passa pelo diálogo com justificativa. */}
        <div className="flex items-center gap-3">
          <Switch id={`setting-${spec.key}`} checked={enabled} onCheckedChange={() => {}} disabled aria-label={label} />
          <Badge variant={enabled ? "success" : "danger"}>{enabled ? t("on") : t("off")}</Badge>
        </div>
        <ConfirmActionDialog
          triggerSize="md"
          triggerLabel={next ? t("turnOn") : t("turnOff")}
          triggerVariant={next ? "secondary" : "danger"}
          title={t("saveTitle", { key: label })}
          description={t("saveDescription", { current: display(enabled), next: display(next) })}
          requireJustification
          destructive={!next}
          action={(justification) => setSetting({ key: spec.key, value: next }, justification)}
        >
          {spec.kill && (
            <p className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft p-2 text-sm text-danger">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t("killSwitchWarning")}
            </p>
          )}
        </ConfirmActionDialog>
      </div>
    );
  }

  if (spec.kind === "number") return <NumberSetting spec={spec} current={typeof current === "number" ? current : 0} label={label} />;
  if (spec.kind === "select") return <SelectSetting spec={spec} current={typeof current === "string" ? current : spec.options[0]} label={label} />;
  return <EmailsSetting current={Array.isArray(current) ? current.filter((v): v is string => typeof v === "string") : []} label={label} />;
}

function NumberSetting({ spec, current, label }: { spec: Extract<Spec, { kind: "number" }>; current: number; label: string }) {
  const t = useTranslations("adminOps.settings");
  const [draft, setDraft] = useState(String(current));
  const next = Number(draft);
  const valid = Number.isInteger(next) && next >= spec.min && next <= spec.max;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <FormField label={label} className="w-40">
        <Input type="number" inputMode="numeric" min={spec.min} max={spec.max} value={draft} onChange={(e) => setDraft(e.target.value)} />
      </FormField>
      <ConfirmActionDialog
        triggerSize="md"
        triggerLabel={t("save")}
        triggerVariant="primary"
        title={t("saveTitle", { key: label })}
        description={t("saveDescription", { current: String(current), next: draft })}
        requireJustification
        disabled={!valid || next === current}
        action={(justification) => setSetting({ key: spec.key, value: next }, justification)}
      />
    </div>
  );
}

function SelectSetting({ spec, current, label }: { spec: Extract<Spec, { kind: "select" }>; current: string; label: string }) {
  const t = useTranslations("adminOps.settings");
  const [draft, setDraft] = useState(current);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <FormField label={label} className="w-56">
        <Select value={draft} onChange={(e) => setDraft(e.target.value)}>
          {spec.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      </FormField>
      <ConfirmActionDialog
        triggerSize="md"
        triggerLabel={t("save")}
        triggerVariant="primary"
        title={t("saveTitle", { key: label })}
        description={t("saveDescription", { current, next: draft })}
        requireJustification
        disabled={draft === current}
        action={(justification) => setSetting({ key: spec.key, value: draft }, justification)}
      />
    </div>
  );
}

// Lista de e-mails de bootstrap: adicionar/remover localmente e salvar a lista inteira com justificativa.
function EmailsSetting({ current, label }: { current: string[]; label: string }) {
  const t = useTranslations("adminOps.settings");
  const [list, setList] = useState<string[]>(current);
  const [draft, setDraft] = useState("");
  const changed = JSON.stringify(list) !== JSON.stringify(current);
  const draftValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.trim());

  function add() {
    const email = draft.trim().toLowerCase();
    if (!draftValid || list.includes(email)) return;
    setList([...list, email]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-2 text-sm text-warning">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {t("keys.bootstrap_warning")}
      </p>
      <ul className="flex flex-wrap gap-2" aria-label={label}>
        {list.map((email) => (
          <li key={email} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-elevated py-0.5 pl-3 pr-1 text-sm text-fg">
            <span className="font-mono text-xs">{email}</span>
            <IconButton label={t("keys.removeEmail", { email })} icon={<X />} size="sm" variant="ghost" onClick={() => setList(list.filter((e) => e !== email))} />
          </li>
        ))}
        {list.length === 0 && <li className="type-caption text-fg-subtle">—</li>}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <FormField label={t("keys.addEmail")} className="min-w-64 flex-1">
          <Input
            type="email"
            inputMode="email"
            placeholder={t("keys.emailPlaceholder")}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
        </FormField>
        <IconButton label={t("keys.addEmail")} icon={<Plus />} variant="secondary" onClick={add} disabled={!draftValid} />
        <ConfirmActionDialog
          triggerSize="md"
          triggerLabel={t("save")}
          triggerVariant="primary"
          title={t("saveTitle", { key: label })}
          description={t("saveDescription", { current: current.join(", ") || "—", next: list.join(", ") || "—" })}
          requireJustification
          destructive
          disabled={!changed}
          action={(justification) => setSetting({ key: "bootstrap_admin_emails", value: list }, justification)}
        />
      </div>
    </div>
  );
}
