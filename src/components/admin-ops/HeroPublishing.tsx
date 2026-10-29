"use client";

import { Check, ChefHat, FilePlus2, Files, LayoutDashboard, Link2, SquarePen, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { chooseActingHero } from "@/app/admin/hero-actions";
import { Avatar, Badge, Sheet, Spinner } from "@/components/ui";
import { HERO_CARDS, type HeroCard } from "@/lib/acting-hero/constants";

export type PickerHero = { id: string; slug: string; name: string; avatar_url: string | null };

type Props = {
  heroes: PickerHero[];
  /** Último herói escolhido (cookie revalidado no banco), mostrado e listado primeiro. */
  current: PickerHero | null;
  /** ?heroi=<atalho>: abre o seletor já no fluxo (vindo de "Trocar hero"). */
  initialCard: HeroCard | null;
  /** Banco sem a 0045: atalhos desligados com o aviso. */
  available: boolean;
};

const ICONS: Record<HeroCard, LucideIcon> = {
  post: SquarePen,
  newContent: FilePlus2,
  content: Files,
  recipes: ChefHat,
  links: Link2,
  dashboard: LayoutDashboard,
};

// "Publicar como hero" no topo do início do admin: os 6 atalhos que eram do herói (mesmo visual) e,
// ao tocar, o seletor do herói (bottom sheet no celular, painel lateral no desktop). Sempre pergunta;
// o último herói aparece primeiro, marcado como atual.
export function HeroPublishing({ heroes, current, initialCard, available }: Props) {
  const t = useTranslations("adminOps.heroPublishing");
  const router = useRouter();
  const titleId = useId();
  const [card, setCard] = useState<HeroCard | null>(available ? initialCard : null);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ordered = current ? [current, ...heroes.filter((h) => h.id !== current.id)] : heroes;

  function open(next: HeroCard) {
    setError(null);
    setCard(next);
  }

  function choose(hero: PickerHero) {
    if (!card || pending) return;
    setError(null);
    setChoosing(hero.id);
    startTransition(async () => {
      const result = await chooseActingHero(hero.id, card);
      if (result.ok) {
        router.push(result.href);
        return;
      }
      setChoosing(null);
      setError(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.generic"));
    });
  }

  return (
    <section id="publicar-como-hero" aria-labelledby={titleId} data-testid="hero-publishing" className="flex scroll-mt-20 flex-col gap-3 rounded-2xl border border-accent/30 bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="type-h2 text-fg">
          {t("title")}
        </h2>
        <p className="type-body-sm text-fg-muted">{t("description")}</p>
      </div>
      {!available ? (
        <p role="status" data-testid="hero-publishing-unavailable" className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-fg">
          {t("unavailable")}
        </p>
      ) : current ? (
        <p className="flex min-w-0 items-center gap-2 text-sm text-fg-muted" data-testid="hero-publishing-current">
          <Avatar src={current.avatar_url} name={current.name} size="xs" alt="" />
          <span className="truncate">{t("current", { name: current.name })}</span>
        </p>
      ) : null}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label={t("cardsLabel")}>
        {HERO_CARDS.map((key) => {
          const Icon = ICONS[key];
          return (
            <li key={key}>
              <button
                type="button"
                data-testid={`hero-action-${key}`}
                aria-haspopup="dialog"
                disabled={!available}
                onClick={() => open(key)}
                className="flex h-full min-h-16 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-2 py-2.5 text-center transition-[border-color,box-shadow] hover:border-accent/40 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-55"
              >
                <Icon className="size-5 text-accent-text" aria-hidden="true" />
                <span className="text-xs font-semibold leading-tight text-fg">{t(`cards.${key}`)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <Sheet
        open={card !== null}
        onOpenChange={(next) => {
          if (!next && !pending) setCard(null);
        }}
        title={t("picker.title")}
        description={card ? t("picker.description", { card: t(`cards.${card}`) }) : undefined}
      >
        <div data-testid="hero-picker" className="flex flex-col gap-3 pb-4">
          {ordered.length === 0 ? (
            <p className="type-body-sm text-fg-muted">{t("picker.empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label={t("picker.listLabel")}>
              {ordered.map((hero) => {
                const isCurrent = current?.id === hero.id;
                const busy = choosing === hero.id;
                return (
                  <li key={hero.id}>
                    <button
                      type="button"
                      data-testid="hero-picker-option"
                      data-hero-id={hero.id}
                      disabled={pending}
                      aria-busy={busy || undefined}
                      onClick={() => choose(hero)}
                      className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-left transition-[border-color,background-color] hover:border-accent/50 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-70"
                    >
                      <Avatar src={hero.avatar_url} name={hero.name} size="md" alt="" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{hero.name}</span>
                      {isCurrent && (
                        <Badge variant="accent" size="sm">
                          <Check className="size-3" aria-hidden="true" />
                          {t("picker.current")}
                        </Badge>
                      )}
                      {busy && <Spinner size="sm" label={t("picker.choosing")} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {error && (
            <p role="alert" className="type-body-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </Sheet>
    </section>
  );
}
