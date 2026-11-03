"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { createContent, updateContent } from "@/app/creator/(hero)/content/actions";
import { ContentKindPicker, type ContentKind } from "@/components/admin-content/ContentKindPicker";
import { ContentForm } from "@/components/editors/ContentForm";
import type { ContentFormValues } from "@/components/editors/types";
import type { ComposerOptions } from "@/lib/post-blocks/queries";
import { emptyDrafts, type BlockDrafts } from "@/lib/post-blocks/schema";
import { MyHeroSwitcher, type HeroChoice } from "./MyHeroSwitcher";

type Props = {
  mode: "create" | "edit";
  initial?: Partial<ContentFormValues>;
  readOnly?: boolean;
  /** Herói em uso (fixo; quem está em mais de uma equipe troca pelo seletor). */
  heroId: string;
  /** Heróis da pessoa: com mais de um, aparece o seletor (só na criação). */
  heroes: HeroChoice[];
  /** Herói padrão da pessoa (receitas saem por ele: o Storage das fotos não recebe a escolha). */
  defaultHero: { id: string; name: string } | null;
  coverState: "ready" | "disabled" | "not_configured";
  options: ComposerOptions;
  initialBlocks?: { drafts: BlockDrafts; products: string[] };
};

const BLOCK_HREFS = { newRecipe: "/creator/recipes/new", links: "/creator/links", newProgram: null };

// Novo conteúdo do creator (0092): o MESMO editor por blocos do admin (ContentKindPicker + ContentForm), com o herói
// fixo e sem os campos só do admin (licença, conclusão, autor, criar programa; ver lib/creator-content/rules).
export function CreatorContentEditor({ mode, initial, readOnly = false, heroId, heroes, defaultHero, coverState, options, initialBlocks }: Props) {
  const t = useTranslations("creator.newContent");
  const router = useRouter();
  const [kind, setKind] = useState<ContentKind>("structured");
  const otherHero = mode === "create" && defaultHero !== null && defaultHero.id !== heroId;

  const action = useCallback(
    async (values: ContentFormValues) => {
      const result = mode === "create" ? await createContent(values) : await updateContent(values);
      if (result.ok) {
        if (mode === "create" && result.id) router.push(`/creator/content/${result.id}/edit`);
        else router.refresh();
      }
      return result;
    },
    [mode, router],
  );

  return (
    <div className="flex flex-col gap-6" data-testid="creator-content-editor">
      {mode === "create" ? <MyHeroSwitcher heroes={heroes} heroId={heroId} /> : null}
      {mode === "create" ? (
        <ContentKindPicker value={kind} onChange={setKind} creatorId={heroId} audience="creator" recipeNote={otherHero ? t("recipeOtherHero", { name: defaultHero?.name ?? "" }) : null} />
      ) : null}
      {mode === "edit" || kind === "structured" ? (
        <ContentForm
          mode={mode}
          initial={initial}
          canEditAccess={false}
          audience="creator"
          action={action}
          readOnly={readOnly}
          cover={{ state: coverState, creatorId: heroId }}
          blocks={{ drafts: initialBlocks?.drafts ?? emptyDrafts(), products: initialBlocks?.products ?? [], options, hrefs: BLOCK_HREFS }}
        />
      ) : null}
    </div>
  );
}
