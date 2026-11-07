"use client";

import { BadgeCheck, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { requestBrandLoginAction, searchBrandCandidatesAction, type BrandCandidate } from "@/lib/brand-universe/actions";
import { Button, FormField, Input } from "@/components/ui";
import { BrandLogo } from "./BrandLogo";

// "Você é da X?" (0129): quem se cadastra como Marca vê primeiro as marcas do domínio do próprio e-mail (ou busca
// pelo nome) e pede o acesso; a Groscove aprova. "Minha marca não está aqui" segue para cadastrar uma nova (children).
export function BrandClaimStep({ initial, initialName, children }: { initial: BrandCandidate[]; initialName: string; children: ReactNode }) {
  const t = useTranslations("brandUniverse.claim");
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string | null>(initial.length === 1 && initial[0]!.domain_matches ? initial[0]!.id : null);
  const [fullName, setFullName] = useState(initialName);
  const [jobTitle, setJobTitle] = useState("");
  const [skip, setSkip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const domainBrand = initial.find((c) => c.domain_matches);

  if (skip) {
    return (
      <div className="flex flex-col gap-4">
        {children}
        <button type="button" onClick={() => setSkip(false)} className="w-fit text-sm font-semibold text-accent-text underline">
          {t("searchAgain")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="brand-claim">
      <div className="flex flex-col gap-1">
        <h2 className="type-h3 text-fg">{domainBrand ? t("titleDomain", { brand: domainBrand.name }) : t("title")}</h2>
        <p className="type-body-sm text-fg-muted">{t("body")}</p>
      </div>
      <form
        className="flex gap-2"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setItems(await searchBrandCandidatesAction(query));
            setChosen(null);
          });
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" aria-label={t("search")} placeholder={t("search")} data-testid="brand-claim-search" />
        </div>
        <Button type="submit" variant="secondary" loading={pending}>
          {t("searchButton")}
        </Button>
      </form>
      {items.length === 0 && query ? <p className="type-body-sm text-fg-muted">{t("none")}</p> : null}
      <ul className="flex flex-col gap-2">
        {items.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setChosen(c.id)}
              aria-pressed={chosen === c.id}
              className={
                "flex w-full items-center gap-3 rounded-2xl border bg-surface p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
                (chosen === c.id ? "border-2 border-accent" : "border-border hover:bg-surface-hover")
              }
              data-testid="brand-claim-candidate"
            >
              <BrandLogo name={c.name} url={c.logo_url} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold text-fg">{c.name}</span>
                {c.category ? <span className="truncate type-caption text-fg-muted">{c.category}</span> : null}
                {c.domain_matches ? (
                  <span className="inline-flex items-center gap-1 type-caption text-success">
                    <BadgeCheck className="size-3.5" aria-hidden="true" />
                    {t("domainMatch")}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {chosen ? (
        <form
          className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setError(null);
              const r = await requestBrandLoginAction({ brandId: chosen, fullName, jobTitle });
              if (!r.ok) return setError(r.error);
              router.refresh();
            });
          }}
        >
          <FormField label={t("fullName")}>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" />
          </FormField>
          <FormField label={t("jobTitle")}>
            <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={80} autoComplete="organization-title" />
          </FormField>
          <Button type="submit" loading={pending} data-testid="brand-claim-request">
            {t("request")}
          </Button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="button" variant="ghost" onClick={() => setSkip(true)} data-testid="brand-claim-skip">
        {t("notListed")}
      </Button>
    </div>
  );
}
