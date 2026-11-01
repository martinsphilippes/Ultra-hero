"use client";

import { ArrowRight, Camera, ChefHat, FileText, Layers, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { chooseActingHero } from "@/app/admin/hero-actions";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export const CONTENT_KINDS = ["structured", "post", "recipe", "program"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

const ICONS: Record<ContentKind, LucideIcon> = { structured: FileText, post: Camera, recipe: ChefHat, program: Layers };

type Props = {
  value: ContentKind;
  onChange: (kind: ContentKind) => void;
  /** Herói responsável escolhido acima (post e receita abrem o portal em nome dele). */
  creatorId: string | null;
};

// "O que você vai criar?" no Novo conteúdo do admin: o conteúdo estruturado fica nesta tela; post
// rápido e receita abrem o editor próprio em nome do herói (admin_act_as_hero, 0045); programa abre o
// cadastro de programa já com o herói escolhido.
export function ContentKindPicker({ value, onChange, creatorId }: Props) {
  const t = useTranslations("adminContent.content.kind");
  const te = useTranslations("adminOps.heroPublishing.errors");
  const router = useRouter();
  const groupId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function go() {
    setError(null);
    if (value === "program") {
      router.push(creatorId ? `/admin/programs/new?creator=${creatorId}` : "/admin/programs/new");
      return;
    }
    if (!creatorId) {
      setError(t("chooseHeroFirst"));
      return;
    }
    startTransition(async () => {
      const result = await chooseActingHero(creatorId, value === "post" ? "post" : "recipes");
      if (!result.ok) {
        setError(te.has(result.error) ? te(result.error) : te("generic"));
        return;
      }
      router.push(value === "post" ? result.href : "/creator/recipes/new");
    });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="content-kind">
      <p id={groupId} className="text-sm font-medium text-fg">
        {t("label")}
      </p>
      <div role="radiogroup" aria-labelledby={groupId} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CONTENT_KINDS.map((kind) => {
          const Icon = ICONS[kind];
          const selected = kind === value;
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setError(null);
                onChange(kind);
              }}
              className={cn(
                "flex min-h-[72px] flex-col items-start gap-1.5 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                selected ? "border-accent bg-accent-soft text-fg" : "border-border bg-surface text-fg-muted hover:border-accent/40",
              )}
              data-testid={`content-kind-${kind}`}
            >
              <Icon className={cn("size-5", selected ? "text-accent-text" : "text-fg-muted")} aria-hidden="true" />
              <span className="text-sm font-semibold leading-tight">{t(`${kind}.title`)}</span>
            </button>
          );
        })}
      </div>
      <p className="type-caption text-fg-muted">{t(`${value}.description`)}</p>
      {value !== "structured" ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-elevated p-4">
          <p className="text-sm text-fg">{t(`${value}.next`)}</p>
          {error ? (
            <p role="alert" className="type-caption font-medium text-danger">
              {error}
            </p>
          ) : null}
          <Button type="button" onClick={go} loading={pending} trailingIcon={<ArrowRight />} className="w-fit" data-testid="content-kind-go">
            {t(`${value}.cta`)}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
