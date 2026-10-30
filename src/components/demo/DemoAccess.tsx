import { KeyRound, ShieldCheck, Sparkles, Stethoscope, Store, User, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { signInAsDemo } from "@/app/demo-actions";
import { DEMO_ACCESS_ACCOUNTS, readyDemoAccounts, type DemoKind, type DemoOrigin } from "@/lib/demo/accounts";
import { isDemoAccessEnabled, isProfessionalDemoReady } from "@/lib/demo/server";
import { getNativeApp } from "@/lib/native-app/server";

const ICON: Record<DemoKind, typeof User> = { admin: ShieldCheck, creator: Sparkles, seller: Store, premium: UserRound, free: User, professional: Stethoscope };

type Props = {
  /** login: lista aberta abaixo da caixa de login; profile: recolhida no fim do Perfil (trocar de conta). */
  from: DemoOrigin;
  failed?: boolean;
};

// Acesso rápido às contas de demonstração, uma por tipo de acesso: um toque e a pessoa entra. Sem a
// senha configurada no servidor, não aparece nada. No app das lojas também não (Apple 2.2; inclui
// admin): o revisor recebe credenciais (docs/lojas.md §8).
export async function DemoAccess({ from, failed }: Props) {
  if (!isDemoAccessEnabled() || (await getNativeApp())) return null;
  const t = await getTranslations("demo");
  const accounts = readyDemoAccounts(DEMO_ACCESS_ACCOUNTS, { professional: await isProfessionalDemoReady() });

  const list = (
    <div className="flex flex-col gap-3">
      {failed ? (
        <p role="alert" className="type-body-sm text-danger">
          {t("signInFailed")}
        </p>
      ) : null}
      <ul className="grid gap-2 sm:grid-cols-2" aria-label={t("listLabel")}>
        {accounts.map((account) => {
          const Icon = ICON[account.kind];
          return (
            <li key={account.kind}>
              <form action={signInAsDemo}>
                <input type="hidden" name="kind" value={account.kind} />
                <input type="hidden" name="from" value={from} />
                <button
                  type="submit"
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-bg px-3 py-2 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  data-demo-kind={account.kind}
                >
                  <Icon className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-semibold text-fg">{t(`kinds.${account.kind}.label`)}</span>
                    <span className="text-xs text-fg-muted">{t(`kinds.${account.kind}.description`)}</span>
                  </span>
                </button>
              </form>
            </li>
          );
        })}
      </ul>
      <p className="type-caption text-fg-subtle">{t("note")}</p>
    </div>
  );

  if (from === "login") {
    return (
      <section aria-labelledby="demo-access-title" className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm" data-testid="demo-access">
        <h2 id="demo-access-title" className="flex items-center gap-2 text-sm font-semibold text-fg">
          <KeyRound className="size-4 text-accent-text" aria-hidden="true" />
          {t("title")}
        </h2>
        {list}
      </section>
    );
  }

  return (
    <details className="group rounded-2xl border border-border bg-surface" open={failed} data-testid="demo-access">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        <KeyRound className="size-4 text-accent-text" aria-hidden="true" />
        {t("title")}
      </summary>
      <div className="px-4 pb-4">{list}</div>
    </details>
  );
}
