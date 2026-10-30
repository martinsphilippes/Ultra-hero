"use client";

import { Check, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { enablePush, registerPushToken, toggleHeroFavorite } from "@/app/(app)/push-actions";
import { useToast } from "@/components/ui";
import { followReducer } from "@/lib/heroes/follows";
import { hasNativeBridge, requestNativePush } from "@/lib/native-app/client";
import { cn } from "@/lib/utils";
import { setConfirmedFollow, useConfirmedFollow } from "./follow-store";

type Props = {
  creatorId: string;
  heroName: string;
  initialFollowing: boolean;
  signedIn: boolean;
  /** Página atual: volta para ela depois do login e é revalidada ao seguir. */
  path: string;
  /** Contagem de seguidores ao lado do botão (página do herói); null/undefined = não mostra. */
  followers?: number | null;
  /** No app das lojas, a pessoa já aceitou avisos de posts de heróis (não pergunta de novo). */
  pushReady?: boolean;
  /** compact: pílula de 28px (cards, feed, listas); md: 32px (cabeçalho da página do herói). Alvo de toque sempre 44px. */
  size?: "compact" | "md";
  /** overlay: sobre a capa de um card (vidro escuro com desfoque, legível em qualquer foto). */
  tone?: "inline" | "overlay";
  className?: string;
};

// Pílula discreta dentro de um alvo transparente de 44px: o elemento clicável tem min-h-11 (o toque e o
// boundingBox continuam com 44px) e a margem negativa devolve o espaço, então no layout ela ocupa só a
// altura visível. O contorno de foco fica na pílula, não no alvo invisível.
const HIT = "group/follow inline-flex min-h-11 shrink-0 items-center -my-1.5 rounded-full focus-visible:outline-none disabled:pointer-events-none";
const PILL_SIZE = { compact: "h-7 gap-1 px-2.5 text-xs", md: "h-8 gap-1.5 px-3 text-[0.8125rem]" } as const;
const PILL_TONE = {
  inline: {
    follow: "border-accent bg-accent text-accent-fg group-hover/follow:bg-accent-hover group-hover/follow:border-accent-hover",
    following: "border-border-strong bg-transparent text-fg-muted group-hover/follow:border-fg-subtle group-hover/follow:text-fg",
  },
  overlay: {
    follow: "border-white/15 bg-accent/90 text-accent-fg backdrop-blur-md group-hover/follow:bg-accent",
    following: "border-white/25 bg-black/45 text-white backdrop-blur-md group-hover/follow:bg-black/60",
  },
} as const;

function pillClasses(size: "compact" | "md", tone: "inline" | "overlay", following: boolean) {
  return cn(
    "inline-flex items-center rounded-full border font-medium leading-none tracking-[0.01em] whitespace-nowrap select-none",
    "transition-[background-color,border-color,color] duration-150 group-active/follow:scale-[0.97] group-disabled/follow:opacity-60",
    "group-focus-visible/follow:outline-2 group-focus-visible/follow:outline-offset-2 group-focus-visible/follow:outline-focus",
    PILL_SIZE[size],
    PILL_TONE[tone][following ? "following" : "follow"],
  );
}

// Seguir / Seguindo (hero_favorites, 0054) com atualização otimista; reverte e avisa se falhar.
// Visitante vai ao login e volta para a mesma página. No app das lojas, o primeiro "Seguir" é o
// momento de pedir a permissão de notificação: com o "sim", liga o push de posts dos heróis seguidos.
export function FollowButton({ creatorId, heroName, initialFollowing, signedIn, path, followers, pushReady = false, size = "md", tone = "inline", className }: Props) {
  const t = useTranslations("follows.button");
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  // confirmado = o que a aba já gravou (vale para todos os botões do mesmo herói) ou o do servidor
  const following = useConfirmedFollow(creatorId, initialFollowing);
  const base = followers === null || followers === undefined ? null : Math.max(0, followers + (following === initialFollowing ? 0 : following ? 1 : -1));
  const [state, apply] = useOptimistic({ following, followers: base }, followReducer);

  const classes = cn(HIT, className);
  const icon = "size-3.5 shrink-0";
  const count =
    state.followers === null ? null : (
      <span className="type-caption type-numeric text-fg-muted" data-testid="hero-followers">
        {state.followers === 1 ? t("followersOne") : t("followersOther", { n: state.followers })}
      </span>
    );

  if (!signedIn) {
    return (
      <span className="inline-flex items-center gap-3">
        <Link href={`/login?next=${encodeURIComponent(path)}`} className={classes} data-testid="follow-button" data-following="false">
          <span className={pillClasses(size, tone, false)}>
            <UserPlus className={icon} aria-hidden="true" />
            {t("follow")}
            <span className="sr-only"> {heroName}</span>
          </span>
        </Link>
        {count}
      </span>
    );
  }

  function onToggle() {
    const next = !state.following;
    startTransition(async () => {
      apply({ type: "toggle" });
      const result = await toggleHeroFavorite({ creatorId, favorite: next, path });
      if (!result.ok) {
        toast({ title: result.error === "hero_unavailable" ? t("unavailable") : t("error"), variant: "error" });
        return;
      }
      setConfirmedFollow(creatorId, next);
      if (!next) {
        toast({ title: t("unfollowed", { name: heroName }), variant: "success", duration: 2500 });
        return;
      }
      const done = t("followed", { name: heroName });
      if (!hasNativeBridge() || pushReady) {
        toast({ title: done, description: pushReady ? t("willNotify") : undefined, variant: "success", duration: 3000 });
        return;
      }
      const push = await requestNativePush(true);
      const registered = push.ok ? await registerPushToken({ token: push.token }) : null;
      if (registered?.ok && (await enablePush({ types: ["hero_posts"] })).ok) {
        toast({ title: done, description: t("willNotify"), variant: "success", duration: 3500 });
      } else if (registered) {
        // permissão dada, mas a conta não guardou o aparelho: não promete aviso
        toast({ title: done, description: t("pushError"), variant: "success", duration: 4000 });
      } else {
        toast({ title: done, description: !push.ok && push.reason === "denied" ? t("pushDenied") : undefined, variant: "success", duration: 4000 });
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-3">
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        aria-pressed={state.following}
        className={classes}
        data-testid="follow-button"
        data-following={state.following ? "true" : "false"}
      >
        <span className={pillClasses(size, tone, state.following)}>
          {state.following ? <Check className={icon} aria-hidden="true" /> : <UserPlus className={icon} aria-hidden="true" />}
          {state.following ? t("following") : t("follow")}
          {/* nome do herói só para leitor de tela: o rótulo visível continua dentro do nome acessível */}
          <span className="sr-only"> {heroName}</span>
        </span>
      </button>
      {count}
    </span>
  );
}
