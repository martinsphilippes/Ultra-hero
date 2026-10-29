"use client";

import { Check, Palette } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Button, buttonBase, buttonVariants } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { BRAND_ORANGE } from "@/components/layout/Logo";
import { applyTemplate, currentTemplate, templates, type Template } from "@/lib/theme/template";
import { cn } from "@/lib/utils";

// Botão "Aparência" (só na Início) + painel com os 5 templates visuais. Trocar só muda o atributo
// data-template do <html>: nada recarrega nem remonta, então tela, formulários e rolagem ficam como estão.
export function AppearanceMenu() {
  const pathname = usePathname();
  const t = useTranslations("common.appearance");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Template>("original");
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  // O painel vai para o <body>: dentro do cabeçalho herdaria as cores da barra (ex.: bloco escuro do Urban).
  useEffect(() => setMounted(true), []);

  if (pathname !== "/") return null;

  const openPanel = () => {
    // Lê o que está de fato aplicado (o script inicial pode ter usado o localStorage).
    setActive(currentTemplate());
    setMode(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
    setOpen(true);
  };

  const choose = (value: Template) => {
    applyTemplate(value);
    setActive(value);
  };

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        aria-haspopup="dialog"
        aria-label={t("button")}
        title={t("button")}
        data-testid="appearance-button"
        className={cn(
          buttonBase,
          buttonVariants.ghost,
          "uh-btn--ghost uh-icon-btn h-11 min-h-11 min-w-11 gap-2 rounded-(--uh-btn-radius-md) px-0 text-sm sm:px-3 [&_svg]:size-5",
        )}
      >
        <Palette aria-hidden="true" />
        <span className="hidden sm:inline">{t("button")}</span>
      </button>

      {mounted &&
        createPortal(
          <Sheet
            open={open}
            onOpenChange={setOpen}
            title={t("title")}
            description={t("description")}
            footer={
              <Button variant="secondary" block onClick={() => setOpen(false)} data-testid="appearance-close">
                {t("close")}
              </Button>
            }
          >
            <fieldset className="flex flex-col gap-3 pb-2" data-testid="appearance-panel">
              <legend className="sr-only">{t("title")}</legend>
              {templates.map((id) => {
                const selected = id === active;
                return (
                  <label
                    key={id}
                    data-testid={`appearance-option-${id}`}
                    data-active={selected || undefined}
                    className={cn(
                      "relative flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-2.5 pr-3 transition-colors",
                      "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                      selected ? "border-accent bg-accent-soft/40 ring-1 ring-accent" : "border-border bg-surface hover:bg-surface-hover",
                    )}
                  >
                    <input type="radio" name="uh-template" value={id} checked={selected} onChange={() => choose(id)} className="sr-only" />
                    <TemplatePreview template={id} mode={mode} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-semibold text-fg [overflow-wrap:anywhere]">{t(`options.${id}.name`)}</span>
                      <span className="type-caption text-fg-muted">{t(`options.${id}.description`)}</span>
                      {selected && <span className="type-caption font-semibold text-accent-text">{t("active")}</span>}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                        selected ? "border-accent bg-accent text-accent-fg" : "border-border-strong",
                      )}
                    >
                      {selected && <Check className="size-3.5" strokeWidth={3} />}
                    </span>
                  </label>
                );
              })}
              <p className="type-caption text-fg-subtle">{t("hint")}</p>
            </fieldset>
          </Sheet>,
          document.body,
        )}
    </>
  );
}

// Miniatura desenhada com os próprios tokens do template (data-template local), sem imagem:
// barra superior com o losango, título "Aa" na fonte de títulos, linhas de texto, botão e cartão.
function TemplatePreview({ template, mode }: { template: Template; mode: "light" | "dark" }) {
  return (
    <span
      aria-hidden="true"
      data-template={template}
      data-theme={mode}
      className="flex h-[5.5rem] w-24 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-bg font-sans text-fg shadow-sm"
    >
      <span className="flex h-4 shrink-0 items-center gap-1 bg-(--uh-chrome-bg) px-1.5">
        <svg viewBox="0 0 64 64" className="size-2 shrink-0">
          <path d="M32 6 58 32 32 58 6 32z" fill={BRAND_ORANGE} />
        </svg>
        <span className="h-[3px] w-7 rounded-full bg-(--uh-chrome-fg) opacity-80" />
      </span>
      <span className="flex min-h-0 flex-1 flex-col gap-1 px-1.5 pb-1.5 pt-1">
        <span
          className="text-[17px] leading-none"
          style={{
            fontFamily: "var(--uh-font-heading)",
            fontWeight: "var(--uh-h1-weight)",
            fontStretch: "var(--uh-heading-stretch)",
            letterSpacing: "var(--uh-h1-tracking)",
            textTransform: "var(--uh-h1-case)" as CSSProperties["textTransform"],
          }}
        >
          Aa
        </span>
        <span className="h-[3px] w-16 rounded-full bg-fg-muted opacity-60" />
        <span className="h-[3px] w-11 rounded-full bg-fg-muted opacity-40" />
        <span className="mt-auto flex items-end gap-1">
          <span className="h-3.5 w-9 rounded-(--uh-btn-radius-sm) bg-accent" />
          <span className="h-5 flex-1 rounded-md border border-border bg-surface shadow-sm" />
        </span>
      </span>
    </span>
  );
}
