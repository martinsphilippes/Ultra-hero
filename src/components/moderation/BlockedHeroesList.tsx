"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Avatar, Button, useToast } from "@/components/ui";
import { unblockHeroAction } from "@/lib/moderation/actions";

type Hero = { id: string; name: string; avatar_url: string | null };

// Heróis bloqueados (0071): só a própria conta vê; desbloquear devolve o herói ao app.
export function BlockedHeroesList({ heroes }: { heroes: Hero[] }) {
  const t = useTranslations("moderation.blockedList");
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  if (heroes.length === 0) return <p className="type-body-sm text-fg-muted">{t("empty")}</p>;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface" data-testid="blocked-heroes">
      {heroes.map((hero) => (
        <li key={hero.id} className="flex items-center justify-between gap-3 p-3">
          <span className="flex min-w-0 items-center gap-3">
            <Avatar src={hero.avatar_url} name={hero.name} size="sm" alt="" />
            <span className="truncate text-sm font-semibold text-fg">{hero.name}</span>
          </span>
          <Button
            size="sm"
            variant="secondary"
            loading={busy === hero.id}
            onClick={() => {
              setBusy(hero.id);
              startTransition(async () => {
                const result = await unblockHeroAction(hero.id);
                setBusy(null);
                if (result.ok) {
                  toast({ title: t("unblocked"), variant: "success" });
                  router.refresh();
                }
              });
            }}
          >
            {t("unblock")}
          </Button>
        </li>
      ))}
    </ul>
  );
}
