"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { createContent, updateContent } from "@/app/creator/content/actions";
import { ContentForm } from "@/components/editors/ContentForm";
import type { ContentFormValues } from "@/components/editors/types";

type Props = { mode: "create" | "edit"; initial?: Partial<ContentFormValues>; readOnly?: boolean };

// Liga o ContentForm às actions da personalidade (sem campos de acesso) e navega após criar.
export function CreatorContentForm({ mode, initial, readOnly = false }: Props) {
  const router = useRouter();
  const action = useCallback(
    async (values: ContentFormValues) => {
      const result = mode === "create" ? await createContent(values) : await updateContent(values);
      if (result.ok && mode === "create" && result.id) router.push(`/creator/content/${result.id}/edit`);
      else if (result.ok) router.refresh();
      return result;
    },
    [mode, router],
  );
  return <ContentForm mode={mode} initial={initial} canEditAccess={false} readOnly={readOnly} action={action} />;
}
