// Links dos portais (só href + chave de tradução; ícones ficam no componente cliente).
// office: o escritório do creator (0087) é um portal como agência e marca (barra lateral e menu no
// celular); "creator" segue sendo a área do herói, sem menu.
export type Portal = "admin" | "creator" | "seller" | "professional" | "agency" | "brand" | "office";

// Raiz de cada portal (o do profissional mora em /profissional, em português como as rotas do app).
export const PORTAL_ROOT: Record<Portal, string> = {
  admin: "/admin",
  creator: "/creator",
  seller: "/seller",
  professional: "/profissional",
  agency: "/agencia",
  brand: "/marca",
  office: "/creator/escritorio",
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
    // Equipe do herói (0091): titular e membros; sem herói, "Criar meu herói"
    { key: "team", href: "/creator/equipe" },
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
    // Oportunidades de patrocínio (0085): situações do elenco oferecidas às marcas; gestor+
    { key: "sponsorships", href: "/agencia/oportunidades" },
    { key: "casting", href: "/agencia/casting" },
    { key: "brands", href: "/agencia/marcas" },
    { key: "notifications", href: "/agencia/notificacoes" },
    { key: "settings", href: "/agencia/configuracoes" },
    { key: "team", href: "/agencia/equipe" },
    // Financeiro simulado e histórico (0069): só o Adm
    { key: "finance", href: "/agencia/financeiro" },
    { key: "history", href: "/agencia/historico" },
  ],
  // Marca (0066): propostas de campanha e o catálogo autorizado de creators; o calendário chega na P1b.
  brand: [
    { key: "dashboard", href: "/marca" },
    // Ações por etapa (0078): cada entregável de cada creator, de Enviada a Publicada
    { key: "board", href: "/marca/acoes" },
    { key: "campaigns", href: "/marca/campanhas" },
    // Biblioteca (0083): conteúdos aprovados/publicados, direitos de uso e vencimento
    { key: "library", href: "/marca/biblioteca" },
    { key: "catalog", href: "/marca/creators" },
    { key: "agenda", href: "/marca/agenda" },
    // Oportunidades de patrocínio (0085): "Quero patrocinar" ou "Não tenho interesse"
    { key: "sponsorships", href: "/marca/oportunidades" },
    // Pagamentos (0090): o que a marca deve à agência (registro simulado)
    { key: "payments", href: "/marca/pagamentos" },
    { key: "team", href: "/marca/equipe" },
    { key: "notifications", href: "/marca/notificacoes" },
  ],
  // Escritório do creator (0065 + 0087): as rotas são as mesmas das abas de antes. Patrocínios ficam na
  // Agenda (não há rota própria do creator) e as assinaturas abrem pelo aviso/termo (sem lista).
  office: [
    { key: "dashboard", href: "/creator/escritorio" },
    { key: "opportunities", href: "/creator/escritorio/oportunidades" },
    { key: "tasks", href: "/creator/escritorio/tarefas" },
    { key: "agenda", href: "/creator/escritorio/agenda" },
    { key: "earnings", href: "/creator/escritorio/ganhos" },
    { key: "availability", href: "/creator/escritorio/disponibilidade" },
    { key: "kit", href: "/creator/escritorio/media-kit" },
    { key: "portfolio", href: "/creator/escritorio/portfolio" },
    { key: "documents", href: "/creator/escritorio/documentos" },
    { key: "consent", href: "/creator/escritorio/consentimento" },
    { key: "notifications", href: "/creator/escritorio/notificacoes" },
  ],
};
