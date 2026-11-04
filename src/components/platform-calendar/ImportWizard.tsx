"use client";

import { CheckCircle2, FileUp, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Badge, Button, FormField, Input, Select, useToast } from "@/components/ui";
import { toZonedIso } from "@/lib/deals/schemas";
import { importPlatformEventsAction } from "@/lib/platform-calendar/actions";
import {
  allowedActions,
  buildPreview,
  editRow,
  parseCsvImport,
  parseJsonImport,
  previewSummary,
  toImportPayload,
  type ExistingEvent,
  type ParsedFile,
  type PreviewRow,
  type RowAction,
} from "@/lib/platform-calendar/import";
import { collectionFromSource, PLATFORM_DEFAULT_TZ, PLATFORM_TIMEZONES, TERRITORIES, type Territory } from "@/lib/platform-calendar/vocab";
import { useCollectionLabel } from "./PlatformBadges";

type Props = { existing: ExistingEvent[] };
type View = "all" | "problems" | "duplicates" | "tentative";
const PAGE = 40;

async function sha256(text: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

// Importação do Calendário Groscove (admin, 0098): arquivo (JSON dos extratores ou CSV) → leitura → pré-visualização
// editável (título, datas, território, estado, o que fazer com cada linha) → duplicidades (chave estável ou título+data)
// → confirmação → um lote só na RPC transacional. Reimportar o mesmo arquivo não duplica (as linhas viram "ignorar").
export function ImportWizard({ existing }: Props) {
  const t = useTranslations("groscoveCalendar.import");
  const tg = useTranslations("groscoveCalendar");
  const collectionLabel = useCollectionLabel();
  const { toast } = useToast();
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [source, setSource] = useState("");
  const [timeZone, setTimeZone] = useState(PLATFORM_DEFAULT_TZ);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [view, setView] = useState<View>("all");
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const summary = useMemo(() => previewSummary(rows), [rows]);
  const visible = useMemo(
    () =>
      rows.filter((r) =>
        view === "problems" ? r.errors.length > 0 || r.warnings.includes("territory_unknown") : view === "duplicates" ? r.duplicate !== null : view === "tentative" ? r.tentative : true,
      ),
    [rows, view],
  );
  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  const shown = visible.slice(page * PAGE, page * PAGE + PAGE);

  async function onFile(f: File | undefined) {
    setError(null);
    setDone(null);
    setRows([]);
    setFile(null);
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) return setError(t("errors.too_big"));
    const text = await f.text();
    const isCsv = /\.csv$/i.test(f.name) || f.type === "text/csv";
    const fallback = f.name.replace(/\.(json|csv)$/i, "");
    const yearGuess = /\b(20\d{2})\b/.exec(f.name)?.[1];
    const result = isCsv ? parseCsvImport(text, fallback, yearGuess ? Number(yearGuess) : null) : parseJsonImport(text, fallback);
    if (!result.ok) return setError(t(`errors.${result.error}`));
    setFileName(f.name);
    setFileHash(await sha256(text));
    setSource(result.file.source);
    setFile(result.file);
    setRows(buildPreview(result.file, existing));
    setView("all");
    setPage(0);
  }

  function update(index: number, patch: Parameters<typeof editRow>[1]) {
    setRows((list) => list.map((r) => (r.index === index ? editRow(r, patch, file?.year) : r)));
  }

  function bulk(action: RowAction, which: (r: PreviewRow) => boolean) {
    setRows((list) => list.map((r) => (which(r) && allowedActions(r).includes(action) ? { ...r, action } : r)));
  }

  function confirm() {
    if (!file) return;
    const chosen = rows.filter((r) => r.action !== "skip");
    if (chosen.length === 0) return setError(t("errors.nothing"));
    // o lote leva também as ignoradas por duplicidade (contagem honesta na importação), sem as linhas com erro
    const batch = rows.filter((r) => r.errors.length === 0);
    const events = toImportPayload(batch, { source: source.trim() || file.source, timeZone, toZoned: toZonedIso });
    start(async () => {
      const result = await importPlatformEventsAction({
        source: source.trim() || file.source || fileName,
        fileName,
        fileHash,
        format: file.format,
        year: file.year,
        meta: file.meta,
        events,
      });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
      if (result.ok) {
        setDone(result.message);
        setRows([]);
        setFile(null);
      } else setError(result.error);
    });
  }

  const collection = source ? collectionFromSource(source) : null;

  return (
    <div className="flex flex-col gap-4" data-testid="import-wizard">
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <p className="type-body-sm text-fg-muted">{t("formatHelp")}</p>
        <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong px-4 text-sm font-semibold text-fg hover:bg-surface-hover">
          <FileUp className="size-5" aria-hidden="true" />
          {fileName || t("pick")}
          <input type="file" accept=".json,.csv,application/json,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} data-testid="import-file" />
        </label>
        {error ? (
          <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 type-body-sm text-fg">
            {error}
          </p>
        ) : null}
        {done ? (
          <p className="flex items-start gap-2 rounded-xl border border-success/40 bg-success-soft px-3 py-2 type-body-sm text-fg" data-testid="import-done">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            <span>
              {done}{" "}
              <Link href="/admin/agenda" className="font-semibold underline">
                {t("seeList")}
              </Link>
            </span>
          </p>
        ) : null}
      </section>

      {file ? (
        <>
          <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" data-testid="import-summary">
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label={t("source")} hint={collection ? t("collectionHint", { collection: collectionLabel(collection) }) : undefined}>
                <Input value={source} maxLength={200} onChange={(e) => setSource(e.target.value)} />
              </FormField>
              <FormField label={t("timezone")}>
                <Select value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
                  {PLATFORM_TIMEZONES.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <p className="type-caption text-fg-muted">
              {t("summary", { total: summary.total, create: summary.create, update: summary.update, skip: summary.skip, errors: summary.errors, duplicates: summary.duplicates, tentative: summary.tentative })}
            </p>
            <div className="flex flex-wrap gap-2">
              {(["all", "problems", "duplicates", "tentative"] as const).map((v) => (
                <Button
                  key={v}
                  type="button"
                  size="sm"
                  variant={view === v ? "primary" : "secondary"}
                  onClick={() => {
                    setView(v);
                    setPage(0);
                  }}
                >
                  {t(`views.${v}`)}
                </Button>
              ))}
            </div>
            {summary.duplicates > 0 ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => bulk("update", (r) => r.duplicate?.kind === "key")}>
                  {t("bulkUpdate")}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => bulk("skip", (r) => r.duplicate !== null)}>
                  {t("bulkSkip")}
                </Button>
              </div>
            ) : null}
          </section>

          <ol className="flex flex-col gap-3" data-testid="import-preview">
            {shown.map((r) => (
              <li key={r.index} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3" data-testid="import-row" data-action={r.action}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-xs text-fg-subtle">#{r.index + 1}</span>
                  {r.errors.map((e) => (
                    <Badge key={e} size="sm" variant="danger">
                      {t(`rowErrors.${e}`)}
                    </Badge>
                  ))}
                  {r.warnings.map((w) => (
                    <Badge key={w} size="sm" variant={w === "tentative" ? "warning" : "neutral"}>
                      {t(`rowWarnings.${w}`)}
                    </Badge>
                  ))}
                  {r.duplicate ? (
                    <Badge size="sm" variant="info">
                      {t(`duplicate.${r.duplicate.kind}`)}
                    </Badge>
                  ) : null}
                </div>
                <Input aria-label={t("columns.title")} value={r.title} maxLength={200} onChange={(e) => update(r.index, { title: e.target.value })} invalid={r.errors.includes("title")} />
                <div className="grid grid-cols-2 gap-2">
                  <Input aria-label={t("columns.start")} value={r.startDate} onChange={(e) => update(r.index, { startDate: e.target.value })} invalid={r.errors.includes("start_date")} />
                  <Input
                    aria-label={t("columns.end")}
                    placeholder={t("columns.endPlaceholder")}
                    value={r.endDate}
                    onChange={(e) => update(r.index, { endDate: e.target.value })}
                    invalid={r.errors.includes("end_date") || r.errors.includes("span")}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Select aria-label={t("columns.territory")} selectSize="sm" className="col-span-2 sm:col-span-1" value={r.territory ?? ""} onChange={(e) => update(r.index, { territory: (e.target.value || null) as Territory | null })}>
                    <option value="">{r.territoryRaw && !r.territory ? t("unknownTerritory", { value: r.territoryRaw }) : tg("noTerritory")}</option>
                    {TERRITORIES.map((k) => (
                      <option key={k} value={k}>
                        {tg(`territories.${k}`)}
                      </option>
                    ))}
                  </Select>
                  <Select aria-label={t("columns.status")} selectSize="sm" value={r.status} onChange={(e) => update(r.index, { status: e.target.value as PreviewRow["status"] })}>
                    <option value="published">{tg("status.published")}</option>
                    <option value="draft">{tg("status.draft")}</option>
                  </Select>
                  <Select aria-label={t("columns.action")} selectSize="sm" value={r.action} onChange={(e) => update(r.index, { action: e.target.value as RowAction })} data-testid="import-row-action">
                    {allowedActions(r).map((a) => (
                      <option key={a} value={a}>
                        {t(`actions.${a}`)}
                      </option>
                    ))}
                  </Select>
                </div>
                {r.duplicate?.targetTitle ? <p className="type-caption text-fg-muted">{t("duplicateOf", { title: r.duplicate.targetTitle })}</p> : null}
                {r.category || r.hashtags.length > 0 || r.highlight ? (
                  <p className="type-caption text-fg-muted">
                    {[r.category || null, r.highlight ? tg("highlight") : null, r.hashtags.map((h) => `#${h}`).join(" ") || null].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
                {r.note ? <p className="type-caption text-fg-subtle">{r.note}</p> : null}
              </li>
            ))}
          </ol>
          {pages > 1 ? (
            <nav className="flex items-center justify-between gap-2" aria-label={t("pager")}>
              <Button type="button" size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                {t("prev")}
              </Button>
              <span className="type-caption text-fg-muted">{t("page", { page: page + 1, pages })}</span>
              <Button type="button" size="sm" variant="secondary" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
                {t("next")}
              </Button>
            </nav>
          ) : null}
          <div className="sticky bottom-3 flex flex-col gap-2 rounded-2xl border border-border bg-surface-elevated p-3 shadow-lg">
            <p className="type-caption text-fg-muted">{t("confirmHint", { create: summary.create, update: summary.update })}</p>
            <Button type="button" size="lg" leadingIcon={<Upload />} onClick={confirm} disabled={pending || summary.create + summary.update === 0} data-testid="import-confirm">
              {t("confirm")}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
