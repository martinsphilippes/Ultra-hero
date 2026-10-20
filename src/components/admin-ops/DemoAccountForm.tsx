"use client";

import { KeyRound, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { createDemoAccount } from "@/app/admin/ops-actions";
import { Button, Dialog, FormField, Input, Select } from "@/components/ui";
import { CopyButton } from "./CopyButton";
import type { CreatorOption, SellerOption } from "./InvitationForm";

type Props = { creators: CreatorOption[]; sellers: SellerOption[] };

// Cria conta demo (service role no servidor) e exibe a senha UMA única vez; nada fica em log.
export function DemoAccountForm({ creators, sellers }: Props) {
  const t = useTranslations("adminOps.settings.demoAccounts");
  const tc = useTranslations("common.actions");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"seller" | "creator">("seller");
  const [orgId, setOrgId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string; userId: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const unlinked = creators.filter((c) => !c.linked);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createDemoAccount({ email: email.trim(), role, orgId: role === "seller" ? orgId : undefined, profileId: role === "creator" ? profileId : undefined });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreated({ email: email.trim().toLowerCase(), password: result.password, userId: result.userId });
    });
  }

  function close() {
    if (pending) return;
    setOpen(false);
    // A senha some da memória do componente ao fechar.
    setCreated(null);
    setEmail("");
    setError(null);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} leadingIcon={<KeyRound />}>
        {t("submit")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        title={created ? t("createdTitle") : t("title")}
        description={created ? undefined : t("description")}
        footer={
          created ? (
            <Button type="button" onClick={close}>
              {t("done")}
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={close} disabled={pending}>
                {tc("cancel")}
              </Button>
              <Button type="submit" form="demo-account-form" loading={pending}>
                {t("submit")}
              </Button>
            </>
          )
        }
      >
        {created ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t("createdWarning")}
            </p>
            <FormField label={t("email")}>
              <Input readOnly value={created.email} className="font-mono text-xs" />
            </FormField>
            <FormField label={t("password")}>
              <Input readOnly value={created.password} onFocus={(e) => e.currentTarget.select()} className="font-mono" />
            </FormField>
            <CopyButton value={created.password} />
          </div>
        ) : (
          <form id="demo-account-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <FormField label={t("email")} required>
              <Input type="email" inputMode="email" autoComplete="off" value={email} disabled={pending} onChange={(e) => setEmail(e.target.value)} />
            </FormField>
            <FormField label={t("role")} required>
              <Select value={role} disabled={pending} onChange={(e) => setRole(e.target.value as "seller" | "creator")}>
                <option value="seller">{t("roleSeller")}</option>
                <option value="creator">{t("roleCreator")}</option>
              </Select>
            </FormField>
            {role === "seller" ? (
              <FormField label={t("org")} required error={error ?? undefined}>
                <Select value={orgId} disabled={pending} onChange={(e) => setOrgId(e.target.value)}>
                  <option value="">—</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            ) : (
              <FormField label={t("profile")} required error={error ?? undefined}>
                <Select value={profileId} disabled={pending} onChange={(e) => setProfileId(e.target.value)}>
                  <option value="">—</option>
                  {unlinked.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
          </form>
        )}
      </Dialog>
    </>
  );
}
