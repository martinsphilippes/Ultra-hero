"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { loadContentBlockOptionsAction } from "@/app/admin/content/block-actions";
import { saveContentAction } from "@/app/admin/content-actions";
import { ContentForm } from "@/components/editors/ContentForm";
import type { ContentFormValues } from "@/components/editors/types";
import { FormField, Select, useToast } from "@/components/ui";
import type { ComposerOptions } from "@/lib/post-blocks/queries";
import { emptyDrafts, type BlockDrafts } from "@/lib/post-blocks/schema";
import { ContentKindPicker, type ContentKind } from "./ContentKindPicker";

type CreatorOption = { id: string; name: string; is_fictional: boolean };

type Props = {
  mode: "create" | "edit";
  contentId?: string;
  initial?: Partial<ContentFormValues>;
  creators: CreatorOption[];
  initialCreatorId: string | null;
  /** Receita estruturada (0027): só leitura até o editor de receitas. */
  readOnly?: boolean;
  /** Envio da capa pelo celular (kill switch e service role), lido no servidor. */
  coverState: "ready" | "disabled" | "not_configured";
  /** Blocos já gravados (edição) e produtos vinculados validados; ausente = tudo vazio (criação). */
  initialBlocks?: { drafts: BlockDrafts; products: string[] };
};

const NO_OPTIONS: ComposerOptions = { recipes: [], products: [], programs: [] };
const BLOCK_HREFS = { newRecipe: "/creator/recipes/new", links: "/admin/links", newProgram: "/admin/programs/new" };

// Envolve o ContentForm compartilhado com a escolha da personalidade (campo só do admin). As opções dos
// blocos (receitas, produtos, programas; 0075/0076) seguem o herói escolhido.
export function AdminContentEditor({ mode, contentId, initial, creators, initialCreatorId, readOnly = false, coverState, initialBlocks }: Props) {
  const t = useTranslations("adminContent.content.form");
  const tc = useTranslations("adminContent.common");
  const router = useRouter();
  const { toast } = useToast();
  const [creatorId, setCreatorId] = useState<string>(initialCreatorId ?? "");
  const [creatorError, setCreatorError] = useState<string | null>(null);
  const [options, setOptions] = useState<ComposerOptions>(NO_OPTIONS);
  const [optionsLoading, setOptionsLoading] = useState(false);
  // o que vai ser criado (só na criação): estruturado fica aqui; post, receita e programa têm editor próprio
  const [kind, setKind] = useState<ContentKind>("structured");

  // troca de herói: recarrega receitas, produtos e programas dele (resposta antiga é descartada)
  useEffect(() => {
    if (!creatorId) {
      setOptions(NO_OPTIONS);
      return;
    }
    let active = true;
    setOptionsLoading(true);
    loadContentBlockOptionsAction(creatorId)
      .then((next) => {
        if (active) setOptions(next);
      })
      .catch(() => {
        if (active) setOptions(NO_OPTIONS);
      })
      .finally(() => {
        if (active) setOptionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [creatorId]);

  const action = useCallback(
    async (values: ContentFormValues) => {
      if (mode === "create" && !creatorId) {
        setCreatorError(t("creatorRequired"));
        return { ok: false as const, error: t("creatorRequired") };
      }
      setCreatorError(null);
      const result = await saveContentAction({ id: contentId ?? null, creatorId: creatorId || null }, values);
      if (result.ok) {
        toast({ title: result.message ?? tc("saved"), variant: "success" });
        if (mode === "create" && result.id) router.push(`/admin/content/${result.id}`);
        else router.refresh();
      }
      return result;
    },
    [mode, creatorId, contentId, router, t, tc, toast],
  );

  return (
    <div className="flex flex-col gap-6">
      <FormField label={t("creatorLabel")} hint={t("creatorHint")} error={creatorError ?? undefined} required={mode === "create"}>
        <Select value={creatorId} onChange={(e) => setCreatorId(e.target.value)} disabled={readOnly}>
          <option value="">{tc("noCreator")}</option>
          {creators.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.is_fictional ? ` · ${tc("fictional")}` : ""}
            </option>
          ))}
        </Select>
      </FormField>
      {mode === "create" ? <ContentKindPicker value={kind} onChange={setKind} creatorId={creatorId || null} /> : null}
      {/* a capa é reservada em nome do herói escolhido acima (post_photo_upload_claim pelo admin, 0045) */}
      {mode === "edit" || kind === "structured" ? (
        <ContentForm
          mode={mode}
          initial={initial}
          canEditAccess
          action={action}
          readOnly={readOnly}
          cover={{ state: coverState, creatorId: creatorId || null }}
          blocks={{ drafts: initialBlocks?.drafts ?? emptyDrafts(), products: initialBlocks?.products ?? [], options, loading: optionsLoading, hrefs: BLOCK_HREFS }}
        />
      ) : null}
    </div>
  );
}
