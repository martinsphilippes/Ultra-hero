"use client";

import { FilePlus2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { createHeroAction, createTalentPageAction, type NewHeroResult } from "@/app/agencia/casting/actions";
import { AccessContactFields, AccessOutcomeNote } from "@/components/agency/AccessPanel";
import { Button, Checkbox, Dialog, EntitySelect, FormField, Input, Switch, Textarea } from "@/components/ui";
import { normalizeAccessEmail, slugifyHeroName } from "@/lib/agency/access-contact";
import { normalizeBrMobile } from "@/lib/auth/phone";
import { PILLARS, type Pillar } from "@/lib/supabase/helpers";
import { memberOption } from "@/lib/ui/entity";

type Manager = { userId: string; name: string; role?: string | null; jobTitle?: string | null };
type PageValues = { slug: string; pillars: Pillar[]; headline: string; bio: string };

// Um só "Novo Hero" (0112): a pessoa (ficha do casting) com e-mail e celular obrigatórios — o acesso nasce junto
// (conta existente ligada na hora ou convite no e-mail) — gestor, segmentos e, se quiser, a página pública já ligada.
export function NewHeroForm({ managers, segments }: { managers: Manager[]; segments: { id: string; name: string }[] }) {
  const t = useTranslations("agency.casting.newHero");
  const tp = useTranslations("pickers");
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [managerId, setManagerId] = useState("");
  const [segmentIds, setSegmentIds] = useState<string[]>([]);
  const [withPage, setWithPage] = useState(false);
  const [page, setPage] = useState<PageValues>({ slug: "", pillars: [], headline: "", bio: "" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Extract<NewHeroResult, { ok: true }> | null>(null);
  const [pending, start] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError(t("nameRequired"));
    if (!normalizeAccessEmail(email)) return setError(t("emailInvalid"));
    if (!normalizeBrMobile(phone)) return setError(t("phoneInvalid"));
    if (withPage && page.pillars.length === 0) return setError(t("pillarsRequired"));
    start(async () => {
      const result = await createHeroAction({
        displayName: name,
        email,
        phone,
        managerId,
        segmentIds,
        page: withPage ? { ...page, slug: page.slug || slugifyHeroName(name) } : null,
      });
      if (!result.ok) return setError(result.error);
      setDone(result);
    });
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4" data-testid="new-hero-done">
        <p className="type-body-sm font-semibold text-fg">{done.creatorId ? t("createdWithPage", { name: name.trim() }) : t("created", { name: name.trim() })}</p>
        <AccessOutcomeNote outcome={done} />
        <Button type="button" className="w-fit" onClick={() => router.push(`/agencia/casting/${done.talentId}`)}>
          {t("openTalent")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate data-testid="new-hero-form">
      <FormField label={t("name")} hint={t("nameHint")} required>
        <Input
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setPage((p) => ({ ...p, slug: slugifyHeroName(e.target.value) }));
          }}
          disabled={pending}
        />
      </FormField>
      <AccessContactFields email={email} phone={phone} onEmail={setEmail} onPhone={setPhone} disabled={pending} emailLabel={t("email")} emailHint={t("emailHint")} />
      <FormField label={t("manager")} hint={tp("hints.talentManager")}>
        <EntitySelect
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
          disabled={pending}
          emptyLabel={t("noManager")}
          emptyCard={tp("empty.noManager")}
          options={managers.map((m) => memberOption(tp, m))}
        />
      </FormField>
      {segments.length > 0 ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium text-fg">{t("segments")}</legend>
          <div className="flex flex-wrap gap-x-4">
            {segments.map((s) => (
              <Checkbox
                key={s.id}
                id={`new-hero-seg-${s.id}`}
                label={s.name}
                checked={segmentIds.includes(s.id)}
                disabled={pending || (!segmentIds.includes(s.id) && segmentIds.length >= 5)}
                onChange={(e) => setSegmentIds((cur) => (e.target.checked ? [...cur, s.id] : cur.filter((x) => x !== s.id)))}
              />
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
        <Switch checked={withPage} onCheckedChange={setWithPage} label={t("withPage")} description={t("withPageHint")} disabled={pending} data-testid="new-hero-page" />
        {withPage ? (
          <PageFields
            values={page}
            onChange={(next) => setPage(next)}
            onSlugTouched={() => setSlugTouched(true)}
            disabled={pending}
            namePlaceholder={slugifyHeroName(name) || "nome-do-heroi"}
          />
        ) : null}
      </div>
      <p className="type-caption text-fg-muted">{t("accessNote")}</p>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" leadingIcon={<Plus />} loading={pending} className="w-full sm:w-fit" data-testid="new-hero-submit">
        {t("submit")}
      </Button>
    </form>
  );
}

function PageFields(props: { values: PageValues; onChange: (v: PageValues) => void; onSlugTouched: () => void; disabled: boolean; namePlaceholder: string }) {
  const t = useTranslations("agency.casting.newHero");
  const tp = useTranslations("common.pillars");
  const v = props.values;
  return (
    <div className="flex flex-col gap-4">
      <FormField label={t("slug")} hint={t("slugHint", { slug: v.slug || props.namePlaceholder })}>
        <Input
          value={v.slug}
          maxLength={60}
          className="font-mono"
          onChange={(e) => {
            props.onSlugTouched();
            props.onChange({ ...v, slug: slugifyHeroName(e.target.value) });
          }}
          disabled={props.disabled}
        />
      </FormField>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium text-fg">{t("pillars")}</legend>
        <div className="flex flex-wrap gap-x-4">
          {PILLARS.map((pillar) => (
            <Checkbox
              key={pillar}
              id={`new-hero-pillar-${pillar}`}
              label={tp(pillar)}
              checked={v.pillars.includes(pillar)}
              disabled={props.disabled}
              onChange={(e) => props.onChange({ ...v, pillars: e.target.checked ? [...v.pillars, pillar] : v.pillars.filter((p) => p !== pillar) })}
            />
          ))}
        </div>
      </fieldset>
      <FormField label={t("headline")} optionalLabel={t("optional")}>
        <Input value={v.headline} maxLength={160} onChange={(e) => props.onChange({ ...v, headline: e.target.value })} disabled={props.disabled} />
      </FormField>
      <FormField label={t("bio")} optionalLabel={t("optional")}>
        <Textarea value={v.bio} maxLength={2000} rows={4} onChange={(e) => props.onChange({ ...v, bio: e.target.value })} disabled={props.disabled} />
      </FormField>
    </div>
  );
}

/** Ficha sem página pública: cria a página já ligada a este talento (um botão). */
export function CreateTalentPageButton({ talentId, talentName }: { talentId: string; talentName: string }) {
  const t = useTranslations("agency.casting.newHero");
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<PageValues>({ slug: slugifyHeroName(talentName), pillars: [], headline: "", bio: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (page.pillars.length === 0) return setError(t("pillarsRequired"));
    start(async () => {
      const result = await createTalentPageAction({ talentId, ...page });
      if (!result.ok) return setError(result.error);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" size="sm" variant="secondary" leadingIcon={<FilePlus2 />} onClick={() => setOpen(true)} data-testid="talent-create-page">
        {t("createPage")}
      </Button>
      {open ? (
        <Dialog
          open
          onOpenChange={(next) => (next || pending ? undefined : setOpen(false))}
          title={t("createPageTitle")}
          description={t("createPageHint")}
          size="md"
          footer={
            <>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                {t("cancel")}
              </Button>
              <Button type="submit" form={formId} loading={pending}>
                {t("createPage")}
              </Button>
            </>
          }
        >
          <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <PageFields values={page} onChange={setPage} onSlugTouched={() => undefined} disabled={pending} namePlaceholder={slugifyHeroName(talentName)} />
            {error ? (
              <p role="alert" className="type-body-sm text-danger">
                {error}
              </p>
            ) : null}
          </form>
        </Dialog>
      ) : null}
    </>
  );
}
