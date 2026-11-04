"use client";

import { Eye, ImagePlus, Rocket, Save, Search, Trash2, Undo2, X } from "lucide-react";
import Image from "next/image";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Badge, Button, Checkbox, FormField, Input, NumberInput, SegmentedControl, Select, Switch, Textarea, useToast } from "@/components/ui";
import { PLATFORM_TIMEZONES } from "@/lib/platform-calendar/vocab";
import { deleteThemeAction, saveThemeAction, searchThemeEventsAction, setThemeStatusAction, startPreviewAction, uploadThemeAssetAction } from "@/lib/seasonal-theme/actions";
import { checkTokens } from "@/lib/seasonal-theme/contrast";
import { formTokensOf, formWindow, type AdminEventRef, type FormModeTokens, type ThemeFormValues } from "@/lib/seasonal-theme/form";
import type { ColorMode, Decoration, ThemeBackground } from "@/lib/seasonal-theme/vocab";
import { DECOR_POSITIONS, DECOR_SIZES, MAX_DECORATIONS, MAX_LEAD_DAYS, SEASON_AREAS } from "@/lib/seasonal-theme/vocab";
import { ThemePreview } from "./ThemePreview";

type Props = { initial: ThemeFormValues; event: AdminEventRef | null; status: "draft" | "published" | null };

const TOKEN_FIELDS: (keyof FormModeTokens)[] = ["accent", "accentSoft", "bg", "surface"];

