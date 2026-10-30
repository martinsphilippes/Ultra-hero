"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button, Checkbox, FormField, Input, Select, Textarea, useToast } from "@/components/ui";
import { DEFAULT_REGISTRY, REGISTRY_TYPES, SPECIALTIES, UFS, type RegistryType, type Specialty } from "@/lib/professionals/rules";
import type { AdminProfileValues, ProfileValues } from "@/lib/professionals/schemas";

type Result = { ok: true; message: string; id?: string } | { ok: false; error: string };

export type ProfileFormInitial = {
  name: string;
  photoUrl: string | null;
  bio: string;
  cities: string[];
  online: boolean;
  registryNumber: string;
  registryUf: string;
  // só admin
  slug?: string;
  specialty?: Specialty;
  registryType?: string;
  sortOrder?: number;
};

type Props =
  | { mode: "professional"; initial: ProfileFormInitial; onSave: (values: ProfileValues) => Promise<Result> }
  | { mode: "admin"; initial: ProfileFormInitial; onSave: (values: AdminProfileValues) => Promise<Result>; redirectOnCreate?: boolean };

// Perfil público do profissional. O profissional edita o que é dele (nome, foto, bio, onde atende,
// registro); o admin também define endereço, especialidade, conselho e ordem.
export function ProfileForm(props: Props) {
  const { initial } = props;
  const admin = props.mode === "admin";
  const t = useTranslations("professionals.portal.profile");
  const ta = useTranslations("professionals.admin.form");
  const tm = useTranslations("professionals");
  const { toast } = useToast();
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [photo, setPhoto] = useState(initial.photoUrl ?? "");
  const [bio, setBio] = useState(initial.bio);
  const [cities, setCities] = useState(initial.cities.join(", "));
  const [online, setOnline] = useState(initial.online);
  const [number, setNumber] = useState(initial.registryNumber);
  const [uf, setUf] = useState(initial.registryUf || "SP");
  const [slug, setSlug] = useState(initial.slug ?? "");
  const [specialty, setSpecialty] = useState<Specialty>(initial.specialty ?? "nutritionist");
  const [registryType, setRegistryType] = useState<string>(initial.registryType ?? DEFAULT_REGISTRY[initial.specialty ?? "nutritionist"]);
  const [sort, setSort] = useState(String(initial.sortOrder ?? 100));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const base = { name, photo_url: photo.trim(), bio, cities, online, registry_number: number.trim(), registry_uf: uf as ProfileValues["registry_uf"] };
    startTransition(async () => {
      const result =
        props.mode === "admin"
          ? await props.onSave({ ...base, slug: slug.trim(), specialty, registry_type: registryType as RegistryType, sort_order: Number(sort) || 0 })
          : await props.onSave(base);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({ title: result.message, variant: "success" });
      if (props.mode === "admin" && props.redirectOnCreate && result.id) router.push(`/admin/professionals/${result.id}`);
      else router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5" noValidate data-testid="pro-profile-form">
      <FormField label={admin ? ta("name") : t("name")} required>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} disabled={pending} />
      </FormField>
      {admin ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={ta("slug")} hint={ta("slugHint")} required>
            <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} maxLength={80} disabled={pending} />
          </FormField>
          <FormField label={ta("specialty")} required>
            <Select
              value={specialty}
              onChange={(e) => {
                const next = e.target.value as Specialty;
                setSpecialty(next);
                setRegistryType(DEFAULT_REGISTRY[next]);
              }}
              disabled={pending}
            >
              {SPECIALTIES.map((s) => (
                <option key={s} value={s}>
                  {tm(`specialty.${s}`)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={ta("registryType")} required>
            <Select value={registryType} onChange={(e) => setRegistryType(e.target.value)} disabled={pending}>
              {REGISTRY_TYPES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={ta("sortOrder")}>
            <Input type="number" inputMode="numeric" min={0} max={1000} value={sort} onChange={(e) => setSort(e.target.value)} disabled={pending} />
          </FormField>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("registryNumber")} hint={admin ? undefined : t("registryHint")} required>
          <Input value={number} onChange={(e) => setNumber(e.target.value)} maxLength={20} disabled={pending} />
        </FormField>
        <FormField label={t("registryUf")} required>
          <Select value={uf} onChange={(e) => setUf(e.target.value)} disabled={pending}>
            {UFS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField label={t("photo")} hint={t("photoHint")}>
        <Input type="url" inputMode="url" value={photo} onChange={(e) => setPhoto(e.target.value)} maxLength={500} disabled={pending} />
      </FormField>
      <FormField label={t("bio")}>
        <Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={2000} rows={5} disabled={pending} />
      </FormField>
      <FormField label={t("cities")} hint={t("citiesHint")}>
        <Input value={cities} onChange={(e) => setCities(e.target.value)} maxLength={600} disabled={pending} />
      </FormField>
      <Checkbox label={t("online")} checked={online} onChange={(e) => setOnline(e.currentTarget.checked)} disabled={pending} />
      {error ? (
        <p role="alert" className="type-body-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="self-start">
        {admin ? ta("save") : t("save")}
      </Button>
    </form>
  );
}
