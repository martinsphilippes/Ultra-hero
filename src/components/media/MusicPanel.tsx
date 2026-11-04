"use client";

import { ExternalLink, Music, Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge, Button, Checkbox, DatePicker, Dialog, FormField, Input, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import { deleteMusicAction, saveMusicAction } from "@/lib/media/actions";
import type { MusicTrack } from "@/lib/media/queries";

const NETWORKS = ["groscove_ultra", "instagram", "tiktok", "youtube", "x", "facebook", "kwai", "twitch", "linkedin", "pinterest", "threads", "other"] as const;
type Network = (typeof NETWORKS)[number];

type Props = { tracks: MusicTrack[]; canEdit: boolean; dealId: string; requestId?: string | null; today: string };

// Músicas liberadas da campanha (0083): a agência cadastra (título, artista, fonte/licença, link, redes permitidas,
// válida até); o influenciador vê "músicas liberadas para usar" nas tarefas; a marca também lê.
export function MusicPanel({ tracks, canEdit, dealId, requestId, today }: Props) {
  const t = useTranslations("media.music");
  const tn = useTranslations("mediaKit.networks");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [editing, setEditing] = useState<MusicTrack | "new" | null>(null);
  const [deleting, startDelete] = useTransition();
  return (
    <div className="flex flex-col gap-3" data-testid="music-panel">
      {tracks.length === 0 ? <p className="type-body-sm text-fg-muted">{t("empty")}</p> : null}
      <ul className="flex flex-col gap-2">
        {tracks.map((m) => {
          const expired = m.validUntil !== null && m.validUntil < today;
          return (
            <li key={m.id} className="flex items-start gap-3 rounded-xl border border-border px-3 py-2" data-testid="music-track">
              <Music className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-sm font-semibold text-fg">
                  {m.title}
                  {m.artist ? <span className="font-normal text-fg-muted"> — {m.artist}</span> : null}
                </span>
                {m.source ? <span className="type-caption text-fg-muted">{t("sourceLine", { source: m.source })}</span> : null}
                <span className="flex flex-wrap items-center gap-1">
                  {m.networks.length > 0 ? m.networks.map((n) => <Badge key={n} size="sm">{tn(n)}</Badge>) : <span className="type-caption text-fg-muted">{t("allNetworks")}</span>}
                  {m.validUntil ? (
                    <Badge size="sm" variant={expired ? "danger" : "neutral"}>
                      {expired ? t("expired", { date: formatPlainDate(m.validUntil, locale) }) : t("until", { date: formatPlainDate(m.validUntil, locale) })}
                    </Badge>
                  ) : null}
                </span>
                {m.url ? (
                  <a href={m.url} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-accent-text underline-offset-2 hover:underline">
                    <ExternalLink className="size-4" aria-hidden="true" />
                    {t("listen")}
                  </a>
                ) : null}
              </span>
              {canEdit ? (
                <span className="flex shrink-0 gap-1">
                  <button type="button" className="flex size-9 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-focus" aria-label={t("edit")} onClick={() => setEditing(m)}>
                    <Pencil className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="flex size-9 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-hover hover:text-danger focus-visible:outline-2 focus-visible:outline-focus"
                    aria-label={t("delete")}
                    disabled={deleting}
                    onClick={() =>
                      startDelete(async () => {
                        const result = await deleteMusicAction({ dealId, requestId, id: m.id });
                        toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
                      })
                    }
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canEdit ? (
        <Button type="button" size="sm" variant="secondary" leadingIcon={<Plus />} className="self-start" onClick={() => setEditing("new")} data-testid="music-add">
          {t("add")}
        </Button>
      ) : null}
      {editing ? <MusicDialog track={editing === "new" ? null : editing} dealId={dealId} requestId={requestId} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function MusicDialog({ track, dealId, requestId, onClose }: { track: MusicTrack | null; dealId: string; requestId?: string | null; onClose: () => void }) {
  const t = useTranslations("media.music");
  const tc = useTranslations("media.common");
  const tn = useTranslations("mediaKit.networks");
  const { toast } = useToast();
  const [title, setTitle] = useState(track?.title ?? "");
  const [artist, setArtist] = useState(track?.artist ?? "");
  const [source, setSource] = useState(track?.source ?? "");
  const [url, setUrl] = useState(track?.url ?? "");
  const [validUntil, setValidUntil] = useState(track?.validUntil ?? "");
  const [networks, setNetworks] = useState<Set<Network>>(() => new Set((track?.networks ?? []).filter((n): n is Network => (NETWORKS as readonly string[]).includes(n))));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function submit() {
    setError(null);
    if (!title.trim()) return setError(t("titleRequired"));
    if (url.trim() && !/^https:\/\//.test(url.trim())) return setError(t("httpsOnly"));
    start(async () => {
      const result = await saveMusicAction({ dealId, requestId, id: track?.id ?? null, title: title.trim(), artist: artist.trim(), source: source.trim(), url: url.trim(), networks: [...networks], validUntil });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onClose();
    });
  }
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)} title={track ? t("edit") : t("add")} description={t("dialogHint")}>
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <FormField label={t("titleLabel")} required>
          <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} disabled={pending} data-testid="music-title" />
        </FormField>
        <FormField label={t("artist")}>
          <Input value={artist} maxLength={120} onChange={(e) => setArtist(e.target.value)} disabled={pending} />
        </FormField>
        <FormField label={t("source")} hint={t("sourceHint")}>
          <Input value={source} maxLength={200} onChange={(e) => setSource(e.target.value)} disabled={pending} />
        </FormField>
        <FormField label={t("url")}>
          <Input type="url" inputMode="url" value={url} maxLength={500} placeholder="https://" onChange={(e) => setUrl(e.target.value)} disabled={pending} />
        </FormField>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-fg">{t("networks")}</legend>
          <p className="type-caption text-fg-muted">{t("networksHint")}</p>
          <div className="grid grid-cols-2 gap-2">
            {NETWORKS.map((n) => (
              <Checkbox
                key={n}
                label={tn(n)}
                checked={networks.has(n)}
                disabled={pending}
                onChange={(e) =>
                  setNetworks((cur) => {
                    const next = new Set(cur);
                    if (e.target.checked) next.add(n);
                    else next.delete(n);
                    return next;
                  })
                }
              />
            ))}
          </div>
        </fieldset>
        <FormField label={t("validUntil")}>
          <DatePicker value={validUntil} onChange={(value) => setValidUntil(value)} disabled={pending} />
        </FormField>
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {tc("cancel")}
          </Button>
          <Button type="submit" loading={pending} data-testid="music-save">
            {tc("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