// Criar/editar tema sazonal (admin, 0100). Nasce rascunho; publicar põe no ar na janela (sem cron). A prévia ao lado
// mostra o tema nos templates, e "Ver no app" liga a pré-visualização só para o admin (cookie de 1 h).
export function ThemeEditor({ initial, event: initialEvent, status }: Props) {
  const t = useTranslations("seasonalTheme.form");
  const ta = useTranslations("seasonalTheme.admin");
  const format = useFormatter();
  const router = useRouter();
  const { toast } = useToast();
  const [v, setV] = useState(initial);
  const [event, setEvent] = useState<AdminEventRef | null>(initialEvent);
  const [pending, start] = useTransition();
  const set = <K extends keyof ThemeFormValues>(key: K, value: ThemeFormValues[K]) => setV((x) => ({ ...x, [key]: value }));
  const tokens = formTokensOf(v);
  const contrast = checkTokens(tokens);
  const win = formWindow(v, event);
  const timezones = (PLATFORM_TIMEZONES as readonly string[]).includes(v.timezone) ? PLATFORM_TIMEZONES : [v.timezone, ...PLATFORM_TIMEZONES];
  const when = (iso: string) => format.dateTime(new Date(iso), { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: v.timezone });

  function notify(result: { ok: boolean; message?: string; error?: string }) {
    toast({ title: result.ok ? (result.message ?? "") : (result.error ?? ""), variant: result.ok ? "success" : "error" });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    start(async () => {
      const result = await saveThemeAction(v);
      notify(result);
      if (result.ok && result.id && !v.id) router.push(`/admin/temas/${result.id}`);
      else if (result.ok) router.refresh();
    });
  }

  function setStatus(next: "draft" | "published") {
    if (!v.id) return;
    start(async () => {
      const saved = await saveThemeAction(v);
      if (!saved.ok) return notify(saved);
      const result = await setThemeStatusAction({ id: v.id!, status: next });
      notify(result);
      if (result.ok) router.refresh();
    });
  }

  function preview() {
    if (!v.id) return;
    start(async () => {
      const saved = await saveThemeAction(v);
      if (!saved.ok) return notify(saved);
      const result = await startPreviewAction({ id: v.id! });
      notify(result);
      if (result.ok) window.open(v.areas.includes("app") ? "/inicio" : v.areas.includes("portals") ? "/heroi" : "/login", "_blank", "noopener");
    });
  }

  function remove() {
    if (!v.id || !window.confirm(ta("confirmDelete", { name: v.name }))) return;
    start(async () => {
      const result = await deleteThemeAction({ id: v.id! });
      notify(result);
      if (result.ok) router.push("/admin/temas");
    });
  }

  const setToken = (mode: ColorMode, key: keyof FormModeTokens, value: string) => setV((x) => ({ ...x, [mode]: { ...x[mode], [key]: value } }));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <form onSubmit={submit} className="flex flex-col gap-5" data-testid="theme-editor">
        <Card title={t("basics")}>
          <FormField label={t("name")} required hint={t("nameHint")}>
            <Input value={v.name} maxLength={80} onChange={(e) => set("name", e.target.value)} data-testid="theme-name" />
          </FormField>
          <FormField label={t("notes")} optionalLabel={t("optional")} hint={t("notesHint")}>
            <Textarea value={v.notes} maxLength={500} rows={2} onChange={(e) => set("notes", e.target.value)} />
          </FormField>
          <EventPicker event={event} onPick={(e) => { setEvent(e); set("eventId", e?.id ?? ""); if (!e) setV((x) => ({ ...x, eventId: "", startMode: "date", endMode: "date" })); }} />
        </Card>

        <Card title={t("when")}>
          <FormField label={t("startMode")}>
            <SegmentedControl
              aria-label={t("startMode")}
              value={v.startMode}
              onValueChange={(m) => set("startMode", m)}
              options={[
                { value: "date", label: t("startByDate") },
                { value: "lead_days", label: t("startByLead"), disabled: !v.eventId },
              ]}
            />
          </FormField>
          {v.startMode === "date" ? (
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t("startDate")} required>
                <Input type="date" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} />
              </FormField>
              <FormField label={t("time")}>
                <Input type="time" value={v.startTime} onChange={(e) => set("startTime", e.target.value)} />
              </FormField>
            </div>
          ) : (
            <FormField label={t("leadDays")} hint={t("leadDaysHint")}>
              <NumberInput value={v.leadDays} max={MAX_LEAD_DAYS} onValueChange={(_, n) => set("leadDays", Math.min(MAX_LEAD_DAYS, n ?? 0))} />
            </FormField>
          )}
          <FormField label={t("endMode")}>
            <SegmentedControl
              aria-label={t("endMode")}
              value={v.endMode}
              onValueChange={(m) => set("endMode", m)}
              options={[
                { value: "date", label: t("endByDate") },
                { value: "event_end", label: t("endByEvent"), disabled: !v.eventId },
              ]}
            />
          </FormField>
          {v.endMode === "date" ? (
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t("endDate")} required hint={t("endDateHint")}>
                <Input type="date" value={v.endDate} onChange={(e) => set("endDate", e.target.value)} />
              </FormField>
              <FormField label={t("time")}>
                <Input type="time" value={v.endTime} onChange={(e) => set("endTime", e.target.value)} />
              </FormField>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("timezone")}>
              <Select value={v.timezone} onChange={(e) => set("timezone", e.target.value)}>
                {timezones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t("priority")} hint={t("priorityHint")}>
              <NumberInput value={v.priority} max={1000} onValueChange={(_, n) => set("priority", Math.min(1000, n ?? 0))} />
            </FormField>
          </div>
          <p className={`rounded-lg px-3 py-2 text-sm ${win ? "bg-surface-hover" : "bg-warning-soft text-warning"}`} data-testid="theme-window">
            {win ? t("windowIs", { start: when(win.start), end: when(win.end) }) : t("windowMissing")}
          </p>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-semibold">{t("areas")}</legend>
            {SEASON_AREAS.map((a) => (
              <Checkbox
                key={a}
                label={t(`area.${a}`)}
                checked={v.areas.includes(a)}
                onChange={(e) => set("areas", e.target.checked ? [...v.areas, a] : v.areas.filter((x) => x !== a))}
              />
            ))}
            <p className="type-caption text-fg-muted">{t("areasNever")}</p>
          </fieldset>
        </Card>

        <Card title={t("colors")} hint={t("colorsHint")}>
          {(["light", "dark"] as ColorMode[]).map((mode) => (
            <fieldset key={mode} className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">{t(`mode.${mode}`)}</legend>
              <div className="grid grid-cols-2 gap-3">
                {TOKEN_FIELDS.map((key) => (
                  <ColorField key={key} label={t(`token.${key}`)} value={v[mode][key]} onChange={(c) => setToken(mode, key, c)} invalid={(key === "bg" || key === "surface") && contrast[mode].errors.some((e) => e.kind === (key === "bg" ? "bg_text" : "surface_text"))} />
                ))}
              </div>
            </fieldset>
          ))}
        </Card>

        <Card title={t("background")}>
          <BackgroundField value={v.background} onChange={(b) => set("background", b)} />
        </Card>

        <Card title={t("decorations")} hint={t("decorationsHint")}>
          <DecorationsField value={v.decorations} onChange={(d) => set("decorations", d)} />
          <Switch checked={v.animations} onCheckedChange={(c) => set("animations", c)} label={t("animations")} description={t("animationsHint")} />
        </Card>

        <Card title={t("banner")}>
          <Switch checked={v.banner.enabled} onCheckedChange={(c) => set("banner", { ...v.banner, enabled: c })} label={t("bannerOn")} description={t("bannerHint")} />
          {v.banner.enabled ? (
            <div className="flex flex-col gap-3">
              {(["pt-BR", "en", "es"] as const).map((l) => (
                <div key={l} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
                  <FormField label={t("bannerText", { lang: l })} required={l === "pt-BR"} optionalLabel={l === "pt-BR" ? undefined : t("optional")}>
                    <Input value={v.banner.text[l]} maxLength={120} onChange={(e) => set("banner", { ...v.banner, text: { ...v.banner.text, [l]: e.target.value } })} />
                  </FormField>
                  <FormField label={t("bannerLabel", { lang: l })} optionalLabel={t("optional")}>
                    <Input value={v.banner.label[l]} maxLength={40} onChange={(e) => set("banner", { ...v.banner, label: { ...v.banner.label, [l]: e.target.value } })} />
                  </FormField>
                </div>
              ))}
              <FormField label={t("bannerHref")} optionalLabel={t("optional")} hint={t("bannerHrefHint")}>
                <Input value={v.banner.href} maxLength={300} placeholder="/explore" onChange={(e) => set("banner", { ...v.banner, href: e.target.value.trim() })} />
              </FormField>
            </div>
          ) : null}
        </Card>

        <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 flex flex-wrap gap-2 rounded-2xl border border-border bg-surface/95 p-2 shadow-md backdrop-blur">
          <Button size="sm" type="submit" leadingIcon={<Save />} disabled={pending || !contrast.ok} data-testid="theme-save">
            {t("save")}
          </Button>
          {v.id ? (
            <>
              {status === "published" ? (
                <Button size="sm" type="button" variant="secondary" leadingIcon={<Undo2 />} onClick={() => setStatus("draft")} disabled={pending}>
                  {ta("unpublish")}
                </Button>
              ) : (
                <Button size="sm" type="button" variant="secondary" leadingIcon={<Rocket />} onClick={() => setStatus("published")} disabled={pending || !contrast.ok || !win} data-testid="theme-publish">
                  {ta("publish")}
                </Button>
              )}
              <Button size="sm" type="button" variant="secondary" leadingIcon={<Eye />} onClick={preview} disabled={pending || !contrast.ok}>
                {ta("previewInApp")}
              </Button>
            </>
          ) : null}
          {!contrast.ok ? <p className="w-full text-sm text-danger">{t("contrastBlocked")}</p> : null}
        </div>
        {v.id ? (
          <div>
            <Button size="sm" type="button" variant="ghost" leadingIcon={<Trash2 />} onClick={remove} disabled={pending}>
              {ta("delete")}
            </Button>
          </div>
        ) : null}
      </form>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <ThemePreview tokens={tokens} background={v.background} decorations={v.decorations} bannerText={v.banner.enabled ? v.banner.text["pt-BR"] : ""} bannerLabel={v.banner.enabled ? v.banner.label["pt-BR"] : ""} />
      </aside>
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
      <div>
        <h2 className="type-h3">{title}</h2>
        {hint ? <p className="mt-1 type-body-sm text-fg-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ColorField({ label, value, onChange, invalid }: { label: string; value: string; onChange: (v: string) => void; invalid?: boolean }) {
  const t = useTranslations("seasonalTheme.form");
  const [draft, setDraft] = useState(value);
  const shown = draft === value || !/^#[0-9a-f]{6}$/.test(draft) ? draft : value;
  return (
    <FormField label={label} optionalLabel={t("optional")} error={invalid ? t("contrastFail") : undefined}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={value || "#000000"}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange(e.target.value.toLowerCase());
          }}
          className="h-11 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-surface p-1"
        />
        <Input
          value={shown}
          placeholder={t("colorDefault")}
          maxLength={7}
          className="min-w-0 font-mono"
          onChange={(e) => {
            const x = e.target.value.trim().toLowerCase();
            setDraft(x);
            if (x === "" || /^#[0-9a-f]{6}$/.test(x)) onChange(x);
          }}
        />
        {value ? (
          <button type="button" className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-surface-hover" aria-label={t("clearColor")} onClick={() => { setDraft(""); onChange(""); }}>
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </FormField>
  );
}

function useUpload(kind: "decoration" | "background", onUrl: (url: string) => void) {
  const { toast } = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const input = (
    <input
      ref={ref}
      type="file"
      accept="image/png,image/jpeg,image/webp"
      className="sr-only"
      tabIndex={-1}
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        const form = new FormData();
        form.set("file", file);
        form.set("kind", kind);
        start(async () => {
          const result = await uploadThemeAssetAction(form);
          toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
          if (result.ok && result.url) onUrl(result.url);
        });
      }}
    />
  );
  return { input, pending, open: () => ref.current?.click() };
}

