# Groscove Ultra — Arquitetura da POC

> Status: POC/experimento público. Tudo que envolve dinheiro, entrega e parcerias é **simulado**. Personalidades são **fictícias**.

## 1. Visão geral

| Camada | Tecnologia | Papel |
|---|---|---|
| App | Next.js 15 (App Router, RSC, Server Actions), React 19, TypeScript strict, Tailwind v4, next-intl | PWA mobile-first, pt-BR/en/es, tema escuro/claro/sistema |
| Dados | Supabase Postgres 17 + RLS + funções `security definer` | Fonte única de verdade para autorização e regras de negócio |
| Auth | Supabase Auth (e-mail/senha, Google OAuth) | Cadastro público só para consumidores; parceiros por convite |
| Arquivos | Supabase Storage | Fotos de perfil no bucket público `avatars` (0031: escrita só pelo servidor com service role, 512×512 sem EXIF, cota de 20/dia); fotos de receita no bucket privado `recipe-media` (0028: 5 MB por objeto, cota de 50 objetos ou 100 MB por herói por dia, servidas só pelo proxy `/media/recipe/[id]`); vídeos de posts e receitas atrás de `VideoProvider` (Cloudflare Stream) |
| Deploy | Vercel (região `gru1`, perto do banco em `sa-east-1`) | 3 crons diários via `vercel.json` (retenção 03:00, renovações 03:30, transporte 04:00 UTC) |
| IA | `RecommendationEngine` (determinístico / OpenAI / Gemini) | Só recomenda itens do catálogo; fallback explícito |

Princípio central: **o cliente nunca decide permissão, preço ou direito de acesso**. Toda escrita sensível passa por RPCs auditadas; toda leitura passa por RLS.

## 2. Módulos e rotas

| Área | Rotas | Quem acessa |
|---|---|---|
| Consumidor | `/`, `/explore` (abas Conteúdos, Receitas, Programas, Produtos e Listas), `/personalities/*`, `/content/[slug]` (receita: `RecipeView`; Modo Cozinha em `/content/[slug]/cozinha`), `/programs/[slug]`, `/profile/*` (inclui `/profile/evolution`, `/profile/today/[categoria]`, `/profile/receitas`, `/profile/lista-de-compras` e `/profile/lembretes`; `/evolution` responde 308), `/onboarding`, `/recipes/onboarding`, `/shop/*`, `/cart`, `/checkout`, `/orders/*`, `/verify/[code]` | visitante (catálogo) / consumidor logado (consumo, listas, pedidos de teste) |
| Portal da personalidade (herói) | `/creator/*` (inclui `/creator/post/new` e Minhas Receitas em `/creator/recipes/*`) | papel `creator` por convite; consumidor que abre `/creator` volta ao início, visitante vai ao login |
| Portal do fornecedor | `/seller/*` | **desligado** (`SELLER_PORTAL_ENABLED = false`, 0053): admin é levado a `/admin/sellers`, as demais contas veem um aviso e as server actions do portal recusam. Ligado, volta a exigir papel `seller` por convite (escopo = organização) |
| Administração | `/admin/*` (inclui a operação dos fornecedores: `/admin/sellers/[id]` com abas Visão geral, Produtos — criar/editar/publicar/arquivar com o `ProductForm` do fornecedor —, Remessas e Organização; `/admin/shipments` com todas as remessas) | papel `admin` (global) |
| Sistema | `/api/cron/{transport,retention}`, `/api/certificates/[code]` | cron (CRON_SECRET) / dono do certificado |

## 3. Identidade e papéis

- `profiles` (1:1 com `auth.users`), `role_assignments` (consumer/creator/seller/admin, com escopo), `creator_profiles`, `seller_organizations`, `seller_memberships`, `invitations` (token com hash SHA-256, uso único, expiração, revogação, e-mail precisa coincidir com a conta autenticada).
- Novo usuário → trigger `handle_new_user`: perfil + papel `consumer`. Admin de bootstrap: lista em `app_settings.bootstrap_admin_emails` (auditado). Nenhuma promoção por autoatendimento.
- Suspensão de parceiro (`partner_status`) revoga a operação (`my_creator_id()`/`my_seller_org_ids()` passam a ignorar) sem apagar histórico.

