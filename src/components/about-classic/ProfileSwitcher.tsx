"use client";

import { ArrowRight, Briefcase, Megaphone, Smartphone, Trophy, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { LogoMark } from "@/components/layout/Logo";
import { Shine } from "./Shine";
import { cn } from "@/lib/utils";

export type SwitcherProfile = { key: "brand" | "hero" | "agency" | "app"; label: string; title: string; lead: string; href: string; cta: string; highlights: { title: string; body: string }[] };

const ICONS: Record<SwitcherProfile["key"], LucideIcon> = { brand: Megaphone, hero: Trophy, agency: Briefcase, app: Smartphone };

// "Eu sou…": a pessoa escolhe o perfil e o cartão troca, com os destaques surgindo em cascata (interativo da abertura).
export function ProfileSwitcher({ label, profiles }: { label: string; profiles: SwitcherProfile[] }) {
  const [active, setActive] = useState(profiles[0]?.key ?? "brand");
  const p = profiles.find((x) => x.key === active) ?? profiles[0];
  if (!p) return null;
  const Icon = ICONS[p.key];
  return (
    <div className="flex flex-col gap-3" data-testid="institutional-switcher">
      {/* "Eu sou" em cima e as quatro opções sempre numa linha só (no celular sem ícone, para caber) */}
      <span aria-hidden="true" className="type-overline text-fg-muted">
        {label}
      </span>
      <div role="radiogroup" aria-label={label} className="flex flex-nowrap items-center gap-1.5 sm:gap-2">
        {profiles.map((x) => {
          const XIcon = ICONS[x.key];
          const on = x.key === active;
          return (
            <button
              key={x.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setActive(x.key)}
              className={cn(
                "inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-sm font-semibold transition-all duration-300 sm:flex-none sm:px-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                on ? "border-accent sm:scale-105 bg-accent text-accent-fg shadow-md" : "border-border bg-surface text-fg hover:bg-surface-hover",
              )}
            >
              <XIcon className="hidden size-4 shrink-0 sm:block" aria-hidden="true" />
              {x.label}
            </button>
          );
        })}
      </div>
      {/* key troca o cartão inteiro: a animação de entrada roda de novo a cada perfil */}
      <div key={p.key} className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-md" aria-live="polite">
        <span aria-hidden="true" className="uh-sb-shine-faint pointer-events-none absolute -right-8 -top-8 isolate">
          {/* opacidade num invólucro: a animação de entrada do triângulo termina em opacidade 1 */}
          <span className="block opacity-10">
            <LogoMark className="uh-sb-intro-mark block h-36" />
          </span>
          <Shine kind="mark" delay={5.2} />
        </span>
        <div className="relative flex flex-col gap-3">
          <span className="uh-sb-pop flex size-11 items-center justify-center rounded-xl bg-accent/15 text-accent-text">
            <Icon className="size-6" aria-hidden="true" />
          </span>
          <h2 className="uh-sb-pop type-h2 text-fg" style={{ animationDelay: "60ms" }}>
            {p.title}
          </h2>
          <p className="uh-sb-pop type-body-sm text-fg-muted" style={{ animationDelay: "120ms" }}>
            {p.lead}
          </p>
          <ul className="flex flex-col gap-2">
            {p.highlights.map((h, i) => (
              <li key={h.title} className="uh-sb-pop flex flex-col rounded-xl border border-border bg-bg px-3 py-2.5" style={{ animationDelay: `${200 + i * 110}ms` }}>
                <span className="text-sm font-semibold text-fg">{h.title}</span>
                <span className="type-caption text-fg-muted">{h.body}</span>
              </li>
            ))}
          </ul>
          <a href={p.href} className="uh-sb-pop inline-flex min-h-11 w-fit items-center gap-1 rounded-md text-sm font-semibold text-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" style={{ animationDelay: "560ms" }}>
            {p.cta}
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  );
}
