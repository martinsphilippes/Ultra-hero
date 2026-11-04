import { ShieldAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
  /** Onde a autorização é registrada (consentimento com o termo assinado na ficha, ou os direitos no admin). */
  href?: string | null;
  /** Quem vê: a agência (termo e consentimento) ou a administração (titular e validade). */
  audience: "agency" | "admin";
  /** A agência já registrou o consentimento com o termo; falta a plataforma confirmar a autorização. */
  awaiting?: boolean;
  compact?: boolean;
  className?: string;
};

// Aviso INTERNO (agência e administração) para pessoa real sem autorização de imagem válida (needsImageAuthorization).
// Substitui o antigo selo público "Perfil ilustrativo" nesses heróis: o público não vê selo nenhum, mas nada é
// apresentado como autorizado até a administração registrar titular e validade (RB-05).
export async function ImageAuthorizationNotice({
  href,
  audience,
  awaiting = false,
  compact = false,
  className,
}: Props) {
  const t = await getTranslations("catalog.imageRights");
  const title = awaiting ? t("awaitingTitle") : t("title");
  const hint = awaiting
    ? t("awaiting")
    : audience === "admin"
      ? t("adminHint")
      : t("agencyHint");
  return (
    <div
      role="note"
      data-testid="image-rights-notice"
      className={cn(
        "flex gap-2 rounded-xl border border-warning/40 bg-warning-soft/40",
        compact ? "px-3 py-2" : "p-3",
        className,
      )}
    >
      <ShieldAlert
        className="mt-0.5 size-4 shrink-0 text-warning"
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        {href && !awaiting ? (
          <Link
            href={href}
            className="text-sm font-semibold text-accent-text underline-offset-2 hover:underline"
          >
            {title}
          </Link>
        ) : (
          <p className="text-sm font-semibold text-fg">{title}</p>
        )}
        {compact ? null : <p className="type-caption text-fg-muted">{hint}</p>}
        {compact ? null : (
          <p className="type-caption text-fg-subtle">{t("internal")}</p>
        )}
      </div>
    </div>
  );
}
