"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { chooseMyHero } from "@/app/heroi/conteudos/hero-actions";
import { Button } from "@/components/ui";

// "Trabalhar neste Hero" (0092): grava o Hero em uso (cookie conferido no servidor e no banco) e recarrega o Perfil.
export function WorkOnHeroButton({ heroId, name }: { heroId: string; name: string }) {
  const t = useTranslations("me.profile.worksFor");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={pending}
        aria-label={t("workOnNamed", { name })}
        data-testid="work-on-hero"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await chooseMyHero({ heroId });
            if (result.ok) router.refresh();
            else setError(t("error"));
          });
        }}
      >
        {t("workOn")}
      </Button>
      {error ? (
        <p role="alert" className="type-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
