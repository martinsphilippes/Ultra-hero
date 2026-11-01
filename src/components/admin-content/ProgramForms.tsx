"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createProgramAction, createVersionAction, saveVersionFieldsAction, updateProgramAction, type VersionFieldsInput } from "@/app/admin/programs/actions";
import { Button, Checkbox, Dialog, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import { PILLARS, type Pillar } from "@/lib/supabase/helpers";

type CreatorOption = { id: string; name: string };
const PILLAR_KEYS = PILLARS;

// ---------------------------------------------------------------- criar programa + 1ª versão
export function ProgramCreateForm({ creators, initialCreatorId = null }: { creators: CreatorOption[]; initialCreatorId?: string | null }) {
  const t = useTranslations("adminContent.programs.create");
  const tc = useTranslations("adminContent.common");
  const tp = useTranslations("common.pillars");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ slug: "", creator_id: initialCreatorId ?? "", pillar: "routine" as Pillar, cover_url: "", title: "", summary: "", estimated_weeks: "" });

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createProgramAction({
        slug: form.slug || form.title,
        creator_id: form.creator_id || null,
        pillar: form.pillar,
        cover_url: form.cover_url,
        title: form.title,
        summary: form.summary,
        estimated_weeks: form.estimated_weeks ? Number(form.estimated_weeks) : null,
      });
      if (result.ok && result.id) {
        toast({ title: result.message ?? tc("saved"), variant: "success" });
        router.push(`/admin/programs/${result.id}`);
      } else if (!result.ok) setError(result.error);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="grid max-w-3xl gap-4 md:grid-cols-2"
    >
      <FormField label={tc("slug")} required className="md:col-span-2">
        <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} maxLength={80} />
      </FormField>
      <FormField label={tc("creator")}>
        <Select value={form.creator_id} onChange={(e) => setForm({ ...form, creator_id: e.target.value })}>
          <option value="">{tc("noCreator")}</option>
          {creators.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={tc("pillar")} required>
        <Select value={form.pillar} onChange={(e) => setForm({ ...form, pillar: e.target.value as Pillar })}>
          {PILLAR_KEYS.map((p) => (
            <option key={p} value={p}>
              {tp(p)}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={tc("cover")} hint={tc("coverHint")} className="md:col-span-2">
        <Input value={form.cover_url} onChange={(e) => setForm({ ...form, cover_url: e.target.value })} maxLength={500} />
      </FormField>

      <h2 className="type-h3 pt-2 text-fg md:col-span-2">{t("firstVersion")}</h2>
      <FormField label={t("versionTitle")} required className="md:col-span-2">
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={140} required />
      </FormField>
      <FormField label={tc("summary")} className="md:col-span-2">
        <Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} maxLength={600} rows={3} />
      </FormField>
      <FormField label={t("estimatedWeeks")}>
        <Input type="number" min={1} max={104} value={form.estimated_weeks} onChange={(e) => setForm({ ...form, estimated_weeks: e.target.value })} />
      </FormField>
      {error && (
        <p role="alert" className="text-sm text-danger md:col-span-2">
          {error}
        </p>
      )}
      <div className="md:col-span-2">
        <Button type="submit" loading={pending}>
          {tc("create")}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- dados básicos do programa
type BasicsProps = { programId: string; creators: CreatorOption[]; initial: { slug: string; creator_id: string | null; pillar: Pillar; cover_url: string | null } };

export function ProgramBasicsForm({ programId, creators, initial }: BasicsProps) {
  const tc = useTranslations("adminContent.common");
  const tp = useTranslations("common.pillars");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ slug: initial.slug, creator_id: initial.creator_id ?? "", pillar: initial.pillar, cover_url: initial.cover_url ?? "" });

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await updateProgramAction(programId, { slug: form.slug, creator_id: form.creator_id || null, pillar: form.pillar, cover_url: form.cover_url });
      if (result.ok) {
        toast({ title: result.message ?? tc("saved"), variant: "success" });
        router.refresh();
      } else setError(result.error);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <FormField label={tc("slug")} required>
        <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} maxLength={80} inputSize="sm" />
      </FormField>
      <FormField label={tc("pillar")} required>
        <Select value={form.pillar} onChange={(e) => setForm({ ...form, pillar: e.target.value as Pillar })} selectSize="sm">
          {PILLAR_KEYS.map((p) => (
            <option key={p} value={p}>
              {tp(p)}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={tc("creator")}>
        <Select value={form.creator_id} onChange={(e) => setForm({ ...form, creator_id: e.target.value })} selectSize="sm">
          <option value="">{tc("noCreator")}</option>
          {creators.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label={tc("cover")} hint={tc("coverHint")}>
        <Input value={form.cover_url} onChange={(e) => setForm({ ...form, cover_url: e.target.value })} maxLength={500} inputSize="sm" />
      </FormField>
      {error && (
        <p role="alert" className="text-sm text-danger sm:col-span-2">
          {error}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" size="sm" loading={pending}>
          {tc("save")}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- nova versão (copiar de)
type VersionOption = { id: string; version_no: number; title: string };

export function NewVersionDialog({ programId, versions }: { programId: string; versions: VersionOption[] }) {
  const t = useTranslations("adminContent.programs.detail");
  const tc = useTranslations("adminContent.common");
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [copyFrom, setCopyFrom] = useState<string>(versions[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createVersionAction(programId, copyFrom || null);
      if (result.ok && result.id) {
        toast({ title: result.message ?? tc("done"), variant: "success" });
        setOpen(false);
        router.push(`/admin/programs/${programId}/versions/${result.id}`);
      } else if (!result.ok) setError(result.error);
    });
  }

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        {t("newVersion")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        title={t("newVersionTitle")}
        description={t("newVersionDescription")}
        size="sm"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {tc("cancel")}
            </Button>
            <Button type="button" onClick={submit} loading={pending}>
              {tc("create")}
            </Button>
          </>
        }
      >
        <FormField label={t("copyFrom")} error={error ?? undefined}>
          <Select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">{t("copyNone")}</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {tc("version", { n: v.version_no })} · {v.title}
              </option>
            ))}
          </Select>
        </FormField>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------- campos da versão
const CERT_FIELDS = ["display_name", "program_title", "completed_at", "version", "pillar"] as const;
type CertField = (typeof CERT_FIELDS)[number];

type VersionFieldsProps = { programId: string; versionId: string; initial: VersionFieldsInput };

// Textos da versão continuam editáveis mesmo publicada (correções); só os itens congelam.
export function ProgramVersionFields({ programId, versionId, initial }: VersionFieldsProps) {
  const t = useTranslations("adminContent.programs.version");
  const tc = useTranslations("adminContent.common");
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: initial.title,
    summary: initial.summary,
    description: initial.description,
    estimated_weeks: initial.estimated_weeks ? String(initial.estimated_weeks) : "",
    certificate_fields: new Set<CertField>(initial.certificate_fields),
  });

  function toggleField(field: CertField, checked: boolean) {
    const next = new Set(form.certificate_fields);
    if (checked) next.add(field);
    else next.delete(field);
    setForm({ ...form, certificate_fields: next });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveVersionFieldsAction(programId, versionId, {
        title: form.title,
        summary: form.summary,
        description: form.description,
        estimated_weeks: form.estimated_weeks ? Number(form.estimated_weeks) : null,
        certificate_fields: CERT_FIELDS.filter((f) => form.certificate_fields.has(f)),
      });
      if (result.ok) {
        toast({ title: result.message ?? tc("saved"), variant: "success" });
        router.refresh();
      } else setError(result.error);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <FormField label={t("title")} required className="sm:col-span-2">
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={140} required />
      </FormField>
      <FormField label={t("summary")} className="sm:col-span-2">
        <Textarea value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} maxLength={600} rows={2} />
      </FormField>
      <FormField label={t("description")} className="sm:col-span-2">
        <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={4000} rows={4} />
      </FormField>
      <FormField label={t("estimatedWeeks")}>
        <Input type="number" min={1} max={104} value={form.estimated_weeks} onChange={(e) => setForm({ ...form, estimated_weeks: e.target.value })} />
      </FormField>
      <fieldset className="flex flex-col gap-1 sm:col-span-2">
        <legend className="text-sm font-semibold text-fg">{t("certificateFields")}</legend>
        <p className="type-caption text-fg-muted">{t("certificateFieldsHint")}</p>
        <div className="grid gap-1 sm:grid-cols-2">
          {CERT_FIELDS.map((field) => (
            <Checkbox key={field} id={`cert-${field}`} label={t(`certificate.${field}`)} checked={form.certificate_fields.has(field)} onChange={(e) => toggleField(field, e.target.checked)} />
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-danger sm:col-span-2">
          {error}
        </p>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" loading={pending}>
          {tc("save")}
        </Button>
      </div>
    </form>
  );
}
