"use client";

import { Layers } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useId } from "react";
import { Button, FormField, Select, Textarea } from "@/components/ui";
import type { ProgramOption } from "@/lib/post-blocks/queries";
import { PROGRAM_NOTE_MAX, type BlockDrafts } from "@/lib/post-blocks/schema";

type Props = {
  drafts: BlockDrafts;
  onChange: (next: BlockDrafts) => void;
  programs: ProgramOption[];
  /** Para onde vai quem ainda não tem programa publicado. */
  newProgramHref: string;
  error?: string | null;
  disabled?: boolean;
};

// Programa do herói dentro do conteúdo (0076): um programa publicado e uma chamada curta. Sem
// programa escolhido, o conteúdo sai sem este bloco. Sem programa publicado, o atalho leva ao cadastro.
export function ProgramBlockEditor({ drafts, onChange, programs, newProgramHref, error, disabled = false }: Props) {
  const t = useTranslations("creator.post.blocks.program");
  const baseId = useId();
  const current = drafts.program;
  const chosen = current.program_id ? programs.find((p) => p.id === current.program_id) : null;
  return (
    <section aria-labelledby={`${baseId}-program`} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-elevated p-4" data-testid="block-program">
      <h3 id={`${baseId}-program`} className="flex items-center gap-2 text-sm font-semibold text-fg">
        <Layers className="size-4 text-accent-text" aria-hidden="true" />
        {t("title")}
      </h3>
      <p className="type-caption text-fg-muted">{t("hint")}</p>
      <FormField label={t("pick")} hint={programs.length === 0 ? t("noPrograms") : undefined}>
        {programs.length === 0 && !current.program_id ? (
          <Button asChild variant="secondary" size="sm" className="w-fit">
            <Link href={newProgramHref}>{t("createProgram")}</Link>
          </Button>
        ) : (
          <Select value={current.program_id ?? ""} disabled={disabled} aria-label={t("pick")} onChange={(e) => onChange({ ...drafts, program: { ...current, program_id: e.target.value || null } })} data-testid="block-program-pick">
            <option value="">{t("none")}</option>
            {/* programa já gravado que saiu do ar: continua na lista para o admin poder tirá-lo */}
            {current.program_id && !chosen ? <option value={current.program_id}>{t("unavailable")}</option> : null}
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
                {p.estimated_weeks ? ` · ${t("weeks", { n: p.estimated_weeks })}` : ""}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      {current.program_id ? (
        <FormField label={t("note")} hint={t("counter", { count: current.note.length, max: PROGRAM_NOTE_MAX })}>
          <Textarea value={current.note} maxLength={PROGRAM_NOTE_MAX} rows={2} placeholder={t("notePlaceholder")} disabled={disabled} onChange={(e) => onChange({ ...drafts, program: { ...current, note: e.target.value } })} data-testid="block-program-note" />
        </FormField>
      ) : null}
      {error ? (
        <p role="alert" className="type-caption font-medium text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
