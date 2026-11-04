"use client";

import { CalendarDays, Search, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, DatePicker, Dialog, FormField, Input, SegmentedControl, Select, Textarea, useToast } from "@/components/ui";
import { deletePostAction, savePostAction, searchEventsAction, type EventOption } from "@/lib/editorial/actions";
import { POST_BODY_MAX, POST_KINDS, POST_TITLE_MAX, type PostInput, type PostKind, type PostStatus } from "@/lib/editorial/vocab";

export type PostFormValues = Omit<PostInput, "kind" | "status"> & { kind: PostKind; status: PostStatus };

type Props = {
  scope: "platform" | "agency";
  initial: PostFormValues;
  /** Evento ligado já conhecido (título e dia), para mostrar sem buscar. */
  initialEvent: { id: string; title: string; when: string } | null;
  /** Para onde voltar depois de salvar/excluir. */
  backHref: string;
};

// Notícia ou dica da agenda (0101): tipo, título, texto, imagem e link opcionais (https), evento da agenda (busca por
// nome) e publicação (rascunho / programado com data e hora de Brasília / publicado agora). O banco confere tudo de novo.
export function PostForm({ scope, initial, initialEvent, backHref }: Props) {
  const t = useTranslations("culture.editorial");
  const tp = useTranslations("culture.posts");
  const tc = useTranslations("common");
  const router = useRouter();
  const { toast } = useToast();
  const [v, setV] = useState<PostFormValues>(initial);
  const [event, setEvent] = useState(initialEvent);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EventOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const set = <K extends keyof PostFormValues>(k: K, value: PostFormValues[K]) => setV((cur) => ({ ...cur, [k]: value }));

  function search() {
    start(async () => setResults(await searchEventsAction(query)));
  }

  function save() {
    setError(null);
    start(async () => {
      const result = await savePostAction(scope, { ...v, eventId: event?.id ?? "" });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      router.push(backHref);
      router.refresh();
    });
  }

  function remove() {
    if (!v.id) return;
    start(async () => {
      const result = await deletePostAction(scope, v.id as string);
      setConfirming(false);
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      router.push(backHref);
      router.refresh();
    });
  }

  const block = "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4";
  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      data-testid="post-form"
    >
      <section className={block}>
        <FormField label={t("form.kind")}>
          <SegmentedControl<PostKind> aria-label={t("form.kind")} value={v.kind} onValueChange={(k) => set("kind", k)} options={POST_KINDS.map((k) => ({ value: k, label: tp(k) }))} />
        </FormField>
        <FormField label={t("form.title")} required>
          <Input value={v.title} maxLength={POST_TITLE_MAX} onChange={(e) => set("title", e.target.value)} disabled={pending} data-testid="post-title" />
        </FormField>
        <FormField label={t("form.body")}>
          <Textarea value={v.body} maxLength={POST_BODY_MAX} rows={6} onChange={(e) => set("body", e.target.value)} disabled={pending} data-testid="post-body" />
        </FormField>
        <FormField label={t("form.image")} hint={t("form.imageHint")}>
          <Input type="url" inputMode="url" value={v.imageUrl} placeholder="https://" onChange={(e) => set("imageUrl", e.target.value.trim())} disabled={pending} />
        </FormField>
        <FormField label={t("form.link")} hint={t("form.linkHint")}>
          <Input type="url" inputMode="url" value={v.linkUrl} placeholder="https://" onChange={(e) => set("linkUrl", e.target.value.trim())} disabled={pending} />
        </FormField>
      </section>

      <section className={block} aria-labelledby="post-event-label">
        <h2 id="post-event-label" className="text-sm font-semibold text-fg">
          {t("form.event")}
        </h2>
        {event ? (
          <div className="flex items-start justify-between gap-2 rounded-xl border border-accent/30 bg-accent-soft/40 p-3" data-testid="post-event">
            <span className="flex min-w-0 items-start gap-2">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium text-fg">{event.title}</span>
                <span className="type-caption text-fg-muted">{event.when}</span>
              </span>
            </span>
            <Button type="button" size="sm" variant="ghost" leadingIcon={<X />} onClick={() => setEvent(null)} disabled={pending}>
              {t("form.eventRemove")}
            </Button>
          </div>
        ) : (
          <p className="type-body-sm text-fg-muted">{t("form.eventNone")}</p>
        )}
        <div className="flex gap-2">
          <Input
            value={query}
            placeholder={t("form.eventSearchPlaceholder")}
            aria-label={t("form.eventSearch")}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                search();
              }
            }}
            disabled={pending}
          />
          <Button type="button" variant="secondary" leadingIcon={<Search />} onClick={search} disabled={pending || query.trim().length < 2}>
            {t("form.eventSearch")}
          </Button>
        </div>
        {results ? (
          results.length === 0 ? (
            <p className="type-caption text-fg-muted">{t("form.eventNoResults")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {results.map((r) => {
                const when = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: r.timezone }).format(new Date(r.startsAt));
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left hover:bg-surface-hover"
                      onClick={() => {
                        setEvent({ id: r.id, title: r.title, when });
                        setResults(null);
                        setQuery("");
                      }}
                    >
                      <span className="text-sm font-medium text-fg">{r.title}</span>
                      <span className="type-caption text-fg-muted">{when}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}
      </section>

      <section className={block}>
        <FormField label={t("form.status")}>
          <Select value={v.status} onChange={(e) => set("status", e.target.value as PostStatus)} disabled={pending} data-testid="post-status">
            {(["draft", "scheduled", "published"] as const).map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </Select>
        </FormField>
        {v.status === "scheduled" ? (
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("form.publishDate")} required>
              <DatePicker value={v.publishDate} onChange={(d) => set("publishDate", d)} disabled={pending} />
            </FormField>
            <FormField label={t("form.publishTime")}>
              <Input type="time" value={v.publishTime} onChange={(e) => set("publishTime", e.target.value)} disabled={pending} />
            </FormField>
          </div>
        ) : null}
        <p className="type-caption text-fg-muted">{scope === "platform" ? t("audienceAdmin") : t("audienceAgency")}</p>
      </section>

      {error ? (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-3 py-2 type-body-sm text-fg">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="lg" disabled={pending} data-testid="post-save">
          {t("form.save")}
        </Button>
        {v.id ? (
          <Button type="button" size="lg" variant="danger" leadingIcon={<Trash2 />} onClick={() => setConfirming(true)} disabled={pending}>
            {t("form.delete")}
          </Button>
        ) : null}
      </div>
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("form.delete")}
        description={t("form.deleteConfirm")}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
              {tc("cancel")}
            </Button>
            <Button type="button" variant="danger" onClick={remove} disabled={pending}>
              {t("form.delete")}
            </Button>
          </>
        }
      />
    </form>
  );
}
