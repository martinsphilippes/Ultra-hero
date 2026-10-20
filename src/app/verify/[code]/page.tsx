import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Award, CircleX, ShieldCheck } from "lucide-react";
import { Badge, Button, PageHeader } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.meta");
  return { title: t("verify") };
}

// Verificação pública (rpc verify_certificate): válido/revogado/não encontrado. Certificado simbólico.
type Params = { params: Promise<{ code: string }> };
type Verification = { valid?: boolean; program_title?: string | null; version?: string | number | null; issued_at?: string | null; symbolic?: boolean };

const CODE_RE = /^UH-[A-Z0-9]{6,16}$/;

export default async function VerifyPage({ params }: Params) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).trim().toUpperCase();
  const [t, tc, locale] = await Promise.all([getTranslations("me.verify"), getTranslations("common"), getLocale()]);
  const uiLocale = locale as Locale;

  let result: Verification | null = null;
  if (CODE_RE.test(code)) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("verify_certificate", { p_code: code });
    if (error) throw new Error(error.message);
    result = data && typeof data === "object" ? (data as Verification) : null;
  }
  const found = Boolean(result);
  const valid = Boolean(result?.valid);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tc("app.name")} />
      <section
        aria-live="polite"
        className={`flex flex-col gap-4 rounded-2xl border p-6 ${found && valid ? "border-success/40 bg-success-soft/40" : "border-danger/30 bg-danger-soft/30"}`}
      >
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${found && valid ? "bg-success text-white" : "bg-danger text-white"}`}>
            {found && valid ? <ShieldCheck className="size-6" /> : <CircleX className="size-6" />}
          </span>
          <div className="flex flex-col">
            <h2 className="type-h2 text-fg">{!found ? t("invalid") : valid ? t("valid") : t("revoked")}</h2>
            <p className="type-caption font-mono text-fg-muted">{t("code", { code })}</p>
          </div>
        </div>
        {!found ? (
          <p className="type-body-sm text-fg-muted">{t("invalidDescription")}</p>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col">
              <dt className="type-caption text-fg-muted">{t("program")}</dt>
              <dd className="flex items-center gap-2 text-sm font-semibold text-fg">
                <Award className="size-4 text-accent-text" aria-hidden="true" />
                {result?.program_title ?? "—"}
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="type-caption text-fg-muted">{t("version", { n: String(result?.version ?? "") })}</dt>
              <dd className="text-sm font-semibold text-fg">{result?.issued_at ? t("issued", { date: formatDate(result.issued_at, uiLocale) }) : "—"}</dd>
            </div>
          </dl>
        )}
        <Badge variant="demo" className="w-fit">
          {tc("demo.tag")}
        </Badge>
        <p className="type-caption text-fg-muted">{t("symbolic")}</p>
      </section>
      <div>
        <Button asChild variant="secondary">
          <Link href="/">{t("home")}</Link>
        </Button>
      </div>
    </div>
  );
}
