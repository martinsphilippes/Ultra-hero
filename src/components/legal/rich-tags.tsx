import Link from "next/link";
import type { RichTranslationValues } from "next-intl";
import type { ReactNode } from "react";

// Tags de rich text (t.rich) dos textos legais. Sem dependências de servidor: serve em server e client.
export const LEGAL_TERMS_HREF = "/legal/terms";
export const LEGAL_PRIVACY_HREF = "/legal/privacy";

export const legalLinkClass =
  "font-medium text-accent-text underline underline-offset-2 hover:text-fg focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

const linkTo = (href: string) => {
  function LegalInlineLink(chunks: ReactNode) {
    return (
      <Link href={href} className={legalLinkClass}>
        {chunks}
      </Link>
    );
  }
  return LegalInlineLink;
};

export const legalRichTags = {
  strong: (chunks: ReactNode) => <strong className="font-semibold text-fg">{chunks}</strong>,
  code: (chunks: ReactNode) => <code className="rounded bg-surface-hover px-1 py-0.5 font-mono text-[0.85em] text-fg break-words">{chunks}</code>,
  terms: linkTo(LEGAL_TERMS_HREF),
  privacy: linkTo(LEGAL_PRIVACY_HREF),
  account: linkTo("/profile/account"),
  profile: linkTo("/profile"),
  interests: linkTo("/profile/interests"),
  plan: linkTo("/profile/plan"),
  evolution: linkTo("/profile/evolution"),
  recipes: linkTo("/profile/receitas"),
  orders: linkTo("/orders"),
  forgot: linkTo("/forgot-password"),
} satisfies RichTranslationValues;
