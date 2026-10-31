import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { KitView } from "@/components/talent/KitView";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import type { ResolvedKit } from "@/lib/talent/media-kit";

export const dynamic = "force-dynamic";

// Fora dos buscadores e sem o token no Referer de links externos.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

type Props = { params: Promise<{ token: string }> };

// Media kit público (D5): sem login, resolvido no servidor pelo service role (media_kit_resolve só
// devolve os campos marcados; link revogado, vencido, sem consentimento ou de agência de demonstração
// → 404 decidido antes de qualquer streaming). A visita só conta fora dos testes (cookie uh-e2e).
export default async function PublicKitPage({ params }: Props) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token) || !hasAdminClient()) notFound();
  const count = (await cookies()).get("uh-e2e")?.value !== "1";
  const { data, error } = await createAdminClient().rpc("media_kit_resolve", { p_token: token, p_count: count });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) notFound();
  const kit = data as unknown as ResolvedKit;
  const t = await getTranslations("mediaKit.public");
  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:py-12" data-testid="public-kit">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-fg-muted">{t("eyebrow")}</p>
      <KitView kit={kit} />
      <footer className="flex flex-col gap-1 border-t border-border pt-4 type-caption text-fg-muted">
        <span>{t("declaredNote")}</span>
        <span>{t("poweredBy")}</span>
      </footer>
    </main>
  );
}
