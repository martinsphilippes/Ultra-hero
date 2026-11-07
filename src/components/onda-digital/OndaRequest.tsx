"use client";

import { CheckCircle2, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { DatePicker, FormField, MoneyInput, Select, Sheet, Textarea } from "@/components/ui";
import { createOndaRequestAction } from "@/lib/onda-digital/actions";
import { ONDA_PURPOSES, type OndaPurpose, type OndaWhen, whatsappHref } from "@/lib/onda-digital/format";
import { cn } from "@/lib/utils";
import { ondaButtonYellow } from "./primitives";

// Pedido "Quero entrar na onda" (0132): uma gaveta só para a página inteira; os botões espalhados (topo, ondas,
// fim) abrem a gaveta já com a onda escolhida.

type Pkg = { slug: string; name: string; scope: string };
type Profile = { id: string; network: "instagram" | "x"; handle: string };
type Ctx = { open: (pkg?: string) => void };
const RequestContext = createContext<Ctx | null>(null);

export function OndaRequestProvider({
  brandId,
  brandName,
  canRequest,
  packages,
  profiles,
  children,
}: {
  brandId: string;
  brandName: string;
  canRequest: boolean;
  packages: Pkg[];
  profiles: Profile[];
  children: ReactNode;
}) {
  const t = useTranslations("ondaDigital.request");
  const tp = useTranslations("ondaDigital.purposes");
  const router = useRouter();
  const [isOpen, setOpen] = useState(false);
  const [pkg, setPkg] = useState("");
  const [purpose, setPurpose] = useState<OndaPurpose>("launch");
  const [when, setWhen] = useState<OndaWhen>("tbd");
  const [date, setDate] = useState("");
  const [subject, setSubject] = useState("");
  const [budget, setBudget] = useState<number | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ctx = useMemo<Ctx>(
    () => ({
      open: (p?: string) => {
        setPkg(p ?? "");
        setSent(false);
        setError(null);
        setOpen(true);
      },
    }),
    [],
  );
  const pkgName = packages.find((p) => p.slug === pkg)?.name ?? "";
  const wa = whatsappHref(t("whatsappText", { brand: brandName, package: pkgName || "none" }));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <RequestContext.Provider value={ctx}>
      {children}
      <Sheet open={isOpen} onOpenChange={setOpen} title={t("title")} description={sent ? undefined : t("description")}>
        {sent ? (
          <div className="flex flex-col items-start gap-4" data-testid="onda-request-sent">
            <CheckCircle2 className="size-10 text-success" aria-hidden="true" />
            <p className="text-base font-semibold text-fg">{t("sent")}</p>
            <a href={wa} target="_blank" rel="noopener noreferrer" className={ondaButtonYellow}>
              <MessageCircle className="size-5" aria-hidden="true" />
              {t("whatsapp")}
            </a>
          </div>
        ) : !canRequest ? (
          <p className="type-body-sm text-fg-muted">{t("noAccess")}</p>
        ) : (
          <form
            className="flex flex-col gap-4"
            data-testid="onda-request-form"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                setError(null);
                const r = await createOndaRequestAction({
                  brandId,
                  package: pkg || undefined,
                  purpose,
                  whenKind: when,
                  whenDate: when === "date" ? date : undefined,
                  subject,
                  budgetCents: budget,
                  profileIds: chosen,
                });
                if (!r.ok) return setError(r.error);
                setSent(true);
                setSubject("");
                setChosen([]);
                router.refresh();
              });
            }}
          >
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold text-fg">{t("package")}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {[...packages, { slug: "", name: t("packageHelp"), scope: "" }].map((p) => (
                  <label
                    key={p.slug || "help"}
                    className={cn(
                      "flex min-h-14 cursor-pointer flex-col justify-center rounded-xl border-2 px-3 py-2 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                      pkg === p.slug ? "border-[#0c0c20] bg-[#ffd84d] text-[#0c0c20]" : "border-border bg-surface text-fg hover:bg-surface-hover",
                    )}
                  >
                    <input type="radio" name="onda-package" value={p.slug} checked={pkg === p.slug} onChange={() => setPkg(p.slug)} className="sr-only" />
                    <span className="text-sm font-bold">{p.name}</span>
                    {p.scope ? <span className="text-xs opacity-80">{p.scope}</span> : null}
                  </label>
                ))}
              </div>
            </fieldset>
            <FormField label={t("purpose")}>
              <Select value={purpose} onChange={(e) => setPurpose(e.target.value as OndaPurpose)} data-testid="onda-purpose">
                {ONDA_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {tp(p)}
                  </option>
                ))}
              </Select>
            </FormField>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold text-fg">{t("when")}</legend>
              <div className="flex flex-wrap gap-2">
                {(["tbd", "now", "date"] as const).map((w) => (
                  <label
                    key={w}
                    className={cn(
                      "inline-flex min-h-11 cursor-pointer items-center rounded-full border-2 px-4 text-sm font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                      when === w ? "border-[#0c0c20] bg-[#ffd84d] text-[#0c0c20]" : "border-border bg-surface text-fg hover:bg-surface-hover",
                    )}
                  >
                    <input type="radio" name="onda-when" value={w} checked={when === w} onChange={() => setWhen(w)} className="sr-only" />
                    {t(`whenOptions.${w}`)}
                  </label>
                ))}
              </div>
              {when === "date" ? <DatePicker value={date} onChange={setDate} min={today} required aria-label={t("date")} title={t("date")} data-testid="onda-date" /> : null}
            </fieldset>
            <FormField label={t("subject")} hint={t("subjectHint")}>
              <Textarea value={subject} onChange={(e) => setSubject(e.target.value)} required minLength={2} maxLength={1000} rows={4} data-testid="onda-subject" />
            </FormField>
            <FormField label={t("budget")}>
              <MoneyInput onValueChange={(_text, cents) => setBudget(cents)} />
            </FormField>
            <details className="rounded-xl border border-border bg-surface p-3">
              <summary className="cursor-pointer text-sm font-semibold text-fg">
                {t("pages")} · <span className="font-normal text-fg-muted">{t("pagesChosen", { count: chosen.length })}</span>
              </summary>
              <p className="mt-2 type-caption text-fg-muted">{t("pagesHint")}</p>
              <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                {profiles.map((p) => (
                  <li key={p.id}>
                    <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-fg">
                      <input
                        type="checkbox"
                        className="size-4 accent-[#3a14c9]"
                        checked={chosen.includes(p.id)}
                        onChange={(e) => setChosen((c) => (e.target.checked ? [...c, p.id] : c.filter((x) => x !== p.id)))}
                      />
                      <span className="truncate">
                        @{p.handle}
                        {p.network === "x" ? " · X" : ""}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </details>
            {error ? (
              <p role="alert" className="type-body-sm text-danger">
                {error}
              </p>
            ) : null}
            <button type="submit" disabled={pending || (when === "date" && !date)} className={ondaButtonYellow} data-testid="onda-request-submit">
              {t("submit")}
            </button>
            <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-accent-text underline">
              <MessageCircle className="size-4" aria-hidden="true" />
              {t("whatsapp")}
            </a>
          </form>
        )}
      </Sheet>
    </RequestContext.Provider>
  );
}

/** Botão que abre a gaveta do pedido (com a onda já escolhida, se vier). */
export function OndaRequestButton({ pkg, className, children, testId }: { pkg?: string; className?: string; children: ReactNode; testId?: string }) {
  const ctx = useContext(RequestContext);
  return (
    <button type="button" onClick={() => ctx?.open(pkg)} className={className ?? ondaButtonYellow} data-testid={testId}>
      {children}
    </button>
  );
}