## 4. Conteúdo e programas

- `content` (metadados públicos) + `content_bodies` (corpo/mídia, **gate server-side** por `can_access_content`). Sem regra de acesso (`access_level is null`) → "temporariamente indisponível", nunca inferido.
- Fluxo editorial: `draft` → `submit_content_for_review` → `in_review` → admin decide `returned | approved (publica) | rejected`. Publicação exige regra de acesso + corpo.
- **Regra de revisão por tipo** (0027): `content_type_settings.review_required` por tipo (`video`, `recipe`, `workout`, `guide`, `article`), **desligada nos 5** (decisão P1). Só muda pela RPC `admin_set_review_required` (justificativa obrigatória, auditada em `admin_audit`); o gatilho `content_type_settings_review_guard` recusa a mudança direta (`review_required_protected`). Desligada, o herói publica direto (`creator_publish_content`, publicação direta da 0025, com agendamento opcional de 1 min a 365 dias); ligada, `creator_publish_content` responde `review_required` e o herói envia (`submit_content_for_review`, que para receita passa pelo checklist e grava a versão `submit`) e o admin aprova, com data se quiser (`admin_review_content`). Em `/admin/content/settings` só a receita ganha "Ligar" (o único tipo com "Enviar para revisão" no portal; `review_flow_unavailable` para os outros). Cobertura: S28 (os dois modos) e E2E `recipes-portal.spec.ts`.
- `content_localizations` por idioma com status; conteúdo não traduzido fica no idioma original com etiqueta.
- Programas: `programs` → `program_versions` (participante preso à versão em que entrou) → `program_items` (livre navegação, obrigatório/opcional). `program_item_substitutions` para item obrigatório arquivado (auditável; vale para todos os pendentes daquela versão). Conclusão emite `certificates` (snapshot congelado, código verificável, simbólico).
- **Prateleiras de programas** (`docs/decisions/program-shelves.md`): na biblioteca Programas do herói (`/personalities/[slug]/programas`) cada programa publicado vira uma prateleira (eyebrow do pilar, título com link, meta, "Ver programa" ou "Continuar") com uma linha de quadrados 1:1, um por etapa, rolagem lateral com snap (3 quadrados inteiros e a ponta do 4º no Pixel 7) e setas ‹ › no desktop (`ProgramShelf` + `ShelfRail`). A carga é em lote (`src/lib/catalog/program-shelves.ts`), com substituições aplicadas no app e resultado igual a `program_required_items` (S39). A seed de demonstração tem 24 programas publicados, 3 por herói (0008 + 0035, S38).
- Progresso: `completions` (única por conteúdo), `content_progress` (continuar), `streak_events` (data local calculada **no servidor** a partir do fuso do dispositivo; desde a 0037 a sequência conta só conteúdos concluídos e entradas em programas, e os Lembretes não contam), `achievements` configuráveis (regras JSON).

## 4.1 Receitas estruturadas (`docs/decisions/recipes-module.md`, fases 1–6)

