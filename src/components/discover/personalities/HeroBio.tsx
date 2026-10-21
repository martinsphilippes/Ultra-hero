"use client";

import { useTranslations } from "next-intl";
import { useId, useLayoutEffect, useRef, useState } from "react";

type Props = { headline: string | null; bio: string | null };

// Bio do herói como no Instagram: uma linha só e "mais" para quem quiser ler o resto. O que importa
// na página são os conteúdos abaixo.
export function HeroBio({ headline, bio }: Props) {
  const t = useTranslations("discover.personalities.profile");
  const [open, setOpen] = useState(false);
  // "mais" só aparece quando a linha realmente corta o texto (em tela larga a bio pode caber inteira).
  const [overflows, setOverflows] = useState(true);
  const ref = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const text = [headline, bio].filter(Boolean).join(" · ");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const check = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, text]);

  if (!text) return null;

  return (
    <div className="flex flex-col gap-0.5" data-testid="hero-bio">
      <p id={id} ref={ref} className={open ? "type-body-sm whitespace-pre-line text-fg" : "type-body-sm truncate text-fg"}>
        {text}
      </p>
      {overflows || open ? (
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="w-fit min-h-8 text-sm font-semibold text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {open ? t("bioLess") : t("bioMore")}
      </button>
      ) : null}
    </div>
  );
}
