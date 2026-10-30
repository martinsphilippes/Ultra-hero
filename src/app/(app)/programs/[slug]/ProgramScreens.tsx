import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, Check, ChefHat, CircleSlash, Dumbbell, FileText, LockKeyhole, Play, Repeat } from "lucide-react";
import { ProductActionCard } from "@/components/catalog/ProductActionCard";
import { Badge } from "@/components/ui";
import type { ContentCardData } from "@/lib/catalog/queries";
import type { NutritionProduct } from "@/lib/programs/nutrition-query";
import type { Pillar } from "@/lib/supabase/helpers";
import { cn } from "@/lib/utils";

// Telas dos cards Conteúdo e Nutricional (renderizadas no servidor e passadas ao visualizador).
// O título da tela fica no visualizador; aqui só o conteúdo.

const TYPE_ICON = { video: Play, recipe: ChefHat, workout: Dumbbell, guide: BookOpen, article: FileText } as const;

// ---------------------------------------------------------------- Conteúdo

export type ProgramItemView = {
  key: string;
  content: (ContentCardData & { required_module_id: string | null }) | null;
  required: boolean;
  done: boolean;
  locked: boolean;
  substituted: boolean;
  progress: number | null;
};

/** Lista de passos de uma seção do programa (mesmas linhas da página antiga, com conclusão). */
export function ProgramItemList({ items, pillar, note }: { items: ProgramItemView[]; pillar: Pillar; note?: string }) {
  const t = useTranslations("consume.program");
  const tcat = useTranslations("catalog");
  return (
    <div className="flex flex-col gap-3">
      {note ? <p className="type-body-sm text-fg-muted">{note}</p> : null}
      <ol className="flex flex-col gap-2" data-testid="program-items">
        {items.map(({ key, content, required, done, locked, substituted, progress }) => {
          const Icon = content ? TYPE_ICON[content.type] : CircleSlash;
          const row = (
            <>
              <span
                aria-hidden="true"
                className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border", done ? "border-success bg-success text-white" : "border-border-strong bg-surface text-fg-subtle")}
              >
                {done ? <Check className="size-4" strokeWidth={3} /> : <Icon className="size-4" />}
              </span>
              <Thumb src={content?.cover_url ?? `/placeholders/cover-${pillar}-2.svg`} dim={!content} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className={cn("line-clamp-2 text-sm font-semibold", content ? "text-fg" : "text-fg-muted")}>{content?.title ?? t("itemUnavailable")}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 type-caption text-fg-muted">
                  {content ? (
                    <>
                      <span>{tcat(`types.${content.type}`)}</span>
                      {content.duration_minutes ? <span>· {tcat("minutes", { n: content.duration_minutes })}</span> : null}
                    </>
                  ) : (
                    <span>{t("itemUnavailableHint")}</span>
                  )}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <Badge variant={required ? "accent" : "neutral"} size="sm">
                    {required ? t("required") : t("optional")}
                  </Badge>
                  <Badge variant={done ? "success" : "neutral"} size="sm">
                    {done ? t("done") : t("pending")}
                  </Badge>
                  {locked && content?.required_module ? (
                    <Badge variant="premium" size="sm" icon={<LockKeyhole />}>
                      {t("premiumLocked", { module: content.required_module.name })}
                    </Badge>
                  ) : null}
                  {substituted ? (
                    <Badge variant="warning" size="sm" icon={<Repeat />}>
                      {t("substituted")}
                    </Badge>
                  ) : null}
                  {content && progress !== null && !done && progress > 0 ? (
                    <span className="type-caption text-fg-muted">
                      {tcat("progress")}: {progress}%
                    </span>
                  ) : null}
                </span>
              </span>
            </>
          );
          return (
            <li key={key}>
              {content ? (
                <Link href={`/content/${content.slug}`} className={ROW_LINK}>
                  {row}
                </Link>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-surface/60 p-3">{row}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const ROW_LINK =
  "flex min-h-11 items-center gap-3 rounded-xl border border-border bg-surface p-3 transition-[border-color,box-shadow] hover:border-accent/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

function Thumb({ src, dim = false }: { src: string; dim?: boolean }) {
  return (
    <span className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-elevated sm:w-24">
      <Image src={src} alt="" fill unoptimized sizes="96px" className={cn("object-cover", dim && "opacity-40")} />
    </span>
  );
}

// ---------------------------------------------------------------- Nutricional

export function NutritionContentList({ contents, note }: { contents: ContentCardData[]; note: string }) {
  const tcat = useTranslations("catalog");
  return (
    <div className="flex flex-col gap-3">
      <p className="type-body-sm text-fg-muted">{note}</p>
      <ul className="flex flex-col gap-2" data-testid="program-nutrition-contents">
        {contents.map((content) => {
          const Icon = TYPE_ICON[content.type];
          return (
            <li key={content.id}>
              <Link href={`/content/${content.slug}`} className={ROW_LINK}>
                <Thumb src={content.cover_url ?? `/placeholders/cover-${content.pillar}-1.svg`} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="line-clamp-2 text-sm font-semibold text-fg">{content.title}</span>
                  <span className="flex flex-wrap items-center gap-x-2 type-caption text-fg-muted">
                    <Icon aria-hidden="true" className="size-3.5" />
                    <span>{tcat(`types.${content.type}`)}</span>
                    {content.duration_minutes ? <span>· {tcat("minutes", { n: content.duration_minutes })}</span> : null}
                    {content.creator ? <span>· {content.creator.name}</span> : null}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function NutritionProductGrid({ products, note, isLoggedIn, nextPath }: { products: NutritionProduct[]; note: string; isLoggedIn: boolean; nextPath: string }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="type-body-sm text-fg-muted">{note}</p>
      <div className="grid gap-4 sm:grid-cols-2" data-testid="program-nutrition-products">
        {products.map(({ product, usedIn, maxQuantity, inCart }) => (
          <ProductActionCard
            key={product.id}
            product={product}
            usedIn={usedIn}
            purchasable
            maxQuantity={maxQuantity}
            isLoggedIn={isLoggedIn}
            inCart={inCart}
            nextPath={nextPath}
            interestContentId={usedIn[0]?.id}
          />
        ))}
      </div>
    </div>
  );
}
