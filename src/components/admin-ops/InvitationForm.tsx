"use client";

import { Mail, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition, type FormEvent } from "react";
import { createInvitation } from "@/app/admin/ops-actions";
import { Button, Dialog, FormField, Input, Select } from "@/components/ui";
import { CopyButton } from "./CopyButton";

export type CreatorOption = { id: string; name: string; linked: boolean };
export type SellerOption = { id: string; name: string };

type Props = {
  creators: CreatorOption[];
  sellers: SellerOption[];
  /** Pré-preenchimento (ex.: botão "convidar" na organização/personalidade). */
  initialRole?: "creator" | "seller";
  initialCreatorId?: string;
  initialSellerId?: string;
  /** Abre o diálogo já na montagem (ex.: ?new=1). */
  defaultOpen?: boolean;
  triggerLabel?: string;
};

// Cria um convite e mostra o link UMA única vez (o banco só guarda o hash do token).
export function InvitationForm({ creators, sellers, initialRole = "creator", initialCreatorId = "", initialSellerId = "", defaultOpen = false, triggerLabel }: Props) {
  const t = useTranslations("adminOps.invitations");
  const tc = useTranslations("common.actions");
  // id único por instância: a mesma página pode ter vários diálogos (o botão do rodapé aponta pelo atributo form)
  const formId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [role, setRole] = useState<"creator" | "seller">(initialRole);
  const [email, setEmail] = useState("");
  const [creatorId, setCreatorId] = useState(initialCreatorId);
  const [sellerId, setSellerId] = useState(initialSellerId);
  const [days, setDays] = useState("7");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const unlinked = creators.filter((c) => !c.linked);
  const linked = creators.filter((c) => c.linked);

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createInvitation({
        email: email.trim(),
        role,
        creatorProfileId: role === "creator" ? creatorId : undefined,
        sellerOrgId: role === "seller" ? sellerId : undefined,
        days: Number(days),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLink(result.link);
    });
  }

  function close() {
    if (pending) return;
    setOpen(false);
    // Limpa o link ao fechar: nunca será exibido novamente.
    setLink(null);
    setEmail("");
    setError(null);
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} leadingIcon={<Mail />}>
        {triggerLabel ?? t("create")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        title={link ? t("created.title") : t("createTitle")}
        size="md"
        footer={
          link ? (
            <Button type="button" onClick={close}>
              {t("created.done")}
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={close} disabled={pending}>
                {tc("cancel")}
              </Button>
              <Button type="submit" form={formId} loading={pending}>
                {t("form.submit")}
              </Button>
            </>
          )
        }
      >
        {link ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t("created.warning")}
            </p>
            <FormField label={t("created.link")}>
              <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            </FormField>
            <CopyButton value={link} />
          </div>
        ) : (
          <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <FormField label={t("form.email")} required>
              <Input type="email" autoComplete="off" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} />
            </FormField>
            <FormField label={t("form.role")} required>
              <Select value={role} onChange={(e) => setRole(e.target.value as "creator" | "seller")} disabled={pending}>
                <option value="creator">{t("form.roleCreator")}</option>
                <option value="seller">{t("form.roleSeller")}</option>
              </Select>
            </FormField>
            {role === "creator" ? (
              <FormField label={t("form.creatorProfile")} hint={t("form.creatorProfileHint")} required>
                <Select value={creatorId} onChange={(e) => setCreatorId(e.target.value)} disabled={pending}>
                  <option value="">{t("form.selectPlaceholder")}</option>
                  {unlinked.length > 0 && (
                    <optgroup label={t("form.unlinkedGroup")}>
                      {unlinked.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {linked.length > 0 && (
                    <optgroup label={t("form.linkedGroup")}>
                      {linked.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>
              </FormField>
            ) : (
              <FormField label={t("form.sellerOrg")} required>
                <Select value={sellerId} onChange={(e) => setSellerId(e.target.value)} disabled={pending}>
                  <option value="">{t("form.selectPlaceholder")}</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
            <FormField label={t("form.days")} hint={t("form.daysHint")} required error={error ?? undefined}>
              <Input type="number" min={1} max={30} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} disabled={pending} />
            </FormField>
          </form>
        )}
      </Dialog>
    </>
  );
}
