import { Search, X } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, IconButton, Input } from "@/components/ui";
import { exploreHref, MAX_QUERY_LENGTH, type ExploreParams } from "./params";

// Busca por formulário GET: funciona sem JavaScript e deixa a URL compartilhável.
// Enviar sempre leva à aba "conteúdos" (a única com busca textual), preservando os filtros.
export async function SearchForm({ params }: { params: ExploreParams }) {
  const t = await getTranslations("discover.explore.search");
  const hidden = (["pillar", "type", "access", "difficulty"] as const).filter((key) => params[key]);

  return (
    <form role="search" action="/explore" method="get" className="flex items-end gap-2">
      {hidden.map((key) => (
        <input key={key} type="hidden" name={key} value={params[key]} />
      ))}
      <div className="min-w-0 flex-1">
        <label htmlFor="explore-q" className="sr-only">
          {t("label")}
        </label>
        <Input
          id="explore-q"
          name="q"
          type="search"
          defaultValue={params.q}
          placeholder={t("placeholder")}
          maxLength={MAX_QUERY_LENGTH}
          autoComplete="off"
          enterKeyHint="search"
          leadingIcon={<Search />}
        />
      </div>
      {params.q ? (
        <IconButton asChild label={t("clear")} icon={<X />} variant="secondary">
          <Link href={exploreHref(params, { q: null })} />
        </IconButton>
      ) : null}
      <Button type="submit" variant="primary">
        {t("submit")}
      </Button>
    </form>
  );
}
