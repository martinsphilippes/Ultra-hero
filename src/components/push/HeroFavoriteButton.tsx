"use client";

import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { enablePush, registerPushToken, toggleHeroFavorite } from "@/app/(app)/push-actions";
import { Button, useToast } from "@/components/ui";
import { hasNativeBridge, requestNativePush } from "@/lib/native-app/client";
import { cn } from "@/lib/utils";

type Props = {
  creatorId: string;
  heroName: string;
  initial: boolean;
  /** Sem sessão: o botão leva ao login e volta para o herói. */
  loggedIn: boolean;
  path: string;
  /** No app, a pessoa já aceitou avisos de posts de heróis (não pergunta de novo). */
  pushReady: boolean;
};

// Favoritar herói (0050). No app das lojas, o primeiro favorito é o momento de pedir a permissão de
// notificação: com o "sim" do sistema, liga o push para posts de heróis favoritos. Recusar não
// desfaz o favorito; o aviso sobre a escolha aparece uma vez.
export function HeroFavoriteButton({ creatorId, heroName, initial, loggedIn, path, pushReady }: Props) {
  const t = useTranslations("discover.personalities.profile.favorite");
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [favorite, setOptimistic] = useOptimistic(initial);

  if (!loggedIn) {
    return (
      <Button asChild variant="secondary" size="sm" leadingIcon={<Heart />}>
        <Link href={`/login?next=${encodeURIComponent(path)}`}>{t("add")}</Link>
      </Button>
    );
  }

  function onToggle() {
    const next = !favorite;
    startTransition(async () => {
      setOptimistic(next);
      const result = await toggleHeroFavorite({ creatorId, favorite: next, path });
      if (!result.ok) {
        toast({ title: result.error === "hero_unavailable" ? t("unavailable") : t("error"), variant: "error" });
        return;
      }
      if (!next) {
        toast({ title: t("removed", { name: heroName }), variant: "success", duration: 2500 });
        return;
      }
      if (!hasNativeBridge() || pushReady) {
        toast({ title: t("added", { name: heroName }), description: pushReady ? t("willNotify") : undefined, variant: "success", duration: 3000 });
        return;
      }
      const push = await requestNativePush(true);
      if (push.ok) {
        await registerPushToken({ token: push.token });
        await enablePush({ types: ["hero_posts"] });
        toast({ title: t("added", { name: heroName }), description: t("willNotify"), variant: "success", duration: 3500 });
      } else {
        toast({ title: t("added", { name: heroName }), description: push.reason === "denied" ? t("pushDenied") : undefined, variant: "success", duration: 4000 });
      }
    });
  }

  return (
    <Button
      type="button"
      variant={favorite ? "primary" : "secondary"}
      size="sm"
      leadingIcon={<Heart className={cn(favorite && "fill-current")} />}
      aria-pressed={favorite}
      onClick={onToggle}
      disabled={pending}
      data-testid="hero-favorite"
    >
      {favorite ? t("remove") : t("add")}
    </Button>
  );
}
