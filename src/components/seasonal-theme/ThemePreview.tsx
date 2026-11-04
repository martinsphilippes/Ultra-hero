"use client";

import { AlertTriangle, CheckCircle2, Sparkles, XCircle } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Select } from "@/components/ui";
import { checkBackground, checkTokens, type ContrastIssue } from "@/lib/seasonal-theme/contrast";
import { backgroundLayerStyle, modeVars } from "@/lib/seasonal-theme/css";
import type { ColorMode, Decoration, ThemeBackground, ThemeTokens } from "@/lib/seasonal-theme/vocab";
import { DECOR_SIZE_PX } from "@/lib/seasonal-theme/vocab";
import { templates, type Template } from "@/lib/theme/template";

type Props = { tokens: ThemeTokens; background: ThemeBackground; decorations: Decoration[]; bannerText: string; bannerLabel: string };

const CORNER: Record<Decoration["position"], string> = { "top-left": "left-1 top-9", "top-right": "right-1 top-9", "bottom-left": "left-1 bottom-1", "bottom-right": "right-1 bottom-1" };

// Prévia lado a lado (claro e escuro) num template à escolha, sem publicar nada: o contêiner usa o mesmo mecanismo das
// prévias da Aparência (data-template/data-theme) e as variáveis do tema por cima (style), exatamente como no app.
// Embaixo, o relatório de contraste AA contra os 6 templates.
export function ThemePreview({ tokens, background, decorations, bannerText, bannerLabel }: Props) {
  const t = useTranslations("seasonalTheme.preview");
  const ta = useTranslations("seasonalTheme");
  const [tpl, setTpl] = useState<Template>("original");
  const report = checkTokens(tokens);
  const bgReport = checkBackground(background, tokens);
  const issues: { level: "error" | "warning"; issue: ContrastIssue }[] = [
    ...[...report.light.errors, ...report.dark.errors].map((issue) => ({ level: "error" as const, issue })),
    ...[...report.light.warnings, ...report.dark.warnings, ...bgReport.warnings].map((issue) => ({ level: "warning" as const, issue })),
  ];

  return (
    <section className="flex flex-col gap-3" aria-label={t("title")} data-testid="theme-preview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="type-h3">{t("title")}</h2>
        <Select aria-label={t("template")} value={tpl} onChange={(e) => setTpl(e.target.value as Template)} className="w-auto">
          {templates.map((x) => (
            <option key={x} value={x}>
              {ta(`templates.${x}`)}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["light", "dark"] as ColorMode[]).map((mode) => (
          <Mock key={mode} mode={mode} template={tpl} tokens={tokens} background={background} decorations={decorations} bannerText={bannerText} bannerLabel={bannerLabel} label={t(mode)} />
        ))}
      </div>
      <ul className="flex flex-col gap-1.5 text-sm" data-testid="theme-contrast">
        {issues.length === 0 ? (
          <li className="flex items-start gap-2 text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t("contrastOk")}
          </li>
        ) : (
          issues.map(({ level, issue }, i) => (
            <li key={i} className={`flex items-start gap-2 ${level === "error" ? "text-danger" : "text-warning"}`}>
              {level === "error" ? <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
              <span>{describe(issue, t, ta)}</span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function describe(issue: ContrastIssue, t: ReturnType<typeof useTranslations>, ta: ReturnType<typeof useTranslations>): string {
  const mode = t(issue.mode);
  switch (issue.kind) {
    case "bg_text":
      return t("issue.bgText", { mode, template: ta(`templates.${issue.template}`), ratio: issue.ratio.toFixed(2) });
    case "surface_text":
      return t("issue.surfaceText", { mode, template: ta(`templates.${issue.template}`), ratio: issue.ratio.toFixed(2) });
    case "accent_ui":
      return t("issue.accentUi", { mode, template: ta(`templates.${issue.template}`), ratio: issue.ratio.toFixed(2) });
    case "accent_text_adjusted":
      return t("issue.accentAdjusted", { mode, from: issue.from, to: issue.to });
    case "accent_soft_text":
      return t("issue.accentSoft", { mode, ratio: issue.ratio.toFixed(2) });
    case "background_hidden":
      return t("issue.backgroundHidden", { mode, template: ta(`templates.${issue.template}`), ratio: issue.ratio.toFixed(2) });
    case "background_image":
      return t("issue.backgroundImage", { mode });
  }
}

function Mock({ mode, template, tokens, background, decorations, bannerText, bannerLabel, label }: { mode: ColorMode; template: Template; tokens: ThemeTokens; background: ThemeBackground; decorations: Decoration[]; bannerText: string; bannerLabel: string; label: string }) {
  const t = useTranslations("seasonalTheme.preview");
  const vars = modeVars(tokens[mode], mode);
  const layer = checkBackground(background, tokens).hiddenIn.includes(mode) ? null : backgroundLayerStyle(background);
  return (
    <div className="flex flex-col gap-1">
      <span className="type-caption text-fg-muted">{label}</span>
      <div data-template={template} data-theme={mode} style={vars} className="relative isolate min-h-64 overflow-hidden rounded-xl border border-border bg-bg font-sans text-fg" data-testid={`theme-mock-${mode}`}>
        {layer ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10" style={layer}>
            {background.type === "image" && background.fit === "cover" ? <Image src={background.url} alt="" fill sizes="200px" className="object-cover" /> : null}
          </div>
        ) : null}
        {decorations.map((d, i) => {
          const px = Math.round(DECOR_SIZE_PX[d.size] / 2);
          return (
            <span key={i} aria-hidden="true" className={`pointer-events-none absolute -z-10 ${CORNER[d.position]}`} style={{ width: px, height: px }}>
              <Image src={d.url} alt="" width={px} height={px} className="h-full w-full object-contain" />
            </span>
          );
        })}
        <div className="flex h-8 items-center justify-between border-b border-border bg-bg/85 px-2 text-[10px] font-bold">
          Groscove Ultra
          <Sparkles className="size-3 text-accent-text" aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-2 p-2">
          {bannerText ? (
            <div className="rounded-md border border-border bg-surface px-2 py-1 text-[10px] leading-tight" style={{ backgroundImage: "linear-gradient(var(--uh-accent-soft), var(--uh-accent-soft))" }}>
              {bannerText} {bannerLabel ? <span className="font-semibold text-accent-text">{bannerLabel}</span> : null}
            </div>
          ) : null}
          <div className="rounded-lg border border-border bg-surface p-2">
            <p className="text-[11px] font-bold leading-tight">{t("cardTitle")}</p>
            <p className="mt-0.5 text-[10px] leading-snug text-fg-muted">{t("cardText")}</p>
            <span className="mt-1 inline-block rounded-full bg-accent-soft px-1.5 py-0.5 text-[9px] font-semibold text-accent-text">{t("badge")}</span>
          </div>
          <span className="inline-flex h-7 items-center justify-center rounded-md bg-accent px-2 text-[10px] font-semibold text-accent-fg">{t("button")}</span>
          <span className="text-[10px] font-semibold text-accent-text">{t("link")}</span>
        </div>
      </div>
    </div>
  );
}
