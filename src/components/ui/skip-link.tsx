import { useTranslations } from "next-intl";

// Link "pular para o conteúdo": invisível até receber foco pelo teclado.
export function SkipLink({ target = "#main" }: { target?: string }) {
  const t = useTranslations("common.a11y");
  return (
    <a
      href={target}
      className="sr-only z-[100] rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-accent-fg shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {t("skipToContent")}
    </a>
  );
}
