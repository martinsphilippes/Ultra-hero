import { BadgeCheck, BriefcaseBusiness, Building2, ChevronRight, ShieldCheck, Stethoscope, Store, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { SettingsItem, SettingsPortalRole } from "@/lib/settings/sections";
import { cn } from "@/lib/utils";

const ICONS: Record<SettingsPortalRole, LucideIcon> = {
  seller: Store,
  professional: Stethoscope,
  office: BriefcaseBusiness,
  agency: Building2,
  brand: BadgeCheck,
  admin: ShieldCheck,
};

// Portais no topo do Perfil (pedido do responsável: a entrada no painel fica "bem em cima", sem
// precisar abrir Configurações). Mesmas linhas da seção Portais; no app das lojas, os portais só da
// web somem (native:hidden) e o middleware barra a rota.
export async function PortalShortcuts({ items }: { items: SettingsItem[] }) {
  const portals = items.filter((i): i is Extract<SettingsItem, { kind: "portal" }> => i.kind === "portal");
  if (portals.length === 0) return null;
  const t = await getTranslations("me.profile.portals");
  const allNativeHidden = portals.every((p) => p.nativeHidden);
  return (
    <nav aria-labelledby="profile-portals-title" data-testid="profile-portals" className={cn("flex flex-col gap-2", allNativeHidden && "native:hidden")}>
      <h2 id="profile-portals-title" className="type-overline px-1 text-fg-muted">
        {t("title")}
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {portals.map((item) => {
          const Icon = ICONS[item.key];
          return (
            <li key={item.key} className={cn(item.nativeHidden && "native:hidden")}>
              <Link
                href={item.href}
                data-testid={`profile-portal-${item.key}`}
                className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus sm:px-5"
              >
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg">
                  <Icon className="size-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold text-fg">{t(item.key)}</span>
                  <span className="type-caption text-fg-muted">{t(`hints.${item.key}`)}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
