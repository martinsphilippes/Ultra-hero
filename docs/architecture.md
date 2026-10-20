# Ultra Hero — Arquitetura da POC

> Status: POC/experimento público. Tudo que envolve dinheiro, entrega e parcerias é **simulado**. Personalidades são **fictícias**.

## 1. Visão geral

| Camada | Tecnologia | Papel |
|---|---|---|
| App | Next.js 15 (App Router, RSC, Server Actions), React 19, TypeScript strict, Tailwind v4, next-intl | PWA mobile-first, pt-BR/en/es, tema escuro/claro/sistema |
| Dados | Supabase Postgres 17 + RLS + funções `security definer` | Fonte única de verdade para autorização e regras de negócio |
| Auth | Supabase Auth (e-mail/senha, Google OAuth) | Cadastro público só para consumidores; parceiros por convite |
| Arquivos | Supabase Storage (preparado) | Uploads de mídia ficam atrás de `VideoProvider` |
| Deploy | Vercel (região `gru1`, perto do banco em `sa-east-1`) | Cron diário via `vercel.json` |
| IA | `RecommendationEngine` (determinístico / OpenAI / Gemini) | Só recomenda itens do catálogo; fallback explícito |

Princípio central: **o cliente nunca decide permissão, preço ou direito de acesso**. Toda escrita sensível passa por RPCs auditadas; toda leitura passa por RLS.

## 2. Módulos e rotas

| Área | Rotas | Quem acessa |
|---|---|---|
| Consumidor | `/`, `/explore`, `/personalities/*`, `/content/[slug]`, `/programs/[slug]`, `/evolution`, `/profile/*`, `/onboarding`, `/shop/*`, `/cart`, `/checkout`, `/orders/*`, `/verify/[code]` | visitante (catálogo) / consumidor logado (consumo, listas, pedidos de teste) |
| Portal da personalidade | `/creator/*` | papel `creator` por convite |
| Portal do fornecedor | `/seller/*` | papel `seller` por convite (escopo = organização) |
| Administração | `/admin/*` | papel `admin` (global) |
| Sistema | `/api/cron/{transport,retention,renewals}`, `/api/certificates/[code]` | cron (CRON_SECRET) / dono do certificado |

## 3. Identidade e papéis

- `profiles` (1:1 com `auth.users`), `role_assignments` (consumer/creator/seller/admin, com escopo), `creator_profiles`, `seller_organizations`, `seller_memberships`, `invitations` (token com hash SHA-256, uso único, expiração, revogação, e-mail precisa coincidir com a conta autenticada).
- Novo usuário → trigger `handle_new_user`: perfil + papel `consumer`. Admin de bootstrap: lista em `app_settings.bootstrap_admin_emails` (auditado). Nenhuma promoção por autoatendimento.
- Suspensão de parceiro (`partner_status`) revoga a operação (`my_creator_id()`/`my_seller_org_ids()` passam a ignorar) sem apagar histórico.

## 4. Conteúdo e programas

- `content` (metadados públicos) + `content_bodies` (corpo/mídia, **gate server-side** por `can_access_content`). Sem regra de acesso (`access_level is null`) → "temporariamente indisponível", nunca inferido.
- Fluxo editorial: `draft` → `submit_content_for_review` → `in_review` → admin decide `returned | approved (publica) | rejected`. Publicação exige regra de acesso + corpo.
- `content_localizations` por idioma com status; conteúdo não traduzido fica no idioma original com etiqueta.
- Programas: `programs` → `program_versions` (participante preso à versão em que entrou) → `program_items` (livre navegação, obrigatório/opcional). `program_item_substitutions` para item obrigatório arquivado (auditável; vale para todos os pendentes daquela versão). Conclusão emite `certificates` (snapshot congelado, código verificável, simbólico).
- Progresso: `completions` (única por conteúdo), `content_progress` (continuar), `streak_events` (data local calculada **no servidor** a partir do fuso do dispositivo), `achievements` configuráveis (regras JSON).

## 5. Planos e direitos (simulados)