function BackgroundField({ value, onChange }: { value: ThemeBackground; onChange: (b: ThemeBackground) => void }) {
  const t = useTranslations("seasonalTheme.form");
  const upload = useUpload("background", (url) => onChange({ type: "image", url, fit: "cover", intensity: value.type === "none" ? 20 : value.intensity }));
  const intensity = value.type === "none" ? 20 : value.intensity;
  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        aria-label={t("background")}
        value={value.type}
        onValueChange={(type) => {
          if (type === "none") onChange({ type: "none" });
          else if (type === "gradient") onChange({ type: "gradient", from: "#ffffff", to: "#000000", angle: 180, intensity });
          else upload.open();
        }}
        options={[
          { value: "none", label: t("bgNone") },
          { value: "gradient", label: t("bgGradient") },
          { value: "image", label: t("bgImage") },
        ]}
      />
      {upload.input}
      {value.type === "gradient" ? (
        <div className="grid grid-cols-2 gap-3">
          <ColorField label={t("gradientFrom")} value={value.from} onChange={(c) => c && onChange({ ...value, from: c })} />
          <ColorField label={t("gradientTo")} value={value.to} onChange={(c) => c && onChange({ ...value, to: c })} />
          <FormField label={t("gradientAngle")}>
            <NumberInput value={value.angle} max={360} onValueChange={(_, n) => onChange({ ...value, angle: Math.min(360, n ?? 0) })} />
          </FormField>
        </div>
      ) : null}
      {value.type === "image" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Image src={value.url} alt="" width={96} height={64} className="h-16 w-24 rounded-md border border-border object-cover" />
          <Select value={value.fit} onChange={(e) => onChange({ ...value, fit: e.target.value === "repeat" ? "repeat" : "cover" })} aria-label={t("bgFit")}>
            <option value="cover">{t("bgCover")}</option>
            <option value="repeat">{t("bgRepeat")}</option>
          </Select>
          <Button type="button" size="sm" variant="secondary" leadingIcon={<ImagePlus />} onClick={upload.open} disabled={upload.pending}>
            {t("replaceImage")}
          </Button>
        </div>
      ) : null}
      {value.type !== "none" ? (
        <FormField label={t("intensity", { value: value.intensity })} hint={t("intensityHint")}>
          <input type="range" min={5} max={40} step={1} value={value.intensity} onChange={(e) => onChange({ ...value, intensity: Number(e.target.value) })} className="w-full accent-[var(--uh-accent)]" />
        </FormField>
      ) : null}
      {upload.pending ? <p className="type-caption text-fg-muted">{t("uploading")}</p> : null}
    </div>
  );
}

