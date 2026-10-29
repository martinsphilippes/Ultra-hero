"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { canGoBackInApp } from "@/lib/nav-history";
import { cn } from "@/lib/utils";

type Props = {
  /** Destino quando não há tela anterior do app (link aberto de fora, aba nova). */
  href: string;
  /** Rótulo desse destino padrão (ex.: "Explorar"); com tela anterior o rótulo vira "Voltar". */
  children: ReactNode;
  className?: string;
};

// Voltar de verdade: volta para a tela anterior do app (como o botão do navegador). Sem tela
// anterior, é um link para o destino padrão da página.
export function BackLink({ href, children, className }: Props) {
  const router = useRouter();
  const t = useTranslations("common.actions");
  const [historyBack, setHistoryBack] = useState(false);
  useEffect(() => setHistoryBack(canGoBackInApp()), []);

  return (
    <Link
      href={href}
      onClick={(e) => {
        if (!historyBack || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        router.back();
      }}
      className={cn(
        "inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md pr-2 text-sm font-medium text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        className,
      )}
      data-testid="back-link"
      data-history={historyBack ? "true" : undefined}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {historyBack ? t("back") : children}
    </Link>
  );
}