- **Modelo** (0024, 0027–0029, 0032, 0033, 0036): a receita é um `content` do tipo `recipe` com tabelas próprias — `recipe_details` (porções, tempos, dificuldade, alérgenos e dietas declarados, agregado das avaliações), `recipe_extras` (nota do chef e termos de ingrediente para a busca), `recipe_categories`/`recipe_category_links` (10 categorias), `recipe_ingredients` (quantidade numérica, em texto ou "a gosto", unidade, nota, opcional), `recipe_steps` + `recipe_step_ingredients`, `recipe_nutrition` (validada só pelo admin, `admin_validate_recipe_nutrition`), `recipe_media` (bucket `recipe-media`), `recipe_versions` (imutáveis; motivos `submit`, `publish`, `schedule`, `admin_publish`, `admin_edit` e `restore_point`), `recipe_ratings`, `recipe_comments` (modelados, sem tela), `recipe_onboarding` (etapa demonstrativa, 0024), `user_recipe_prefs` + `recipe_view_history` (histórico opcional, 90 dias), `shopping_list_items`, `recipe_ingredient_products` (vínculo ingrediente↔produto validado pelo admin) e `creator_recipe_links` (receitas indicadas por outro herói, 0024). O corpo v1 das 8 receitas do seed foi convertido pelo backfill (0029) e guardado como `restore_point`.
- **Escrita**: só por RPC. `recipe_save` grava tudo de uma vez com controle de concorrência (`stale_draft`) e recusa nutrição validada vinda do herói; o gatilho de publicável roda o checklist (título, resumo, capa, texto alternativo da galeria, porções, tempo total e tempos coerentes, ao menos 1 ingrediente, 1 etapa e 1 categoria, alérgenos declarados — mesmo que nenhum —, licença coerente com o vídeo e vídeo do Stream enviado pelo próprio herói) em toda entrada no ar. Ciclo de vida do herói: publicar/agendar, despublicar (volta a rascunho), retirar da revisão, arquivar, restaurar, duplicar (sem fotos), restaurar versão no rascunho e **excluir**: rascunho nunca publicado ou, desde a 0036, receita **arquivada pelo próprio herói** (`creator_delete_recipe`; publicada pede arquivar antes, a arquivada pelo admin é trava dele, em programa ou com conclusões dá `content_in_use`; favoritos, versões, avaliações e mídia saem em cascata, a auditoria fica). Sem a 0036 no banco o app cai em `creator_delete_recipe_draft` (só rascunho nunca publicado).
- **Acesso**: os cards (catálogo, perfil do chef, coleção) são públicos; ingredientes, preparo, Modo Cozinha e lista de compras exigem a etapa demonstrativa, garantida no banco por `can_access_content` (o corpo nem chega ao HTML do visitante). Catálogo em `/explore?tab=receitas` pela `recipe_catalog` (a única RPC de receita que o visitante executa; 24 por página com cursor).
- **Telas**: Portal do Chef (`/creator/recipes`, editor `RecipeWizard` em 6 etapas com cópia local e conflito, prévia, versões), página da receita (`RecipeView`, porções na URL, checklist, imprimir, compartilhar), Modo Cozinha (só no aparelho), Minha coleção (`/profile/receitas`), lista de compras (`/profile/lista-de-compras`, kit da receita nos 4 estados do comércio) e `/admin/content/[id]/preview`, `/admin/creators` (credenciais, P7) e `/admin/links` (aba Ingredientes).
- **Mídia**: fotos reduzidas no aparelho (2048 px, sem EXIF), enviadas direto ao bucket com a sessão do herói (políticas da 0028, cota diária), bytes conferidos na action e servidas pelo proxy com a RLS de quem pede; o cron diário apaga órfãs depois de 24 h (`recipe_orphan_media` + API do Storage). Vídeo opcional pelo Stream ou link YouTube/Vimeo.
- **SEO**: `RECIPES_SEO_INDEX` desligada (P6): sem sitemap de receitas nem JSON-LD enquanto os chefs forem fictícios; `/robots.txt` tira portais, perfil e `/*/cozinha` dos buscadores.

## 5. Planos e direitos (simulados)

- Unidade de direito = **módulo** (`plan_modules`: base, training_full, nutrition_full, chef_full; preços demonstrativos editáveis). `plans` são pacotes de apresentação. `module_dependencies` configuráveis (FULL **não** exige Base por padrão).
- `simulated_subscriptions` (1 por usuário, ciclo de 30 dias, renovação simulada idempotente em `sync_subscription`), `subscription_modules` (upgrade imediato; downgrade agendado para o fim do período; cancelamento mantém acesso até o fim).
- Comércio é independente de assinatura: qualquer usuário autenticado pode fazer pedido de teste.

## 6. Comércio demonstrativo

