"use client";

import { Archive, Link2, Save, ShieldCheck, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { archiveTalentAction, linkCreatorAction, recordConsentAction, saveTalentAction, setCatalogAction, setSegmentsAction } from "@/app/agencia/casting/actions";
import { Button, Checkbox, Dialog, FormField, Input, Select, Switch, Textarea, useToast } from "@/components/ui";
import { AVAILABILITIES, COMMERCIAL_STATUSES, UFS, type Availability, type CommercialStatus } from "@/lib/talent/vocab";

export type TalentFormValues = {
  id: string | null;
  displayName: string;
  city: string;
  state: string;
  managerId: string;
  commercialStatus: CommercialStatus;
  availability: Availability;
  availabilityNote: string;
  contactEmail: string;
  contactPhone: string;
  internalNotes: string;
  lastContactAt: string;
};

export const EMPTY_TALENT: TalentFormValues = {
  id: null,
  displayName: "",
  city: "",
  state: "",
  managerId: "",
  commercialStatus: "prospect",
  availability: "available",
  availabilityNote: "",
  contactEmail: "",
  contactPhone: "",
  internalNotes: "",
  lastContactAt: "",
};

// Ficha do talento (gestor+): dados de contato e notas internas nunca vão ao kit nem ao creator
// (talent_my_context não devolve esses campos). Sem valores aqui.
export function TalentForm({ initial, managers, canEdit }: { initial: TalentFormValues; managers: { userId: string; name: string }[]; canEdit: boolean }) {
  const t = useTranslations("agency.casting.form");
  const tv = useTranslations("agency.casting");
  const router = useRouter();
  const { toast } = useToast();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof TalentFormValues>(k: K, value: TalentFormValues[K]) => setV((cur) => ({ ...cur, [k]: value }));
  const disabled = pending || !canEdit;

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    start(async () => {
      const result = await saveTalentAction(v);
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      if (!v.id && result.id) router.push(`/agencia/casting/${result.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate data-testid="talent-form">
      <FormField label={t("name")} hint={t("nameHint")} required>
        <Input value={v.displayName} maxLength={80} onChange={(e) => set("displayName", e.target.value)} disabled={disabled} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <FormField label={t("city")}>
          <Input value={v.city} maxLength={60} onChange={(e) => set("city", e.target.value)} disabled={disabled} />
        </FormField>
        <FormField label={t("state")}>
          <Select value={v.state} onChange={(e) => set("state", e.target.value)} disabled={disabled}>
            <option value="">—</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label={t("status")}>
          <Select value={v.commercialStatus} onChange={(e) => set("commercialStatus", e.target.value as CommercialStatus)} disabled={disabled}>
            {COMMERCIAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {tv(`status.${s}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("availability")}>
          <Select value={v.availability} onChange={(e) => set("availability", e.target.value as Availability)} disabled={disabled}>
            {AVAILABILITIES.map((s) => (
              <option key={s} value={s}>
                {tv(`availability.${s}`)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t("manager")}>
          <Select value={v.managerId} onChange={(e) => set("managerId", e.target.value)} disabled={disabled}>
            <option value="">{t("noManager")}</option>
            {managers.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField label={t("availabilityNote")} hint={t("availabilityNoteHint")}>
        <Input value={v.availabilityNote} maxLength={280} onChange={(e) => set("availabilityNote", e.target.value)} disabled={disabled} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label={t("email")}>
          <Input type="email" inputMode="email" value={v.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} disabled={disabled} />
        </FormField>
        <FormField label={t("phone")}>
          <Input type="tel" inputMode="tel" value={v.contactPhone} maxLength={20} onChange={(e) => set("contactPhone", e.target.value)} disabled={disabled} />
        </FormField>
        <FormField label={t("lastContact")}>
          <Input type="date" value={v.lastContactAt} onChange={(e) => set("lastContactAt", e.target.value)} disabled={disabled} />
        </FormField>
      </div>
      <FormField label={t("notes")} hint={t("notesHint")}>
        <Textarea value={v.internalNotes} maxLength={2000} rows={4} onChange={(e) => set("internalNotes", e.target.value)} disabled={disabled} />
      </FormField>
      {error ? (
        <p role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
      {canEdit ? (
        <Button type="submit" leadingIcon={<Save />} loading={pending} className="w-fit" data-testid="talent-save">
          {v.id ? t("save") : t("create")}
        </Button>
      ) : null}
    </form>
  );
}

// Até 5 segmentos ativos da agência (nomes são dados da agência, não i18n).
export function SegmentPicker({ talentId, segments, selected, canEdit }: { talentId: string; segments: { id: string; name: string }[]; selected: string[]; canEdit: boolean }) {
  const t = useTranslations("agency.casting");
  const { toast } = useToast();
  const [chosen, setChosen] = useState<string[]>(selected);
  const [pending, start] = useTransition();
  const dirty = chosen.slice().sort().join() !== selected.slice().sort().join();

  function toggle(id: string, on: boolean) {
    setChosen((cur) => (on ? (cur.length >= 5 ? cur : [...cur, id]) : cur.filter((x) => x !== id)));
  }

  function save() {
    start(async () => {
      const result = await setSegmentsAction({ talentId, segmentIds: chosen });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  return (
    <fieldset className="flex flex-col gap-3" data-testid="segment-picker">
      <legend className="sr-only">{t("segmentsTitle")}</legend>
      <p className="type-caption text-fg-muted">{t("segmentsHint", { count: chosen.length })}</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {segments.map((s) => (
          <li key={s.id}>
            <Checkbox
              label={s.name}
              checked={chosen.includes(s.id)}
              onChange={(e) => toggle(s.id, e.target.checked)}
              disabled={pending || !canEdit || (!chosen.includes(s.id) && chosen.length >= 5)}
            />
          </li>
        ))}
      </ul>
      {canEdit ? (
        <Button type="button" size="sm" variant="secondary" onClick={save} loading={pending} disabled={!dirty} className="w-fit">
          {t("segmentsSave")}
        </Button>
      ) : null}
    </fieldset>
  );
}

// Catálogo para marcas (etapa C): só com consentimento vigente.
export function CatalogSwitch({ talentId, visible, consentOk, canEdit }: { talentId: string; visible: boolean; consentOk: boolean; canEdit: boolean }) {
  const t = useTranslations("agency.casting");
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-1" data-testid="catalog-switch">
      <Switch
        checked={visible}
        disabled={pending || !canEdit || (!consentOk && !visible)}
        onCheckedChange={(on) =>
          start(async () => {
            const result = await setCatalogAction({ talentId, visible: on });
            toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
          })
        }
        label={t("catalogLabel")}
      />
      <p className="type-caption text-fg-muted">{consentOk ? t("catalogHint") : t("catalogNeedsConsent")}</p>
    </div>
  );
}

// Liga (ou desliga) o herói com página pública: o banco recusa herói já em outro casting.
export function HeroLinkForm({ talentId, heroes, currentId, canEdit, locked }: { talentId: string; heroes: { id: string; name: string }[]; currentId: string | null; canEdit: boolean; locked: boolean }) {
  const t = useTranslations("agency.casting.hero");
  const { toast } = useToast();
  const [creatorId, setCreatorId] = useState("");
  const [pending, start] = useTransition();

  function run(target: string | null) {
    if (!target && !window.confirm(t("confirmUnlink"))) return;
    start(async () => {
      const result = await linkCreatorAction({ talentId, creatorId: target });
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  if (!canEdit) return null;
  if (currentId) {
    return (
      <Button type="button" size="sm" variant="ghost" leadingIcon={<Unlink />} onClick={() => run(null)} loading={pending} disabled={locked}>
        {t("unlink")}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <FormField label={t("label")} hint={locked ? t("locked") : t("hint")} className="min-w-56 flex-1">
        <Select value={creatorId} onChange={(e) => setCreatorId(e.target.value)} disabled={pending || locked}>
          <option value="">{t("choose")}</option>
          {heroes.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </Select>
      </FormField>
      <Button type="button" size="sm" variant="secondary" leadingIcon={<Link2 />} onClick={() => run(creatorId)} loading={pending} disabled={!creatorId || locked}>
        {t("link")}
      </Button>
    </div>
  );
}

// Arquivar: só o Adm, com justificativa. Revoga o link do kit e tira do catálogo.
export function ArchiveTalentButton({ talentId }: { talentId: string }) {
  const t = useTranslations("agency.casting.archive");
  const tc = useTranslations("common.actions");
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    start(async () => {
      const result = await archiveTalentAction({ talentId, justification: reason });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      setOpen(false);
      router.push("/agencia/casting");
    });
  }

  return (
    <>
      <Button type="button" size="sm" variant="ghost" leadingIcon={<Archive />} onClick={() => setOpen(true)}>
        {t("open")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => (!pending ? setOpen(next) : undefined)}
        title={t("title")}
        description={t("description")}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {tc("cancel")}
            </Button>
            <Button type="submit" form="archive-talent" variant="danger" loading={pending}>
              {t("confirm")}
            </Button>
          </>
        }
      >
        <form id="archive-talent" onSubmit={submit} className="flex flex-col gap-3" noValidate>
          <FormField label={t("reason")} hint={t("reasonHint")} required>
            <Textarea value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)} disabled={pending} />
          </FormField>
          {error ? (
            <p role="alert" className="type-body-sm text-danger">
              {error}
            </p>
          ) : null}
        </form>
      </Dialog>
    </>
  );
}

// Talento sem login: a agência registra o consentimento com o termo assinado (documento do talento).
export function RecordConsentForm({ talentId, documents }: { talentId: string; documents: { id: string; title: string }[] }) {
  const t = useTranslations("agency.casting.consent");
  const { toast } = useToast();
  const [documentId, setDocumentId] = useState(documents[0]?.id ?? "");
  const [pending, start] = useTransition();
  if (documents.length === 0) return <p className="type-body-sm text-fg-muted">{t("needsDocument")}</p>;
  return (
    <div className="flex flex-wrap items-end gap-2" data-testid="record-consent">
      <FormField label={t("document")} className="min-w-56 flex-1">
        <Select value={documentId} onChange={(e) => setDocumentId(e.target.value)} disabled={pending}>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </Select>
      </FormField>
      <Button
        type="button"
        size="sm"
        leadingIcon={<ShieldCheck />}
        loading={pending}
        disabled={!documentId}
        onClick={() =>
          start(async () => {
            const result = await recordConsentAction({ talentId, documentId });
            toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
          })
        }
      >
        {t("record")}
      </Button>
    </div>
  );
}
