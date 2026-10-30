import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Bot, Database, FlaskConical, Timer, TriangleAlert } from "lucide-react";
import { legalRichTags } from "@/components/legal/rich-tags";
import { AccountPasswordCard, type PasswordCardMode } from "@/components/me/AccountPasswordCard";
import { AccountPhoneForm } from "@/components/me/AccountPhoneForm";
import { DeleteAccountDialog } from "@/components/me/DeleteAccountDialog";
import { DELETE_ACCOUNT_ANCHOR } from "@/lib/settings/sections";
import { DemoBadge, PageHeader } from "@/components/ui";
import { isPasswordVaultConfigured } from "@/lib/auth/password-crypto";
import { formatE164ForDisplay } from "@/lib/auth/phone";
import { hasGeneratedPassword, isDemoUser } from "@/lib/auth/quick-signup-server";
import { requireUser } from "@/lib/auth/session";
import { DEMO_ACCOUNTS } from "@/lib/demo/accounts";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.meta");
  return { title: t("account") };
}

// Prazos aprovados em docs/privacy-and-retention.md (app_settings.retention.days só é legível por admin).
const RETENTION = { analytics: 90, test_orders: 90, logs: 30, audit: 365 } as const;

// Conta e privacidade: resumo do que a POC guarda, prazos de retenção, natureza demonstrativa e exclusão.
export default async function AccountPage() {
  const user = await requireUser("/profile/account");
  const [t, tc, tl, password, phone] = await Promise.all([
    getTranslations("me.account"),
    getTranslations("common"),
    getTranslations("legal.links"),
    passwordState(user),
    readPhone(user.id),
  ]);

  const blocks = [
    { key: "demo", icon: FlaskConical, title: t("demo.title"), body: <p className="type-body-sm text-fg-muted">{t("demo.body")}</p> },
    {
      key: "store",
      icon: Database,
      title: t("store.title"),
      body: (
        <>
          <ul className="list-disc space-y-1 pl-5 type-body-sm text-fg-muted">
            <li>{t("store.item1")}</li>
            <li>{t("store.item2")}</li>
            <li>{t("store.item3")}</li>
            <li>{t("store.item4")}</li>
          </ul>
          <p className="type-body-sm font-medium text-fg">{t("store.not")}</p>
        </>
      ),
    },
    {
      key: "retention",
      icon: Timer,
      title: t("retention.title"),
      body: (
        <>
          <ul className="list-disc space-y-1 pl-5 type-body-sm text-fg-muted">
            <li>{t("retention.analytics", { days: RETENTION.analytics })}</li>
            <li>{t("retention.orders", { days: RETENTION.test_orders })}</li>
            <li>{t("retention.logs", { days: RETENTION.logs })}</li>
            <li>{t("retention.audit", { days: RETENTION.audit })}</li>
          </ul>
          <p className="type-caption text-fg-muted">{t("retention.exceptions")}</p>
        </>
      ),
    },
    { key: "ai", icon: Bot, title: t("ai.title"), body: <p className="type-body-sm text-fg-muted">{t("ai.body")}</p> },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} description={t("description")} eyebrow={tc("app.name")} backHref="/profile" backLabel={tc("actions.back")} actions={<DemoBadge />} />

      <div className="grid gap-4 md:grid-cols-2">
        {blocks.map(({ key, icon: Icon, title, body }) => (
          <section key={key} aria-labelledby={`${key}-title`} className={cn("flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5", key === "demo" && "native:hidden")}>
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-elevated text-accent-text">
                <Icon className="size-5" />
              </span>
              <h2 id={`${key}-title`} className="type-h3 text-fg">
                {title}
              </h2>
            </div>
            <div className="flex flex-col gap-2">{body}</div>
          </section>
        ))}
      </div>

      {/* Senha gerada no cadastro rápido e celular (0046) */}
      <div className="grid gap-4 md:grid-cols-2">
        <AccountPasswordCard mode={password.mode} canGenerate={password.canGenerate} />
        {phone.available ? <AccountPhoneForm initialPhone={formatE164ForDisplay(phone.value)} /> : null}
      </div>

      <section id={DELETE_ACCOUNT_ANCHOR} aria-labelledby="delete-title" className="flex scroll-mt-20 flex-col gap-4 rounded-2xl border border-danger/30 bg-danger-soft/40 p-5">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger">
            <TriangleAlert className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 id="delete-title" className="type-h3 text-fg">
              {t("delete.title")}
            </h2>
            <p className="type-body-sm max-w-prose text-fg-muted">{t("delete.description")}</p>
            <p className="type-body-sm max-w-prose text-fg-muted">
              {tl.rich("accountNote", { privacy: legalRichTags.privacy, terms: legalRichTags.terms })}
            </p>
          </div>
        </div>
        <div>
          <DeleteAccountDialog />
        </div>
      </section>
    </div>
  );
}

type SessionUser = Awaited<ReturnType<typeof requireUser>>;

// Estado do cartão "Sua senha". Sem service role, sem chave ou sem a 0046: "indisponível".
async function passwordState(user: SessionUser): Promise<{ mode: PasswordCardMode; canGenerate: boolean }> {
  if (isDemoUser(user, DEMO_ACCOUNTS.map((a) => a.email))) return { mode: "demo", canGenerate: false };
  const providers = new Set((user.identities ?? []).map((identity) => identity.provider));
  const fallback: PasswordCardMode = providers.has("google") && !providers.has("email") ? "google" : "own";
  // quem só usa o Google continua vendo "Você entra com o Google", mesmo sem o cofre
  const off = { mode: fallback === "google" ? "google" : "unavailable", canGenerate: false } as const;
  if (!hasAdminClient() || !isPasswordVaultConfigured()) return off;
  const stored = await hasGeneratedPassword(createAdminClient(), user.id);
  if (stored === null) return off;
  return { mode: stored ? "stored" : fallback, canGenerate: true };
}

// Celular do próprio perfil (coluna da 0046; sem ela, o campo não aparece).
async function readPhone(userId: string): Promise<{ available: boolean; value: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("phone_e164").eq("id", userId).maybeSingle();
  if (error) return { available: false, value: null };
  return { available: true, value: data?.phone_e164 ?? null };
}
