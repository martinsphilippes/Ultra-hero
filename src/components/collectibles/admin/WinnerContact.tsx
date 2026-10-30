"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setCollectibleContactAction } from "@/app/admin/collectibles/actions";
import { Button, useToast } from "@/components/ui";
import { CONTACT_STATUSES, type ContactStatus } from "@/lib/collectibles/rules";
import { cn } from "@/lib/utils";

// Andamento do contato com quem arrematou (a contatar → contatado → entregue). Sem pagamento online:
// a equipe combina a entrega por fora e marca aqui. Cada troca é auditada no banco.
export function WinnerContact({ id, status }: { id: string; status: ContactStatus }) {
  const t = useTranslations("collectibles.admin.result");
  const router = useRouter();
  const { toast } = useToast();
  const [value, setValue] = useState<ContactStatus>(status);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await setCollectibleContactAction(id, value);
      if (result.ok) {
        toast({ title: result.message ?? t("done"), variant: "success" });
        router.refresh();
      } else {
        toast({ title: result.error, variant: "error" });
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label={t("contactLabel")} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {CONTACT_STATUSES.map((option) => (
          <label
            key={option}
            className={cn(
              "flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-semibold",
              value === option ? "border-accent bg-accent-soft/40 text-fg" : "border-border text-fg-muted",
            )}
          >
            <input
              type="radio"
              name={`contact-${id}`}
              value={option}
              checked={value === option}
              onChange={() => setValue(option)}
              className="size-5 accent-[var(--uh-accent)]"
            />
            {t(`status.${option}`)}
          </label>
        ))}
      </div>
      <Button onClick={save} loading={pending} disabled={value === status} data-testid="save-winner-contact">
        {t("save")}
      </Button>
    </div>
  );
}
