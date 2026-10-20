import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Bot, Database, FlaskConical, Timer, TriangleAlert } from "lucide-react";
import { DeleteAccountDialog } from "@/components/me/DeleteAccountDialog";
import { DemoBadge, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.meta");
  return { title: t("account") };
}

// Prazos aprovados em docs/privacy-and-retention.md (app_settings.retention.days só é legível por admin).
const RETENTION = { analytics: 90, test_orders: 90, logs: 30, audit: 365 } as const;

// Conta e privacidade: resumo do que a POC guarda, prazos de retenção, natureza demonstrativa e exclusão.
export default async function AccountPage() {
  await requireUser("/profile/account");
  const [t, tc] = await Promise.all([getTranslations("me.account"), getTranslations("common")]);

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
          <section key={key} aria-labelledby={`${key}-title`} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
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

      <section aria-labelledby="delete-title" className="flex flex-col gap-4 rounded-2xl border border-danger/30 bg-danger-soft/40 p-5">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger">
            <TriangleAlert className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 id="delete-title" className="type-h3 text-fg">
              {t("delete.title")}
            </h2>
            <p className="type-body-sm max-w-prose text-fg-muted">{t("delete.description")}</p>
          </div>
        </div>
        <div>
          <DeleteAccountDialog />
        </div>
      </section>
    </div>
  );
}
