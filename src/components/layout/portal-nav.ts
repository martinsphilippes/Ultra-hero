// Links dos portais (só href + chave de tradução; ícones ficam no componente cliente).
export type Portal = "admin" | "creator" | "seller";

export type PortalLink = { key: string; href: string };

export const PORTAL_LINKS: Record<Portal, readonly PortalLink[]> = {
  admin: [
    { key: "dashboard", href: "/admin" },
    { key: "users", href: "/admin/users" },
    { key: "invitations", href: "/admin/invitations" },
    { key: "creators", href: "/admin/creators" },
    { key: "sellers", href: "/admin/sellers" },
    { key: "content", href: "/admin/content" },
    { key: "programs", href: "/admin/programs" },
    { key: "plans", href: "/admin/plans" },
    { key: "featured", href: "/admin/featured" },
    { key: "translations", href: "/admin/translations" },
    { key: "products", href: "/admin/products" },
    { key: "links", href: "/admin/links" },
    { key: "orders", href: "/admin/orders" },
    { key: "feedback", href: "/admin/feedback" },
    { key: "metrics", href: "/admin/metrics" },
    { key: "audit", href: "/admin/audit" },
    { key: "settings", href: "/admin/settings" },
  ],
  creator: [
    // Postar é a ação principal do herói: primeiro item do menu.
    { key: "post", href: "/creator/post/new" },
    { key: "dashboard", href: "/creator" },
    { key: "content", href: "/creator/content" },
    { key: "links", href: "/creator/links" },
    { key: "profile", href: "/creator/profile" },
  ],
  seller: [
    { key: "dashboard", href: "/seller" },
    { key: "products", href: "/seller/products" },
    { key: "fulfillments", href: "/seller/fulfillments" },
    { key: "profile", href: "/seller/profile" },
  ],
};
