"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { searchContentAction } from "@/app/admin/content-actions";
import { addItemAction, moveItemAction, removeItemAction, substituteItemAction, updateItemAction } from "@/app/admin/programs/actions";
import { StatusBadge } from "@/components/admin";
import { Badge, Button, FormField, Input, Select, Switch, Textarea, useToast } from "@/components/ui";
import { canUseInProgram } from "@/lib/programs/item-ownership";
import { ActionButton } from "./ActionButton";
import { SearchPicker, type PickItem } from "./SearchPicker";

export type VersionItem = {
  id: string;
  content_id: string;
  position: number;
  section: string | null;
  is_required: boolean;
  content: { id: string; title: string; type: string; status: string; creator_id: string | null } | null;
};

/** Herói dono do programa: a busca só traz conteúdos dele (0052). Nulo = programa editorial, sem herói. */
export type ProgramHero = { id: string; name: string } | null;

type EditorProps = { programId: string; versionId: string; items: VersionItem[]; readOnly: boolean; hero: ProgramHero };

// Editor de itens da versão: busca conteúdo publicado → adicionar; ordem; seção; obrigatório; remover.
export function ProgramItemsEditor({ programId, versionId, items, readOnly, hero }: EditorProps) {
  const t = useTranslations("adminContent.programs.version");
  const tc = useTranslations("adminContent.common");
  const ts = useTranslations("adminCommon.status");
  const router = useRouter();
  const { toast } = useToast();
  const [picked, setPicked] = useState<PickItem | null>(null);
  const [section, setSection] = useState("");
  const [pending, startTransition] = useTransition();

  function add() {
    if (!picked) return;
    startTransition(async () => {
      const result = await addItemAction(programId, versionId, picked.id, section || null);
      if (result.ok) {
        toast({ title: result.message ?? tc("done"), variant: "success" });
        setPicked(null);
        router.refresh();
      } else toast({ title: result.error, variant: "error" });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {readOnly ? (
        <p role="note" className="rounded-lg border border-info/40 bg-info-soft/50 px-3 py-2 text-sm text-fg">
          {t("readOnly")}
        </p>
      ) : (
        <div className="grid gap-3 rounded-lg border border-dashed border-border-strong p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
          <div className="flex min-w-0 flex-col gap-1">
            <SearchPicker label={t("searchContent")} search={(q) => searchContentAction(q, true, hero?.id ?? null)} value={picked} onChange={setPicked} />
            {hero && (
              <p className="type-caption text-fg-muted" data-testid="program-items-hero-scope">
                {t("heroScope", { name: hero.name })}
              </p>
            )}
          </div>
          <FormField label={t("section")} optionalLabel={tc("optional")}>
            <Input value={section} onChange={(e) => setSection(e.target.value)} placeholder={t("sectionPlaceholder")} maxLength={60} />
          </FormField>
          <Button type="button" onClick={add} disabled={!picked} loading={pending} leadingIcon={<Plus />}>
            {t("addItem")}
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("noItems")}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface" aria-label={t("itemsCaption")}>
          {items.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              index={index}
              total={items.length}
              programId={programId}
              versionId={versionId}
              readOnly={readOnly}
              foreign={Boolean(item.content) && !canUseInProgram(hero?.id, item.content?.creator_id)}
              statusLabel={item.content ? ts(item.content.status as never) : ""}
              typeLabel={item.content ? tc(`types.${item.content.type}` as never) : ""}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

type RowProps = { item: VersionItem; index: number; total: number; programId: string; versionId: string; readOnly: boolean; foreign: boolean; statusLabel: string; typeLabel: string };

function ItemRow({ item, index, total, programId, versionId, readOnly, foreign, statusLabel, typeLabel }: RowProps) {
  const t = useTranslations("adminContent.programs.version");
  const tc = useTranslations("adminContent.common");
  const router = useRouter();
  const { toast } = useToast();
  const [section, setSection] = useState(item.section ?? "");
  const [pending, startTransition] = useTransition();

  function saveSection() {
    if ((item.section ?? "") === section.trim()) return;
    startTransition(async () => {
      const result = await updateItemAction(programId, versionId, item.id, { section: section.trim() || null });
      if (result.ok) router.refresh();
      else toast({ title: result.error, variant: "error" });
    });
  }

  function toggleRequired(next: boolean) {
    startTransition(async () => {
      const result = await updateItemAction(programId, versionId, item.id, { is_required: next });
      if (result.ok) router.refresh();
      else toast({ title: result.error, variant: "error" });
    });
  }

  const archived = item.content?.status === "archived";

  return (
    <li className="flex flex-col gap-3 p-3 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="type-numeric mt-0.5 w-6 shrink-0 text-right text-sm font-semibold text-fg-muted" aria-label={t("position")}>
          {index + 1}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate text-sm font-medium text-fg">{item.content?.title ?? item.content_id}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {typeLabel && <Badge size="sm">{typeLabel}</Badge>}
            {item.content && <StatusBadge status={item.content.status} label={statusLabel} />}
            {archived && (
              <Badge variant="danger" size="sm">
                {t("contentArchived")}
              </Badge>
            )}
            {/* etapa de outro herói (legado da troca de heróis da 0044): a 0052 remove */}
            {foreign && (
              <Badge variant="warning" size="sm">
                {t("foreignContent")}
              </Badge>
            )}
            {item.section && readOnly && <span className="type-caption text-fg-muted">{item.section}</span>}
          </div>
        </div>
      </div>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Input
            aria-label={`${t("section")} · ${item.content?.title ?? ""}`}
            value={section}
            onChange={(e) => setSection(e.target.value)}
            onBlur={saveSection}
            placeholder={t("sectionPlaceholder")}
            inputSize="sm"
            className="w-40"
            maxLength={60}
            disabled={pending}
          />
          <Switch size="sm" checked={item.is_required} onCheckedChange={toggleRequired} label={t("requiredToggle")} disabled={pending} id={`req-${item.id}`} />
          <ActionButton icon={<ArrowUp />} label={tc("moveUp")} variant="ghost" disabled={index === 0} action={() => moveItemAction(programId, versionId, item.id, "up")} />
          <ActionButton icon={<ArrowDown />} label={tc("moveDown")} variant="ghost" disabled={index === total - 1} action={() => moveItemAction(programId, versionId, item.id, "down")} />
          <ActionButton icon={<Trash2 />} label={tc("remove")} variant="ghost" className="text-danger" action={() => removeItemAction(programId, versionId, item.id)} />
        </div>
      )}
      {readOnly && (
        <Badge variant={item.is_required ? "accent" : "neutral"} size="sm">
          {item.is_required ? t("requiredToggle") : tc("optional")}
        </Badge>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- substituições
export type Substitution = {
  id: string;
  original_content_id: string;
  replacement_content_id: string;
  reason: string | null;
  created_at: string;
  original: { title: string } | null;
  replacement: { title: string; status: string } | null;
};

type SubsProps = { programId: string; versionId: string; items: VersionItem[]; substitutions: Substitution[]; hero: ProgramHero };

export function SubstitutionsPanel({ programId, versionId, items, substitutions, hero }: SubsProps) {
  const t = useTranslations("adminContent.programs.version");
  const tc = useTranslations("adminContent.common");
  const router = useRouter();
  const { toast } = useToast();
  const [original, setOriginal] = useState<string>("");
  const [replacement, setReplacement] = useState<PickItem | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!original || !replacement) return;
    setError(null);
    startTransition(async () => {
      const result = await substituteItemAction(programId, versionId, original, replacement.id, reason);
      if (result.ok) {
        toast({ title: result.message ?? tc("done"), variant: "success" });
        setOriginal("");
        setReplacement(null);
        setReason("");
        router.refresh();
      } else setError(result.error);
    });
  }

  const requiredItems = items.filter((i) => i.is_required);

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="grid gap-3 rounded-lg border border-dashed border-border-strong p-3 sm:grid-cols-2"
      >
        <FormField label={t("original")} required>
          <Select value={original} onChange={(e) => setOriginal(e.target.value)}>
            <option value="">{tc("none")}</option>
            {requiredItems.map((i) => (
              <option key={i.id} value={i.content_id}>
                {i.content?.title ?? i.content_id}
                {i.content?.status === "archived" ? ` · ${t("contentArchived")}` : ""}
              </option>
            ))}
          </Select>
        </FormField>
        <SearchPicker label={t("replacement")} search={(q) => searchContentAction(q, true, hero?.id ?? null)} value={replacement} onChange={setReplacement} />
        <FormField label={t("reason")} required className="sm:col-span-2" error={error ?? undefined}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} required />
        </FormField>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" loading={pending} disabled={!original || !replacement || reason.trim().length < 5}>
            {t("substitute")}
          </Button>
        </div>
      </form>

      {substitutions.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("noSubstitutions")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface" aria-label={t("substitutionsCaption")}>
          {substitutions.map((s) => (
            <li key={s.id} className="flex flex-col gap-1 p-3 text-sm">
              <p className="text-fg">
                <span className="line-through decoration-fg-muted">{s.original?.title ?? s.original_content_id}</span>
                <span aria-hidden="true"> → </span>
                <span className="font-medium">{s.replacement?.title ?? s.replacement_content_id}</span>
              </p>
              {s.reason && <p className="text-fg-muted">{s.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
