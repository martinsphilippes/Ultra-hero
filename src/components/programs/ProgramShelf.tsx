import { Ban, BookOpen, Check, ChefHat, Dumbbell, FileText, Lock, PlayCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { tileCover } from "@/components/discover/explore/tiles";
import { Button, StepMark } from "@/components/ui";
import { joinMeta, sectionStarts, shelfSectionKind, stepAccessibleName } from "@/lib/catalog/program-shelf";
import type { ProgramShelfData, ShelfStepData } from "@/lib/catalog/program-shelves";
import { cn } from "@/lib/utils";
import { ShelfRail } from "./ShelfRail";

const TYPE_ICON = { video: PlayCircle, recipe: ChefHat, workout: Dumbbell, guide: BookOpen, article: FileText } as const;

// Largura do quadrado. Celular: (largura útil + margem esquerda − 3 vãos) / 3,4 → 3 quadrados inteiros
// e ~40% do 4º no Pixel 7 (412px), a dica de que a linha rola. Desktop: largura fixa, mais quadrados.
const STEP_WIDTH = "w-[calc((100%-0.5rem)/3.4)] md:w-44";

type Props = {
  shelf: ProgramShelfData;
  /** Prioriza as capas dos primeiros quadrados (primeira prateleira da dobra). */
  priority?: boolean;
  /** Nível do título (h2 na biblioteca; h3 se a página já tiver um h2 acima). */
  headingLevel?: "h2" | "h3";
};

// Prateleira de um programa (estilo playlist do YouTube): eyebrow do pilar, título (link para o
// programa), meta curta e ação; embaixo, uma linha de quadrados 1:1, um por etapa, com rolagem lateral.
export async function ProgramShelf({ shelf, priority = false, headingLevel = "h2" }: Props) {
  const [t, tc, tp] = await Promise.all([getTranslations("catalog.programShelf"), getTranslations("catalog"), getTranslations("common.pillars")]);
  const Heading = headingLevel;
  const headingId = `shelf-${shelf.id}`;
  const href = `/programs/${shelf.slug}`;
  const total = shelf.steps.length;
  const starts = sectionStarts(shelf.steps.map((s) => s.step));
  const hasSections = starts.some(Boolean);

  const meta = joinMeta([
    t("steps", { n: total }),
    shelf.estimatedWeeks ? tc("weeks", { n: shelf.estimatedWeeks }) : null,
    shelf.enrollment === "completed" ? t("completed") : shelf.progress ? t("progress", { done: shelf.progress.done, total: shelf.progress.total }) : null,
  ]);
  const continuing = shelf.enrollment === "active";
  const actionHref = continuing && shelf.nextContentSlug ? `/content/${shelf.nextContentSlug}` : href;

  const header = (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-2">
        <StepMark />
        <span className="type-overline truncate text-accent-text">{t("eyebrow", { pillar: tp(shelf.pillar) })}</span>
      </div>
      <Heading id={headingId} className="type-h3 line-clamp-2 text-balance text-fg">
        <Link href={href} className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          {shelf.title}
        </Link>
      </Heading>
      <p className="type-caption text-fg-muted" data-testid="shelf-meta">
        {meta}
      </p>
    </div>
  );

  const action = (
    <Button asChild variant={continuing ? "primary" : "secondary"} size="sm" className="min-h-11 md:min-h-9">
      {/* nome com o programa: as ações das prateleiras não ficam todas iguais para o leitor de tela */}
      <Link href={actionHref} aria-label={`${continuing ? t("continue") : t("view")}: ${shelf.title}`}>
        {continuing ? t("continue") : t("view")}
      </Link>
    </Button>
  );

  return (
    <section aria-labelledby={headingId} data-testid="program-shelf" data-program={shelf.slug} className="flex flex-col">
      <ShelfRail
        header={header}
        action={action}
        listLabel={t("listLabel", { title: shelf.title })}
        previousLabel={t("previous", { title: shelf.title })}
        nextLabel={t("next", { title: shelf.title })}
      >
        {shelf.steps.length === 0 ? (
          <li className="w-full rounded-xl border border-dashed border-border-strong px-4 py-6 text-center type-body-sm text-fg-muted">{t("noSteps")}</li>
        ) : (
          shelf.steps.map((data, index) => (
            // relative: os trechos sr-only (absolutos) ficam presos ao quadrado; sem isso escapariam do trilho e
            // alargariam a página no celular
            <li key={`${data.step.originalContentId}-${data.step.contentId}`} className={cn(STEP_WIDTH, "relative shrink-0 snap-start")}>
              {hasSections ? <SectionLabel section={data.step.section} show={starts[index]} labels={{ essential: t("sections.essential"), beyond: t("sections.beyond") }} /> : null}
              <StepTile
                data={data}
                n={index + 1}
                total={total}
                priority={priority && index < 4}
                labels={{
                  step: t("step", { n: index + 1 }),
                  of: t("stepOfSr", { total }),
                  state: stepStateText(data, t, tc),
                  name: stepAccessibleName({ position: t("stepOf", { n: index + 1, total, title: data.content?.title ?? t("unavailableTitle") }), state: stepStateText(data, t, tc) }),
                  type: data.content ? tc(`types.${data.content.type}`) : null,
                  minutes: data.content?.duration_minutes ? tc("minutes", { n: data.content.duration_minutes }) : null,
                  done: t("doneBadge"),
                  unavailable: t("unavailableTitle"),
                }}
              />
            </li>
          ))
        )}
      </ShelfRail>
    </section>
  );
}

type Translator = Awaited<ReturnType<typeof getTranslations>>;

/** Estado em texto para leitor de tela ("concluída", "requer plano Base"); null quando aberta. */
function stepStateText(data: ShelfStepData, t: Translator, tc: Translator): string | null {
  if (data.state === "done") return t("state.done");
  if (data.state === "locked") return t("state.locked", { plan: data.content?.required_module?.name ?? tc("premium") });
  if (data.state === "unavailable") return t("state.unavailable");
  return null;
}

// Rótulo discreto da seção ("Essencial" / "Para ir além"), só no primeiro quadrado de cada uma;
// nos outros, um espaço vazio do mesmo tamanho mantém as capas alinhadas.
function SectionLabel({ section, show, labels }: { section: string | null; show: boolean; labels: { essential: string; beyond: string } }) {
  const kind = shelfSectionKind(section);
  if (!show || !kind) return <span aria-hidden="true" className="mb-1.5 block h-4" />;
  const text = kind === "essential" ? labels.essential : kind === "beyond" ? labels.beyond : (section ?? "");
  return (
    <p className={cn("mb-1.5 flex h-4 items-center gap-1.5 truncate type-overline", kind === "essential" ? "text-accent-text" : "text-fg-muted")}>
      <span aria-hidden="true" className={cn("h-3 w-0.5 shrink-0 rounded-full", kind === "essential" ? "bg-accent" : "bg-border-strong")} />
      {text}
    </p>
  );
}

type TileLabels = {
  /** "Etapa 2" (visível no selo) */
  step: string;
  /** "de 6:" (só leitor de tela, completa o selo) */
  of: string;
  /** "concluída" / "requer plano Base" / "indisponível" (só leitor de tela) */
  state: string | null;
  /** Nome completo, para o quadrado sem link (conteúdo fora do ar). */
  name: string;
  type: string | null;
  minutes: string | null;
  done: string;
  unavailable: string;
};

// Quadrado da etapa: capa 1:1 na linguagem do ContentTile (ícone do tipo, cadeado), selo "Etapa N",
// título em até 2 linhas e tipo · duração. O nome do link vem do próprio texto visível, completado
// por trechos só para leitor de tela: "Etapa 2 de 6: Título, concluída" (sem aria-label, para o
// nome sempre conter o texto que aparece — WCAG 2.5.3).
function StepTile({ data, n, total, priority, labels }: { data: ShelfStepData; n: number; total: number; priority: boolean; labels: TileLabels }) {
  const { content, state } = data;
  const Icon = content ? TYPE_ICON[content.type] : Ban;
  const src = content ? tileCover(content.cover_url, content.pillar) : null;
  const done = state === "done";

  const cover = (
    <span className="relative block aspect-square overflow-hidden rounded-lg bg-surface-elevated">
      {src ? (
        <Image
          src={src}
          alt=""
          fill
          priority={priority}
          unoptimized={src.endsWith(".svg")}
          sizes="(min-width: 768px) 11rem, 30vw"
          className={cn("object-cover transition-transform duration-500 ease-out-expo group-hover:scale-[1.04] motion-reduce:transition-none", done && "opacity-60")}
        />
      ) : null}
      {/* Ícones e selos brancos com sombra/fundo escuro: legíveis sobre qualquer capa. */}
      <span className="absolute left-1.5 top-1.5 rounded bg-obsidian/75 px-1.5 py-0.5 font-mono text-[0.625rem] font-medium uppercase leading-none tracking-wider text-white">
        {labels.step}
        <span className="sr-only"> {labels.of}</span>
      </span>
      <Icon aria-hidden="true" className="absolute right-1.5 top-1.5 size-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
      {done ? (
        <span aria-hidden="true" className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded bg-success px-1.5 py-0.5 font-mono text-[0.625rem] font-medium uppercase leading-none tracking-wider text-white">
          <Check aria-hidden="true" className="size-3" strokeWidth={3} />
          {labels.done}
        </span>
      ) : state === "locked" ? (
        <Lock aria-hidden="true" className="absolute bottom-1.5 left-1.5 size-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
      ) : null}
      {content ? (
        <span aria-hidden="true" data-focus-ring="" className="pointer-events-none absolute inset-0 rounded-lg opacity-0 ring-[3px] ring-inset ring-focus group-focus-visible:opacity-100" />
      ) : null}
    </span>
  );

  const text = (
    <>
      <span className={cn("line-clamp-2 text-sm font-semibold leading-snug", content ? "text-fg" : "text-fg-muted")}>
        {content?.title ?? labels.unavailable}
        {labels.state ? <span className="sr-only">, {labels.state}</span> : null}
      </span>
      {content ? (
        <span aria-hidden="true" className="type-caption truncate text-fg-muted">
          {joinMeta([labels.type, labels.minutes])}
        </span>
      ) : null}
    </>
  );

  if (!content) {
    return (
      <div className="flex flex-col gap-1.5" role="group" aria-label={labels.name} data-testid="shelf-step" data-state={state}>
        {cover}
        {text}
      </div>
    );
  }

  return (
    <Link
      href={`/content/${content.slug}`}
      data-testid="shelf-step"
      data-state={state}
      data-step={n}
      data-total={total}
      className="group flex flex-col gap-1.5 rounded-lg focus-visible:outline-none"
    >
      {cover}
      {text}
    </Link>
  );
}
