"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Select } from "@/components/ui";
import { setOndaRequestStatusAction } from "@/lib/onda-digital/actions";
import { ONDA_STATUSES, type OndaStatus } from "@/lib/onda-digital/format";

// A Groscove (gestor+) avança a etapa do pedido; a marca recebe o aviso no sino (0132).
export function OndaStatusControl({ id, status }: { id: string; status: OndaStatus }) {
  const t = useTranslations("ondaDigital");
  const router = useRouter();
  const [value, setValue] = useState<OndaStatus>(status);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setMsg(null);
          const r = await setOndaRequestStatusAction({ id, status: value });
          if (!r.ok) return setMsg({ ok: false, text: r.error });
          setMsg({ ok: true, text: t("agency.saved") });
          router.refresh();
        });
      }}
    >
      <Select value={value} onChange={(e) => setValue(e.target.value as OndaStatus)} selectSize="sm" aria-label={t("agency.status")} data-testid="onda-status-select">
        {ONDA_STATUSES.map((s) => (
          <option key={s} value={s}>
            {t(`statuses.${s}`)}
          </option>
        ))}
      </Select>
      <Button type="submit" size="sm" variant="secondary" loading={pending} disabled={value === status}>
        {t("agency.save")}
      </Button>
      {msg ? (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "w-full type-caption text-success" : "w-full type-caption text-danger"}>
          {msg.text}
        </p>
      ) : null}
    </form>
  );
}
