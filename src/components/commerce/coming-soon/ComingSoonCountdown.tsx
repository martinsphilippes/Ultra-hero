"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useServerNow } from "@/components/collectibles/Countdown";
import { countdownParts, pad2, SHOP_TIMEZONE } from "@/lib/shop/coming-soon";

type Props = { opensAt: string; serverNow: number };

// Contagem DIAS · HORAS · MIN · SEG até a abertura, pelo relógio do servidor (primeiro render = valor do
// servidor, sem divergência de hidratação; depois anda no aparelho). Os dígitos visuais ficam fora da
// árvore de acessibilidade; leitores de tela recebem uma frase completa que só muda a cada minuto
// (aria-live="off": não interrompe ninguém a cada segundo). Ao zerar, a página é recarregada do servidor
// (o modo desliga sozinho na data).
export function ComingSoonCountdown({ opensAt, serverNow }: Props) {
  const t = useTranslations("commerce.comingSoon");
  const locale = useLocale();
  const router = useRouter();
  const now = useServerNow(serverNow);
  const target = Date.parse(opensAt);
  const parts = countdownParts(target - now);
  const refreshed = useRef(false);

  useEffect(() => {
    if (parts.done && !refreshed.current && serverNow < target) {
      refreshed.current = true;
      router.refresh();
    }
  }, [parts.done, router, serverNow, target]);

  // frase por minuto (arredonda para cima: "faltam 0 minutos" só quando abriu)
  const minuteParts = countdownParts(Math.ceil(Math.max(0, target - now) / 60_000) * 60_000);
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: SHOP_TIMEZONE,
  }).format(new Date(target));

  const units = [
    { key: "days", value: parts.days, label: t("units.days") },
    { key: "hours", value: parts.hours, label: t("units.hours") },
    { key: "minutes", value: parts.minutes, label: t("units.minutes") },
    { key: "seconds", value: parts.seconds, label: t("units.seconds") },
  ] as const;

  return (
    <div aria-live="off" className="flex flex-col gap-2" data-testid="shop-coming-soon-countdown">
      <time dateTime={opensAt} aria-hidden="true" className="uh-cs-units uh-cs-mono">
        {units.map((unit) => {
          const digits = pad2(unit.value).split("");
          return (
            <span key={unit.key} className="uh-cs-unit">
              <span className="uh-cs-digits">
                {digits.map((digit, index) => (
                  // a chave muda com o dígito: o novo entra com o "flip" (só onde mudou)
                  <span key={`${digits.length - index}-${digit}`} className="uh-cs-digit uh-cs-flip" suppressHydrationWarning>
                    {digit}
                  </span>
                ))}
              </span>
              <span className="uh-cs-unit-label">{unit.label}</span>
            </span>
          );
        })}
      </time>
      <p className="sr-only" suppressHydrationWarning>
        {t("srCountdown", {
          days: minuteParts.days,
          hours: minuteParts.hours,
          minutes: minuteParts.minutes,
          date,
        })}
      </p>
    </div>
  );
}
