# Estratégia de testes — POC Ultra Hero

| Camada | Ferramenta | Comando | O que cobre |
|---|---|---|---|
| Regras de negócio + RLS | SQL (psql) em Postgres local isolado | `npm run test:rls` | 155 asserções: visitante, consumidor gratuito, direitos de acesso/assinatura simulada, convites, fluxo editorial, isolamento entre fornecedores, moderação, suspensão de vínculos, checkout multi-fornecedor com snapshots, máquina de estados de remessas, kill switch, programas versionados/substituição/certificado, analytics sem PII, feedback, exclusão de conta, retenção, portão do experimento (`experiment.open`), suspensão auditada de contas |
| Unitários | Vitest | `npm run test` | formatação, helpers, motor determinístico de recomendações, validações Zod |
| E2E + acessibilidade | Playwright (Pixel 7 + Desktop Chrome) + axe | `npm run test:e2e` | rotas públicas sem violações sérias de WCAG 2.x A/AA, navegação por teclado, troca de idioma, redirecionamentos de rotas protegidas, sinalização de demonstração |
| Tipos e estilo | tsc, eslint, check-messages | `npm run check` | projeto inteiro |

## Como rodar os E2E

`npm run build && npm run test:e2e` (o Playwright sobe `next start -p 3100`; com `E2E_BASE_URL` ele usa um servidor já ativo). Em ambientes com Chromium pré-instalado e sem acesso para baixar navegadores, aponte `PLAYWRIGHT_CHROMIUM_PATH=/caminho/para/chromium`.

Última execução registrada (20/10/2026, build de produção local, projetos Pixel 7 + Desktop Chrome): **26/26 aprovados** — axe sem violações sérias/críticas em `/`, `/explore`, `/personalities`, `/login`, `/signup`, `/shop`, `/offline`; navegação por teclado com `aria-current`; troca de idioma; checkout e rotas protegidas redirecionam para login; sinalização de demonstração. Correções feitas a partir da varredura: contraste do token `fg-subtle` (3,3:1 → ≥4,6:1 nos dois temas) e nome acessível do logotipo contendo o texto visível (WCAG 2.5.3).

## Como o teste de RLS funciona

`scripts/db/test-rls.sh` recria `ultra_hero_test` (shim Supabase + migrations + seed) e executa `supabase/tests/rls_scenarios.sql` numa única transação (rollback no fim). Papéis são simulados exatamente como o PostgREST faz: `set role authenticated|anon` + `request.jwt.claims`. Funções `tests.ok` e `tests.expect_error` imprimem `PASS` ou abortam.

Para adicionar um cenário: copie um bloco `S<n>`, crie usuários em `auth.users` se precisar, e use `tests.login(uid, email)`.

## Mapa dos critérios de aceite → evidência

| Critério (prompt mestre §13) | Onde é verificado |
|---|---|
| Visitante explora, mas não consome nem confirma pedido | RLS S1; E2E `journeys.spec.ts` |
| Gratuito consome liberado e faz pedido de teste | RLS S2, S8 |
| Premium visível, bloqueado no servidor; dependências FULL configuráveis | RLS S2, S3 |
| Convites válidos/inválidos/expirados | RLS S4 |
| Personalidade submete → admin aprova → sugere produto → admin valida | RLS S5 |
| Fornecedor publica direto; admin suspende; fornecedor não reativa | RLS S6 |
| Mudança significativa suspende vínculo; conteúdo intacto | RLS S7 |
| Carrinho próprio + parceiro → 1 pedido, remessas independentes, snapshots | RLS S8 |
| Fornecedor A não lê B; ninguém marca entrega sozinho | RLS S8 |
| Checkout rejeita indisponível/suspenso e revalida | RLS S2, S6, S8 |
| Frete/destino/pagamento fictícios; nenhum serviço externo | por construção (sem adapters reais) + rótulos na UI (E2E) |
| Versões, histórico e certificados; arquivado não destrói progresso | RLS S9 |
| Exclusão de conta, retenção 90/30/365, anonimização | RLS S11 |
| Cadastro fechado (`experiment.open` = false) só aceita convite pendente, bootstrap ou conta demo criada pelo admin (marcador em app_metadata, nunca em user_metadata) | RLS S12 |
| Suspensão/reativação de conta auditada (justificativa; nunca a si mesmo nem admin) | RLS S13 + `tests/unit/experiment-gate.test.ts` |
| pt-BR/en/es, teclado, foco, contraste, legendas, erros, responsivo | `check-messages`, E2E axe/teclado, revisão manual (checklist) |
| Dashboard separa interesse, pedido de teste e receita real | RLS S10 (`admin_metrics`) |

## Contas de teste

Não há senhas no seed. Para testar portais no ambiente remoto: admin cria convites (`/admin/invitations`) ou provisiona contas demo (`/admin/settings`, exige service role no servidor). O primeiro login do e-mail de bootstrap recebe papel admin.

## O que ainda não é automatizado

- Fluxos autenticados ponta a ponta no navegador (login real) — dependem de contas no ambiente de execução dos E2E.
- Comparação real OpenAI vs Gemini — `npm run eval:recommendations` roda os cenários com o motor determinístico e só compara provedores quando há chaves.
- Auditoria completa WCAG 2.2 AA — axe cobre uma parte; o restante está no `docs/launch-checklist.md` para verificação manual.
