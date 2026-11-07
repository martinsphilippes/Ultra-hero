"use client";

import { Clock, Lock, MoreHorizontal, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { openContactAction, requestCastingAccessAction, type OpenContact } from "@/lib/casting-open/actions";
import { Button } from "@/components/ui";

// Ações de um Hero do casting aberto: "⋯" → Solicitar acesso (contato e valores); aguardando; ou Ver contato.
export function OpenCastingActions({ talentId, access, canRequest }: { talentId: string; access: "none" | "pending" | "approved"; canRequest: boolean }) {
  const t = useTranslations("castingOpen");
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [contact, setContact] = useState<OpenContact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);

  if (access === "approved") {
    return (
      <div className="flex flex-col gap-2">
        {contact ? (
          <dl className="grid gap-1 rounded-xl border border-border bg-surface-elevated p-3 text-sm" data-testid="open-contact">
            {contact.email ? <dd className="break-all">{contact.email}</dd> : null}
            {contact.phone ? <dd>{contact.phone}</dd> : null}
            {contact.socials.map((s) => (
              <dd key={`${s.network}-${s.handle}`} className="text-fg-muted">
                {s.network}: @{s.handle}
              </dd>
            ))}
            {contact.fees.length > 0 ? (
              <dd className="text-fg-muted">{t("fees", { values: contact.fees.map((c) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100)).join(" · ") })}</dd>
            ) : null}
            {!contact.email && !contact.phone && contact.socials.length === 0 ? <dd className="text-fg-muted">{t("noContact")}</dd> : null}
          </dl>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            leadingIcon={<Phone />}
            loading={pending}
            onClick={() =>
              start(async () => {
                const r = await openContactAction(talentId);
                if (r.ok) setContact(r.contact);
                else setError(r.error);
              })
            }
            data-testid="open-contact-show"
          >
            {t("showContact")}
          </Button>
        )}
        {error ? <p className="type-caption text-danger">{error}</p> : null}
      </div>
    );
  }
  if (access === "pending") {
    return (
      <p className="inline-flex items-center gap-1.5 type-caption text-fg-muted" data-testid="open-pending">
        <Clock className="size-4" aria-hidden="true" />
        {t("pending")}
      </p>
    );
  }
  if (!canRequest) {
    return (
      <p className="inline-flex items-center gap-1.5 type-caption text-fg-muted">
        <Lock className="size-4" aria-hidden="true" />
        {t("locked")}
      </p>
    );
  }
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={menu}
        aria-label={t("more")}
        onClick={() => setMenu((v) => !v)}
        className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        data-testid="open-more"
      >
        <MoreHorizontal className="size-5" aria-hidden="true" />
      </button>
      {menu ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-xl border border-border bg-surface-elevated p-2 shadow-lg">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await requestCastingAccessAction({ talentId });
                if (!r.ok) return setError(r.error);
                setMenu(false);
                router.refresh();
              })
            }
            className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-surface-hover"
            data-testid="open-request"
          >
            <span className="text-sm font-semibold text-fg">{t("request")}</span>
            <span className="type-caption text-fg-muted">{t("requestHint")}</span>
          </button>
          {error ? <p className="px-3 pb-1 type-caption text-danger">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
