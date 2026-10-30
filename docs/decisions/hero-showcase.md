# Vitrine do hero: atalhos configuráveis, alimentação, programas, produtos e profissionais

Decisões do responsável (30/10/2026). Implementação em etapas, depois de: 6 heróis reais (0044),
publicação só pelo admin (0045) e cadastro rápido (0046).

## Atalhos da página do hero
| Atalho | Conteúdo | Ações de quem vê |
|---|---|---|
| Dia a dia (antes "Rotina") | posts rápidos do próprio hero (foto/vídeo do composer) | ver, curtir, salvar |
| Alimentação (antes "Receitas") | receitas lançadas pelo ADMIN para o hero, assinadas por um hero chef ou só indicadas pelo hero | fazer (Modo Cozinha) · comprar pronto (produto ligado, ex.: marmita) · lista de compras · contratar nutricionista |
| Programas / Treinos | programas lançados pelo admin para o hero | começar · comprar produto ligado · contratar profissional (ex.: personal) |
| Produtos | tudo que o hero usa ou indica | adicionar ao carrinho |

## Regras
- Só o admin lança receitas e programas para um hero; o hero publica só o Dia a dia.
- Receita: o admin escolhe o hero da vitrine e, opcionalmente, um hero chef que assina. Sem chef, a
  receita aparece como "indicada por <hero>" (qualquer hero pode indicar; decisão 3).
- Receita pode ter 1 produto ligado ("Comprar pronto"); programa pode ter 1 produto e/ou 1 serviço.
- Profissionais (nutricionista, personal…) são CONTAS REAIS da plataforma (decisão 1): papel
  próprio, perfil, especialidade, serviços com preço e caixa de pedidos para responder.
- Contratar um serviço = item no carrinho com pagamento SIMULADO, igual aos produtos (decisão 2);
  gera pedido para o profissional.
- Nomes/ícones/ordem/visibilidade dos atalhos são configurados pelo admin POR CATEGORIA do hero
  (Esporte, Música, Gastronomia, Arte e Entretenimento; até 2 categorias por hero), com exceção
  por hero. Ex.: Esporte mostra "Treinos" no lugar de "Programas".

## Administração (no app)
Categorias e seus atalhos; categorias de cada hero e exceções; receita (hero da vitrine, chef que
assina, produto ligado, nutricionistas sugeridos); programa (produto, profissional); profissionais
(aprovação, serviços, preços).

## Dados (esboço)
hero_categories, creator_category_links (máx. 2), hero_library_tabs (por categoria; rótulo
pt-BR/en/es, ícone, ordem, ativo), creator_library_overrides; professionals (papel
`professional`), professional_services, service_orders (simulado); recipe_product_links,
recipe_signers (chef), program_product_links, program_service_links.

## Indicadores
Por hero e por atalho: toques em fazer/comprar/contratar, conversão receita→carrinho,
contratações por profissional.

## Etapas
1. Atalhos configuráveis (Dia a dia, Alimentação) + categorias da aba Hero + editor no admin.
   Feito: categorias da aba Hero (0049: hero_categories com id/slug estáveis e sort_order,
   creator_category_links com posição 1|2; /admin/hero-categories; campo Categorias no herói).
   Feito: atalhos configuráveis (0050). Fontes fixas no código (dia-a-dia, nutricao, alimentacao,
   treinos, gastronomia, programas, produtos = segmento da URL); hero_library_tabs (por categoria:
   rótulo pt-BR/en/es, ícone de lista fixa, ordem, visível) e creator_library_overrides (exceção por
   herói, campo nulo = herda), RLS de leitura pública e escrita só do admin, auditoria, RPCs atômicas.
   Vale a categoria principal (posição 1) do herói; a exceção vence; sem categoria/config: padrões.
   "Rotina" → Dia a dia e "Receitas" → Alimentação (/rotina e /receitas viram 308). Editor em
   /admin/hero-categories (Atalhos por categoria) e "Atalhos deste herói" em /admin/creators/[id].
   Sem seed: Esporte com "Programas" → "Treinos" daria dois atalhos "Treinos" nos heróis com vídeos
   de treino (Neymar, João Fonseca); o editor avisa nomes repetidos. Decidir no admin (ex.: renomear
   a fonte treinos para "Vídeos de treino" junto).
