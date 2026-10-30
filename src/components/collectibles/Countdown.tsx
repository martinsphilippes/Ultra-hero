"use client";

import { useEffect, useState } from "react";
import { formatCountdown, isUrgent } from "@/lib/collectibles/rules";
import { cn } from "@/lib/utils";
import "./collectibles.css";

/**
 * Hora do servidor no aparelho: `serverNow` é a hora do servidor quando a página foi gerada; na
 * montagem guardamos a diferença para o relógio local (o celular pode estar adiantado ou atrasado).
 * `offsetMs` externo (medido por ida e volta) tem prioridade quando existe.
 */
export function useServerNow(serverNow: number, offsetMs?: number | null, tickMs = 1000): number {
  const [state, setState] = useState<{ offset: number; now: number } | null>(null);
  useEffect(() => {
    const offset = offsetMs ?? serverNow - Date.now();
    const update = () => setState({ offset, now: Date.now() + offset });
    update();
    const id = window.setInterval(update, tickMs);
    return () => window.clearInterval(id);
  }, [serverNow, offsetMs, tickMs]);
  return state?.now ?? serverNow;
}

type Props = {
  /** Fim (ou início, para "começa em") em ISO. */
  target: string | null;
  serverNow: number;
  className?: string;
  urgentClassName?: string;
};

// Contagem regressiva dd hh:mm:ss pelo relógio do servidor; último minuto em destaque.
export function Countdown({ target, serverNow, className, urgentClassName }: Props) {
  const now = useServerNow(serverNow);
  const remaining = target ? Math.max(0, Date.parse(target) - now) : 0;
  const urgent = isUrgent(remaining);
  return (
    <time
      dateTime={target ?? undefined}
      suppressHydrationWarning
      className={cn("type-numeric tabular-nums", className, urgent && ["uh-countdown-urgent", urgentClassName])}
    >
      {formatCountdown(remaining)}
    </time>
  );
}
