import { ChefHat, Layers, Salad, ShoppingBag } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import type { BlockReferences } from "@/lib/post-blocks/queries";
import type { PostBlock } from "@/lib/post-blocks/schema";
import { StepChecklist } from "./StepChecklist";

type Props = {
  contentId: string;
  blocks: PostBlock[];
  checked: number[];
  references: BlockReferences;
};

// Blocos de um conteúdo (0075/0076), embaixo da foto, do vídeo ou do texto: treino com passos marcáveis
// por pessoa, receitas/produtos/pratos da nutrição, cardápio do chef e o programa do herói. Só para
// quem pode consumir. O bloco do pilar vem antes do programa.
export async function PostBlocks({ contentId, blocks, checked, references }: Props) {
  if (blocks.length === 0) return null;
  const t = await getTranslations("consume.blocks");
  const ordered = blocks.slice().sort((a, b) => Number(a.kind === "program") - Number(b.kind === "program"));
  return (
    <div className="flex flex-col gap-6" data-testid="post-blocks">
      {ordered.map((block) => {
        if (block.kind === "program") {
          const program = references.programs.get(block.data.program_id);
          if (!program) return null;
          return (
            <section key="program" aria-labelledby="post-program" className="flex flex-col gap-3" data-testid="post-block-program">
              <h2 id="post-program" className="flex items-center gap-2 text-sm font-semibold text-fg">
                <Layers className="size-4 text-accent-text" aria-hidden="true" />
                {t("program.title")}
              </h2>
              {block.data.note ? <p className="type-body-sm text-fg-muted">{block.data.note}</p> : null}
              <RefCard
                href={`/programs/${program.slug}`}
                image={program.cover_url}
                title={program.title}
                tag={program.estimated_weeks ? t("program.weeks", { n: program.estimated_weeks }) : t("program.tag")}
                cta={t("program.open")}
                icon={<Layers className="size-4" aria-hidden="true" />}
              />
            </section>
          );
        }
        if (block.kind === "workout") {
          return <StepChecklist key="workout" contentId={contentId} description={block.data.description} steps={block.data.steps.map((s) => s.text)} initialChecked={checked} />;
        }
        if (block.kind === "nutrition") {
          return (
            <section key="nutrition" aria-labelledby="post-nutrition" className="flex flex-col gap-3" data-testid="post-block-nutrition">
              <h2 id="post-nutrition" className="flex items-center gap-2 text-sm font-semibold text-fg">
                <Salad className="size-4 text-accent-text" aria-hidden="true" />
                {t("nutrition.title")}
              </h2>
              <ul className="flex flex-col gap-2">
                {block.data.items.map((item, index) => {
                  if (item.kind === "recipe") {
                    const recipe = references.recipes.get(item.content_id);
                    if (!recipe) return null;
                    return (
                      <li key={index}>
                        <RefCard href={`/content/${recipe.slug}`} image={recipe.cover_url} title={recipe.title} tag={t("nutrition.recipe")} cta={t("nutrition.openRecipe")} />
                      </li>
                    );
                  }
                  if (item.kind === "product") {
                    const product = references.products.get(item.product_id);
                    if (!product) return null;
                    return (
                      <li key={index}>
                        <RefCard href={`/shop/${product.slug}`} image={product.image_url} title={product.title} tag={t("nutrition.product")} cta={t("nutrition.openProduct")} icon={<ShoppingBag className="size-4" aria-hidden="true" />} />
                      </li>
                    );
                  }
                  return (
                    <li key={index} className="rounded-xl border border-border bg-surface px-4 py-3">
                      <p className="text-sm font-semibold text-fg">{item.name}</p>
                      {item.description ? <p className="type-body-sm text-fg-muted">{item.description}</p> : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        }
        return (
          <section key="menu" aria-labelledby="post-menu" className="flex flex-col gap-3" data-testid="post-block-menu">
            <h2 id="post-menu" className="flex items-center gap-2 text-sm font-semibold text-fg">
              <ChefHat className="size-4 text-accent-text" aria-hidden="true" />
              {t("menu.title")}
            </h2>
            <ol className="flex flex-col gap-2">
              {block.data.options.map((option, index) => {
                const recipe = option.recipe_id ? references.recipes.get(option.recipe_id) : null;
                return (
                  <li key={index} className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-4 py-3">
                    <p className="text-sm font-semibold text-fg">
                      <span className="mr-2 text-fg-muted">{index + 1}.</span>
                      {option.name}
                    </p>
                    {option.description ? <p className="type-body-sm text-fg-muted">{option.description}</p> : null}
                    {recipe ? (
                      <Link href={`/content/${recipe.slug}`} className="w-fit text-sm font-semibold text-accent-text hover:underline">
                        {t("menu.openRecipe")}
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function RefCard({ href, image, title, tag, cta, icon }: { href: string; image: string | null; title: string; tag: string; cta: string; icon?: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2 pr-3 transition-colors hover:border-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
      <span className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-surface-elevated">
        {/* otimizador só para hosts da lista (foto do bucket, imagem local); SVG passa direto */}
        {image ? <Image src={image} alt="" fill unoptimized={image.endsWith(".svg")} sizes="64px" className="object-cover" /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-text">{tag}</span>
        <span className="truncate text-sm font-semibold text-fg">{title}</span>
        <span className="flex items-center gap-1 text-xs text-fg-muted">
          {icon}
          {cta}
        </span>
      </span>
    </Link>
  );
}