- `products` (publicação direta pelo fornecedor; moderação posterior pelo admin: `clear | hidden | suspended`; fornecedor não altera moderação — guard de coluna). `product_versions` guarda antes/depois; mudança **significativa** (título, categoria, tipo, atributos, ficha alimentar) suspende automaticamente `content_product_links` validados; preço/disponibilidade só são auditados.
- Carrinho multi-fornecedor → `checkout_cart` revalida (disponível, moderação, fornecedor ativo, preço esperado) e congela snapshots em `test_orders` / `test_order_items` / `test_fulfillments` (uma remessa por operação). Destinos fictícios (`demo_destinations`) e frete por regra (`demo_shipping_rules`).
- Máquina de estados (`fulfillment_transition`): fornecedor `awaiting → preparing → ready_for_dispatch` (+ cancelar); sistema `ready_for_dispatch → in_transit → delivered|failed` (`advance_simulated_transport`); admin tudo. Fornecedor nunca marca entrega.
- Retenção: pedidos ligados ao usuário por 90 dias → anonimização (`run_retention`), com `retention_exceptions` documentadas.

### 6.1 Operação dos fornecedores pelo admin (0053)

Decisão do responsável: sem cadastro/login de fornecedor por enquanto; o admin faz tudo o que o portal fazia, sem perder nada do admin. Não há contexto "agindo como fornecedor" (como o `x-acting-hero` da 0045): as políticas e RPCs do fornecedor já aceitam `is_admin()` (insert/update de `products`, update de `seller_organizations`, leitura de remessas/itens/eventos, `fulfillment_transition` com ator `admin` e as transições do fornecedor e do sistema). As telas filtram pela organização da URL; as ações do admin (`src/app/admin/sellers/product-actions.ts`, `transitionFulfillmentAction`) exigem papel admin. A 0053 só acrescenta a trilha: gatilho `admin_seller_ops_audit` (security definer, sem execute para anon/authenticated; S14 segue com 17) grava `products.insert`/`products.update` (só os campos alterados; moderação continua em `product.moderate`) e `fulfillment.transition` (antes/depois, organização, pedido, observação). O cadastro da organização já era auditado (0012). As telas do portal viraram componentes compartilhados (`src/components/commerce/seller/views/*`) usados pelo `/seller` (guardado) e pelo admin.

## 7. Recomendações

`src/lib/recommendations`: candidatos = catálogo publicado e com regra de acesso, menos concluídos e "não me interessa". Motor determinístico (interesses, afinidade de pilar, dificuldade, destaque, diversidade) sempre disponível e **identificado como fallback**; OpenAI/Gemini só com chave, saída JSON validada contra o catálogo, sem PII, com kill switch (`ai.enabled`), provedor (`ai.provider`) e rate limit por usuário. Persistência em `user_recommendations` via service role; métricas em `recommendation_runs`.

## 7.1 Hoje com relógio (`docs/decisions/hoje-relogio.md`)

- **F1 + F2 implementadas (22/10/2026), sem tabela nova nem dado de saúde gravado.** O "Hoje" do Perfil mostra só o que o relógio mede sozinho: nada é digitado (Hidratação, Descanso e "Adicionar item" saíram; as chaves locais `uh:today:*` são apagadas uma vez). Os Lembretes ficam em Perfil › Lembretes (`/profile/lembretes`), fora do Hoje (Q5). As contas demo veem um **relógio simulado** determinístico, gerado na hora no servidor a partir da persona e da data local (`src/lib/wearables/demo.ts`), nunca gravado: blocos "Sua noite" e "Seu dia até agora · até HH:MM", detalhe por categoria em `/profile/today/[categoria]` com tendência de 7/30 dias e "Sobre seus dados". As contas reais veem "Conectar relógio — em breve" e "Ver um exemplo". Catálogo de métricas em `src/lib/wearables/catalog.ts` (só automáticas, de treino ou calculadas; os testes falham se aparecer água, peso, humor etc.). O fuso vem do aparelho (`TimezoneSync`, que atualiza a tela quando o fuso muda); os E2E rodam em `America/Sao_Paulo`.
- **F3 + F4 (relógio real: Garmin, Oura, WHOOP e Polar) desenvolvidas e ocultas** no projeto único (decisão do dono: sem ambiente novo); 0038 e 0039 aplicadas vazias no remoto. Dados de saúde num schema `health` **fora da API**, sem usage para `anon`, `authenticated` nem `service_role`; só o papel `health_ingest` (NOLOGIN, sem bypassrls) escreve e a pessoa lê por RPCs. Consentimento por categoria com texto arquivado (`consent_version='2026-10-draft-1'`, 18+ por autodeclaração), `/profile/devices`, revogação, retenção de 13 meses e auditoria; contas demo não conectam (servidor e banco recusam). Apple Watch e Health Connect só com app nativo nas lojas (F5a/F5b). Antes de qualquer dado real: política e `legal.json` revisadas, **encarregado nomeado e publicado**, RIPD, Vercel Pro (o Supabase já é Pro), os apps de desenvolvedor das marcas com as variáveis, a conta demo sem o papel admin (Q16) e o token da Cloudflare trocado; o passo a passo está na seção "Roteiro de ligar" de `docs/decisions/hoje-relogio.md`.
- **Código do relógio real** (`src/lib/health/*`): um adaptador por marca em `adapters/` (`garmin.ts`, `oura.ts`, `whoop.ts`, `polar.ts`), OAuth com `state` e PKCE (S256, só na Garmin) guardados num cookie assinado em `oauth.ts`, webhooks conferidos em `webhooks.ts` (HMAC na Oura, WHOOP e Polar; token de caminho na Garmin) e gravação no schema `health` só pela conexão do papel `health_ingest` (`db.ts`). Duas travas mantêm tudo desligado: a chave `WEARABLES_REAL_ENABLED` (`config.ts`), desligada na Vercel, e `health.config` com `connect_open='false'` no banco; com elas, `health_consent_grant` devolve `health_disabled` (conta não demo) ou `demo_account_cannot_connect` (conta demo).

