"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resolveReportAction } from "@/app/admin/denuncias/actions";
import { Button } from "@/components/ui";

// Ações da triagem (0071): dispensar, tirar o conteúdo do ar ou suspender o herói.
export function ReportResolveButtons({ id, hasContent, hasCreator }: { id: string; hasContent: boolean; hasCreator: boolean }) {
  const t = useTranslations("moderation.admin");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const run = (status: "dismissed" | "actioned", archiveContent: boolean, suspendCreator: boolean) =>
    startTransition(async () => {
      const result = await resolveReportAction({ id, status, archiveContent, suspendCreator });
      setError(!result.ok);
      if (result.ok) router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasContent ? (
        <Button size="sm" variant="danger" disabled={pending} onClick={() => run("actioned", true, false)}>
          {t("archive")}
        </Button>
      ) : null}
      {hasCreator ? (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("actioned", false, true)}>
          {t("suspend")}
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("dismissed", false, false)}>
        {t("dismiss")}
      </Button>
      {error ? (
        <span role="alert" className="type-caption text-danger">
          {t("error")}
        </span>
      ) : null}
    </div>
  );
}
