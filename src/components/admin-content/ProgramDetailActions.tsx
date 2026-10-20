"use client";

import { Archive, RotateCcw, Star, StarOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { setFeaturedAction } from "@/app/admin/content-actions";
import { publishVersionAction, setProgramStatusAction } from "@/app/admin/programs/actions";
import { ConfirmActionDialog } from "@/components/admin";
import { ActionButton } from "./ActionButton";

type Props = { programId: string; status: "draft" | "published" | "archived"; isFeatured: boolean };

// Ações do programa: arquivar/reativar e destaque. (Publicar acontece pela versão.)
export function ProgramDetailActions({ programId, status, isFeatured }: Props) {
  const t = useTranslations("adminContent.programs.detail");
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "archived" ? (
        <ConfirmActionDialog
          triggerLabel={
            <>
              <Archive className="size-4" aria-hidden="true" /> {t("archive")}
            </>
          }
          title={t("archiveTitle")}
          description={t("archiveDescription")}
          requireJustification
          destructive
          action={(j) => setProgramStatusAction(programId, "archived", j)}
        />
      ) : (
        <ConfirmActionDialog
          triggerLabel={
            <>
              <RotateCcw className="size-4" aria-hidden="true" /> {t("unarchive")}
            </>
          }
          title={t("unarchive")}
          requireJustification
          action={(j) => setProgramStatusAction(programId, "draft", j)}
        />
      )}
      <ActionButton icon={isFeatured ? <StarOff /> : <Star />} variant={isFeatured ? "ghost" : "secondary"} action={() => setFeaturedAction("program", programId, !isFeatured, null)}>
        {isFeatured ? t("featureOff") : t("featureOn")}
      </ActionButton>
    </div>
  );
}

// Publicar versão (2 passos; explica que participantes ficam na versão em que entraram).
export function PublishVersionButton({ programId, versionId, disabled }: { programId: string; versionId: string; disabled?: boolean }) {
  const t = useTranslations("adminContent.programs.version");
  return (
    <ConfirmActionDialog
      triggerLabel={t("publish")}
      triggerVariant="primary"
      title={t("publishTitle")}
      description={t("publishDescription")}
      confirmLabel={t("publish")}
      disabled={disabled}
      action={() => publishVersionAction(programId, versionId)}
    />
  );
}
