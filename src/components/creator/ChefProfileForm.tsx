"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestCredentials, saveSpecialties, withdrawCredentials } from "@/app/creator/profile/chef-actions";
import { ChipInput } from "@/components/editors/content/fields";
import { Button, FormField, Textarea, useToast } from "@/components/ui";
import { CREDENTIALS_MAX_LENGTH, SPECIALTIES_MAX, SPECIALTY_MAX_LENGTH } from "@/lib/recipes/credentials";

type Props = {
  specialties: string[];
  request: string | null;
  /** O texto aprovado que está hoje no perfil público (null = nada aprovado). */
  approved: string | null;
  readOnly?: boolean;
};

// Especialidades (até 6, públicas) e pedido de credenciais (P7): o texto só aparece no perfil
// depois da aprovação do admin, com o rótulo "Credenciais informadas pelo herói".
export function ChefProfileForm({ specialties: initialSpecialties, request, approved, readOnly = false }: Props) {
  const t = useTranslations("recipes.chef");
  const te = useTranslations("creator.errors");
  const { toast } = useToast();
  const router = useRouter();
  const [specialties, setSpecialties] = useState(initialSpecialties);
  const [text, setText] = useState(request ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const status = request ? (approved && approved === request.trim() ? "statusApproved" : "statusPending") : "statusNone";
  const errorText = (code: string) => (te.has(code) ? te(code) : te("generic"));

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(errorText(result.error ?? "generic"));
          return;
        }
        toast({ title: done, variant: "success" });
        router.refresh();
      } catch {
        setError(errorText("generic"));
      }
    });
  }

  return (
    <section aria-labelledby="chef-profile" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5" data-testid="chef-profile">
      <div className="flex flex-col gap-1">
        <h2 id="chef-profile" className="text-base font-semibold text-fg">
          {t("title")}
        </h2>
        <p className="type-body-sm text-fg-muted">{t("description")}</p>
      </div>
      <fieldset disabled={readOnly || pending} className="flex flex-col gap-3">
        <ChipInput label={t("specialties")} hint={t("specialtiesHint")} values={specialties} onChange={setSpecialties} max={SPECIALTIES_MAX} maxLength={SPECIALTY_MAX_LENGTH} />
        <div>
          <Button type="button" variant="secondary" onClick={() => run(() => saveSpecialties({ specialties }), t("specialtiesSaved"))} loading={pending}>
            {t("saveSpecialties")}
          </Button>
        </div>
      </fieldset>
      <fieldset disabled={readOnly || pending} className="flex flex-col gap-3 border-t border-border pt-4">
        <FormField label={t("credentials")} hint={t("credentialsHint")}>
          <Textarea rows={3} maxLength={CREDENTIALS_MAX_LENGTH} value={text} onChange={(e) => setText(e.target.value)} />
        </FormField>
        <p className="type-caption text-fg-muted">{t("credentialsNotice")}</p>
        <p className="type-body-sm font-medium text-fg" role="status">
          {t(status)}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => run(() => requestCredentials({ text }), t("sent"))} disabled={!text.trim() || text.trim() === (request ?? "").trim()} loading={pending}>
            {t("send")}
          </Button>
          {request && (
            <Button type="button" variant="ghost" onClick={() => run(() => withdrawCredentials(), t("withdrawn"))}>
              {t("withdraw")}
            </Button>
          )}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
