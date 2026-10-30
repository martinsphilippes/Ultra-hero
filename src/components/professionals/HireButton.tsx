"use client";

import { Check, Handshake, LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { hireService } from "@/app/(app)/profissionais/actions";
import { Button, VisuallyHidden, buttonBase, buttonSizes, buttonVariants, useToast } from "@/components/ui";
import type { HireAction, ProfessionalTap } from "@/lib/professionals/rules";
import { cn } from "@/lib/utils";
import { fireProfessionalTap } from "./track-tap";

type Props = {
  serviceId: string;
  title: string;
  action: HireAction;
  inCart: boolean;
  /** Para onde voltar depois do login. */
  nextPath: string;
  tap: Omit<ProfessionalTap, "action"> | null;
  size?: "sm" | "md";
  className?: string;
};

// "Contratar" (0058): põe o serviço no carrinho (pagamento simulado, como os produtos). Visitante vê
// "Entrar para contratar"; no app das lojas não aparece nada (o servidor manda action "none" e o
// CSS native:hidden garante). O toque conta no indicador (sem dados da pessoa).
export function HireButton({ serviceId, title, action, inCart, nextPath, tap, size = "md", className }: Props) {
  const t = useTranslations("professionals.hire");
  const { toast } = useToast();
  const router = useRouter();
  const [added, setAdded] = useState(inCart);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (action === "none") return null;
  if (action === "own") return <p className={cn("type-caption text-fg-muted native:hidden", className)}>{t("own")}</p>;

  if (action === "login") {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(nextPath)}`}
        onClick={() => fireProfessionalTap(tap ? { ...tap, action: "contratar" } : null)}
        className={cn(buttonBase, buttonVariants.secondary, buttonSizes[size], "native:hidden", className)}
        data-testid="hire-login"
      >
        <LogIn className="size-4" aria-hidden="true" />
        {t("login")}
        <VisuallyHidden> ({title})</VisuallyHidden>
      </Link>
    );
  }

  if (added) {
    return (
      <Link href="/cart" className={cn(buttonBase, buttonVariants.secondary, buttonSizes[size], "native:hidden", className)} data-testid="hire-in-cart">
        <Check className="size-4" aria-hidden="true" />
        {t("inCart")} · {t("viewCart")}
        <VisuallyHidden> ({title})</VisuallyHidden>
      </Link>
    );
  }

  function submit() {
    fireProfessionalTap(tap ? { ...tap, action: "contratar" } : null);
    setError(null);
    startTransition(async () => {
      const result = await hireService({ serviceId });
      if (result.ok) {
        setAdded(true);
        toast({
          title: t("added"),
          description: (
            <span className="flex flex-col gap-1">
              <span>{t("addedDescription", { title })}</span>
              <Link href="/cart" className="font-semibold text-accent-text underline-offset-4 hover:underline">
                {t("viewCart")}
              </Link>
            </span>
          ),
          variant: "success",
        });
        router.refresh();
      } else {
        setError(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.generic"));
      }
    });
  }

  return (
    <div className={cn("flex flex-col gap-1 native:hidden", className)}>
      <Button type="button" size={size} leadingIcon={<Handshake />} onClick={submit} loading={pending} data-testid="hire-button">
        {t("button")}
        <VisuallyHidden> ({title})</VisuallyHidden>
      </Button>
      {error ? (
        <p role="alert" className="type-caption font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
