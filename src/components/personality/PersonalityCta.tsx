import { Brain, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isPersonalityType } from "@/lib/personality/test";

// Atalho para o teste de personalidade (0128): mostra o tipo de quem já fez ou convida a fazer.
export async function PersonalityCta({ userId }: { userId: string }) {
  const [t, supabase] = await Promise.all([getTranslations("personality"), createClient()]);
  const { data } = await supabase.from("personality_results").select("type").eq("user_id", userId).maybeSingle();
  const type = data && isPersonalityType(data.type) ? data.type : null;
  return (
    <Link
      href="/teste-de-personalidade"
      className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-surface-hover"
      data-testid="personality-cta"
    >
      <span className="flex items-start gap-3">
        <Brain className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden="true" />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-fg">{type ? t("myType", { name: t(`types.${type}.name`), type }) : t("cta")}</span>
          <span className="type-caption text-fg-muted">{type ? t(`types.${type}.body`) : t("ctaHint")}</span>
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-fg-muted" aria-hidden="true" />
    </Link>
  );
}
