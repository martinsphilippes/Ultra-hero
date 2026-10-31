"use client";

import {
  ArrowLeft,
  BadgeCheck,
  Bell,
  BriefcaseBusiness,
  Building2,
  Contact,
  BarChart3,
  ChefHat,
  ClipboardList,
  FileText,
  Gauge,
  Gem,
  Languages,
  LayoutDashboard,
  Link2,
  Mail,
  Menu,
  MessageSquare,
  Package,
  SlidersHorizontal,
  Tags,
  SquarePlus,
  ScrollText,
  Settings,
  ShoppingBag,
  Star,
  Stethoscope,
  Handshake,
  Store,
  UserRound,
  Truck,
  Users,
  KanbanSquare,
  CalendarDays,
  Megaphone,
  Search,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { PORTAL_LINKS, PORTAL_ROOT, type Portal } from "./portal-nav";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  users: Users,
  invitations: Mail,
  creators: Star,
  sellers: Store,
  professionals: Stethoscope,
  services: Handshake,
  profile: UserRound,
  content: FileText,
  programs: ClipboardList,
  featured: Star,
  translations: Languages,
  products: Package,
  brands: BadgeCheck,
  shopFilters: SlidersHorizontal,
  collectibles: Gem,
  heroCategories: Tags,
  links: Link2,
  orders: ShoppingBag,
  feedback: MessageSquare,
  metrics: BarChart3,
  indicators: Gauge,
  audit: ScrollText,
  settings: Settings,
  fulfillments: Truck,
  shipments: Truck,
  post: SquarePlus,
  recipes: ChefHat,
  agency: Building2,
  casting: Contact,
  office: BriefcaseBusiness,
  team: Users,
  notifications: Bell,
  pipeline: KanbanSquare,
  campaigns: Megaphone,
  catalog: Search,
  agenda: CalendarDays,
  tasks: ClipboardList,
};

function isActive(pathname: string, href: string, root: string) {
  if (href === root) return pathname === root;
  return pathname === href || pathname.startsWith(`${href}/`);
}

type PortalNavListProps = { portal: Portal; onNavigate?: () => void; navKeys?: readonly string[] };

// Lista de links do portal com aria-current.
export function PortalNavList({ portal, onNavigate, navKeys }: PortalNavListProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const root = PORTAL_ROOT[portal];

  return (
    <nav aria-label={t("portalLabel")} className="flex flex-col gap-4">
      <ul className="flex flex-col gap-0.5">
        {PORTAL_LINKS[portal].filter(({ key }) => !navKeys || navKeys.includes(key)).map(({ key, href }) => {
          const Icon = ICONS[key] ?? LayoutDashboard;
          const active = isActive(pathname, href, root);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
                  active ? "bg-accent-soft text-accent-text" : "text-fg-muted hover:bg-surface-hover hover:text-fg",
                )}
              >
                <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                <span className="truncate">{t(`${portal}.${key}`)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Link
        href="/"
        onClick={onNavigate}
        className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 text-sm font-medium text-fg-muted hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <ArrowLeft className="size-[18px]" aria-hidden="true" />
        {t("actions.backToApp")}
      </Link>
    </nav>
  );
}

type PortalMobileMenuProps = { portal: Portal; children?: ReactNode; navKeys?: readonly string[] };

// Botão de menu (mobile) que abre a navegação do portal em um Sheet.
export function PortalMobileMenu({ portal, children, navKeys }: PortalMobileMenuProps) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Fecha ao navegar.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <IconButton label={t("actions.openMenu")} icon={<Menu />} onClick={() => setOpen(true)} className="md:hidden" aria-expanded={open} />
      <Sheet open={open} onOpenChange={setOpen} side="left" title={<Logo size="sm" />} description={t(`portalDescription.${portal}`)}>
        <div className="flex flex-col gap-4 pb-4">
          <PortalNavList portal={portal} onNavigate={() => setOpen(false)} navKeys={navKeys} />
          {children}
        </div>
      </Sheet>
    </>
  );
}
