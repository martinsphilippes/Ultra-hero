"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { chooseMyHero } from "@/app/heroi/conteudos/hero-actions";
import { EntitySelect, FormField } from "@/components/ui";
import { heroOption } from "@/lib/ui/entity";

export type HeroChoice = { id: string; name: string; slug: string; avatar_url: string | null };

// Creator em mais de uma equipe de herói (0092): um seletor simples. Trocar grava a escolha (cookie revalidado no
// servidor e no banco) e recarrega a tela já pelo herói novo. Com um herói só, não aparece.
export function MyHeroSwitcher({ heroes, heroId }: { heroes: HeroChoice[]; heroId: string }) {
  const t = useTranslations("creator.newContent");
  const tp = useTranslations("pickers");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (heroes.length < 2) return null;

  function onChange(next: string) {
    if (!next || next === heroId) return;
    setError(null);
    startTransition(async () => {
      const result = await chooseMyHero({ heroId: next });
      if (result.ok) router.refresh();
      else setError(t("heroSwitchError"));
    });
  }

  return (
    <FormField label={t("heroLabel")} hint={t("heroHint")} error={error ?? undefined}>
      <EntitySelect
        value={heroId}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        roleInOption={false}
        options={heroes.map((h) => heroOption(tp, { id: h.id, name: h.name, slug: h.slug, avatarUrl: h.avatar_url }))}
        data-testid="creator-hero-select"
      />
    </FormField>
  );
}