## 8. Observabilidade, auditoria e segurança

- `admin_audit` (ator, ação, recurso, antes/depois, justificativa) alimentado pelas RPCs administrativas e por triggers relevantes. Retenção 365 dias.
- `analytics_events` (sem PII — a função rejeita chaves suspeitas; 90 dias). `feedback` opcional e contextual. `recommendation_runs` 30 dias.
- RLS em 100% das tabelas; funções `security definer` com `search_path` fixo; guards de coluna por papel; `app.trusted` transacional só para RPCs confiáveis (não exposto à API).
- Chaves: `NEXT_PUBLIC_*` só publicáveis; `SUPABASE_SERVICE_ROLE_KEY` apenas em rotinas de servidor (`src/lib/supabase/admin.ts`).
- Testes: `npm run test:rls` executa `supabase/tests/rls_scenarios.sql` num Postgres local isolado (991 asserções em 23/10/2026, S0–S51; contagens e mapa em `docs/testing.md`).
- Banco local com as 38 migrações (0001–0039, sem 0034): 85 tabelas em `public`, todas com RLS, 137 políticas em `public`, 184 funções em `public` e 12 tabelas no schema `health`, fora da API; o visitante executa 17 funções `security definer` (a lista fixa do S14, que não cresce). O remoto está igual (39 registros em `supabase_migrations.schema_migrations`, nada pendente).

## 9. Ambientes

| Ambiente | Banco | Observação |
|---|---|---|
| Local (dev/testes) | PostgreSQL 16 + `supabase/local/shim_supabase.sql` | `npm run db:local:reset`, `npm run db:types` |
| Experimento (atual) | projeto Supabase `ultra-hero` (sa-east-1) | Um só projeto, por decisão do dono (Q17 revista em 23/10/2026: sem ambiente novo); o relógio real fica oculto atrás de `WEARABLES_REAL_ENABLED`. A recomendação original (criar `ultra-hero-staging` e `ultra-hero-prod`) não foi adotada e fica como registro |
| Vercel | produção = branch `master` | previews por PR |

## 10. Limitações conhecidas da POC

- Vídeo: o herói envia vídeos curtos pelo Cloudflare Stream (posts e receitas); conteúdos do seed seguem com embeds e player de demonstração; Mux existe só como interface (ADR-001).
- IA depende de chaves; sem elas tudo é fallback determinístico (ADR-002).
- Cron na Vercel Hobby é diário; o transporte simulado também avança sob demanda ao abrir pedidos.
- Sem notificações push/in-app, sem pagamentos, sem logística real, sem comunidade.
