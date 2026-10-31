// Links dos portais (só href + chave de tradução; ícones ficam no componente cliente).
export type Portal = "admin" | "creator" | "seller" | "professional" | "agency" | "brand";

// Raiz de cada portal (o do profissional mora em /profissional, em português como as rotas do app).
export const PORTAL_ROOT: Record<Portal, string> = {
  admin: "/admin",
  creator: "/creator",
  seller: "/seller",
  professional: "/profissional",
  agency: "/agencia",
  brand: "/marca",
};

export type PortalLink = { key: string; href: string };

export const PORTAL_LINKS: Record<Portal, readonly PortalLink[]> = {
  admin: [
    { key: "dashboard", href: "/admin" },
    { key: "users", href: "/admin/users" },
    { key: "invitations", href: "/admin/invitations" },
    { key: "creators", href: "/admin/creators" },
    { key: "heroCategories", href: "/admin/hero-categories" },
    { key: "sellers", href: "/admin/sellers" },
    { key: "professionals", href: "/admin/professionals" },
    // Gestão (0064): agências, equipes, marcas atendidas e o ambiente de demonstração
    { key: "agency", href: "/admin/agencia" },
    { key: "content", href: "/admin/content" },
    { key: "programs", href: "/admin/programs" },
    { key: "featured", href: "/admin/featured" },
    { key: "translations", href: "/admin/translations" },
    { key: "products", href: "/admin/products" },
    // Marcas e produtos externos + Smart Tags (0062): compra no site da marca, fora do app
    { key: "brands", href: "/admin/marcas" },
    { key: "shopFilters", href: "/admin/shop-filters" },
    { key: "collectibles", href: "/admin/collectibles" },
    { key: "links", href: "/admin/links" },
    { key: "orders", href: "/admin/orders" },
    { key: "shipments", href: "/admin/shipments" },
    { key: "feedback", href: "/admin/feedback" },
    // Denúncias (0071): conteúdo e heróis denunciados no app; resposta em até 24 horas
    { key: "reports", href: "/admin/denuncias" },
    { key: "metrics", href: "/admin/metrics" },
    // Indicadores (Etapa 5, 0060): por herói, atalho, conversão, profissionais, colecionáveis, ranking
    { key: "indicators", href: "/admin/indicadores" },
    { key: "audit", href: "/admin/audit" },
    { key: "settings", href: "/admin/settings" },
  ],
  creator: [
    // O herói só posta; conteúdos, receitas, vínculos e painel são do admin ("Publicar como hero").
    // O escritório (0065) aparece para quem está num casting; o talento sem página não tem "Novo post".
    { key: "post", href: "/creator/post/new" },
    { key: "office", href: "/creator/escritorio" },
  ],
  seller: [
    { key: "dashboard", href: "/seller" },
    { key: "products", href: "/seller/products" },
    { key: "fulfillments", href: "/seller/fulfillments" },
    { key: "profile", href: "/seller/profile" },
  ],
  // Profissional (0058): pedidos para responder, serviços com preço e o perfil público.
  professional: [
    { key: "dashboard", href: "/profissional" },
    { key: "orders", href: "/profissional/pedidos" },
    { key: "services", href: "/profissional/servicos" },
    { key: "profile", href: "/profissional/perfil" },
  ],
  // Agência (0064): o menu é filtrado pelo papel no servidor (agencyNavKeys; só o Adm vê Equipe).
  agency: [
    { key: "dashboard", href: "/agencia" },
    // Heróis (0070): perfis públicos que a agência gerencia e publica em nome deles
    { key: "heroes", href: "/agencia/herois" },
    // Pipeline comercial (0066): briefing → consulta → confirmação; a ficha do negócio mora em /agencia/negocios
    { key: "pipeline", href: "/agencia/pipeline" },
    // Tarefas (0068): modelo de 12 passos por campanha + avulsas; minhas, da equipe e atrasadas
    { key: "tasks", href: "/agencia/tarefas" },
    // Agenda (0067): eventos de sistema do pipeline + reuniões, gravações e datas comerciais
    { key: "agenda", href: "/agencia/agenda" },
    { key: "casting", href: "/agencia/casting" },
    { key: "brands", href: "/agencia/marcas" },
    { key: "notifications", href: "/agencia/notificacoes" },
    { key: "settings", href: "/agencia/configuracoes" },
    { key: "team", href: "/agencia/equipe" },
  ],
  // Marca (0066): propostas de campanha e o catálogo autorizado de creators; o calendário chega na P1b.
  brand: [
    { key: "dashboard", href: "/marca" },
    { key: "campaigns", href: "/marca/campanhas" },
    { key: "catalog", href: "/marca/creators" },
    { key: "agenda", href: "/marca/agenda" },
    { key: "team", href: "/marca/equipe" },
    { key: "notifications", href: "/marca/notificacoes" },
  ],
};
