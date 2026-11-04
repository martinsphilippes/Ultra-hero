import { BadgeCheck, Building2, ChevronRight, Smartphone, Sparkles, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { loginPathFor, type SignupProfile } from "@/lib/auth/profile-signup";

const ICONS: Record<SignupProfile, LucideIcon> = { hero: Sparkles, brand: BadgeCheck, agency: Building2, consumer: Smartphone };

type Props = { profiles: readonly SignupProfile[]; next?: string | null };

// "Como você vai usar o Ultra?" (0103): cartões grandes, um por perfil, que levam ao cadastro daquele perfil. Mobile
// first: um por linha, área de toque alta, ícone + título + frase curta.
export function ProfileChooser({ profiles, next }: Props) {
  const t = useTranslations("auth.choose");
  return (
    <ul className="flex flex-col gap-3" aria-label={t("cardsLabel")} data-testid="profile-chooser">
      {profiles.map((p) => {
        const Icon = ICONS[p];
        return (
          <li key={p}>
            <Link
              href={loginPathFor(p, next)}
              data-testid={`profile-card-${p}`}
              className="flex min-h-20 items-center gap-4 rounded-2xl border border-border bg-bg p-4 transition-colors hover:border-accent/50 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
                <Icon className="size-6" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-base font-semibold text-fg">{t(`${p}.title`)}</span>
                <span className="type-body-sm text-fg-muted">{t(`${p}.text`)}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-fg-muted" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
