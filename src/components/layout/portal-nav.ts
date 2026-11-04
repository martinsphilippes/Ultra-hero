// Links dos portais (só href + chave de tradução; ícones ficam no componente cliente).
// "creator" é a chave interna do Portal do Herói (0097: portal único em /heroi, com barra lateral e menu no celular).
// "project" (0110): portal mínimo do staff externo (fotógrafo, maquiador…) em /projetos — só as salas em que foi chamado.
export type Portal = "admin" | "creator" | "seller" | "professional" | "agency" | "brand" | "project";

// Raiz de cada portal (o do profissional mora em /profissional, em português como as rotas do app).
export const PORTAL_ROOT: Record<Portal, string> = {
  admin: "/admin",
  creator: "/heroi",
  seller: "/seller",
  professional: "/profissional",
  agency: "/agencia",
  brand: "/marca",
  project: "/projetos",
};

/** group: grupo do menu (textos em nav.groups.<group>); sem grupo, o item fica no topo. */
export type PortalLink = { key: string; href: string; group?: string };

/** Itens do Portal do Herói para a pessoa (puro, testável). Herói = papel de herói (titular ou membro da equipe);
 *  casting = está num casting de agência (ficha com login próprio ou herói ligado). */
export function heroPortalNavKeys(opts: { hero: boolean; casting: boolean }): string[] {
  const keys = ["home"];
  if (opts.hero) keys.push("post", "newContent", "content", "recipes");
  if (opts.casting) keys.push("opportunities", "tasks");
  if (opts.hero || opts.casting) keys.push("agenda", "finance");
  if (opts.casting) keys.push("availability");
  if (opts.hero) keys.push("publicPage");
  keys.push("team");
  if (opts.casting) keys.push("kit", "portfolio", "documents", "consent");
  keys.push("notifications");
  return keys;
}

export const PORTAL_LINKS: Record<Portal, readonly PortalLink[]> = {
  admin: [
    { key: "dashboard", href: "/admin" },
    { key: "users", href: "/admin/users" },
    { key: "invitations", href: "/admin/invitations" },
    { key: "creators", href: "/admin/herois" },
    { key: "heroCategories", href: "/admin/hero-categories" },
    { key: "sellers", href: "/admin/sellers" },
    { key: "professionals", href: "/admin/professionals" },
    // Gestão (0064): agências, equipes, marcas atendidas e o ambiente de demonstração
    { key: "agency", href: "/admin/agencia" },
    // Calendário Groscove (0098): agenda central da plataforma, vista por todos os portais; importação do cronograma
    { key: "agenda", href: "/admin/agenda" },
    // Layout dinâmico (0100): temas visuais temporários ligados a eventos do Calendário Groscove
    { key: "seasonalThemes", href: "/admin/temas" },
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
    // Interessados no lançamento (0117): lista "Seja o primeiro a saber" do teaser (/conheca) e a planilha
    { key: "leads", href: "/admin/interessados" },
    { key: "audit", href: "/admin/audit" },
    { key: "settings", href: "/admin/settings" },
  ],
  // Portal do Herói (0097): o "creator" era o próprio herói, então o portal do herói e o escritório do casting
  // viraram um só, em /heroi, com os itens em grupos. O layout escolhe os itens (heroPortalNavKeys): os da agência
  // só para quem está num casting; os de conteúdo só para quem tem herói. Vínculos de produtos é do admin
  // ("Publicar como hero"), por isso não está aqui; patrocínios aparecem na Agenda (não há tela própria).
  creator: [
    { key: "home", href: "/heroi" },
    { key: "post", href: "/heroi/post/novo", group: "content" },
    { key: "newContent", href: "/heroi/conteudos/novo", group: "content" },
    { key: "content", href: "/heroi/conteudos", group: "content" },
    { key: "recipes", href: "/heroi/receitas", group: "content" },
    { key: "opportunities", href: "/heroi/oportunidades", group: "work" },
    { key: "tasks", href: "/heroi/tarefas", group: "work" },
    { key: "agenda", href: "/heroi/agenda", group: "work" },
    { key: "finance", href: "/heroi/financeiro", group: "work" },
    { key: "availability", href: "/heroi/disponibilidade", group: "work" },
    { key: "publicPage", href: "/heroi/pagina", group: "profile" },
    { key: "team", href: "/heroi/equipe", group: "profile" },
    { key: "kit", href: "/heroi/media-kit", group: "profile" },
    { key: "portfolio", href: "/heroi/portfolio", group: "profile" },
    { key: "documents", href: "/heroi/documentos", group: "profile" },
    { key: "consent", href: "/heroi/consentimento", group: "profile" },
    { key: "notifications", href: "/heroi/avisos", group: "profile" },
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
    // Estratégias para marcas (0111): banco de ideias do mês, relatório do casting e envio à marca
    { key: "strategies", href: "/agencia/estrategias" },
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
    { key: "catalog", href: "/marca/herois" },
    { key: "agenda", href: "/marca/agenda" },
    // Oportunidades de patrocínio (0085): "Quero patrocinar" ou "Não tenho interesse"
    { key: "sponsorships", href: "/marca/oportunidades" },
    // Pagamentos (0090): o que a marca deve à agência (registro simulado)
    { key: "payments", href: "/marca/pagamentos" },
    { key: "team", href: "/marca/equipe" },
    { key: "notifications", href: "/marca/notificacoes" },
  ],
  // Staff externo (0110): as salas dos projetos em que foi chamado e os avisos
  project: [
    { key: "projects", href: "/projetos" },
    { key: "notifications", href: "/projetos/avisos" },
  ],
};