function DecorationsField({ value, onChange }: { value: Decoration[]; onChange: (d: Decoration[]) => void }) {
  const t = useTranslations("seasonalTheme.form");
  const used = new Set(value.map((d) => d.position));
  const upload = useUpload("decoration", (url) => onChange([...value, { url, position: DECOR_POSITIONS.find((p) => !used.has(p)) ?? "top-right", size: "md" }]));
  return (
    <div className="flex flex-col gap-3">
      {upload.input}
      {value.map((d, i) => (
        <div key={`${d.url}-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
          <Image src={d.url} alt="" width={40} height={40} className="size-10 rounded object-contain" />
          <Select aria-label={t("position")} value={d.position} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, position: e.target.value as Decoration["position"] } : x)))}>
            {DECOR_POSITIONS.map((p) => (
              <option key={p} value={p}>
                {t(`positions.${p}`)}
              </option>
            ))}
          </Select>
          <Select aria-label={t("size")} value={d.size} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, size: e.target.value as Decoration["size"] } : x)))}>
            {DECOR_SIZES.map((s) => (
              <option key={s} value={s}>
                {t(`sizes.${s}`)}
              </option>
            ))}
          </Select>
          <button type="button" className="ml-auto inline-flex size-9 items-center justify-center rounded-md text-fg-muted hover:bg-surface-hover" aria-label={t("removeImage")} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="secondary" leadingIcon={<ImagePlus />} onClick={upload.open} disabled={upload.pending || value.length >= MAX_DECORATIONS}>
          {t("addDecoration")}
        </Button>
        <span className="type-caption text-fg-muted">{t("decorationsCount", { count: value.length, max: MAX_DECORATIONS })}</span>
      </div>
      {upload.pending ? <p className="type-caption text-fg-muted">{t("uploading")}</p> : null}
    </div>
  );
}

function EventPicker({ event, onPick }: { event: AdminEventRef | null; onPick: (e: AdminEventRef | null) => void }) {
  const t = useTranslations("seasonalTheme.form");
  const format = useFormatter();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<AdminEventRef[] | null>(null);
  const [pending, start] = useTransition();
  const day = (iso: string, tz: string) => format.dateTime(new Date(iso), { day: "2-digit", month: "short", year: "numeric", timeZone: tz });

  function search() {
    start(async () => {
      const result = await searchThemeEventsAction({ q });
      setItems(result.ok ? result.items : []);
    });
  }

  if (event) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-hover p-3" data-testid="theme-event">
        <div className="min-w-0 flex-1">
          <p className="type-caption text-fg-muted">{t("linkedEvent")}</p>
          <p className="font-semibold">{event.title}</p>
          <p className="text-sm text-fg-muted">
            {day(event.startsAt, event.timezone)} → {day(new Date(Date.parse(event.endsAt) - 1).toISOString(), event.timezone)}
            {event.status === "cancelled" ? (
              <Badge variant="danger" size="sm" className="ml-2">
                {t("eventCancelled")}
              </Badge>
            ) : null}
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" leadingIcon={<X />} onClick={() => onPick(null)}>
          {t("unlinkEvent")}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <FormField label={t("eventSearch")} optionalLabel={t("optional")} hint={t("eventSearchHint")}>
        <div className="flex gap-2">
          <Input
            value={q}
            maxLength={80}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                search();
              }
            }}
            data-testid="theme-event-search"
          />
          <Button type="button" variant="secondary" leadingIcon={<Search />} onClick={search} disabled={pending || q.trim().length < 2}>
            {t("search")}
          </Button>
        </div>
      </FormField>
      {items ? (
        items.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("noEvents")}</p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-1 overflow-auto">
            {items.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => onPick(e)} className="flex min-h-11 w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-surface-hover">
                  <span className="font-medium">{e.title}</span>
                  <span className="text-xs text-fg-muted">{day(e.startsAt, e.timezone)}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
