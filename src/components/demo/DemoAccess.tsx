import { KeyRound, ShieldCheck, Sparkles, Store, User, UserRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { signInAsDemo } from "@/app/demo-actions";
import { DEMO_ACCOUNTS, type DemoKind } from "@/lib/demo/accounts";
import { isDemoAccessEnabled, isDemoUnlocked } from "@/lib/demo/server";
import { DemoUnlockForm } from "./DemoUnlockForm";

const ICON: Record<DemoKind, typeof User> = { admin: ShieldCheck, creator: Sparkles, seller: Store, premium: UserRound, free: User };

// Acesso rápido às contas de demonstração (uma por tipo de acesso), no topo do Início. Fechado por um
// código: sem ele, aparece só o campo do código; sem as variáveis de ambiente, não aparece nada.
export async function DemoAccess({ failed }: { failed?: boolean }) {
  if (!isDemoAccessEnabled()) return null;
  const [t, unlocked] = await Promise.all([getTranslations("demo"), isDemoUnlocked()]);

  return (
    <details className="group mx-gutter rounded-2xl border border-border bg-surface md:mx-0" open={unlocked || failed} data-testid="demo-access">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        <KeyRound className="size-4 text-accent-text" aria-hidden="true" />
        {t("title")}
      </summary>
      <div className="flex flex-col gap-3 px-4 pb-4">
        {failed ? (
          <p role="alert" className="type-body-sm text-danger">
            {t("signInFailed")}
          </p>
        ) : null}
        {unlocked ? (
          <ul className="grid gap-2 sm:grid-cols-2" aria-label={t("listLabel")}>
            {DEMO_ACCOUNTS.map((account) => {
              const Icon = ICON[account.kind];
              return (
                <li key={account.kind}>
                  <form action={signInAsDemo}>
                    <input type="hidden" name="kind" value={account.kind} />
                    <button
                      type="submit"
                      className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-border bg-bg px-3 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      data-demo-kind={account.kind}
                    >
                      <Icon className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
                      <span className="flex min-w-0 flex-col">
                        <span className="text-sm font-semibold text-fg">{t(`kinds.${account.kind}.label`)}</span>
                        <span className="truncate text-xs text-fg-muted">{t(`kinds.${account.kind}.description`)}</span>
                      </span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : (
          <DemoUnlockForm />
        )}
        <p className="type-caption text-fg-subtle">{t("note")}</p>
      </div>
    </details>
  );
}
