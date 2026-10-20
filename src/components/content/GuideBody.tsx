import { Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { GuideBody as Guide } from "./body-types";

// Guia/artigo: seções (título + texto) e pontos-chave. O id do wrapper serve ao ReadingTracker.
export async function GuideBody({ guide, id }: { guide: Guide; id: string }) {
  const t = await getTranslations("consume.body.guide");
  return (
    <article id={id} className="flex flex-col gap-8">
      {guide.intro && <p className="type-body text-lg text-fg-muted">{guide.intro}</p>}
      {guide.sections.map((section, index) => (
        <section key={index} className="flex flex-col gap-2">
          {section.heading && <h2 className="type-h2 text-fg">{section.heading}</h2>}
          {section.text.split(/\n{2,}/).map((paragraph, pi) => (
            <p key={pi} className="type-body max-w-prose text-fg">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
      {guide.keyPoints.length > 0 && (
        <section aria-labelledby="guide-key-points" className="rounded-2xl border border-accent/30 bg-accent-soft/40 p-5">
          <h2 id="guide-key-points" className="mb-3 flex items-center gap-2 type-h3 text-fg">
            <Sparkles className="size-5 text-accent-text" aria-hidden="true" />
            {t("keyPoints")}
          </h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 type-body text-fg">
            {guide.keyPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
