# Groscove Ultra (antes Ultra Hero) — POC

PWA mobile-first de conteúdo, hábitos, treino, nutrição e gastronomia com **seis heróis reais** (Neymar, Gabriel Medina, João Fonseca, Anitta, Ronaldinho Gaúcho e Érick Jacquin; uso de nome e imagem sob contrato informado pelo responsável), programas, evolução, **assinaturas simuladas** e **comércio demonstrativo**. Nenhum pagamento ou entrega real.

Stack aprovada: **Next.js 15 + TypeScript** · **Supabase** (Postgres/RLS/Auth/Storage) · **Vercel**. Idiomas: pt-BR (padrão), en, es.

- Arquitetura, estados e permissões: [`docs/architecture.md`](docs/architecture.md)
- Decisões técnicas: [`docs/decisions/`](docs/decisions/) (vídeo, IA, módulo de receitas, prateleiras de programas, Hoje com relógio)
- Privacidade/retenção: [`docs/privacy-and-retention.md`](docs/privacy-and-retention.md)
- Checklist de lançamento: [`docs/launch-checklist.md`](docs/launch-checklist.md)

## App nas lojas (Groscove Ultra)

A mesma web vai para a App Store e o Google Play numa casca Expo em [`mobile/`](mobile/README.md): no app, comércio, planos e textos de demonstração não aparecem, o login usa Google pelo navegador do sistema e Sign in with Apple, e há push para posts de heróis favoritos, conquistas, programas concluídos e lembrete de sequência ([`docs/decisions/push-notifications.md`](docs/decisions/push-notifications.md)). Decisão: [`docs/decisions/app-nas-lojas.md`](docs/decisions/app-nas-lojas.md). Roteiro de publicação: [`docs/lojas.md`](docs/lojas.md).

## Como rodar

```bash
cp .env.example .env.local        # preencha NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (e opcionais)
npm install
npm run dev                        # http://localhost:3000
```

### Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` · `npm run lint` | TypeScript estrito · ESLint |
| `npm run messages:check` | Garante árvores de tradução e placeholders idênticos (pt-BR/en/es): 25 namespaces, 5.798 chaves por idioma |
| `npm run test` | Vitest: 1.836 aprovados + 1 pulado em 86 arquivos (85 aprovados + 1 pulado; 30/10/2026) |
| `npm run test:rls` | 1.523 asserções de RLS/regras de negócio (S0–S67; 30/10/2026, migrações até a 0057) num Postgres local isolado (`LOCAL_DB_NAME` escolhe o banco) |
| `npm run test:e2e` (use `PLAYWRIGHT_CHROMIUM_PATH` para reutilizar um Chromium já instalado e `E2E_BASE_URL` para um servidor já ativo) | Playwright (Pixel 7 + Desktop Chrome) + axe, com as contas demo: 522 testes em 44 specs (30/10/2026); detalhes em `docs/testing.md` |
| `npm run db:local:reset` | Sobe Postgres 16 local com shim Supabase + todas as migrations + seed |
| `npm run db:types` | Regenera `src/lib/supabase/database.types.ts` a partir do banco local |
| `npm run eval:recommendations` | Compara motores de recomendação (determinístico vs provedores com chave) |
| `npm run icons` | Regenera ícones PWA (PNG) a partir da marca |
| `npm run check` | typecheck + lint + mensagens + testes |

### Vocabulário

Na interface, o papel `creator` (quem assina conteúdos e programas) aparece como **herói** em pt-BR, en e es, conforme o DMR 1.0. É um termo de papel, sem flexão de gênero. Código, tabelas (`creator_profiles`) e rotas (`/personalities`, `/creator`) mantêm os nomes originais; a documentação técnica ainda usa "personalidade" para esses identificadores.

### Banco de dados

Migrations versionadas em `supabase/migrations/0001…0057*.sql` (57 arquivos: não há 0034 e existe a 0044b; aplicar **em ordem**). Da 0040 em diante: `0040_list_items_products_programs`, `0041_favorites_products_programs`, `0042_hero_cover_photos`, `0043_post_photos`, `0044_real_heroes` + `0044b_profile_avatars_real_heroes`, `0045_admin_hero_publishing`, `0046_quick_signup`, `0047_shop_filters`, `0048_program_concept`, `0049_hero_categories`, `0050_hero_library_tabs`, `0051_alimentacao`, `0052_hero_scoped_showcase`, `0053_admin_seller_ops`, `0054_push_notifications`, `0055_fix_counters_embed`, `0056_hero_follows_compare` e `0057_collectibles_auctions`. Situação registrada em 23/10/2026 (até a 0039): todas aplicadas em produção, 39 registros em `supabase_migrations.schema_migrations` (o remoto sempre teve 1 registro a mais que os arquivos); confira as posteriores com `remote-apply.mjs --dry`. Mais antigas, em destaque: `0036_recipe_delete_archived.sql` (o herói exclui de vez a receita que ele arquivou; `docs/decisions/recipes-module.md`, seção "Fase 6"), `0037_streak_contents_only.sql` (a sequência conta só conteúdos concluídos e entradas em programas; Lembretes não contam) e `0038_health_foundation.sql` + `0039_health_ingest.sql` (schema `health` do relógio real, fora da API, aplicadas vazias; ver `WEARABLES_REAL_ENABLED` abaixo). Seed determinístico e reexecutável em `0008_seed.sql` (8 personalidades fictícias, 40 conteúdos, 8 programas, 24 produtos, 4 operações, destinos fictícios, planos/módulos, conquistas, interesses). A `0035_program_shelves_seed.sql` acrescenta 16 programas de demonstração (24 no total, 3 por herói; ver `docs/decisions/program-shelves.md`). A `0044_real_heroes.sql` troca os personagens pelas seis pessoas reais (mesmas linhas, slugs novos) e tira do app, de forma reversível, os dois personagens restantes (perfil suspenso, conteúdo arquivado ou passado ao dono do programa que o usava; auditoria `hero.removed`): no fim ficam 6 heróis, 38 conteúdos no ar e 18 programas publicados. Fotos e licenças em `docs/photo-credits.md`. A `0054_push_notifications.sql` cria herói favorito, tokens de push, a fila de envio e os gatilhos dos avisos (`docs/decisions/push-notifications.md`); aplicar depois do merge.

