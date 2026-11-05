"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { createMyHeroAction } from "@/app/heroi/equipe/actions";
import { Button, FormField, Input } from "@/components/ui";

// "Criar meu Hero" (0091): o creator sem Hero cria a página pública dele; ela nasce pendente e o admin
// aprova antes de ir ao ar. A pessoa vira titular (pode montar a equipe depois).
export function CreateMyHeroForm() {
  const t = useTranslations("invites.myHero");
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const n = name.trim();
    if (n.length < 2 || n.length > 80) return setError(t("nameError"));
    start(async () => {
      const result = await createMyHeroAction({ name: n });
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4" noValidate data-testid="create-my-hero">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
          <Sparkles className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-base font-semibold text-fg">{t("title")}</h2>
          <p className="type-body-sm text-fg-muted">{t("text")}</p>
        </div>
      </div>
      <FormField label={t("name")} hint={t("nameHint")} required error={error ?? undefined}>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </FormField>
      <Button type="submit" size="lg" block loading={pending}>
        {t("create")}
      </Button>
    </form>
  );
}
