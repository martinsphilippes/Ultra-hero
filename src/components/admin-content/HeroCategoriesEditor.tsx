"use client";

import { ArrowDown, ArrowUp, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteHeroCategoryAction, moveHeroCategoryAction, saveHeroCategoryAction, setHeroCategoryActiveAction } from "@/app/admin/hero-categories/actions";
import { ConfirmActionDialog } from "@/components/admin";
import { Badge, Button, Dialog, FormField, IconButton, Input, Switch, useToast } from "@/components/ui";
import { personalitiesHref } from "@/lib/heroes/categories";
import { slugifyLabel } from "@/lib/shop/filters";
import { ActionButton } from "./ActionButton";

export type HeroCategoryNames = { "pt-BR": string; en: string; es: string };
export type HeroCategoryRow = {
  id: string;
  slug: string;
  name: HeroCategoryNames;
  is_active: boolean;
  /** Heróis ligados (qualquer status). */
  heroCount: number;
  /** Heróis ativos ligados (0 = chip escondido na aba Hero). */
  visibleCount: number;
  /** Nomes dos heróis ligados, para conferência. */
  heroNames: string[];
};

type Props = { categories: HeroCategoryRow[] };

// Categorias da aba Hero: lista na ordem dos chips (subir/descer), ativar, editar e excluir.
export function HeroCategoriesEditor({ categories }: Props) {
  const t = useTranslations("adminContent.heroCategories");
  const tc = useTranslations("adminContent.common");
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState<HeroCategoryRow | "new" | null>(null);
  const [pending, startTransition] = useTransition();

  function move(id: string, direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveHeroCategoryAction(id, direction);
      if (result.ok) router.refresh();
      else toast({ title: result.error, variant: "error" });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-caption text-fg-muted">{t("allFixed")}</p>
        <Button type="button" size="sm" leadingIcon={<Plus />} onClick={() => setEditing("new")}>
          {t("new")}
        </Button>
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface" aria-label={t("listLabel")}>
          {categories.map((row, index) => {
            const name = row.name["pt-BR"];
            return (
              <li key={row.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center" data-testid="hero-category-row">
                <span className="type-numeric w-8 shrink-0 text-sm font-bold text-fg-muted" aria-label={t("position", { n: index + 1 })}>
                  {index + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">{name}</span>
                    <span className="font-mono text-xs text-fg-muted">{row.slug}</span>
                    <Badge size="sm" variant={row.is_active ? "success" : "neutral"}>
                      {row.is_active ? t("active") : t("inactive")}
                    </Badge>
                    {row.is_active && row.visibleCount === 0 ? (
                      <Badge size="sm" variant="warning">
                        {t("hiddenEmpty")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-fg-muted" data-testid="hero-category-count">
                    {t("heroCount", { count: row.heroCount })}
                  </p>
                  {row.heroNames.length > 0 ? <p className="text-xs text-fg-muted">{row.heroNames.join(" · ")}</p> : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  <IconButton icon={<ArrowUp />} label={`${tc("moveUp")} · ${name}`} size="sm" onClick={() => move(row.id, "up")} disabled={index === 0 || pending} />
                  <IconButton icon={<ArrowDown />} label={`${tc("moveDown")} · ${name}`} size="sm" onClick={() => move(row.id, "down")} disabled={index === categories.length - 1 || pending} />
                  <IconButton icon={<Pencil />} label={`${tc("edit")} · ${name}`} size="sm" onClick={() => setEditing(row)} />
                  {row.is_active && row.visibleCount > 0 ? (
                    <IconButton asChild icon={<ExternalLink />} label={`${t("viewInApp")} · ${name}`} size="sm">
                      <Link href={personalitiesHref(row.slug)} target="_blank" rel="noopener" />
                    </IconButton>
                  ) : null}
                  <ActionButton action={() => setHeroCategoryActiveAction(row.id, !row.is_active)} variant="ghost">
                    {row.is_active ? t("deactivate") : t("activate")}
                  </ActionButton>
                  <ConfirmActionDialog
                    triggerLabel={
                      <>
                        <Trash2 className="size-4" aria-hidden="true" />
                        <span className="sr-only">{`${tc("remove")} · ${name}`}</span>
                      </>
                    }
                    triggerVariant="ghost"
                    title={t("deleteTitle", { name })}
                    description={t("deleteDescription")}
                    confirmLabel={tc("remove")}
                    destructive
                    action={() => deleteHeroCategoryAction(row.id)}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {editing !== null && <HeroCategoryDialog category={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function HeroCategoryDialog({ category, onClose }: { category: HeroCategoryRow | null; onClose: () => void }) {
  const t = useTranslations("adminContent.heroCategories");
  const tc = useTranslations("adminContent.common");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<HeroCategoryNames>(category?.name ?? { "pt-BR": "", en: "", es: "" });
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(category));
  const [active, setActive] = useState(category?.is_active ?? true);

  function setPt(value: string) {
    setNames({ ...names, "pt-BR": value });
    if (!slugTouched) setSlug(slugifyLabel(value));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveHeroCategoryAction({ id: category?.id ?? null, slug, name: names, is_active: active });
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
      title={category ? t("editTitle") : t("new")}
      description={t("dialogDescription")}
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
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label={t("namePt")} required>
            <Input value={names["pt-BR"]} onChange={(e) => setPt(e.target.value)} maxLength={40} />
          </FormField>
          <FormField label={t("nameEn")} hint={t("nameFallback")}>
            <Input value={names.en} onChange={(e) => setNames({ ...names, en: e.target.value })} maxLength={40} />
          </FormField>
          <FormField label={t("nameEs")} hint={t("nameFallback")}>
            <Input value={names.es} onChange={(e) => setNames({ ...names, es: e.target.value })} maxLength={40} />
          </FormField>
        </div>
        <FormField label={t("slug")} hint={t("slugHint")} required>
          <Input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
            maxLength={40}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            className="font-mono"
          />
        </FormField>
        <Switch id="hero-category-active" checked={active} onCheckedChange={setActive} label={t("active")} description={t("activeHint")} />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
