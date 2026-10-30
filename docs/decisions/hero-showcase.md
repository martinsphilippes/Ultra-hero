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
   Os atalhos por categoria (hero_library_tabs) virão ligados a hero_categories.id.
2. Alimentação completa (chef que assina, comprar pronto, lista de compras).
3. Profissionais e serviços (conta, perfil, serviços, contratação simulada, caixa de pedidos).
4. Programas com produto e profissional ligados.
