import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { PortalShortcuts } from "@/components/me/PortalShortcuts";
import { PageHeader } from "@/components/ui";
import { PORTAL_CHOOSER_PATH, portalNavHref } from "@/components/layout/nav-items";
import { getMyPortalItems } from "@/lib/portals/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("me.profile.portals");
  return { title: t("title") };
}

// Aba Portal de quem tem mais de um portal: a pessoa escolhe em qual entrar. Com um só, a aba já abre direto nele.
export default async function PortalsPage() {
  const [items, t] = await Promise.all([getMyPortalItems(), getTranslations("me.profile.portals")]);
  const href = portalNavHref(items.map((item) => item.href));
  if (href !== PORTAL_CHOOSER_PATH) redirect(href ?? "/profile");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} />
      <PortalShortcuts items={items} />
    </div>
  );
}
