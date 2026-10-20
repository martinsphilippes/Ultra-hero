import { Info } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui";

export type FoodInfo = { ingredients: string[]; allergens: string[]; storage: string };

// Normaliza o jsonb food_info (pode vir incompleto de produtos antigos).
export function parseFoodInfo(value: unknown): FoodInfo | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === "string") : []);
  return { ingredients: list(v.ingredients), allergens: list(v.allergens), storage: typeof v.storage === "string" ? v.storage : "" };
}

// Ficha alimentar: ingredientes, alérgenos em destaque e conservação, com aviso educativo.
export async function FoodInfoBlock({ info }: { info: FoodInfo }) {
  const t = await getTranslations("commerce.product.foodInfo");
  return (
    <section aria-labelledby="food-info-title" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <h2 id="food-info-title" className="type-h3 text-fg">
        {t("title")}
      </h2>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <dt className="type-overline text-fg-muted">{t("ingredients")}</dt>
          <dd>
            {info.ingredients.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {info.ingredients.map((item) => (
                  <li key={item}>
                    <Badge variant="neutral" className="normal-case tracking-normal">
                      {item}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-sm text-fg-muted">—</span>
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-1.5">
          <dt className="type-overline text-fg-muted">{t("allergens")}</dt>
          <dd>
            {info.allergens.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {info.allergens.map((item) => (
                  <li key={item}>
                    <Badge variant="warning" className="normal-case tracking-normal">
                      {item}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-sm text-fg-muted">{t("allergensNone")}</span>
            )}
          </dd>
        </div>
        {info.storage ? (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <dt className="type-overline text-fg-muted">{t("storage")}</dt>
            <dd className="type-body-sm text-fg">{info.storage}</dd>
          </div>
        ) : null}
      </dl>
      <p className="flex items-start gap-2 type-caption text-fg-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {t("disclaimer")}
      </p>
    </section>
  );
}