Aplicar no projeto Supabase remoto:

```bash
# via Management API (recomendado): token em https://supabase.com/dashboard/account/tokens
SUPABASE_ACCESS_TOKEN=... node scripts/db/remote-apply.mjs            # aplica o que falta
SUPABASE_ACCESS_TOKEN=... node scripts/db/remote-apply.mjs --dry      # só lista
```

Ou cole cada arquivo no SQL Editor do Supabase, na ordem. O admin inicial é definido por `app_settings.bootstrap_admin_emails` (seed) e aplicado no primeiro login.

### Variáveis de ambiente

Veja [`.env.example`](.env.example). Resumo:

| Variável | Obrigatória | Onde |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sim | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | para recomendações persistidas, cron, contas demo | servidor apenas (Vercel) |
| `CRON_SECRET` | para `/api/cron/*` | Vercel |
| `NEXT_PUBLIC_SITE_URL` | recomendada | URL pública |
| `OPENAI_API_KEY` / `GEMINI_API_KEY` | opcional | sem elas: fallback determinístico, identificado |
| `CLOUDFLARE_*`, `VIDEO_PROVIDER` (Cloudflare Stream) | para o herói enviar vídeo (posts e receitas) | servidor; ligadas na Vercel (produção). Sem elas, o novo post mostra "Vídeo ainda não configurado". Mux só como interface |
| `EXPO_ACCESS_TOKEN` | não: só com a "segurança reforçada" do push ligada no projeto Expo | servidor (Vercel). O push do app das lojas (`docs/decisions/push-notifications.md`) sai pelo cron `/api/cron/push` (22:00 UTC) e logo depois de publicar um post ou concluir um conteúdo |
| `WEARABLES_REAL_ENABLED` (e as variáveis das marcas no `.env.example`) | não: relógio real (Garmin, Oura, WHOOP, Polar) pronto e oculto | desligada na Vercel; no banco, trava `connect_open = 'false'` em `health.config`. Para ligar: `docs/decisions/hoje-relogio.md`, seção "Roteiro de ligar" |

Google OAuth: configurar em Supabase → Authentication → Providers → Google (callback `https://<ref>.supabase.co/auth/v1/callback`).

## Papéis e acesso

| Papel | Como obtém | O que pode |
|---|---|---|
| Visitante | — | explorar catálogo, programas e perfis públicos |
| Consumidor | cadastro público (nível gratuito) | consumir conteúdo liberado, listas, progresso, assinatura simulada, pedidos de teste |
| Personalidade | convite + ativação pelo admin | rascunhos, submissão para revisão, sugestão de vínculo com produto |
| Fornecedor | convite + ativação pelo admin | **desligado por enquanto** (0053): o portal `/seller` não abre e a conta demo do fornecedor saiu do painel; produtos, remessas e perfil das organizações são operados pelo admin em `/admin/sellers/[id]` (abas Visão geral, Produtos, Remessas, Organização) e `/admin/shipments`. Contas e dados mantidos; religar = `SELLER_PORTAL_ENABLED` em `src/lib/seller-ops/portal.ts` |
| Admin | bootstrap/concessão auditada | tudo, com confirmação e trilha de auditoria (inclui a operação dos fornecedores: escritas em produtos e transições de remessa vão para `admin_audit`, 0053) |

Autorização é aplicada em **PostgreSQL (RLS + funções `security definer`)**; a interface só reflete.

## O que há no app agora (30/10/2026)