2. Alimentação completa (chef que assina, comprar pronto, lista de compras).
   Feito (0051). Reaproveita o modelo das receitas: o herói autor (content.creator_id) segue dono e
   assinatura padrão; a vitrine de outros heróis continua em creator_recipe_links (0024, admin valida,
   auditado). Novo: recipe_signers (sem linha = o autor assina; chef_id = herói chef que assina;
   chef_id nulo = sem chef, "Indicada por") e recipe_ready_products (1 produto "Comprar pronto" por
   receita, chave primária). Assinatura: "Receita de <chef>", "Receita de <chef> · indicada por
   <herói>" ou "Indicada por <herói>" (o herói é o da vitrine de onde a pessoa veio, ?vitrine=, ou o
   autor). Ações na página da receita e nos cards da Alimentação: Fazer (Modo Cozinha), Lista de
   compras (folha de ingredientes da receita; no card, leva à receita em #lista-de-compras), Comprar
   pronto (carrinho de teste, mesmas regras da loja, não depende da etapa demonstrativa) e a linha
   "Nutricionista: em breve" (constante NUTRITIONIST_ACTION em lib/recipes/showcase; a Etapa 3 liga).
   Admin: painel "Vitrine (Alimentação)" em /admin/content/[id] (heróis da vitrine, quem assina,
   produto pronto). Indicadores (base da Etapa 5): recipe_action_counters por dia (Brasília), herói
   da vitrine, origem (alimentacao = card, receita = página), ação (fazer, comprar_pronto,
   lista_compras) e receita; sem pessoa e sem IP; nenhum grant para anon/authenticated; soma só pelo
   service role (POST /api/recipe-actions → recipe_action_bump, que confere se a receita está na
   vitrine do herói), sem esperar resposta, 1 toque por ação e receita por página, limite por
   instância; o navegador do E2E não grava. Sem a 0051: tudo como antes, sem as partes novas.
3. Profissionais e serviços (conta, perfil, serviços, contratação simulada, caixa de pedidos).
   Feito (0058). Dados: professionals (perfil público; especialidade nutritionist | personal_trainer |
   physiotherapist | psychologist; registro CRN/CREF/CREFITO/CRP + número + UF; selo "Registro
   conferido"; situação pending → approved | suspended; aprovado exige registro conferido),
   professional_verifications (nota da conferência, só o admin lê), professional_services (sessão em
   minutos ou plano em semanas; online, presencial ou os dois; preço R$ 5–100 mil; o profissional
   pausa/edita, o admin pode desativar), professional_suggestions (sugerido em herói, receita ou
   programa; chave primária própria, nunca tabela-ponte na chave, lição da 0055), service_cart_items,
   service_orders (título/preço/formato congelados, nome curto do cliente "Maria L.", 1ª resposta e
   fechamento) e service_order_events (mudanças e recados). Papel: app_role ganha `professional`
   (o valor não é usado na própria migração: o Postgres não deixa; só as funções o gravam em tempo de
   execução); o portal e a RLS usam my_professional_id() (perfil ligado à conta).
   Situação do pedido (service_order_update, mesma tabela de lib/professionals/rules): profissional
   aceita ou recusa o novo, agenda/remarca (recado obrigatório), conclui ou cancela (com recado);
   cliente cancela só enquanto ninguém respondeu; admin cancela qualquer aberto com nota (auditado);
   encerrado não volta. Contratar: "Contratar" põe o serviço no carrinho (1 de cada, até 10; o próprio
   profissional não contrata o seu); o checkout com serviço é atômico (checkout_with_services: produtos
   pelo checkout_cart de sempre, só se houver produto, e um pedido por serviço; preço diferente do
   visto ou serviço fora do ar recusa tudo; destino só com produto); sem serviço, o caminho de antes.
   Telas: /profissionais (lista, filtro por especialidade), /profissionais/<slug> (perfil, selo,
   serviços com Contratar), carrinho e checkout com a seção Serviços, Minhas compras → aba Serviços
   (situação, agenda, recados, cancelar), portal /profissional (Painel com pedidos por situação e
   tempo de resposta, Pedidos, Serviços, Perfil; trocar o registro tira o selo e volta para análise),
   admin /admin/professionals (lista com situação, pedidos aguardando e mediana de resposta; abas
   Visão geral com aprovação + convite + conta de acesso rápido, Perfil, Serviços, Sugeridos e
   Pedidos). Convite: o mesmo invitations (coluna professional_id; admin_invite_professional;
   accept_invitation liga a conta e grava o papel). Receitas: a linha "Nutricionista: em breve" virou
   "Contratar nutricionista" (NUTRITIONIST_ACTION = "live", HireNutritionist) com os sugeridos da
   receita, depois do herói da vitrine, senão qualquer nutricionista aprovado; também no fim da
   Alimentação do herói. Sem a 0058 no banco (ou sem nutricionista aprovado) volta a linha "em breve".
   App das lojas: /profissional travado no middleware; lista e perfil aparecem sem "Contratar" (o
   servidor não renderiza o botão e a ação recusa pedido vindo do app); carrinho e Minhas compras já
   eram travados. Indicadores (base da Etapa 5): professional_tap_counters por dia (Brasília),
   profissional, herói (opcional), origem (receita, alimentacao, perfil, lista, programa) e ação
   (contratar, ver_perfil); sem pessoa, sem FK, sem grant para anon/authenticated; soma só pelo service
   role (POST /api/professional-taps → professional_tap_bump, que ignora profissional fora do ar).
   Seed: Nina Horta (nutricionista, 3 serviços; sugerida no Jacquin e em 2 receitas dele) e Téo Fôlego
   (personal, 3 serviços; sugerido no Neymar, no João Fonseca e no programa Base de força), aprovados,
   sem conta. Conta de acesso rápido: o admin cria em /admin/professionals/<id> (só perfil de exemplo
   sem conta; usa DEMO_ACCOUNTS_PASSWORD, profissional@demo.ultrahero.app); o botão "Profissional" do
   painel da tela de login só aparece depois disso. LGPD: conta anonimizada sai dos pedidos (sem
   vínculo nem nome). Fica para a Etapa 4: mostrar o profissional sugerido na página do programa.
4. Programas com produto e profissional ligados.
   Feito (0059). Dados: program_products (até 3 produtos por programa, ordem 1..3 única, nota "por que
   este produto" até 200; chave primária própria, nunca tabela-ponte na chave) e
   professional_suggestions.service_id (serviço escolhido para o profissional sugerido no programa; FK
   composta (service_id, professional_id) garante que é do mesmo profissional; só com program_id;
   serviço apagado zera só a coluna). Leitura pública: programa publicado e produto publicado/liberado.
   Escrita só por RPC do admin, auditada: admin_program_products_save (troca a lista inteira;
   program.products) e admin_program_professional_service_set (program.professional_service); sugerir
   ou tirar o profissional reaproveita admin_professional_suggestion_set da 0058. Admin: painel
   "Produto e profissional" em /admin/programs/<id>. Página do programa: "Próximos passos" (só com
   produto ou profissional ligado) com Começar (o botão de participar sai do cabeçalho; inscrito vê
   Continuar → 1º obrigatório pendente; concluído vê Rever conteúdos), Comprar produto (linhas com
   nota e "Adicionar ao carrinho de teste"; some com o comércio desligado e no app das lojas) e
   Contratar profissional (serviço escolhido, senão o 1º ativo; Contratar → carrinho; no app vira
   "Profissionais indicados" só com Ver perfil). 5º card "Apoio" (telas Produtos do programa e
   Profissionais indicados), só quando há vínculo visível; com 5 cards a linha fica mais densa
   (folga e letra menores) para os rótulos caberem a 390 px. Nutricional (decisão do responsável):
   só com conteúdo de nutrição/receita do programa, conteúdo PRÓPRIO do herói (autor) ou produto de
   comida ligado ao programa/herói; receitas apenas indicadas pelo herói (creator_recipe_links de
   outro autor) não contam mais nem aparecem. Indicadores: Contratar/Ver perfil a partir do programa
   contam em professional_tap_counters com origem "programa"; "Comprar produto" não tem contador
   próprio (recipe_action_counters é só de receita; ficou para a Etapa 5). Sem a 0059 no banco: os
   profissionais sugeridos (0058) aparecem com o 1º serviço ativo; produtos ligados não aparecem.
