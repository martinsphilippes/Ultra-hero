"use client";

import {
  CalendarDays,
  CheckCircle2,
  Compass,
  Contact,
  DoorOpen,
  Handshake,
  Heart,
  KanbanSquare,
  Megaphone,
  MessagesSquare,
  ScrollText,
  ShoppingBag,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Hourglass } from "@/components/commerce/coming-soon/Hourglass";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { markWelcomeSeenAction } from "@/lib/welcome/actions";
import { WELCOME_OPEN_PARAM, WELCOME_STEPS, welcomeStepCount, welcomeSuppressedOn, type WelcomeArea, type WelcomeIcon } from "@/lib/welcome/areas";
import "@/components/commerce/coming-soon/coming-soon.css";
import "./welcome.css";

const ICONS: Record<WelcomeIcon, LucideIcon> = {
  users: Users,
  heart: Heart,
  compass: Compass,
  shoppingBag: ShoppingBag,
  handshake: Handshake,
  calendar: CalendarDays,
  wallet: Wallet,
  messages: MessagesSquare,
  user: UserRound,
  megaphone: Megaphone,
  checkCircle: CheckCircle2,
  contact: Contact,
  kanban: KanbanSquare,
  scroll: ScrollText,
  door: DoorOpen,
};

type Props = {
  area: WelcomeArea;
  /** Ainda não visto: abre sozinho (depois da abertura animada do app, se estiver tocando). */
  initialOpen: boolean;
  /** Data do lançamento já formatada (ex.: 01.01.2027), para o último passo. */
  launchDate: string;
};

// Card de boas-vindas da área (src/lib/welcome/areas.ts): 3–5 passos curtos (ícone + título + 1 frase) e o último,
// igual para todos, "Mais novidades em breve." com a ampulheta do lançamento. Dialog nativo (foco preso, Esc fecha);
// fechar de qualquer jeito (Esc, X, Pular, Começar) marca como visto no servidor. "Como funciona" reabre com
// ?como-funciona=1 no endereço.
export function WelcomeTour({ area, initialOpen, launchDate }: Props) {
  const t = useTranslations("welcome");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [, startTransition] = useTransition();
  const marked = useRef(false);
  const steps = WELCOME_STEPS[area];
  const total = welcomeStepCount(area);
  const last = step === total - 1;

  // abre: pelo "Como funciona" (?como-funciona=1, tirado do endereço em seguida) ou no primeiro acesso, esperando a
  // abertura animada do app terminar (data-intro no <html>)
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has(WELCOME_OPEN_PARAM)) {
      url.searchParams.delete(WELCOME_OPEN_PARAM);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      setStep(0);
      setOpen(true);
      return;
    }
    if (!initialOpen || marked.current || welcomeSuppressedOn(window.location.pathname)) return;
    const html = document.documentElement;
    if (!html.hasAttribute("data-intro")) {
      setOpen(true);
      return;
    }
    const observer = new MutationObserver(() => {
      if (!html.hasAttribute("data-intro")) {
        observer.disconnect();
        setOpen(true);
      }
    });
    observer.observe(html, { attributes: true, attributeFilter: ["data-intro"] });
    return () => observer.disconnect();
    // pathname: o "Como funciona" pode chegar por navegação no cliente
  }, [initialOpen, pathname]);

  const close = useCallback(() => {
    setOpen(false);
    if (marked.current) return;
    marked.current = true;
    startTransition(async () => {
      await markWelcomeSeenAction(area);
    });
  }, [area]);

  const onOpenChange = useCallback((next: boolean) => (next ? setOpen(true) : close()), [close]);

  const current = last ? null : steps[step];
  const Icon = current ? ICONS[current.icon] : null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={t(`areas.${area}.title`)}
      className="uh-welcome"
      footer={
        <div className="flex w-full flex-col gap-4">
          <ol className="flex items-center justify-center gap-1.5" aria-label={t("progress")}>
            {Array.from({ length: total }, (_, i) => (
              <li key={i} aria-current={i === step ? "step" : undefined} className={cn("uh-welcome-dot", i === step && "is-active", i < step && "is-done")}>
                <span className="sr-only">{t("stepOf", { current: i + 1, total })}</span>
              </li>
            ))}
          </ol>
          <div className="flex items-center justify-between gap-2">
            {last ? (
              <span />
            ) : (
              <Button variant="ghost" size="sm" onClick={close} data-testid="welcome-skip">
                {t("skip")}
              </Button>
            )}
            <div className="flex items-center gap-2">
              {step > 0 ? (
                <Button variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} data-testid="welcome-back">
                  {t("back")}
                </Button>
              ) : null}
              {last ? (
                <Button onClick={close} data-autofocus data-testid="welcome-start">
                  {t("start")}
                </Button>
              ) : (
                <Button onClick={() => setStep((s) => Math.min(total - 1, s + 1))} data-autofocus data-testid="welcome-next">
                  {t("next")}
                </Button>
              )}
            </div>
          </div>
        </div>
      }
    >
      {open ? (
        <div aria-live="polite" className="pb-2" data-testid="welcome-tour" data-area={area} data-step={step}>
          <p className="sr-only">{t("stepOf", { current: step + 1, total })}</p>
          {current && Icon ? (
            <div key={current.key} className="uh-welcome-step flex flex-col items-start gap-3 pt-2">
              <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-text">
                <Icon className="size-7" />
              </span>
              <h3 className="type-h2 text-fg">{t(`areas.${area}.steps.${current.key}.title`)}</h3>
              <p className="type-body text-fg-muted">{t(`areas.${area}.steps.${current.key}.body`)}</p>
            </div>
          ) : (
            <div key="final" className="uh-welcome-step uh-welcome-final" data-testid="welcome-final">
              <Hourglass className="uh-welcome-hourglass" />
              <h3 className="uh-welcome-final-title">
                {t("final.title").replace(/\.$/, "")}
                <span aria-hidden="true" className="uh-welcome-final-dot">
                  .
                </span>
              </h3>
              <p className="uh-welcome-final-body">{t("final.body")}</p>
              <p className="uh-welcome-final-date">{t("final.date", { date: launchDate })}</p>
            </div>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
