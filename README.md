# Ultra Hero — POC

PWA mobile-first de conteúdo, hábitos, treino, nutrição e gastronomia com **personalidades fictícias**, programas, evolução, **assinaturas simuladas** e **comércio demonstrativo**. Nenhum pagamento, entrega ou parceria real.

Stack aprovada: **Next.js 15 + TypeScript** · **Supabase** (Postgres/RLS/Auth/Storage) · **Vercel**. Idiomas: pt-BR (padrão), en, es.

- Arquitetura, estados e permissões: [`docs/architecture.md`](docs/architecture.md)
- Decisões técnicas: [`docs/decisions/`](docs/decisions/) (vídeo, IA)
- Privacidade/retenção: [`docs/privacy-and-retention.md`](docs/privacy-and-retention.md)
- Checklist de lançamento: [`docs/launch-checklist.md`](docs/launch-checklist.md)

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
| `npm run messages:check` | Garante árvores de tradução idênticas (pt-BR/en/es) |
| `npm run test` | Vitest (lógica pura) |
| `npm run test:rls` | 152 cenários de RLS/regras de negócio num Postgres local isolado |
| `npm run test:e2e` (use `PLAYWRIGHT_CHROMIUM_PATH` para reutilizar um Chromium já instalado) | Playwright (mobile + desktop) + axe |
| `npm run db:local:reset` | Sobe Postgres 16 local com shim Supabase + todas as migrations + seed |
| `npm run db:types` | Regenera `src/lib/supabase/database.types.ts` a partir do banco local |
| `npm run eval:recommendations` | Compara motores de recomendação (determinístico vs provedores com chave) |
| `npm run icons` | Regenera ícones PWA (PNG) a partir da marca |
| `npm run check` | typecheck + lint + mensagens + testes |

### Banco de dados

Migrations versionadas em `supabase/migrations/0001…0010*.sql` (aplicar **em ordem**). Seed determinístico e reexecutável em `0008_seed.sql` (8 personalidades fictícias, 40 conteúdos, 8 programas, 24 produtos, 4 operações, destinos fictícios, planos/módulos, conquistas, interesses).

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
| Cloudflare Stream / Mux | opcional | POC usa embeds + player demo |

Google OAuth: configurar em Supabase → Authentication → Providers → Google (callback `https://<ref>.supabase.co/auth/v1/callback`).

## Papéis e acesso

| Papel | Como obtém | O que pode |
|---|---|---|
| Visitante | — | explorar catálogo, programas e perfis públicos |
| Consumidor | cadastro público (nível gratuito) | consumir conteúdo liberado, listas, progresso, assinatura simulada, pedidos de teste |
| Personalidade | convite + ativação pelo admin | rascunhos, submissão para revisão, sugestão de vínculo com produto |
| Fornecedor | convite + ativação pelo admin | produtos da própria operação, preparação das próprias remessas |
| Admin | bootstrap/concessão auditada | tudo, com confirmação e trilha de auditoria |

Autorização é aplicada em **PostgreSQL (RLS + funções `security definer`)**; a interface só reflete.

## Módulos

- **Consumidor**: Início (curadoria → recomendações), Explorar (busca, filtros, programas, produtos, listas), Personalidades, Conteúdo (gate server-side, player abstrato, conclusão, favoritos), Programas (versionados, substituições, certificado simbólico em PDF), Evolução (streak, conquistas), Perfil (planos simulados, interesses, conta/exclusão), Loja/carrinho/checkout/pedidos **de teste**.
- **Portais**: Personalidade (`/creator`), Fornecedor (`/seller`), Administração (`/admin`).
- **Sistema**: cron diário (transporte simulado, retenção, renovações), certificados, recomendações.

## Limitações da simulação

- Preços, planos, frete, destinos e entregas são fictícios e rotulados.
- Vídeo: embeds (YouTube/Vimeo) e player de demonstração; Cloudflare Stream/Mux são adaptadores não configurados (ADR-001).
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

Nenhuma imagem, nome ou marca real. Placeholders são SVGs próprios. Personalidades, fornecedores e produtos são fictícios e identificados como tal.
