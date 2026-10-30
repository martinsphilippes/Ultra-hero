"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setCreatorCategoriesAction } from "@/app/admin/hero-categories/actions";
import { Button, FormField, Select, useToast } from "@/components/ui";

export type HeroCategoryOption = { id: string; label: string; is_active: boolean };

type Props = { creatorId: string; options: HeroCategoryOption[]; initial: string[] };

// Categorias do herói (até 2, em ordem): a 1ª é a principal; a 2ª é opcional.
export function HeroCategoriesField({ creatorId, options, initial }: Props) {
  const t = useTranslations("adminContent.heroCategories.field");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [first, setFirst] = useState(initial[0] ?? "");
  const [second, setSecond] = useState(initial[1] ?? "");
  const [error, setError] = useState<string | null>(null);

  const selection = [first, second].filter(Boolean);
  const dirty = selection.join(",") !== initial.join(",");
  const label = (o: HeroCategoryOption) => (o.is_active ? o.label : `${o.label} (${t("inactive")})`);

  function changeFirst(value: string) {
    setFirst(value);
    // sem principal não há segunda; e a segunda não repete a primeira
    if (!value || value === second) setSecond("");
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setCreatorCategoriesAction(creatorId, selection);
      if (result.ok) {
        toast({ title: result.message ?? t("saved"), variant: "success" });
        router.refresh();
      } else setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="hero-categories-field">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("first")} hint={t("firstHint")}>
          <Select value={first} onChange={(e) => changeFirst(e.target.value)} data-testid="hero-category-first">
            <option value="">{t("none")}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {label(o)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("second")} hint={t("secondHint")}>
          <Select value={second} onChange={(e) => setSecond(e.target.value)} disabled={!first} data-testid="hero-category-second">
            <option value="">{t("none")}</option>
            {options
              .filter((o) => o.id !== first)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {label(o)}
                </option>
              ))}
          </Select>
        </FormField>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={save} loading={pending} disabled={!dirty}>
          {t("save")}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