- Unidade de direito = **módulo** (`plan_modules`: base, training_full, nutrition_full, chef_full; preços demonstrativos editáveis). `plans` são pacotes de apresentação. `module_dependencies` configuráveis (FULL **não** exige Base por padrão).
- `simulated_subscriptions` (1 por usuário, ciclo de 30 dias, renovação simulada idempotente em `sync_subscription`), `subscription_modules` (upgrade imediato; downgrade agendado para o fim do período; cancelamento mantém acesso até o fim).
- Comércio é independente de assinatura: qualquer usuário autenticado pode fazer pedido de teste.

## 6. Comércio demonstrativo

- `products` (publicação direta pelo fornecedor; moderação posterior pelo admin: `clear | hidden | suspended`; fornecedor não altera moderação — guard de coluna). `product_versions` guarda antes/depois; mudança **significativa** (título, categoria, tipo, atributos, ficha alimentar) suspende automaticamente `content_product_links` validados; preço/disponibilidade só são auditados.
- Carrinho multi-fornecedor → `checkout_cart` revalida (disponível, moderação, fornecedor ativo, preço esperado) e congela snapshots em `test_orders` / `test_order_items` / `test_fulfillments` (uma remessa por operação). Destinos fictícios (`demo_destinations`) e frete por regra (`demo_shipping_rules`).
- Máquina de estados (`fulfillment_transition`): fornecedor `awaiting → preparing → ready_for_dispatch` (+ cancelar); sistema `ready_for_dispatch → in_transit → delivered|failed` (`advance_simulated_transport`); admin tudo. Fornecedor nunca marca entrega.
- Retenção: pedidos ligados ao usuário por 90 dias → anonimização (`run_retention`), com `retention_exceptions` documentadas.

## 7. Recomendações

`src/lib/recommendations`: candidatos = catálogo publicado e com regra de acesso, menos concluídos e "não me interessa". Motor determinístico (interesses, afinidade de pilar, dificuldade, destaque, diversidade) sempre disponível e **identificado como fallback**; OpenAI/Gemini só com chave, saída JSON validada contra o catálogo, sem PII, com kill switch (`ai.enabled`), provedor (`ai.provider`) e rate limit por usuário. Persistência em `user_recommendations` via service role; métricas em `recommendation_runs`.

## 8. Observabilidade, auditoria e segurança

- `admin_audit` (ator, ação, recurso, antes/depois, justificativa) alimentado pelas RPCs administrativas e por triggers relevantes. Retenção 365 dias.
- `analytics_events` (sem PII — a função rejeita chaves suspeitas; 90 dias). `feedback` opcional e contextual. `recommendation_runs` 30 dias.
- RLS em 100% das tabelas; funções `security definer` com `search_path` fixo; guards de coluna por papel; `app.trusted` transacional só para RPCs confiáveis (não exposto à API).
- Chaves: `NEXT_PUBLIC_*` só publicáveis; `SUPABASE_SERVICE_ROLE_KEY` apenas em rotinas de servidor (`src/lib/supabase/admin.ts`).
- Testes: `npm run test:rls` executa `supabase/tests/rls_scenarios.sql` num Postgres local isolado (157 asserções cobrindo os critérios de aceite).

## 9. Ambientes

| Ambiente | Banco | Observação |
|---|---|---|
| Local (dev/testes) | PostgreSQL 16 + `supabase/local/shim_supabase.sql` | `npm run db:local:reset`, `npm run db:types` |
| Experimento (atual) | projeto Supabase `ultra-hero` (sa-east-1) | **Recomendação:** criar `ultra-hero-staging` e `ultra-hero-prod` antes da abertura pública |
| Vercel | produção = branch `master` | previews por PR |

## 10. Limitações conhecidas da POC

- Vídeo real (Cloudflare Stream/Mux) e upload não estão ligados: embeds + player de demonstração (ADR-001).
- IA depende de chaves; sem elas tudo é fallback determinístico (ADR-002).
- Cron na Vercel Hobby é diário; o transporte simulado também avança sob demanda ao abrir pedidos.
- Sem notificações push/in-app, sem pagamentos, sem logística real, sem comunidade.