- **Heróis com categorias e atalhos** (0049/0050/0052): a página do herói segue o Instagram (foto, números, Seguir, bio, atalhos redondos e a grade de posts 3 por linha); os atalhos (Dia a dia, Alimentação, Treinos, Gastronomia, Programas, Produtos) são configurados pelo admin por categoria e por herói, com rótulo nos 3 idiomas, e cada um abre a biblioteca do herói só com o que é dele. Capa de vídeo que não carrega vira o placeholder da marca com play.
- **Alimentação** (0051): receitas do chef que assina e as que ele indica, "Comprar pronto", lista de compras ligada ao comércio de teste e indicadores.
- **Colecionáveis** (0057): lances ao vivo em itens assinados, sem pagamento online (quem arremata vê "Você arrematou!" e a equipe faz o contato), dentro de Comprar, com **Minhas compras** (`/shop/compras`: pedidos de teste e "Lances e arremates"; `/orders` leva para lá).
- **Seguir e comparação** (0054/0056): seguir heróis (contagem pública de seguidores, push no app), Início com "Seguindo | Todos", Heróis que sigo e o "Você vs Hero" com referências definidas pelo admin.
- **Fornecedor no admin** (0053): o portal `/seller` está desligado; produtos, remessas e organização dos fornecedores são operados pelo admin em `/admin/sellers/[id]` e `/admin/shipments`, com auditoria.
- **Hoje em cards**: Seu dia, Sua noite e Evolução em 3 cards com telas deslizantes.
- **Programa em cards** (0048): Conceito, Prepare-se, Conteúdo e Nutricional em 4 cards com telas em sequência.

## Módulos

- **Consumidor**: Início (curadoria → recomendações), Explorar (busca, filtros, programas, produtos, listas), Heróis (hub de bibliotecas por herói), Conteúdo (gate server-side, player abstrato, conclusão, favoritos), Programas (versionados, substituições, certificado simbólico em PDF), Perfil (portais no topo para quem tem papel de herói, fornecedor ou admin, como a primeira opção de toque; "Hoje — Seu dia, em foco" só com o que o relógio mede, sem nada digitado: relógio simulado nas contas demo, "Conectar relógio — em breve" e "Ver um exemplo" nas contas reais, detalhe por categoria em `/profile/today/[categoria]`; "Continue seus programas" depois da Evolução; Evolução com streak (só conteúdos concluídos e entradas em programas; Lembretes não contam, 0037) e conquistas em `/profile/evolution`; Lembretes em Perfil › Lembretes, fora do Hoje; para o herói, o topo do Perfil segue o Instagram (foto, nome, headline e bio públicos, Portal do herói logo abaixo, botões "Editar perfil" e "Ver página pública"); "Editar perfil" abre na mesma tela o editor recolhível (avatar, headline, bio, capa, redes, especialidades e credenciais de chef, nota de direitos), e o herói ativo tem um avatar só (foto ou ilustração, igual no app e na página pública); planos simulados, interesses, conta/exclusão). A barra inferior tem 4 abas: Início, Explorar, Heróis e Perfil, Loja/carrinho/checkout/pedidos **de teste**.
- **Receitas**: catálogo em Explorar › Receitas, página da receita com porções, checklist e Modo Cozinha, Minha coleção, lista de compras ligada ao comércio de teste e, no portal do herói, Minhas Receitas com editor em 6 etapas, versões, publicação direta (revisão por tipo desligada) e exclusão da receita arquivada (`docs/decisions/recipes-module.md`).
- **Portais**: Herói (`/creator`; o perfil público saiu do portal e mora no Perfil, `/creator/profile` redireciona para `/profile#perfil-publico`, que abre o editor), Fornecedor (`/seller`, desligado por enquanto: a operação mora em `/admin/sellers` e `/admin/shipments`), Administração (`/admin`).
- **Sistema**: cron diário (transporte simulado, retenção, renovações), certificados, recomendações.

## Limitações da simulação

- Preços, planos, frete, destinos e entregas são fictícios e rotulados.
- Vídeo: o herói envia vídeos curtos pelo Cloudflare Stream (posts e receitas; ligado em produção); os conteúdos do seed seguem com embeds (YouTube/Vimeo) e player de demonstração; URL assinada para premium e legendas ainda não existem; Mux existe só como interface (ADR-001).
- IA: só com chave; fallback determinístico sempre identificado (ADR-002).
- Sem notificações push, pagamentos, logística, comunidade ou aconselhamento clínico.

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| "temporariamente indisponível" num conteúdo publicado | sem `access_level` | admin define regra de acesso |
| Conteúdo premium visível mas bloqueado | sem módulo ativo | esperado; `/profile/plan` |
| `protected_column: x` | coluna só para admin/sistema | usar a RPC correspondente |
| `cart_changed: [...]` no checkout | preço/disponibilidade mudou | UI pede confirmação |
| Recomendações marcadas como fallback | sem chave ou kill switch | `/admin/settings` |
| `npm run test:rls` falha em `citext` | search_path local | o script já define `public, extensions` |
| Cadastro recusado ("Database error saving new user" / `experiment_closed`) | `experiment.open` desligado e e-mail sem convite pendente | criar convite para o e-mail ou religar em `/admin/settings` |
| Usuário não consegue entrar após suspensão | conta suspensa (ban no Auth) | `/admin/users/<id>` → Reativar conta |

## Licenças e direitos

Os heróis são as seis pessoas reais citadas acima (fotos de licença livre, créditos em `docs/photo-credits.md`). Fornecedores de exemplo e destinos são fictícios e identificados como tal.
