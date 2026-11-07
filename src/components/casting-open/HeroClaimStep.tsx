"use client";

import { BadgeCheck, Search, UserRoundCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { claimProfileAction, searchClaimCandidatesAction, type ClaimCandidate } from "@/lib/casting-open/actions";
import { Avatar, Button, Input } from "@/components/ui";

// "É você?" (reunião Groscove): antes de criar um Hero do zero, o cadastro mostra os perfis do casting com nome
// parecido. "Sou eu" envia o pedido à agência dona (que confere o e-mail e aprova); "Não sou nenhum deles" segue
// para criar o Hero novo (children).
export function HeroClaimStep({ initial, initialName, children }: { initial: ClaimCandidate[]; initialName: string; children: ReactNode }) {
  const t = useTranslations("heroClaim");
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [name, setName] = useState(initialName);
  const [skip, setSkip] = useState(initial.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (skip) {
    return (
      <div className="flex flex-col gap-4">
        {children}
        <button type="button" onClick={() => setSkip(false)} className="w-fit text-sm font-semibold text-accent-text underline">
          {t("searchAgain")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="hero-claim">
      <div className="flex flex-col gap-1">
        <h2 className="type-h3 text-fg">{t("title")}</h2>
        <p className="type-body-sm text-fg-muted">{t("body")}</p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => setItems(await searchClaimCandidatesAction(name)));
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
          <Input value={name} onChange={(e) => setName(e.target.value)} className="pl-9" aria-label={t("searchLabel")} placeholder={t("searchLabel")} />
        </div>
        <Button type="submit" variant="secondary" loading={pending}>
          {t("search")}
        </Button>
      </form>
      {items.length === 0 ? <p className="type-body-sm text-fg-muted">{t("none")}</p> : null}
      <ul className="flex flex-col gap-2">
        {items.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3" data-testid="hero-claim-candidate">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar src={c.photo} name={c.name} size="md" alt="" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-fg">{c.name}</p>
                <p className="truncate type-caption text-fg-muted">{[c.category, [c.city, c.state].filter(Boolean).join(" · "), c.agency].filter(Boolean).join(" · ")}</p>
                {c.email_matches ? (
                  <p className="inline-flex items-center gap-1 type-caption text-success">
                    <BadgeCheck className="size-3.5" aria-hidden="true" />
                    {t("emailMatches")}
                  </p>
                ) : null}
              </div>
            </div>
            <Button
              size="sm"
              leadingIcon={<UserRoundCheck />}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await claimProfileAction(c.id);
                  if (!r.ok) return setError(r.error);
                  router.refresh();
                })
              }
              data-testid="hero-claim-me"
            >
              {t("itsMe")}
            </Button>
          </li>
        ))}
      </ul>
      {error ? <p className="type-body-sm text-danger">{error}</p> : null}
      <Button type="button" variant="ghost" onClick={() => setSkip(true)} data-testid="hero-claim-skip">
        {t("notMe")}
      </Button>
    </div>
  );
}
