"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { chooseHeroAction, createHeroAction, updateHeroAction } from "@/app/agencia/herois/actions";
import { Button, Checkbox, FormField, Input, Textarea, useToast } from "@/components/ui";
import { PILLARS, type Pillar } from "@/lib/supabase/helpers";

type HeroValues = { name: string; slug: string; pillars: Pillar[]; headline: string; bio: string };

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Perfil do herói gerenciado pela agência (0070): criar (com o endereço público) ou editar texto e pilares.
export function HeroProfileForm({ heroId, initial }: { heroId?: string; initial?: Omit<HeroValues, "slug"> & { slug?: string } }) {
  const t = useTranslations("agency.heroes.form");
  const tp = useTranslations("common.pillars");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<HeroValues>({
    name: initial?.name ?? "",
    slug: initial?.slug ?? "",
    pillars: initial?.pillars ?? [],
    headline: initial?.headline ?? "",
    bio: initial?.bio ?? "",
  });
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));
  const editing = Boolean(heroId);

  function togglePillar(pillar: Pillar, on: boolean) {
    setValues((v) => ({ ...v, pillars: on ? [...v.pillars, pillar] : v.pillars.filter((p) => p !== pillar) }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = heroId ? await updateHeroAction({ id: heroId, ...values }) : await createHeroAction(values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({ title: editing ? t("saved") : t("created"), variant: "success" });
      const createdId = "id" in result && typeof result.id === "string" ? result.id : null;
      if (!heroId && createdId) {
        const chosen = await chooseHeroAction(createdId);
        router.push(chosen.ok ? `/agencia/herois/${createdId}` : "/agencia/herois");
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" data-testid="hero-profile-form">
      <FormField label={t("name")} required>
        <Input
          value={values.name}
          maxLength={80}
          onChange={(e) => {
            const name = e.target.value;
            setValues((v) => ({ ...v, name, slug: slugTouched ? v.slug : slugify(name) }));
          }}
        />
      </FormField>
      {!editing ? (
        <FormField label={t("slug")} hint={t("slugHint", { slug: values.slug || "nome-do-heroi" })} required>
          <Input
            value={values.slug}
            maxLength={60}
            onChange={(e) => {
              setSlugTouched(true);
              setValues((v) => ({ ...v, slug: slugify(e.target.value) }));
            }}
          />
        </FormField>
      ) : null}
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium text-fg">{t("pillars")}</legend>
        <div className="flex flex-wrap gap-x-4">
          {PILLARS.map((pillar) => (
            <Checkbox key={pillar} id={`pillar-${pillar}`} label={tp(pillar)} checked={values.pillars.includes(pillar)} onChange={(e) => togglePillar(pillar, e.target.checked)} />
          ))}
        </div>
      </fieldset>
      <FormField label={t("headline")} optionalLabel={t("optional")}>
        <Input value={values.headline} maxLength={160} onChange={(e) => setValues((v) => ({ ...v, headline: e.target.value }))} />
      </FormField>
      <FormField label={t("bio")} optionalLabel={t("optional")}>
        <Textarea value={values.bio} maxLength={2000} rows={5} onChange={(e) => setValues((v) => ({ ...v, bio: e.target.value }))} />
      </FormField>
      {error ? (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" loading={pending} disabled={values.name.trim().length < 2 || values.pillars.length === 0 || (!editing && !values.slug)}>
        {editing ? t("save") : t("create")}
      </Button>
    </form>
  );
}

// Abrir a gestão de um herói: grava a escolha (auditada) e vai para a página dele.
export function ManageHeroButton({ heroId, label }: { heroId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await chooseHeroAction(heroId);
            if (!result.ok) setError(result.error);
            else router.push(`/agencia/herois/${heroId}`);
          })
        }
      >
        {label}
      </Button>
      {error ? (
        <span role="alert" className="type-caption text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
