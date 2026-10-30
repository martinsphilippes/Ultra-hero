// Links dos portais (só href + chave de tradução; ícones ficam no componente cliente).
export type Portal = "admin" | "creator" | "seller";

export type PortalLink = { key: string; href: string };

export const PORTAL_LINKS: Record<Portal, readonly PortalLink[]> = {
  admin: [
    { key: "dashboard", href: "/admin" },
    { key: "users", href: "/admin/users" },
    { key: "invitations", href: "/admin/invitations" },
    { key: "creators", href: "/admin/creators" },
    { key: "heroCategories", href: "/admin/hero-categories" },
    { key: "sellers", href: "/admin/sellers" },
    { key: "content", href: "/admin/content" },
    { key: "programs", href: "/admin/programs" },
    { key: "plans", href: "/admin/plans" },
    { key: "featured", href: "/admin/featured" },
    { key: "translations", href: "/admin/translations" },
    { key: "products", href: "/admin/products" },
    { key: "shopFilters", href: "/admin/shop-filters" },
    { key: "links", href: "/admin/links" },
    { key: "orders", href: "/admin/orders" },
    { key: "shipments", href: "/admin/shipments" },
    { key: "feedback", href: "/admin/feedback" },
    { key: "metrics", href: "/admin/metrics" },
    { key: "audit", href: "/admin/audit" },
    { key: "settings", href: "/admin/settings" },
  ],
  creator: [
    // O herói só posta; conteúdos, receitas, vínculos e painel são do admin ("Publicar como hero").
    { key: "post", href: "/creator/post/new" },
  ],
  seller: [
    { key: "dashboard", href: "/seller" },
    { key: "products", href: "/seller/products" },
    { key: "fulfillments", href: "/seller/fulfillments" },
    { key: "profile", href: "/seller/profile" },
  ],
};
