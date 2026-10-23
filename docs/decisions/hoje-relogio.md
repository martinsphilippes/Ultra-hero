# Documento de desenho — "Hoje — Seu dia, em foco" baseado em relógio

> Ultra Hero · PWA Next.js 15 + Supabase (sa-east-1) + Vercel (gru1) · pt-BR/en/es
> Data: 22/10/2026 · **Revisão 2** (incorpora as críticas das lentes 1 — fidelidade ao pedido/produto — e 2 — arquitetura, segurança e LGPD) · Status: **F1 e F2 no ar (22/10/2026); F3 e F4 (Garmin, Oura, WHOOP, Polar) prontas e testadas atrás da chave `WEARABLES_REAL_ENABLED`, desligada (23/10/2026) — não vão ao ar até jurídico, encarregado e custos (Q18)** · Autor: arquitetura/produto
> Base: pesquisas 1–4 (Apple, Garmin, outras marcas, integração/LGPD), as duas críticas, e leitura do código atual (`src/app/(app)/profile/page.tsx`, `profile/actions.ts`, `today-actions.ts`, `src/components/me/today/*`, `src/lib/routine/*`, `src/lib/demo/accounts.ts`, `src/lib/recommendations/recalculate.ts`, `supabase/migrations/0006_ops.sql`, `0016_hardening.sql`, `0022_routine_today.sql`, `messages/pt-BR/me.json`, `vercel.json`, `docs/privacy-and-retention.md`, `docs/architecture.md`) e do esquema do Open Wearables (código de terceiros, **não** é documentação oficial da Garmin/Oura).
> Convenções: **[NC]** = não confirmado em fonte oficial; **[CP]** = conhecimento prévio, não reverificado nesta pesquisa; **[EST]** = estimativa minha; **[OW]** = nome de campo visto no esquema do Open Wearables, não na especificação oficial (fechada).
> Fontes novas desta revisão: [Samsung — dados do Samsung Health no Health Connect (18/02/2025)](https://developer.samsung.com/health/blog/en/accessing-samsung-health-data-through-health-connect) · [Vercel Hobby](https://vercel.com/docs/plans/hobby) · [Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines) · [Supabase Backups](https://supabase.com/docs/guides/platform/backups) · [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) · [Supabase Roles](https://supabase.com/docs/guides/database/postgres/roles) · [Next.js static exports](https://nextjs.org/docs/app/guides/static-exports) · [fórum Apple sobre `inBed`](https://developer.apple.com/forums/thread/726278).

---

## Estado da implementação (F1 + F2) — leia antes do resto

Este documento é a referência do time. As fases **F1** (Hoje sem digitação) e **F2** (novo Hoje com relógio simulado) estão no ar; **F3 e F4** estão no código atrás da chave `WEARABLES_REAL_ENABLED` (desligada) — ver "Estado da implementação (F3 + F4)" abaixo. Nenhum dado de saúde é coletado enquanto a chave estiver desligada.

| O quê | Onde | Observação |
|---|---|---|
| Catálogo canônico (§13.1–13.3): código, categoria, seção do Hoje, unidade, agregação, modo A/T/C, status v1/v1d, modelos que medem, faixa plausível | `src/lib/wearables/catalog.ts`; nomes em `messages/<locale>/wearables.json` (`metrics.*`) | Só A/T/C e v1/v1d. Sob demanda, reguladas e digitadas ficam fora (listas só de texto para "Sobre seus dados"); `tests/unit/wearables-catalog.test.ts` falha se aparecer água, peso, humor, ciclo, RPE, calorias ingeridas etc. Caminho difere do §8.1 (`src/lib/health/`): o nome `health` fica reservado para a F3 |
| Linha de base e índices (§13.4): Disposição Ultra Hero, Sinais da noite, Carga do dia (TRIMP de Edwards), carga 7/28 dias, eficiência e regularidade do sono | `src/lib/wearables/derived.ts` | Mesmas funções servirão à ingestão real |
| Comparação de um dia parcial (RN-07) | `generateWatchDay` em `src/lib/wearables/demo.ts`; `usualRange` em `src/components/me/today/watch-helpers.ts` | O que acumula no dia (passos, kcal, zonas, Carga do dia, estresse, Body Battery…) é comparado com os 28 dias anteriores **cortados no mesmo horário** (`baselines`); a banda dos gráficos usa dias inteiros (`fullDayBaselines`). Metas do relógio, horários e cálculos nossos não mostram "faixa habitual"; a faixa respeita a escala plausível (Body Battery ≥ 5). Antes da sincronização da manhã, o Body Battery é o último de ontem, com a data dele, e médias/máximas "do dia" não aparecem |
| Gerador determinístico (§9.9) | `src/lib/wearables/demo.ts` (+ `context.ts`: quem vê qual Hoje, data/hora no fuso do perfil) | Persona por conta demo: **premium** = Apple Watch Series 12, **gratuito** = Garmin vívoactive 6, **herói** = Garmin fēnix 9, **fornecedor** = Galaxy Watch9 (Health Connect), **admin** = Apple Watch Series 11 (coluna SE 3/S9–S11), **"Ver um exemplo"** = Apple Watch Series 12 (semente própria). Difere da tabela do §9.9 (premium com Garmin + Oura): uma fonte por persona na F2; duas fontes ficam para quando houver a resolução do §9.6 |
| Hoje (§6.2/6.3) | `src/components/me/today/*` (`TodaySection`, `WatchToday`, `ConnectWatchCard`, `TrendChart`, `ContinuePrograms`, `LegacyTodayCleanup`) | Conta real: card "Conectar relógio" (marcas "Em breve", sem botão que finja conectar) + "Ver um exemplo" (`/profile/today?exemplo=1`, rótulo "Exemplo"). RF-02 previa só uma linha; o pedido da F2 pediu o card |
| Detalhe por categoria e "Sobre seus dados" | `/profile/today/[section]` (`readiness`, `sleep`, `vitals`, `activity`, `workouts`, `stress`, `environment`), `/profile/today/about` | Categoria que o modelo não mede responde 404. "Sinais da noite" (`vitals`) só tem leituras do sono; FC média/mín./máx./caminhando, VFC e respiração do dia ficam em Atividade (§6.4). Em dia sem treino, o card Treinos aparece compacto ("Nenhum treino hoje", último VO₂máx com a data, Carga do dia) e leva ao detalhe. O nome do app de sincronização vem de `wearables.syncApps` (Saúde/Health/Salud) e o texto fala no futuro, porque nenhuma conexão real existe |
| F1 | Hidratação, Descanso e "Adicionar item" removidos (componentes, `local-log.ts`, `today-actions.ts`); `uh:today:*` apagado do aparelho uma vez (marcador `uh:today:migrated`); sugestões de programa em "Continue seus programas", depois do card Evolução | **Sem migração**: `routine_items`/`routine_checks` ficam como estão (Q5 em aberto) e `compute_streak` continua contando as marcações antigas (Q10 em aberto). O aviso único e a exportação CSV dos itens (§5.10) ficam para quando Q5/Q10 forem respondidas |

**Respostas do responsável (23/10/2026):** Q1 sim, depois do jurídico e do encarregado · Q2 tem CNPJ, domínio e site · Q3 só Garmin, Oura, WHOOP e Polar (sem app nativo) · Q4 sem agregador · Q5 itens manuais vão para Lembretes, fora do Hoje · Q6 Hoje para todos · Q7 **outra regra, a definir** · Q8 sim, em "Sobre seus dados" · Q9 aprovado, sempre rotulado · Q10 só conteúdos agora; atividade do relógio quando houver relógio real · Q11 prazos aprovados · Q12 dicas de herói só para quem ligar (v2) · Q13 sob demanda fora; treino iniciado no relógio conta · Q14 passos só do relógio · Q15 reter o bruto da Garmin 30 dias · Q16 contas demo desligadas no projeto com dado real · Q17 produção nova + um de testes · Q18 **ainda não** · Q19 encarregado: pessoa da empresa · Q20 30 dias.

---

## Estado da implementação (F3 + F4) — pronto atrás da chave, NÃO publicado

Nada disso coleta dado enquanto `WEARABLES_REAL_ENABLED` não for `1` **e** a marca não tiver todas as variáveis. Com a chave desligada (padrão), o Hoje, o card "Conectar relógio" (tudo "Em breve") e as contas demo ficam exatamente como na F2; as rotas `/api/wearables/*` respondem 404 sem ler o corpo.

| O quê | Onde | Observação |
|---|---|---|
| Schema `health` fora da API, papel `health_ingest`, RLS, gatilhos, consentimento, conexões, credenciais, fila de revogações, métricas diárias, sono, treinos, inbox, auditoria, retenção, exclusão de conta | `supabase/migrations/0038_health_foundation.sql` | Sem grant para `anon`/`authenticated`/`service_role` nas tabelas (42501 provado no S43). A pessoa lê e age só por RPCs `public.*` `security definer` com `search_path` vazio, nenhuma executável por `anon` (lista do S14 inalterada) nem pela `service_role` (exceto `health_run_retention`, que só apaga) |
| Funções de ingestão (`connection_open`, `credentials_store`, `connection_set_status`, `event_receive/claim/finish`, `apply_batch`, `revocation_finish`) | `supabase/migrations/0039_health_ingest.sql` | `security invoker`, só `health_ingest` executa; idempotência em 3 níveis, `for share`, upsert condicional (RN-10) |
| Papel próprio | `health_ingest` criado **sem LOGIN** (a senha nunca vai ao repositório) | No projeto novo: `alter role health_ingest with login password '…'` e `HEALTH_INGEST_DATABASE_URL` com o usuário `health_ingest.<ref>` no pooler (Supavisor, modo transação, sem prepared statements). [NC] confirmar no projeto que o Supavisor aceita o papel próprio; **alternativa mais restrita se não aceitar:** conexão direta (porta 5432) com o MESMO papel — nunca `service_role` |
| Cifra dos tokens | `src/lib/health/crypto.ts` | AES-256-GCM na aplicação, nonce de 96 bits, AAD = conexão + versão, chave `WEARABLE_TOKEN_KEY_V{n}` **só na Vercel**. Vault/pgsodium descartado: a chave moraria no mesmo banco que o dado cifrado |
| Consentimento | `health.consent_texts` (imutável, hash no servidor), `health.consents` (`subject_ref` = HMAC do id; a prova sobrevive à exclusão), idade mínima configurável em `health.config.min_age` (padrão 18, `min_age_rule_pending = true` — Q7) | Texto **rascunho** `2026-10-draft-1`; o final entra por migração nova. Rascunho legal em `docs/legal-drafts/health-consent.md` |
| Adaptadores puros + listas permitidas | `src/lib/health/adapters/{garmin,oura,whoop,polar}.ts` | Fixtures em `tests/fixtures/wearables/*.ts` (URL da documentação de cada marca no arquivo). Teste falha se água, calorias ingeridas, peso/composição, humor, ciclo, esforço percebido, tags, sob demanda ou treino manual/upload entrarem |
| Normalizador, dedup (§9.6), Hoje real | `src/lib/health/{normalize,dedup,snapshot}.ts` | O Hoje real usa os **mesmos** cards, detalhes e funções de `derived.ts` do simulado; o que acumula no dia não tem faixa habitual enquanto o dia é parcial (sem curva intradiária, F6) |
| OAuth (state + PKCE em cookie assinado), webhooks assinados, anti-SSRF | `src/app/api/wearables/[provider]/{connect,callback,webhook/[[...token]]}`, `src/lib/health/{oauth,webhooks,ssrf}.ts` | Garmin: token de caminho ≥ 128 bits (o anterior vale na rotação); busca do ping só em `https://apis.garmin.com/wellness-api/rest/`. Assinatura inválida → 401 sem gravar |
| Tique de novas tentativas e revogações | `/api/cron/wearables` (`WEARABLES_TICK_SECRET`) | **Fora do `vercel.json`** (Hobby só permite cron diário): agendar por `pg_cron` + `pg_net` com o segredo no Vault, ou Vercel Pro |
| Retenção | `public.health_run_retention()` chamada pelo `/api/cron/retention` existente | Pula sem erro em banco sem a 0038 |
| UI | `/profile/devices`, `/profile/devices/connect/[provider]`, `SyncingCard`, `WatchToday mode="real"`, "Sobre seus dados" com a seção de conexão | Contas demo não veem o fluxo (servidor e banco recusam). Textos nos 3 idiomas (`messages/*/devices.json`, `me.today.real/syncing`) |
| Fronteira de import | `eslint.config.mjs` | `postgres` e `@/lib/health/{db,store,pipeline,provider-api}` só nas rotas de wearables, no cron de wearables e nas ações de Relógios e anéis |

**Desvios em relação ao desenho (e por quê):**
- `health.derived` não existe: os índices nossos são calculados na leitura, em TypeScript, a partir das séries que `my_health_today` devolve (a §6.5 já pede "cálculos em TypeScript"); desconectar apaga tudo o que veio da fonte e nada calculado fica para trás.
- Exclusão de conta coberta por **gatilho `before delete` em `auth.users`** (`health.on_auth_user_delete`), não por mudança em `anonymize_user_data`/`delete_my_account`: vale para a exclusão self-service e para a do painel e não conflita com outras frentes que mexem nessas funções. `delete_my_account` continua concedida a `authenticated` (o endurecimento da §8.3 fica para quando houver reautenticação na exclusão).
- Fora desta entrega: exportação (RF-10), `/admin/wearables`, dicas RF-17, histórico inicial de 30 dias após conectar (Oura e WHOOP trazem ontem/hoje numa carga inicial; Garmin e Polar começam no dia da conexão — dito na tela), intradiário (F6), `/ingest/device` e app nativo (Q3).
- WHOOP: `cycle.score.kilojoule` (energia total) não vira "kcal ativas"; a temperatura absoluta vira desvio na leitura (mediana de 28 noites, mínimo 7).
- Escopo `personal` da Oura e `read:profile` da WHOOP pedidos só para o id da pessoa (a lista permitida lê só o id). [NC] confirmar no cadastro se a Oura entrega o id sem `personal`.

**Revisão independente de 23/10/2026 (correções antes de ligar):**
- **Inbox:** o hash de idempotência cobre a identidade da notificação (`eventId`) e o conteúdo (`inboxHash`); antes, a 2ª notificação do mesmo objeto (Oura/WHOOP) ou do mesmo dia (Polar) voltava `duplicate` e o dado parava de atualizar. Na Garmin o `eventId` do push leva um hash curto do resumo: o resumo do dia reenviado com o mesmo `summaryId` e conteúdo novo entra; o repetido continua duplicado.
- **Busca por escopo e categoria:** a pipeline só busca na marca o tipo que a pessoa consentiu e cujo escopo a marca concedeu (a inscrição do webhook é da aplicação). 401/403 numa busca **não** rebaixa a conexão: renova o token uma vez; renovação recusada = desautorizado (`token_expired`); renovada e ainda recusada = recurso fora do escopo (evento falha, conexão segue).
- **Revogação na marca:** com o token de acesso vencido (401), renova pelo refresh token e revoga com o novo; só conta como concluída sem revogar quando a própria renovação é recusada (400/401) ou quando não há refresh token (Polar). O refresh token girado é regravado na fila antes de revogar.
- **Exclusão na marca (§5.17):** `health.daily_metrics.source_ref` guarda o documento de origem (`sleep:<id>`, `recovery:<id>`, `daily_readiness:<id>`, `cycle:<id>`…). Sono apagado leva as métricas da noite e o recovery que pertence a ele; recovery apagado (WHOOP) e resumo diário apagado (Oura) levam as métricas deles.
- **Redução de categorias:** anula na hora todo o bruto do inbox da pessoa (os resumos da Garmin misturam categorias) e trava as conexões (`for update`) contra um lote em andamento.
- **Retenção:** `token_expired` (como chega a desautorização no app da Oura/WHOOP/Polar) e `error` (abertura que falhou) também apagam em 30 dias. [Pendente] O tique ainda não renova tokens de quem parou de receber eventos; até lá, quem desautoriza sem novos eventos cai na regra de 12 meses sem dado.
- **WHOOP:** o ciclo pertence ao dia em que a pessoa acorda do sono que o abre (início + 12 h [CP: quem dorme de dia pode cair no dia seguinte]), nunca pelo `end`. O recovery grava também o Strain final do ciclo anterior (fechado) e cada treino relê o ciclo atual (a WHOOP não tem webhook de ciclo). Sem `read:sleep`, o recovery vem da lista `/v2/recovery`. [NC] semântica do filtro `end` de `/v2/cycle`.
- **Oura:** o `timestamp` dos resumos diários (início do dia Oura) não é mais usado como horário da medida.
- **Garmin sem zonas:** reserva da §13.4 implementada — zona pela FC média ÷ maior FC dos 90 dias (≥ 30 dias com FC máxima), duração inteira nessa zona, rotulada "zonas estimadas" no card Treinos. `my_health_today` aceita até 100 dias (o Hoje pede 93).
- **Consentimento e "Sobre seus dados":** as categorias oferecidas e a lista "O que o aparelho mede" vêm do que cada adaptador grava (`*_INGESTED_CODES`): WHOOP sem Atividade, Polar sem Temperatura.
- **Conectar:** treino manual/upload e sono digitado da Garmin são descartados antes do inbox; abertura que falha vira `error` (com "Reconectar"); com a chave desligada, quem já consentiu ou conectou continua podendo desconectar e retirar o consentimento.

### Roteiro de ligar (só depois do jurídico, do encarregado e de Q18)

1. **Projetos Supabase novos (Q17):** `ultra-hero-prod` (dado real, **sem contas demo** — Q16) e `ultra-hero-staging` (testes com o relógio da equipe), ambos em sa-east-1 e plano **Pro** (backups de 7 dias). Aplicar as migrações em ordem. Não aplicar 0038/0039 no projeto atual de experimento.
2. **Papel:** `alter role health_ingest with login password '<gerado>'`; testar pelo pooler (`postgresql://health_ingest.<ref>:<senha>@<pooler>:6543/postgres?sslmode=require`): `select current_user` = `health_ingest`, `select count(*) from health.daily_metrics` funciona, `select count(*) from public.profiles` dá 42501.
3. **Consentimento final:** migração nova com o texto revisado nos 3 idiomas + `select health.set_consent_version('<versão>')`; regra de idade (`update health.config set value = '<idade>' where key = 'min_age'` e `min_age_rule_pending = 'false'`).
4. **Encarregado (Q19) publicado** no site e no texto; RIPD com Vercel e Supabase como operadores estrangeiros; política e `legal.json` atualizados a partir de `docs/legal-drafts/health-consent.md`; plano de incidente (Res. CD/ANPD 15/2024).
5. **Apps de desenvolvedor das marcas** (callback `https://<domínio>/api/wearables/<marca>/callback`):
   - **Garmin Connect Developer Program** (Health API): registrar só dailies, sleeps, activities, hrv, respiration, skinTemp, stressDetails, userMetrics, deregistrations e userPermissionsChange (**não** registrar bodyComps, mct, bloodPressures, pulseox, healthSnapshot, activityDetails, manuallyUpdatedActivities); push/ping em `https://<domínio>/api/wearables/garmin/webhook/<GARMIN_WEBHOOK_PATH_TOKEN>`; confirmar OAuth 2.0 + PKCE e as URLs de token, user id e registro [NC].
   - **Oura** (cloud.ouraring.com → My Applications): redirect URI; inscrever o webhook (`POST /v2/webhook/subscription`) para daily_readiness, daily_sleep, sleep, daily_activity, daily_spo2, daily_stress e workout (create/update/delete), `callback_url = https://<domínio>/api/wearables/oura/webhook`, com o `OURA_WEBHOOK_VERIFICATION_TOKEN`; conferir o formato de `x-oura-signature` [NC].
   - **WHOOP** (developer.whoop.com): redirect URI, webhook v2 em `https://<domínio>/api/wearables/whoop/webhook`, escopos `offline read:profile read:recovery read:cycles read:sleep read:workout` (nunca `read:body_measurement`); limite de 10 membros até a revisão do app.
   - **Polar AccessLink** (admin.polaraccesslink.com): redirect URI; criar o webhook (`POST /v3/webhooks`, eventos EXERCISE, SLEEP, ACTIVITY_SUMMARY) para `https://<domínio>/api/wearables/polar/webhook` e guardar a `signature_secret_key` em `POLAR_WEBHOOK_SECRET`.
6. **Variáveis na Vercel** (Production/Preview, nunca `NEXT_PUBLIC_`): `HEALTH_INGEST_DATABASE_URL`, `WEARABLE_TOKEN_KEY_V1` (`openssl rand -base64 32`), `WEARABLE_TOKEN_KEY_VERSION=1`, `WEARABLES_TICK_SECRET`, `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`, `GARMIN_WEBHOOK_PATH_TOKEN` (`openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`; na rotação, também `GARMIN_WEBHOOK_PATH_TOKEN_PREVIOUS`), `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`, `OURA_WEBHOOK_VERIFICATION_TOKEN`, `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `POLAR_CLIENT_ID`, `POLAR_CLIENT_SECRET`, `POLAR_WEBHOOK_SECRET`; `NEXT_PUBLIC_SITE_URL` com o domínio final; por último `WEARABLES_REAL_ENABLED=1`. Marca sem todas as variáveis continua "Em breve".
7. **Tique a cada 10 min:** `pg_cron` + `pg_net` chamando `/api/cron/wearables` com `Authorization: Bearer <WEARABLES_TICK_SECRET>` lido do Vault, ou cron da Vercel Pro.
8. **Planos pagos (Q18):** Vercel Pro (uso comercial) e Supabase Pro nos 2 projetos; Garmin Enterprise só se passar de ~1.000 usuários ou precisar de histórico.
9. **Teste em staging com o relógio da equipe** (`E2E_WEARABLES_REAL=1`): conectar, receber o 1º dado, desconectar e ver `health.pending_revocations` esvaziar; retirar o consentimento; excluir a conta de teste.

---

## Sumário executivo (leia isto primeiro)

1. **Regra do produto:** o Hoje mostra **só o que o relógio (ou anel/pulseira) mede sozinho pelo uso** — de forma automática (A) ou num treino iniciado/detectado no relógio (T). Nada é digitado, nem no Ultra Hero nem no app da marca. Hidratação, Descanso manual e "Adicionar item" **saem**. Medidas que exigem um gesto da pessoa (ECG, SpO₂ avulsa, Health Snapshot, bioimpedância) **ficam fora** até o responsável decidir (Q13).
2. **Filtro de origem em todos os tipos, não só em treinos:** cada adaptador lê **só os campos da lista permitida** (§13.2) e descarta qualquer amostra digitada (`HKMetadataKeyWasUserEntered`, `MANUAL_ENTRY`, Garmin `manual`/`isWebUpload`/sono `validation = MANUAL`, Oura `source = manual`) e qualquer amostra que não venha do relógio/anel (ex.: passos só do iPhone, sono do Sleep Cycle). A água que a Garmin manda no resumo diário (`hydrationInMilliliters` [OW]) é ignorada e coberta por teste.
3. **Impossível num PWA:** ler Apple Watch (HealthKit), Galaxy Watch e Pixel via Health Connect. Só um **app nativo nas lojas** lê esses dados. Sem app nativo, **não há Apple Watch no Ultra Hero**.
4. **Funciona no PWA, pelo servidor:** Garmin, Oura, WHOOP, Polar e Google Health API.
5. **Garmin:** a pesquisa 2 indica reabertura em 21/10/2026 (Personal, Starter grátis até ~1.000 usuários [NC], push, **sem histórico**; Enterprise pago a partir de 01/04/2027). **Confirmar no portal**, inclusive se a Starter tem pull ou assinatura de webhook [NC]. Exige CNPJ, e-mail de domínio próprio, site e política públicos.
6. **Galaxy Watch pelo Health Connect entrega pouco:** a Samsung só envia passos, FC, sono com estágios, SpO₂, exercício (kcal, distância, FC, potência, velocidade, VO₂máx) e peso/gordura/TMB. **Não envia** VFC, FC de repouso, temperatura, respiração nem andares (Samsung, fev/2025; muda por versão). Para Galaxy não há Disposição UH nem Sinais da noite completos.
7. **Índices famosos:** a maioria não sai por API (Prontidão e Pontuação do sono da Apple; Training Readiness, Training Status, HRV Status da Garmin). Quando a marca entrega um índice por API (Body Battery, Oura Readiness, WHOOP Recovery, Polar Nightly Recharge), **ele é o principal**, com nome e escala originais. Quando não entrega, mostramos a **Disposição Ultra Hero** (nome próprio, sem "Prontidão", em faixas "abaixo / no / acima do seu habitual"), sempre com "calculado pelo Ultra Hero · pode diferir do número do seu relógio".
8. **Hoje em dois blocos fixos:** "Sua noite" (índice, Sono, **Sinais da noite** = FC de repouso, VFC, respiração, SpO₂ e temperatura contra o seu habitual) e "Seu dia até agora · até HH:MM" (Atividade com **anéis da Apple** ou metas da Garmin, Treinos com **carga do dia**, Estresse, e uma linha de Ambiente). Cerca de 5 cards, 1 coluna no celular. Valores com horário ("Body Battery 58 às 07:42"), nunca "agora". Sem botão Atualizar.
9. **Segurança de verdade, não por convenção:** os dados de saúde vão para um schema `health` **fora da API**, sem grant para `anon`, `authenticated` **nem `service_role`** (que hoje é usada pelo motor de recomendação e ignora RLS). Só um papel próprio `health_ingest` escreve; a pessoa lê por RPCs. Teste: `service_role` recebe 42501.
10. **Mudança jurídica obrigatória:** a política atual diz "não coletamos dados de saúde individuais". Antes de gravar **qualquer** dado real: consentimento específico por categoria (com texto arquivado), RIPD, **encarregado nomeado e publicado**, política nos três idiomas, Vercel e Supabase no mapa de operadores estrangeiros, plano de incidente (Res. CD/ANPD 15/2024).
11. **Custos que deixam de ser opcionais com dado real:** Vercel **Pro** (o Hobby é só para uso pessoal e não comercial; US$ 20 por membro/mês), Supabase **Pro** (backups diários de 7 dias; o Free não tem backup automático) e, recomendado, um projeto de produção separado do experimento com contas demo. Ver Q17–Q18.
12. **Dá para construir já, sem credencial:** catálogo, schema e papéis, normalizadores com lista permitida e testes, consentimento, desconexão, retenção, UI completa e o **gerador de demonstração** (só códigos v1 que o modelo simulado realmente entrega).

---

## 1. Problema

1. **O Hoje atual mistura agenda manual com registros de saúde digitados.**
   - **Ritmo de hoje** (`RhythmBlock`): sugestões de programa (`pickProgramSuggestions`) mais itens criados à mão (`routine_items`/`routine_checks`, migração 0022, marcação pela RPC `routine_check`).
   - **Hidratação** (`HydrationBlock`, `local-log.ts`): copos de 250 ml no `localStorage` (`uh:today:<data>:hydration`).
   - **Descanso** (`RestBlock`): "descansei?" mais horas, também no `localStorage`.
   - O texto `me.today.description` diz: "O ritmo vem dos programas em que você está e do que você adiciona. Hidratação e descanso ficam só neste aparelho."
2. **Regra do responsável:** só entra o que o relógio mede sozinho. Água não é medida por relógio nenhum — e **também não pode entrar por tabela**, quando a pessoa a registra no app da marca e a marca a reenvia (Garmin `hydrationInMilliliters` [OW]). O mesmo vale para calorias ingeridas, peso digitado, sono ou passos digitados no app Saúde, e treinos gravados só pelo GPS do celular.
3. **O que ele quer:** que o Hoje entregue "tudo o que Garmin e Apple Watch (e os melhores relógios) conseguem medir".
4. **Restrições reais:**
   - PWA não acessa HealthKit nem Health Connect.
   - Várias métricas proprietárias não saem por API; o Galaxy pelo Health Connect entrega um subconjunto pequeno.
   - O dado é **sensível** (LGPD art. 11) e a política atual promete não coletá-lo.
   - Funções de **dispositivo médico regulado** (Anvisa): ECG, ritmo irregular, apneia, hipertensão.
   - Contas demo **compartilhadas** (senha única), inclusive uma com papel **admin** (`admin@demo.ultrahero.app`, `src/lib/demo/accounts.ts`).
   - A `service_role` é usada fora da ingestão (motor de recomendação, actions de admin e de herói) e ignora RLS.
   - A sequência (`compute_streak`, 0022) conta `streak_events` **ou** `routine_checks`: desligar a rotina manual afeta a sequência.

## 2. Objetivo

- **O1. Sem digitação.** Um Hoje que mostra, em até 2 rolagens no celular, o estado do dia **medido pelo relógio**, separado em "Sua noite" (fechada) e "Seu dia até agora" (parcial). Nenhum campo de entrada, nenhum dado digitado em outro app.
- **O2. Catálogo canônico provider-agnóstico.** Código estável por métrica, mapeamento por fonte e **lista permitida de campos** por adaptador. Nova marca = novo adaptador.
- **O3. Honestidade.**
  - Métrica que o relógio não mede é **escondida**, nunca vira zero.
  - Todo valor mostra o horário da amostra ("58 às 07:42"); nada sugere tempo real.
  - Índice da marca com nome e escala da marca; índice nosso com nome próprio e "pode diferir do número do seu relógio".
  - Recurso desligado no relógio vira uma dica de ajuste (não de digitação).
  - Sempre "bem-estar, não diagnóstico".
- **O4. Privacidade por padrão e por construção.**
  - Só a própria pessoa lê; nenhum papel de servidor fora da ingestão tem grant nas tabelas de saúde.
  - Consentimento por categoria, com texto arquivado; revogar nunca é bloqueado.
  - Desconectar apaga os dados daquela fonte **e** os derivados que os usaram.
  - Admin não vê valores; contas demo não operam nada de saúde.
  - Os dados nunca alimentam venda, recomendação de produto, analytics ou IA externa.
- **O5. Demonstrável hoje.** As 5 contas demo exibem o Hoje com dados gerados, **só com o que a v1 real entrega** para o modelo simulado, sem gravar nada.
- **O6. Entrega em fases pequenas**, cada uma publicável, com "chave" por provedor.

**Fora de escopo (v1):**
- Escrever no HealthKit ou Health Connect.
- Coach, prescrição, metas sugeridas por nós ou diagnóstico.
- Funções médicas reguladas e medidas sob demanda (até Q13).
- Rota GPS.
- Ciclo menstrual (registro manual; o endpoint Garmin `mct` não é registrado).
- Comparação com outras pessoas e rankings.

---

## 3. Requisitos funcionais

| ID | Requisito |
|---|---|
| RF-01 | O Hoje não tem **nenhum** controle de entrada de dado. Os únicos toques são: navegar, ver detalhe, trocar o período da tendência (7/30 dias), conectar ou gerenciar relógios, "ver nosso cálculo" e dispensar uma dica. **Não há botão Atualizar**: a página relê o banco no evento `visibilitychange` e mostra a dica fixa da fonte ("Para atualizar, sincronize no app Garmin Connect"). |
| RF-02 | **Conta real, nenhum provedor ligado no ambiente:** o bloco Hoje não aparece; fica só uma linha "Em breve: seu dia medido pelo relógio · Ver um exemplo" (o exemplo abre a prévia demo, a partir da F2). **Conta real, provedor ligado, sem fonte conectada:** card "Conecte seu relógio" com as marcas **disponíveis neste ambiente**, o que é lido, o aviso de privacidade e o botão. Nenhum valor fictício para contas reais. |
| RF-03 | Com fonte: dois blocos de ordem fixa (§6.2). **"Sua noite"**: índice do dia, Sono, Sinais da noite. **"Seu dia até agora · até HH:MM"**: Atividade, Treinos, Estresse (Body Battery entra em "Sua noite" como índice), mais uma linha de Ambiente quando houver valor. Cada card mostra o valor principal com horário e a comparação com o habitual; a minitendência fica só no detalhe em telas < 400 px. |
| RF-04 | Card ou métrica sem suporte no dispositivo (matriz **e** o que a fonte de fato envia) **não aparece**. Suportada mas sem dado hoje: "Sem dados hoje" e o último valor com a data. |
| RF-05 | Cada card leva ao detalhe (`/profile/today/[categoria]`): valor e horário, curva do dia quando houver, tendência 7/30 dias, faixa habitual, "como é medido" (por fonte e modelo), fonte, última sincronização e aviso de bem-estar. Métricas com status **v1d** aparecem só no detalhe. |
| RF-06 | O cabeçalho do Hoje mostra a fonte e o horário da última sincronização ("Garmin fēnix 9 · sincronizado às 07:42"), "Sincronizando…" e "Dados até HH:MM". |
| RF-07 | Página **Relógios e anéis** (`/profile/devices`): conectar, reconectar, desconectar (apaga dados e derivados, com confirmação), fonte principal por categoria quando há 2+ fontes, categorias consentidas (ampliar ou reduzir sem apagar o resto), "Sobre seus dados" (o que lemos, o que a marca não compartilha, o que o seu modelo mede). |
| RF-08 | **Consentimento LGPD** em tela própria, antes da primeira conexão, **por categoria**: finalidades, categorias, retenção, operadores (inclusive estrangeiros) e revogação. A versão e o hash vêm do texto arquivado no servidor. |
| RF-09 | **Revogar o consentimento** com 1 toque + confirmação: desconecta tudo, apaga tudo e enfileira a revogação nas marcas. Nunca é bloqueado. |
| RF-10 | **Exportar meus dados de relógio** (JSON/CSV), com **reautenticação recente** (≤ 5 min), até 3 por dia, `Cache-Control: no-store` e auditoria. Desligado em contas demo. |
| RF-11 | **Contas demo:** Hoje gerado de forma determinística, faixa "Dados de demonstração" em cada card e no cabeçalho; só códigos **v1/v1d ∩ capacidades do modelo simulado**. Conectar, consentir, exportar e qualquer ação de `/admin/wearables` ficam bloqueados. |
| RF-12 | As sugestões de programa saem do Hoje e viram **"Continue seus programas"**, posicionada **depois do card Evolução** no Perfil (longe do Hoje), com a mesma ação `completeContent`. Itens manuais deixam de existir na interface (§5.10). |
| RF-13 | Limpeza única no aparelho das chaves `uh:today:*`, sem enviar nada ao servidor. |
| RF-14 | Avisos de bem-estar fixos no rodapé do Hoje, em cada detalhe e no consentimento. |
| RF-15 | Admin: `/admin/wearables` **só com contagens**, interruptor por provedor; exige `is_admin() and not is_demo(auth.uid())`. |
| RF-16 | i18n completo (pt-BR/en/es), unidades métricas, acessibilidade (§6.6). `me.today.description` reescrito (§6.2). |
| RF-17 | **Dica de recurso desligado:** após 7 dias com modelo conhecido, comparar o que a matriz espera para o modelo com `capabilities`. Para cada diferença, uma dica única e dispensável: "Seu {modelo} pode medir {X}: ative em {caminho no relógio}". É ajuste no relógio, não digitação. |
| RF-18 | Link de loja (app iOS/Android) só aparece quando existe URL de loja configurada no ambiente. |

---

## 4. Regras de negócio

| ID | Regra |
|---|---|
| RN-01 | **Só medição do dispositivo.** Uma métrica entra se o relógio, anel ou pulseira a mede pelo uso: **(A) automática** ou **(T) treino** iniciado no relógio ou detectado por ele (T entra por ser uso do relógio; registrado em Q13). Medidas **sob demanda** (ECG, SpO₂ avulsa, Health Snapshot, bioimpedância, pressão) ficam `excluded_action` até decisão do responsável (Q13). |
| RN-02 | **Proibido:** campos de digitação; esforço/RPE dado pela pessoa (`workoutEffortScore`, RPE da Polar); humor (`HKStateOfMind`); ciclo; peso e composição corporal (Garmin `bodyComps`, Samsung peso/gordura/TMB); água (`hydrationInMilliliters`); cafeína; alimentação e calorias ingeridas (`consumedCalories`, `NutritionRecord`); glicose; pressão (manguito ou estimada); LifeLoad. |
| RN-02b | **Lista permitida por adaptador.** Cada adaptador lê **só** os campos listados na §13.2 para aquele provedor; qualquer outro campo é ignorado sem ser gravado. Teste obrigatório com fixture contendo `hydrationInMilliliters`, `consumedCalories`, `netCalorieGoal`, `bodyComps` e `onDemandReadings`: nada disso chega às tabelas. Endpoints Garmin não registrados: `mct`, `bodyComps`, `bloodPressures` [OW]. |
| RN-03 | **Funções médicas reguladas não são lidas** nem pedidas: ECG, ritmo irregular, histórico de FA, hipertensão, apneia, FC alta/baixa, pressão estimada. Ficam `excluded_regulated`. Revisão só com parecer jurídico e regulatório (RDC Anvisa 657/2022; ler resultado de dispositivo médico pode tirar o app da isenção de bem-estar [NC]). |
| RN-04 | **Sem zero fabricado.** Métrica ausente é escondida. Zero só quando a fonte informa zero. |
| RN-05 | **Dia do usuário.** Meia-noite a meia-noite no fuso da amostra (Garmin `startTimeOffsetInSeconds`, HealthKit `HKMetadataKeyTimeZone`, Oura `day`); na falta, `profiles.timezone`. **Sono pertence ao dia em que a pessoa acorda**; cochilo, ao dia em que começa. |
| RN-06 | **Uma métrica, uma fonte por dia** (§9.6). Nunca somamos fontes. |
| RN-07 | **Linha de base pessoal:** mediana ± 1 desvio robusto (MAD×1,4826) de 28 dias, mínimo de 7 dias/noites válidos; antes disso, "Aprendendo seu normal: n de 7". Comparação **sempre com a própria pessoa**. "Dentro/fora da sua faixa habitual" = dentro/fora dessa banda. |
| RN-08 | **Índice do fabricante:** aparece com nome, marca e **escala e rótulos originais** (`value` + `scale`); nunca normalizamos para 0–100. **Índice nosso:** nome próprio que não imita marca (Disposição, Sinais da noite, Carga do dia), selo "calculado pelo Ultra Hero", "pode diferir do número do seu relógio" e "por que este número". |
| RN-08b | **Precedência no card:** se a fonte entrega índice por API (Garmin Body Battery, Oura Readiness, WHOOP Recovery, Polar Nightly Recharge), ele é o **principal** e a Disposição UH fica recolhida em "ver nosso cálculo". Se não entrega (Apple, Google, Galaxy), a Disposição UH é a principal — **se** houver VFC noturna ou FC de repouso; sem as duas, ela não é calculada (Galaxy pelo Health Connect). |
| RN-09 | **VFC não mistura métodos.** SDNN (Apple) e RMSSD (Oura, WHOOP, Health Connect, Apple watchOS 27) guardados com `method`; linha de base por método e fonte; trocar de fonte reinicia a linha de base. |
| RN-10 | **Atualização tardia vence se for mais nova:** o upsert sobrescreve quando `coalesce(excluded.source_updated_at, excluded.ingested_at) >= coalesce(atual.source_updated_at, atual.ingested_at)`. |
| RN-11 | **Dado defasado.** > 6 h sem sincronizar: selo "última sincronização às HH:MM" e dica da fonte. > 72 h: card de alerta no topo. > 30 dias: conexão "inativa" (§10). |
| RN-12 | **Plausibilidade.** Fora da faixa: descartado e registrado com **código enumerado** (ex.: `plaus_out_of_range:hr_bpm`), nunca com a mensagem do validador nem o valor. Faixas: FC 25–240; FC de repouso 30–120; SpO₂ 70–100%; respiração 4–40/min; desvio de temperatura ±5 °C; temperatura absoluta da pele 25–40 °C; passos 0–100.000/dia; sono 0–20 h/sessão; VFC 3–300 ms; VO₂máx 10–95. |
| RN-13 | **Consentimento antes de tudo e por categoria.** Sem consentimento ativo na versão vigente, nenhuma conexão é criada e nenhum dado é aceito; e cada métrica só é gravada se a sua categoria está em `consent.categories` (servidor **e** gatilho). Mudança **material** da política pausa a ingestão e pede novo aceite (dados guardados por N dias, Q20); mudança **não material** só avisa. |
| RN-14 | **Desconectar apaga e nunca é bloqueado.** A desconexão sempre para a ingestão, apaga dados e derivados daquela conexão e enfileira a revogação na marca (§8.3). `retention_exceptions` não bloqueia: só retém, em separado, o conjunto específico sob guarda legal, e a pessoa é informada. |
| RN-15 | **Finalidade restrita.** Dado de relógio serve **só** para mostrar à própria pessoa o Hoje, as tendências e a exportação. Proibido: recomendação de produtos (inclusive Ultra.e Life), anúncios, `analytics_events`, motor de recomendação, IA (OpenAI/Gemini), heróis ou fornecedores. Garantia **técnica**: schema `health` sem grant para `service_role`, `authenticated` e `anon` (§8.9). |
| RN-16 | **Contas demo** (`app_metadata.ultra_hero_demo = true`, lido no servidor) nunca conectam, consentem, exportam ou operam `/admin/wearables` (servidor + banco). |
| RN-17 | **Idade mínima** de 18 anos (proposta; Q7, inclusive ECA Digital). |
| RN-18 | **Linguagem:** "acompanhar", "tendência", "dentro/fora da sua faixa habitual". Proibido: "normal/anormal", "risco", "diagnóstico", "doença", "alvo"/"meta sugerida" (não prescrevemos). |
| RN-19 | **Unidades:** km, kcal, °C em todos os idiomas; guardado em unidade SI/canônica. |
| RN-20 | **Origem e digitação — vale para TODOS os tipos.** Descartar: HealthKit `HKMetadataKeyWasUserEntered = true`; Health Connect `recordingMethod = MANUAL_ENTRY`; Garmin `manual: true` e `isWebUpload: true` em atividades [OW] e `validation in ('MANUAL','AUTO_MANUAL')` em sono [OW; semântica de `AUTO_MANUAL` NC]; Oura `workout.source = 'manual'` [OW]. **Aceitar só amostras do relógio/anel:** Apple = `HKDevice.model == "Watch"` (consultas com predicado de dispositivo); Health Connect = `dataOrigin` do app da marca do relógio **e** `metadata.device.type in (WATCH, RING)`. **Exceção** para passos/distância somados pelo app Saúde (iPhone + relógio) **só se o responsável aprovar** (Q14); padrão: só relógio. |
| RN-21 | **"Noturno" é definição nossa quando a fonte não a tem.** Para HealthKit e Health Connect, `hrv_night`, `spo2_night_*` e `resp_rate_sleep` = média (e mínimo, quando aplicável) das amostras **dentro da sessão principal de sono**, com mínimo de **2** amostras de VFC e **3** de SpO₂; abaixo disso a métrica fica escondida. SpO₂ da Apple **fora** da janela do sono é descartada (não separamos medida de fundo de medida sob demanda). Garmin `onDemandReadings` é ignorado. |
| RN-22 | **Demo coerente com a realidade:** a persona só exibe códigos com status v1/v1d **e** presentes na coluna da matriz (§13.3) do modelo simulado. É teste de propriedade. |

---

## 5. Casos especiais

- **5.1 Dois relógios ou relógio + anel.** Dados guardados por fonte; leitura escolhe uma fonte por métrica e dia (§9.6). Sono: anel > relógio; atividade: relógio de pulso; treinos: união com deduplicação (≥ 70% de sobreposição e mesmo esporte → fica o de maior prioridade).
- **5.2 Garmin gravando no Apple Health ou no Health Connect.** Amostra cuja origem é o app Garmin Connect (`sourceRevision.source.bundleIdentifier` ou `dataOrigin = com.garmin.android.apps.connectmobile` [CP]) é **descartada** quando há conexão Garmin direta ativa.
- **5.3 iPhone + Apple Watch.** Padrão (RN-20): passos e distância só do relógio, usando `HKStatisticsCollectionQuery` com predicado de dispositivo (`HKQuery.predicateForObjects(withDeviceProperty: HKDevicePropertyKeyModel, allowedValues: ["Watch"])` [CP]). Se Q14 aprovar a exceção, usa-se a soma deduplicada do app Saúde, rotulada "relógio + iPhone". Métricas de marcha do iPhone **não entram**.
- **5.4 Viagem e fuso.** Vale o fuso da amostra; dia de 23 h ou 25 h sem ajuste.
- **5.5 Quem trabalha à noite.** Sono diurno conta no dia em que acorda; a "noite principal" é a sessão mais longa; as demais são cochilos.
- **5.6 Relógio sem uso / dia parcial.** Usa tempo de uso quando a fonte informa (Garmin epochs, WHOOP `percent_recorded`). < 60% de cobertura: "Dia incompleto (relógio usado ~9 h)", fora da linha de base.
- **5.7 Sincronização atrasada.** Garmin só envia após o relógio sincronizar com o Garmin Connect; HealthKit em segundo plano roda no máximo ~1×/h. Todo valor mostra o horário da amostra; Body Battery mostra `bodyBatteryMostRecentValue` [OW] com o horário da última amostra.
- **5.8 Primeira conexão e histórico.** Garmin Starter sem histórico ("Seu histórico começa hoje"); outras marcas: 30 dias; iOS 27 pode limitar a 30 dias [NC]; Health Connect > 30 dias exige `READ_HEALTH_DATA_HISTORY`. WHOOP manda temperatura **absoluta**: o desvio aparece só após 7 noites ("Aprendendo seu normal").
- **5.9 Permissão negada no HealthKit.** Indistinguível de "sem dados"; dica "Ajustes › Saúde › Acesso a Dados › Ultra Hero". Health Connect informa a negação ("sem permissão").
- **5.10 Dados existentes do Hoje antigo.**
  - **`routine_items`/`routine_checks`:**
    - A migração marca os itens como `active = false`, revoga `insert/update` de `authenticated` e `routine_check` passa a recusar com `routine_disabled`. O `select` do dono continua.
    - **Sequência:** `compute_streak` conta `streak_events` **ou** `routine_checks` (0022, l. 91–110). As marcações antigas continuam contando os dias passados, mas **quem mantinha a sequência só pela rotina a perde no dia seguinte à F1**. Por isso a **Q10 precisa ser respondida antes de publicar a F1**. Enquanto isso, o aviso único diz: "A sequência agora conta conteúdos concluídos. Os itens que você criou à mão saíram do Hoje — baixe sua lista se quiser guardar." (CSV em `/profile/account`).
    - **Medir antes** no remoto: quantas pessoas reais têm sequência atual > 0 que cairia sem `routine_checks` (comparar `compute_streak` com uma versão só com `streak_events`), e quantas têm itens ativos.
    - Apagar 90 dias depois pelo `run_retention()`, se Q5 = apagar.
  - **Sugestões de programa:** só mudam de lugar (RF-12).
  - **Hidratação e descanso no `localStorage`:** removidos no aparelho (marcador `uh:today:migrated=1`); nada é enviado ou convertido.
- **5.11 Conta demo tenta conectar.** Botão desabilitado com explicação; servidor e banco recusam com `demo_account_cannot_connect`.
- **5.12 Pessoa revoga na marca.** Evento de cancelamento ou 401 → `revoked_by_provider`, ingestão para, "Reconectar ou apagar os dados?". Sem resposta em 30 dias, apaga (Q11).
- **5.13 Exclusão de conta durante uma ingestão.** O worker trava a conexão com `for share`; a exclusão/desconexão usa `for update` (§8.3). Um evento atrasado de conexão inexistente é descartado sem gravar payload.
- **5.14 Cadeira de rodas.** `pushCount`/`WheelchairPushesRecord` → **Impulsos** no lugar de Passos.
- **5.15 Treino sem FC.** Sem zonas e fora da carga calculada.
- **5.16 Mudança de modelo.** Métricas novas aparecem a partir da primeira amostra; a nota sobre prontidão da Apple muda com o modelo (§6.2).
- **5.17 Valores corrigidos ou apagados na marca.** Aplicamos exclusão/sobrescrita; nunca mantemos dado que a fonte retirou.
- **5.18 Recurso desligado no relógio.** Garmin: SpO₂ vem desligada por padrão. Apple: sono, temperatura do pulso, Sinais Vitais, Ruído e luz do dia (depende de "Calibração e Distância" nos Serviços de Localização) exigem ativação [NC caminhos exatos]. Tratado pela RF-17.
- **5.19 Galaxy pelo Health Connect.** Sem VFC e sem FC de repouso → sem Disposição UH; Sinais da noite mostra só SpO₂. Distância e kcal só existem dentro de exercícios. O escopo muda por versão do Samsung Health [NC]: a matriz é revista a cada versão e `capabilities` manda.

---

## 6. Fluxo do usuário e UX mobile

### 6.1 Fluxos

**A. Conectar a primeira fonte de nuvem (Garmin, Oura, WHOOP, Polar, Google):**
1. Hoje: o card "Conecte seu relógio" leva a `/profile/devices`.
2. A pessoa escolhe a marca e vê o **consentimento por categoria** (RF-08), com reautenticação recente. Confirma ou cancela.
3. `GET /api/wearables/oauth/{provider}/start` → marca (PKCE + `state` em cookie httpOnly assinado).
4. A pessoa autoriza na marca.
5. `callback` troca o código, cifra os tokens, cria a conexão (`active`), registra o usuário e só os endpoints das categorias consentidas, agenda o histórico quando houver.
6. Volta a `/profile/devices?connected=garmin`: "Conectado. Os primeiros dados chegam quando seu relógio sincronizar."
7. No Hoje, "Sincronizando…" até o 1º upsert; consulta a cada 30 s enquanto visível, por até 5 min.

**B. Apple Watch, Galaxy ou Pixel (exige o app nativo):**
1. No PWA, o card "Apple Watch" diz "Disponível no app Ultra Hero para iPhone" e mostra o link da loja **só se houver URL configurada** (RF-18); senão, "em breve".
2. No app nativo: consentimento LGPD (na WebView) → permissão HealthKit/Health Connect **só dos tipos das categorias consentidas** → o servidor emite uma **chave de ingestão por aparelho**, guardada no Keychain/Keystore.
3. O código nativo lê (âncoras, filtro de origem e de digitação), monta um DTO bruto versionado e envia a `POST /api/wearables/ingest/device`. **Nenhum valor de saúde passa pela WebView.**
4. Atualização em segundo plano: `HKObserverQuery` + entrega em segundo plano no iOS; WorkManager no Android.

**C. Uso diário:**
1. Abrir o Perfil. O Hoje é renderizado no servidor.
2. Tocar num card abre o detalhe.
3. Ao voltar para a aba (`visibilitychange`), a página relê o banco. Não há "forçar sincronização": a dica fixa explica como sincronizar no app da marca.

**D. Desconectar:** `/profile/devices` › fonte › "Desconectar e apagar dados". A confirmação diz quantos dias serão apagados. Apaga na hora; a revogação na marca é tentada na hora e, se falhar, fica na fila (§8.3).

**E. Revogar tudo:** "Retirar consentimento" → desconecta todas as fontes, apaga tudo, enfileira revogações, registra.

**F. Reduzir categorias:** desmarcar "Temperatura" em `/profile/devices` apaga só os dados dessa categoria (RPC `health_consent_update`). Ampliar exige reautenticação.

### 6.2 Hierarquia do Hoje (celular, 360–430 px, 1 coluna)

```
┌ Hoje · quarta, 22 de outubro ────────────────────┐
│ Seu dia, medido pelo relógio.                     │
│ ⌚ Garmin fēnix 9 · sincronizado às 07:42           │
│ Para atualizar, sincronize no app Garmin Connect. │
│ (demo: ▣ Dados de demonstração — simulam um …)     │
├ SUA NOITE ───────────────────────────────────────┤
│ Body Battery™ · Garmin                            │
│  58 às 07:42 · carregou +63 durante a noite        │
│  máx 91 · mín 22          Ver nosso cálculo ›     │
│  A Garmin não compartilha Training Readiness      │
│  e Training Status.                               │
├──────────────────────────────────────────────────┤
│ Sono  7 h 10 · nota Garmin 81                     │
│  23:40 → 06:58 · 12 min abaixo da sua média       │
├──────────────────────────────────────────────────┤
│ Sinais da noite · 4 de 5 na sua faixa habitual    │
│  VFC 48 ms (abaixo) · FC rep. 54 · resp. 14,2     │
│  SpO₂ 96% · temp. +0,1 °C · calculado pelo UH     │
├ SEU DIA ATÉ AGORA · até 07:42 ───────────────────┤
│ Atividade  1.912 passos · 19% da meta do relógio  │
│  intensidade 96 de 150 min na semana              │
├──────────────────────────────────────────────────┤
│ Treinos (só se houver) Corrida 42 min · 7,8 km    │
│  5:23 /km · FC média 148 · carga do dia 86        │
├──────────────────────────────────────────────────┤
│ Estresse  média 31 até agora (baixo)              │
├──────────────────────────────────────────────────┤
│ Segurança (só se houver evento hoje)              │
├──────────────────────────────────────────────────┤
│ ⓘ Dados do seu relógio, para bem-estar. Não       │
│   substitui avaliação médica. · Relógios e anéis ›│
└──────────────────────────────────────────────────┘
(… card Evolução … depois:) Continue seus programas
```

- **Dois blocos de ordem fixa.** "Sua noite" está fechada de manhã e vem primeiro; "Seu dia até agora" leva o selo "até HH:MM" e tom de parcial. Cards sem suporte saem e os demais sobem. Cerca de 5 cards.
- **Layout:** 1 coluna até `md`; a partir de `md`, duas colunas (Sua noite | Seu dia). Minitendência só no detalhe abaixo de 400 px.
- **Card do índice (precedência RN-08b):**
  - Garmin: Body Battery (valor com horário, máx/mín, carregado/gasto) + nota fixa "A Garmin não compartilha Training Readiness e Training Status" (também no detalhe); Disposição UH recolhida.
  - Oura: Readiness Oura (escala original); Disposição UH recolhida.
  - WHOOP: Recovery (escala original) + Strain do dia; Disposição UH recolhida.
  - Polar: Nightly Recharge com status e rótulos originais; Disposição UH recolhida.
  - Apple, Google, Galaxy: Disposição UH principal (em faixa: abaixo / no / acima do seu habitual), se houver VFC ou FC de repouso; senão o card não aparece.
  - **Nota Apple condicionada ao modelo:** Series 12 e Ultra 4 → "Seu Apple Watch tem Prontidão própria, mas a Apple não a compartilha com outros apps". SE 3 e Series 9–11 → sem nota. Modelo vem de `HKDevice.hardwareVersion` mapeado para a geração (tabela própria, [NC] identificadores).
- **Sinais da noite** (`night_vitals_uh`) junta FC de repouso, VFC, respiração, SpO₂ e temperatura, cada um "na faixa" ou "acima/abaixo da sua faixa habitual" (RN-07), sem cor sozinha e sem "alerta". Substitui os antigos cards Coração, Respiração/O₂ e Temperatura.
- **Atividade:**
  - **Apple:** três anéis Movimento / Exercício / Em pé com % da meta do relógio (`HKActivitySummary`), sem repetir "minutos intensos".
  - **Garmin:** passos vs. `dailyStepGoal` [OW], minutos de intensidade **da semana** vs. `intensityDurationGoalInSeconds` [OW], andares subidos/descidos.
  - Outras: passos, kcal ativas, minutos de intensidade calculados.
- **Treinos:** ritmo/velocidade (distância ÷ duração), FC, zonas no detalhe, **carga do dia** (`cardio_load_day_uh`, "calculado pelo UH") comparada com a faixa habitual — sem "alvo".
- **Estresse** só para fontes que o medem (Garmin, Oura).
- **Ambiente** não é card: uma linha dentro de "Seu dia" ("ruído médio 62 dB · luz do dia 48 min"), só quando houver valor (Apple).
- **Segurança** escondida sem evento; com evento: "Seu relógio registrou uma possível queda às 14:32. Se precisar, procure ajuda."
- **Textos (pt-BR; en/es na F1):**
  - `me.today.title`: "Hoje — Seu dia, em foco"
  - `me.today.description`: "Medido pelo seu relógio: sua noite e seu dia até agora. Nada para digitar."
  - Seção de programas: "Continue seus programas".

### 6.3 Estados

| Estado | Como aparece | Regra |
|---|---|---|
| Conta real, nenhum provedor ligado no ambiente | **Sem bloco Hoje.** Só a linha "Em breve: seu dia medido pelo relógio · Ver um exemplo" | RF-02 |
| Conta real sem consentimento ou fonte (provedor ligado) | Card-convite com as marcas disponíveis no ambiente; botão "Conectar relógio"; "O que lemos e como protegemos". **Nenhum número.** | RF-02 |
| Fonte conectada, aguardando 1º dado | Esqueleto + "Sincronizando… os primeiros dados chegam quando seu relógio sincronizar com o app da marca" | §6.1 A |
| Dia parcial | Selo "até 10:42" no bloco "Seu dia" | RF-03 |
| Ainda sem dado de hoje | "Sua noite" com a última noite disponível e a data; "Seu dia" com "Sem dados hoje" e o valor de ontem esmaecido | RN-05 |
| Defasado (> 6 h) | Selo âmbar com o horário e a dica da fonte; > 72 h, card de alerta | RN-11 |
| Formando linha de base | "Aprendendo seu normal: 3 de 7 noites", sem seta | RN-07 |
| Métrica não suportada | **Escondida.** "Sobre seus dados" explica | RN-04 |
| Recurso desligado no relógio | Dica única dispensável "Seu {modelo} pode medir {X}: ative em {caminho}" | RF-17 |
| Erro de token | Card no topo "Reconecte sua Garmin…" | — |
| Revogada na marca | Card "Você desautorizou o Ultra Hero na Garmin. Reconectar ou apagar dados?" | §5.12 |
| Consentimento desatualizado (mudança material) | Card "Atualizamos como tratamos seus dados do relógio. Revise para continuar"; ingestão pausada | RN-13 |
| Provedor desligado pelo admin | "Garmin temporariamente indisponível"; dados antigos visíveis | §10 |
| Conta demo | Faixa "Dados de demonstração" + selo "Demo" em cada card; ações bloqueadas | RF-11 |

### 6.4 Detalhe por categoria (`/profile/today/[categoria]`)

- **Topo:** valor de hoje com horário, faixa habitual (banda), frase de contexto.
- **Curva do dia:** quando há amostras intradiárias (F6).
- **Tendência:** abas 7 e 30 dias, barra ou linha com a banda habitual.
- **Componentes:** sono com estágios, horário e regularidade; Disposição UH com pesos e contribuições; Sinais da noite com os 5 componentes; Atividade com métricas v1d (FC média caminhando, tempo sedentário, minutos moderados/vigorosos, andares descidos); Treinos com zonas e recuperação da FC em 1 min.
- **"Como é medido"** por fonte e modelo. Ex.: "Apple Watch Series 9–11 e SE 3 medem a VFC poucas vezes por noite; com menos de 2 leituras na noite, não mostramos o valor." "Para Apple, 'tempo na cama' e 'tempo para adormecer' não aparecem: esse dado vem do iPhone, não do relógio [NC]."
- **Rodapé:** fonte, modelo, última sincronização, método e aviso de bem-estar.
- **Não-objetivos:** exportar daqui e compartilhar em rede social.

### 6.5 Tendências

- **Janelas:** 7 dias (card) e 30 dias (detalhe). Retenção de **13 meses** (tendência anual + linha de base; Q11).
- **Cálculos em TypeScript** (`src/lib/health/derived.ts` e `baseline.ts`), a partir das séries resolvidas que `my_health_today` devolve (35 dias): média de 7 dias, mediana/MAD de 28 dias, seta (▲▼ acima de 0,5 MAD). O mesmo código serve o worker, a página e o gerador demo.

### 6.6 Acessibilidade

- **Nome acessível de cada card** com valor, unidade por extenso, horário e comparação. Ex.: `aria-label="Body Battery da Garmin: 58 às 7 horas e 42. Carregou 63 durante a noite. Abrir detalhes."`
- **Gráficos:** `role="img"` com resumo; tabela alternativa no detalhe; anéis da Apple com texto ("Movimento 42% da meta").
- **Cor nunca sozinha:** sempre com texto ("abaixo da sua faixa"). Contraste AA nos dois temas.
- **Toque e movimento:** alvos ≥ 44 px; `prefers-reduced-motion` nos anéis.
- **Texto:** números tabulares; zoom 200% sem rolagem horizontal (1 coluna ajuda).
- **Regiões e foco:** "Sincronizando" em `aria-live="polite"`; erros em `role="alert"`; foco: cabeçalho → Sua noite → Seu dia → aviso → Relógios; selo demo lido antes do primeiro valor; cada bloco é uma `section` com título.
- **Formatação:** `Intl.NumberFormat`/`DateTimeFormat`; "7 h 10 min" (pt), "7 h 10 m" (es/en).

---

## 7. Papéis e permissões

| Papel | Pode | Não pode |
|---|---|---|
| Consumidor (dono) | Ler os próprios dados **por RPC**; conceder, ampliar (com reautenticação), reduzir e revogar consentimento; conectar e desconectar; escolher fonte principal; exportar (com reautenticação) | Escrever valor de saúde; ver dados de outra pessoa; acessar o schema `health` diretamente |
| Herói (creator) | O mesmo que o consumidor, para a própria conta | Qualquer dado de saúde de seguidores, mesmo agregado (v1) |
| Fornecedor (seller) | O mesmo que o consumidor, para a própria conta | Qualquer acesso a dado de terceiros ou cruzamento com produto |
| Admin (real, não demo) | Painel só com contagens; ligar/desligar provedor; reprocessar uma conexão sem ver conteúdo; ver auditoria sem valores | Ler tabelas de saúde; exportar dados de terceiros |
| `health_ingest` (papel Postgres próprio, LOGIN, sem BYPASSRLS; credencial só nas rotas de ingestão, OAuth callback e cron de wearables) | Gravar métricas, sono, treinos, derivados e inbox; ler/gravar credenciais cifradas e a fila de revogações | Ser usado fora dessas rotas (fronteira de import `server-only` em `src/lib/health/db.ts` + regra de lint) |
| `service_role` (motor de recomendação, admin, heróis, etc.) | Nada no schema `health` | Qualquer `select`/`insert` no schema `health` (teste: erro 42501) |
| App nativo (chave de ingestão por aparelho) | Enviar lote bruto a `/ingest/device`; o servidor resolve a conexão pela chave | Escolher `connectionId`/`user_id`; gravar direto; receber valores de volta pela ponte JS |
| Contas demo (inclusive admin demo) | Ver o Hoje gerado | Conectar, consentir, exportar, usar `/admin/wearables` |
| Anônimo (`anon`) | Nada | Qualquer acesso ou `execute` de saúde |

---

## 8. Estrutura do banco de dados

**Migração proposta:** `00NN_wearables.sql` (próximo número livre; 0033/0034 podem estar reservados e a 0035 está prevista para programas). Padrões herdados: `revoke all … from anon, authenticated`; políticas com `(select auth.uid())`; funções `security definer set search_path = ''` com nomes qualificados; `revoke execute … from public, anon`; `set_updated_at`.

**Mudança estrutural desta revisão:** todas as tabelas de saúde ficam no schema **`health`**, que **não** entra em "Exposed schemas" da API:

```sql
create schema health;
revoke all on schema health from public, anon, authenticated, service_role;
create role health_ingest login noinherit nobypassrls password :'health_ingest_pw';  -- senha via secret, nunca no repositório
grant usage on schema health to health_ingest;
-- após criar as tabelas:
revoke all on all tables in schema health from public, anon, authenticated, service_role;
alter default privileges in schema health revoke all on tables from public, anon, authenticated, service_role;
```

A conexão do `health_ingest` vai pelo pooler (Supavisor, modo transação) com `HEALTH_INGEST_DATABASE_URL` só na Vercel [NC: suporte do pooler a papel próprio confirmar no projeto]. A leitura da pessoa e as ações do dono são RPCs `public.*` `security definer` que filtram por `auth.uid()`.

### 8.1 Catálogo

```sql
create type health.category as enum
  ('readiness','sleep','heart','activity','workout','breathing','temperature','stress','environment','safety');
create type health.mode as enum ('auto','workout','computed');                       -- RN-01 (sem 'on_demand')
create type health.catalog_status as enum
  ('v1','v1_detail','v2','excluded_regulated','excluded_action','excluded_manual','vendor_only','not_watch','dropped');

create table health.metric_catalog (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{2,63}$'),
  category health.category not null,
  unit text not null,                 -- 'count','min','bpm','ms','pct','kcal','m','c','c_delta','score','db','ml_kg_min','s_per_km',...
  daily_agg text not null check (daily_agg in ('sum','avg','min','max','last','night','session','week','computed')),
  mode health.mode not null,
  status health.catalog_status not null,
  plaus_min numeric, plaus_max numeric,
  display_order int not null default 100,
  higher_is_better boolean
);
grant select on health.metric_catalog to authenticated;   -- só leitura descritiva; anon não lê (corrige a §8.1 anterior)
```

O catálogo vive também em TypeScript (`src/lib/health/catalog.ts`), com teste que compara TS e seed SQL e teste de que cada adaptador só referencia campos da sua lista permitida (RN-02b).

### 8.2 Consentimento

```sql
create table health.consent_texts (            -- imutável: sem update/delete (gatilho recusa)
  version text not null, locale text not null,
  body text not null, sha256 text not null,    -- calculado no insert pela migração
  material boolean not null,                   -- mudança material pausa a ingestão (RN-13)
  published_at timestamptz not null default now(),
  primary key (version, locale)
);

create table health.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,   -- a prova sobrevive à exclusão da conta
  subject_ref text not null,                   -- HMAC-SHA256(user_id, segredo no Vault): liga a prova à pessoa sem guardar o id
  policy_version text not null, locale text not null,
  text_sha256 text not null,                   -- copiado de consent_texts pela RPC, nunca enviado pelo cliente
  categories health.category[] not null,
  channel text not null check (channel in ('web','ios','android')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text check (revoke_reason in ('user','account_deleted','policy_material_change','admin_incident')),
  foreign key (policy_version, locale) references health.consent_texts(version, locale)
);
create unique index consents_one_active on health.consents(user_id) where revoked_at is null and user_id is not null;
```

- **RPCs (`public`, `security definer`, só `authenticated`):**
  - `health_consent_grant(p_version, p_locale, p_categories, p_channel)`: recusa versão que não seja a vigente, conta demo e (quando houver) menor; copia o hash do texto arquivado. A server action exige reautenticação ≤ 5 min.
  - `health_consent_update(p_categories)`: reduzir apaga **só** os dados das categorias retiradas (e os derivados que as usavam); ampliar exige reautenticação.
  - `health_consent_revoke()`: revoga, desconecta tudo, apaga e enfileira revogações (§8.3).
  - `my_health_consent()`: leitura do dono.
- **O consentimento não é dado de saúde:** é ação da pessoa e precisa ser feito por ela.

### 8.3 Conexões, credenciais e revogações pendentes

```sql
create type health.provider as enum
  ('garmin','oura','whoop','polar','google_health','apple_health','health_connect','samsung_health','aggregator');
create type health.conn_status as enum
  ('pending','active','token_expired','consent_outdated','revoked_by_provider','disabled','error');

create table health.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider health.provider not null,
  provider_user_id text,
  status health.conn_status not null default 'pending',
  scopes text[] not null default '{}',
  device_models text[] not null default '{}',      -- ex.: {'fenix 9'}; Apple: hardwareVersion → geração
  capabilities text[] not null default '{}',       -- códigos já recebidos (alimenta "esconder" e a RF-17)
  priority smallint not null default 100,
  connected_at timestamptz not null default now(),
  last_data_at timestamptz, last_sync_at timestamptz,
  last_error_code text check (last_error_code ~ '^[a-z0-9_:]+$'),
  consecutive_errors int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index conn_provider_account on health.connections(provider, provider_user_id)
  where status in ('pending','active','token_expired','consent_outdated');
create unique index conn_one_per_provider on health.connections(user_id, provider)
  where status in ('pending','active','token_expired','consent_outdated');

create table health.credentials (                     -- só health_ingest
  connection_id uuid primary key references health.connections(id) on delete cascade,
  access_token_enc bytea not null, refresh_token_enc bytea,
  token_expires_at timestamptz, key_version smallint not null,
  device_ingest_key_hash text,                     -- OBRIGATÓRIO para apple_health/health_connect (SHA-256 da chave)
  updated_at timestamptz not null default now()
);
create unique index cred_device_key on health.credentials(device_ingest_key_hash) where device_ingest_key_hash is not null;

create table health.pending_revocations (            -- sem FK em cascata: sobrevive à desconexão e à exclusão da conta
  id uuid primary key default gen_random_uuid(),
  provider health.provider not null, provider_user_id text,
  access_token_enc bytea, key_version smallint,
  attempts smallint not null default 0, next_attempt_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
```

- **Desconectar** (`public.wearable_disconnect(p_connection)`, `security definer`): `select … for update` na conexão → copia o token para `pending_revocations` → apaga dados, derivados que a usaram (§8.4) e a **linha da conexão** → audita. Tudo numa transação. A rota tenta a revogação na hora (como `health_ingest`); se falhar, o cron tenta de novo; após 7 dias, a linha some. A desconexão **nunca** espera a marca.
- **Exclusão de conta:** `anonymize_user_data` passa a fazer o mesmo enfileiramento **dentro da própria transação**, antes do `delete` em cascata. Além disso, `execute` de `delete_my_account()` é revogado de `authenticated` (hoje concedido em `0016_hardening.sql:63`); a exclusão passa a existir só pela server action, que chama `delete_account_for(p_uid)` concedida apenas ao servidor.
- **Tokens:** AES-256-GCM na aplicação; nonce aleatório de 96 bits por cifragem; AAD = `connection_id || key_version`. Chave `WEARABLE_TOKEN_KEY_V{n}` **só na Vercel** (nunca no Supabase, para não ficar ao lado dos dados cifrados). `client_secret` nunca no banco.
- **Chave por aparelho:** 256 bits aleatórios, emitida por server action com sessão + consentimento, mostrada uma única vez ao código nativo, guardada no Keychain com `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` (iOS) ou Android Keystore; escopo só de ingestão; revogada ao desconectar.

### 8.4 Métricas diárias e derivados

```sql
create table health.daily_metrics (
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references health.connections(id) on delete cascade,
  local_date date not null,
  metric_code text not null references health.metric_catalog(code),
  value numeric not null,
  scale text,                        -- escala original do fabricante (ex.: 'polar_nr_status', 'whoop_recovery_pct'); null = unidade do catálogo
  value_label text,                  -- rótulo original quando categórico (ex.: Polar "OK"/"compromised" [CP])
  method text,                       -- 'sdnn' | 'rmssd' | 'vendor:garmin_sleep_score' ...
  sample_count smallint,             -- RN-21 (mín. 2 VFC / 3 SpO₂)
  sampled_at timestamptz,            -- horário da última amostra (mostrado como "às HH:MM")
  coverage_pct smallint check (coverage_pct between 0 and 100),
  is_vendor_score boolean not null default false,
  source_device text,
  source_updated_at timestamptz,
  normalizer_version smallint not null,
  ingested_at timestamptz not null default now(),
  primary key (user_id, local_date, metric_code, connection_id)
);
create index dm_user_metric_date on health.daily_metrics(user_id, metric_code, local_date desc);

create table health.derived (                      -- tudo o que é calculado pelo UH
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  code text not null references health.metric_catalog(code),   -- disposition_uh, night_vitals_uh, cardio_load_day_uh, training_load_*, sleep_regularity, intensity_min_weighted…
  value numeric, detail jsonb not null default '{}',             -- componentes (sem PII), versão do cálculo
  inputs uuid[] not null,                                        -- conexões cujos dados entraram no cálculo
  calc_version smallint not null, computed_at timestamptz not null default now(),
  primary key (user_id, local_date, code)
);
create index derived_inputs on health.derived using gin (inputs);
```

- **Por que estreito:** nova métrica/marca sem migração; FK para o catálogo; ~60 métricas × 395 dias ≈ 24 mil linhas por pessoa e fonte.
- **Derivados separados:** ao desconectar uma fonte, `delete from health.derived where inputs && array[conn]` e recálculo com o que sobrou (enfileirado). Resolve o caso Garmin + Oura em que a Disposição usava VFC e carga da Garmin (RN-14, art. 16).
- **Derivados só em TypeScript** (`src/lib/health/derived.ts`), chamados pelo worker e pelo gerador demo. Nada de cálculo duplicado em SQL.

### 8.5 Sessões de sono

```sql
create table health.sleep_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references health.connections(id) on delete cascade,
  external_id text not null,
  local_date date not null,             -- dia em que acorda (RN-05)
  start_at timestamptz not null, end_at timestamptz not null, tz_offset_min smallint,
  is_main boolean not null default true, is_nap boolean not null default false,
  in_bed_min int,                       -- null para Apple (vem do iPhone [NC])
  asleep_min int, deep_min int, light_min int, rem_min int, awake_min int,
  latency_min int,                      -- null para Apple
  efficiency_pct smallint,              -- Apple: asleep ÷ (asleep + awake) dentro da sessão
  vendor_score smallint, vendor_score_scale text,
  lowest_hr smallint,
  hypnogram jsonb,                      -- ≤ 2 KB
  normalizer_version smallint not null, source_updated_at timestamptz, ingested_at timestamptz not null default now(),
  unique (connection_id, external_id),
  check (end_at > start_at)
);
create index ss_user_date on health.sleep_sessions(user_id, local_date desc);
```

### 8.6 Treinos (sem rota GPS)

```sql
create table health.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references health.connections(id) on delete cascade,
  external_id text not null,
  local_date date not null,
  sport text not null,
  origin text not null check (origin in ('started_on_device','auto_detected')),   -- RN-20 (digitado/web upload nunca entra)
  start_at timestamptz not null, end_at timestamptz not null,
  duration_s int not null, distance_m numeric, active_kcal numeric,
  avg_hr smallint, max_hr smallint, hr_zone_s int[] check (cardinality(hr_zone_s) = 5 or hr_zone_s is null),
  hr_recovery_1min smallint,
  elevation_gain_m numeric, avg_speed_mps numeric,      -- ritmo derivado na exibição (s/km)
  avg_cadence numeric, avg_power_w numeric,
  trimp numeric,                                        -- carga UH do treino
  vendor_effort numeric, vendor_effort_scale text,      -- só esforço ESTIMADO pelo relógio; nunca o dado pela pessoa
  metrics jsonb not null default '{}',                  -- v2: dinâmica de corrida, natação, mergulho, perda de suor estimada
  normalizer_version smallint not null, source_updated_at timestamptz, ingested_at timestamptz not null default now(),
  unique (connection_id, external_id)
);
create index wo_user_date on health.workouts(user_id, local_date desc);
```

**Decisão mantida:** sem rota GPS. `activityDetails` da Garmin e `HKWorkoutRoute` são ignorados.

### 8.7 Amostras intradiárias (F6)

```sql
create table health.intraday_day (
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references health.connections(id) on delete cascade,
  metric_code text not null check (metric_code in ('hr_bpm','stress_level','body_battery','steps')),
  local_date date not null, step_s smallint not null default 300,
  values real[] not null,                 -- 288 posições; null = sem amostra
  primary key (user_id, metric_code, local_date, connection_id)
);
```

Uma linha por dia e métrica (~120 mil linhas para 1.000 pessoas × 30 dias). Entra na **F6**.

### 8.8 Entrada bruta (inbox) e auditoria

```sql
create table health.ingest_events (
  id uuid primary key default gen_random_uuid(),
  provider health.provider not null,
  connection_id uuid not null references health.connections(id) on delete cascade,  -- resolvida ANTES de gravar
  provider_event_id text, idempotency_key text,
  payload_sha256 text not null,
  kind text not null,
  status text not null default 'received' check (status in ('received','processing','done','failed','dead','ignored')),
  attempts smallint not null default 0, next_attempt_at timestamptz,
  last_error_code text check (last_error_code ~ '^[a-z0-9_:]+$'),   -- só códigos enumerados (RN-12)
  payload jsonb,                               -- null quando 'ignored'; anulado no prazo da §8.10
  received_at timestamptz not null default now(), processed_at timestamptz,
  unique (connection_id, payload_sha256)
);
create unique index ie_provider_event on health.ingest_events(provider, provider_event_id) where provider_event_id is not null;
create unique index ie_idem on health.ingest_events(connection_id, idempotency_key) where idempotency_key is not null;
create index ie_pending on health.ingest_events(status, next_attempt_at) where status in ('received','failed');

create table health.audit (                   -- nunca guarda valores de saúde
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  actor text not null check (actor in ('user','system','admin')), actor_id uuid,
  action text not null,
  provider health.provider, connection_id uuid,
  detail jsonb not null default '{}',           -- contagens, códigos; função recusa chaves do catálogo
  created_at timestamptz not null default now()
);
```

**Regras do inbox:**
- **Assinatura inválida → 401 sem gravar nada**; só incrementa um contador por provedor (métrica operacional).
- **Conexão resolvida antes de gravar.** Sem conexão `active` + consentimento vigente: grava só metadados (`status='ignored'`, `payload=null`) ou nada, se nem a conexão existir.
- **Interruptor de provedor desligado:** `ignored` sem payload.

### 8.9 Grants, RLS e gatilhos (resumo)

| Objeto | anon | authenticated | service_role | health_ingest |
|---|---|---|---|---|
| `health.metric_catalog` | — | `select` | — | `select` |
| `health.consent_texts` | — | via RPC | — | `select` |
| `health.consents` | — | via RPC do dono | — | `select` |
| `health.connections` | — | via RPC `my_wearable_connections()` (só colunas seguras) | — | `select/insert/update/delete` |
| `health.credentials`, `health.pending_revocations` | — | — | — | `select/insert/update/delete` |
| `health.daily_metrics`, `sleep_sessions`, `workouts`, `derived`, `intraday_day` | — | via RPC `my_health_today(p_date)` / `my_health_export()` | — | `select/insert/update/delete` |
| `health.ingest_events` | — | — | — | `select/insert/update` |
| `health.audit` | — | via RPC `my_health_audit()` (só `action`, `provider`, `created_at`) | — | `insert` |

- **RLS ligada em todas as tabelas** com política `to health_ingest using (true)` (defesa extra caso um grant escape) e nenhuma política para outros papéis.
- **Gatilhos `before insert or update`** nas tabelas de dados recusam quando: não há consentimento ativo; a categoria da métrica não está em `consent.categories`; `connection.status <> 'active'`; o usuário é demo.
- **Concorrência:** o worker abre a transação com `select … from health.connections where id = $1 for share`; desconexão e exclusão usam `for update`. Um worker que leu `active` não consegue inserir depois do delete.
- **Admin:** RPC `admin_wearables_ops()` só com contagens, piso de 5 por célula, exige `is_admin() and not is_demo(auth.uid())`.
- **Funções:** `revoke execute … from public, anon`; RPCs do dono com `grant` para `authenticated`.

**Testes (`supabase/tests/rls_scenarios.sql`):**
- `set role service_role; select … from health.daily_metrics` → **42501** (e o mesmo para `authenticated` e `anon`);
- dono lê os próprios dados pela RPC; outro usuário recebe vazio;
- `authenticated` não grava; categoria não consentida não grava; demo não conecta nem chama `admin_wearables_ops`;
- desconectar apaga dados, derivados com aquela conexão e a linha da conexão, e cria `pending_revocations`;
- `delete_my_account` não executável por `authenticated`; `anonymize_user_data` apaga tudo e enfileira revogações;
- consentimento sobrevive à exclusão da conta com `user_id null` e `subject_ref`;
- `last_error_code` recusa texto livre.

### 8.10 Retenção (proposta)

| Conjunto | Prazo | Mecanismo |
|---|---|---|
| `daily_metrics`, `sleep_sessions`, `workouts`, `derived` | **13 meses** móveis enquanto conta e consentimento existirem (Q11) | `run_retention()` diário |
| `intraday_day` | **30 dias** | idem |
| `ingest_events.payload` | **7 dias** para Oura/WHOOP/Polar/app nativo (a marca permite re-buscar); **30 dias para Garmin Starter** se Q15 aprovar (sem histórico, é a única forma de reprocessar), declarado no RIPD. Linha com metadados: 30 dias | idem |
| `pending_revocations` | até sucesso ou **7 dias** | cron de wearables |
| `audit` | **365 dias** | idem |
| `consents` | enquanto a conta existir + **5 anos** após a revogação, já sem `user_id` após a exclusão (só `subject_ref`) — prazo a confirmar com o jurídico | idem |
| Conexão inativa (> 180 dias sem dado) | aviso; aos 12 meses, desconecta e apaga | cron |
| Revogada na marca | 30 dias para decidir; depois apaga | cron |
| Desconexão, redução de categoria ou revogação | **imediato** | RPC na mesma transação |
| Exclusão de conta | **imediato** (revogação na marca pela fila) | `anonymize_user_data` |
| Mudança material sem novo aceite | N dias (Q20), depois apaga | cron |
| `routine_items`/`routine_checks` antigos | 90 dias após a F1 (se Q5 = apagar) | `run_retention()` |
| Backups | Supabase **Pro**: backups diários guardados por 7 dias → a política diz "dados apagados somem dos backups em até 7 dias". PITR é complemento pago (exige compute Small) e não é necessário | — |

---

## 9. APIs e integrações

### 9.1 Caminho recomendado

| Opção | Cobre | Custo | Prazo [EST] | Prós | Contras |
|---|---|---|---|---|---|
| **A. Direto, nuvem** (Garmin Starter, Oura, WHOOP, Polar) | Garmin (bruto, Body Battery, estresse, Sleep Score), Oura, WHOOP, Polar | Grátis nas marcas (Garmin Starter; demais sem taxa confirmada) | 1–2 semanas por marca após aprovação | Funciona no PWA; banco em sa-east-1 | Aprovação por marca; Garmin Starter sem histórico e só push; WHOOP limita a 10 membros até revisão; Oura exige assinatura do usuário |
| **B. App nativo próprio** (Capacitor apontando para a URL de produção + plugin nativo próprio) | Apple Watch (HealthKit); Galaxy/Pixel via Health Connect (subconjunto, §13.3) | US$ 99/ano (Apple) + US$ 25 único (Play) + desenvolvimento | **10–16 semanas** até beta externo no TestFlight [EST] | Único caminho para Apple Watch | Risco da regra 4.2 (app que é "site empacotado"); revisão HealthKit; Privacy Manifest; formulário "Health apps"; entrega em segundo plano ≤ ~1×/h |
| **C. Agregador** (Terra, Thryve, Sahha, ROOK, Junction, Spike) | Nuvem numa integração; Apple ainda exige SDK num app nativo | US$ 300–500/mês + por usuário [NC] | 2–4 semanas + app nativo | Rapidez; Garmin possivelmente já aprovado [NC] | Custo recorrente; transferência internacional (art. 33); os índices proprietários continuam sem sair |
| D. Ponte sem app (Atalhos/Health Auto Export) [CP] | Apple, precário | — | 1 semana | Prova de conceito | Não recomendo nem para teste com dado real |

**Por que o app nativo não é "a mesma interface empacotada":** o Next 15 com server actions, cookies e middleware não sai em `output: 'export'` (só exportação estática sem esses recursos). O shell carrega a **URL de produção** numa WebView. Consequências e mitigação:
- Risco 4.2 → tela **nativa** de status de sincronização (o que foi lido, quando, permissões), além da WebView.
- Ponte nativa exposta a conteúdo remoto → o plugin **não devolve valores ao JS**: só `requestAuthorization()` e `syncNow()`, que retornam um status; navegação e ponte restritas à **origem exata** de produção (`allowNavigation`), CSP estrita no site.
- A F5a **começa** com uma prova de conceito do shell que precisa passar pela revisão de beta externo do TestFlight.

**Recomendação:**
1. **Agora, sem custo de marca:** construir o que independe de credencial (§9.8) e pedir o Garmin Starter assim que houver CNPJ, domínio, site e política.
2. **Em paralelo, depois da conta Apple de organização (F0):** app iOS com PoC do shell primeiro.
3. **Depois:** Oura, WHOOP, Polar. Google Health API só após revisão de escopos restritos (Fitbit Web API morre em 30/10/2026).
4. **Agregador** só se a Garmin negar ou demorar > 60 dias.
5. **Samsung Health Data SDK:** fora (parceria [NC]).

**Residência e operadores:** o banco fica em sa-east-1 e as funções em gru1, mas **Vercel Inc. e Supabase Inc. são operadores estrangeiros** (suporte, logs e observabilidade podem estar fora do país [NC]). Entram no mapa de transferências do RIPD; verificar se os DPAs adotam as cláusulas-padrão da ANPD (Res. CD/ANPD 19/2024) [NC]; não ligar log drain nem observabilidade que capture corpo de requisição.

### 9.2 Contrato interno normalizado

```ts
// src/lib/health/types.ts
export type NormalizedBatch = {
  provider: HealthProvider; normalizerVersion: number;            // SEM connectionId/userId: o servidor resolve
  daily: { localDate: string; code: MetricCode; value: number; scale?: string; valueLabel?: string;
           method?: string; sampleCount?: number; sampledAt?: string; coveragePct?: number;
           isVendorScore?: boolean; sourceDevice?: string; sourceUpdatedAt?: string }[];
  sleep: SleepSessionInput[]; workouts: WorkoutInput[];
  intraday?: { code: "hr_bpm" | "stress_level" | "body_battery" | "steps"; localDate: string; stepS: 300; values: (number | null)[] }[];
  deletions?: { kind: "sleep" | "workout"; externalId: string }[];
};
export interface ProviderAdapter {
  provider: HealthProvider;
  allowedFields: Record<string, readonly string[]>;              // RN-02b: por tipo de payload
  verifyWebhook(req: Request, rawBody: string): Promise<{ ok: boolean; eventId?: string }>;
  parseWebhook(rawBody: string): Promise<{ providerUserId: string; kind: string; payload: unknown }[]>;
  fetchRange?(conn: ConnectionCtx, from: string, to: string): Promise<unknown[]>;
  normalize(kind: string, payload: unknown, ctx: { tzFallback: string; consentedCategories: HealthCategory[] }): NormalizedBatch;
  revoke?(cred: DecryptedCredential): Promise<void>;
  oauth?: { authorizeUrl: string; tokenUrl: string; scopes: string[]; pkce: boolean };
}
```

- **Pipeline:** adaptador → `pick(allowedFields)` → filtro de origem/digitação (RN-20) → `normalize` (puro, testado com fixtures) → `validate` (catálogo, categoria consentida, plausibilidade, RN-21) → `upsertBatch` (uma transação por conexão, `for share`, upsert condicional RN-10) → `recompute(user, dates)` em TS → atualiza `capabilities`, `last_data_at`.
- **App nativo:** o código **Swift/Kotlin** faz as consultas com âncora, as somas diárias (`HKStatisticsCollectionQuery` com predicado de relógio) e o filtro de digitação, e envia um **DTO bruto versionado** (`apple_dto_v1`, `hc_dto_v1`) com metadados de cada amostra (origem, `HKDevice.model`, `hardwareVersion`, `wasUserEntered`, tipo de aparelho). O mapeamento para o catálogo é o adaptador `apple_health`/`health_connect` **no servidor**, com um único `normalizer_version`. O servidor reaplica os filtros.

### 9.3 Endpoints e ações

| Rota/ação | Método | Autenticação | Função |
|---|---|---|---|
| `/api/wearables/oauth/[provider]/start` | GET | sessão | Confere consentimento vigente, demo, interruptor e env; `state` + PKCE |
| `/api/wearables/oauth/[provider]/callback` | GET | sessão + `state` | Troca o código, cifra tokens, cria a conexão, registra **só os endpoints das categorias consentidas**, audita |
| `/api/wearables/webhooks/[provider]` (Garmin: `/webhooks/garmin/[token]`) | POST | assinatura da marca ou token de caminho (§9.4) | Verifica (401 sem gravar se falhar), resolve conexão, grava no inbox, 200 em < 1 s, processa em `after()` |
| `/api/wearables/ingest/device` | POST | `Authorization: Device <chave>` + `Idempotency-Key` | Lote bruto do app nativo (≤ 500 registros, ≤ 512 KB, ≤ 60 lotes/h por conexão). Conexão resolvida **pela chave** (`provider in ('apple_health','health_connect')`, `status='active'`); `connectionId`/`user_id` do corpo são ignorados. Recusa fixtures quando `VERCEL_ENV=production` |
| `/api/cron/wearables` | GET | `WEARABLES_TICK_SECRET` (próprio; não é o `CRON_SECRET`) | A cada 10 min: novas tentativas, revogações pendentes, renovação de tokens, recálculo das 04:00 locais, conexões paradas |
| `/api/cron/retention` (existente) | GET | `CRON_SECRET` | Passa a chamar a purga de saúde |
| Server actions `profile/devices/actions.ts` | — | sessão (+ reautenticação ≤ 5 min onde indicado) | `grantHealthConsent`*, `updateHealthConsent`* (ampliar), `revokeHealthConsent`, `disconnectWearable`, `setPrimarySource`, `issueDeviceKey`, `exportMyHealthData`*, `dismissHint`, `dismissRoutineNotice` (* = reautenticação) |
| RPC `my_health_today(p_date)` | — | `authenticated` (`security definer`, filtra por `auth.uid()`) | Séries resolvidas de 35 dias, derivados, capacidades, frescor, num JSON |
| RPC `admin_wearables_ops()` | — | admin não demo | Só contagens |

### 9.4 Webhooks: verificação por marca

| Marca | Verificação | Observação |
|---|---|---|
| WHOOP v2 | HMAC-SHA256 sobre `timestamp + body` (`X-WHOOP-Signature`, `X-WHOOP-Signature-Timestamp`) [CP] | Buscar o recurso pela API |
| Polar AccessLink | HMAC-SHA256, `Polar-Webhook-Signature` [CP] | Limite 500 + 20×usuários / 15 min |
| Oura v2 | Desafio na inscrição; assinatura nas entregas [NC] | Buscar o recurso pela API |
| Garmin | Sem HMAC documentado publicamente [NC]. **(a)** Confirmar no portal se a Starter oferece pull/ping ou assinatura. **(b)** Se for só push: token de caminho ≥ 128 bits por ambiente, rotacionável (dois válidos durante a troca), comparado em tempo constante; aceitar só `userId` de conexão `active`; limite de tamanho (1 MB) e de taxa por `userId`. **(c)** No modo ping, buscar `callbackURL` **só** se for `https` e o host for exatamente `apis.garmin.com` (anti-SSRF com o nosso token). | Limitação: o caminho com o token aparece nos logs de requisição da própria Vercel, que não controlamos [NC]; mitigação: acesso aos logs restrito e rotação periódica |
| Agregador | HMAC (`terra-signature`) [CP] | — |

**Regras comuns:** tempo constante; tolerância de 5 min no carimbo; anti-replay pelos índices únicos; corpo ≤ 1 MB; logs só com id do evento, provedor, status e tempo.

### 9.5 Idempotência, reprocessamento e novas tentativas

- **Idempotência em três níveis:** evento único **por conexão** (`connection_id` + hash/`provider_event_id`/`Idempotency-Key`); chave natural na tabela; upsert condicional com `coalesce(source_updated_at, ingested_at)`.
- **Reprocessar:** Oura/WHOOP/Polar/Google re-buscam com `fetchRange`. **Garmin Starter não permite** (push sem histórico): só dá para reprocessar a partir do payload retido — por isso a Q15 (reter 30 dias ou aceitar a perda). App nativo: o aparelho reenvia a partir da âncora anterior quando o servidor pede (`resync_from` na resposta).
- **Novas tentativas:** 1, 5, 30 min, 2 h, 12 h; após 6 falhas, `dead` (só código de erro, sem payload visível).
- **Tique de 10 min:** `pg_cron` + `pg_net` chamando `/api/cron/wearables` com `WEARABLES_TICK_SECRET` guardado no **Supabase Vault** (o texto do job não contém o segredo; lido no momento da chamada [CP]). O mesmo tique faz o recálculo das "04:00 locais" de cada pessoa.

### 9.6 Deduplicação e prioridade entre fontes

Resolução na leitura (`my_health_today`). Para cada (`user`, `date`, `code`):
1. fonte principal escolhida pela pessoa para a categoria;
2. regra padrão: sono, temperatura, VFC/SpO₂ noturnas: anel (Oura) > WHOOP > relógio com melhor cobertura; atividade e passos: relógio de pulso > anel; estresse e Body Battery: só a fonte que mede;
3. maior `coverage_pct`;
4. mais recente.

Treinos: união com deduplicação (§5.1). A fonte escolhida aparece no detalhe.

### 9.7 Contrato com o app nativo (resumo)

- **iOS:**
  - entitlements `com.apple.developer.healthkit` + `…healthkit.background-delivery`; `NSHealthShareUsageDescription` nos 3 idiomas; **Privacy Manifest**;
  - pedir **só** os tipos v1/v1d das categorias consentidas (nada da RN-03 nem da RN-02);
  - `HKAnchoredObjectQuery` por tipo; somas com `HKStatisticsCollectionQuery` e predicado `HKDevicePropertyKeyModel = "Watch"`; descartar `HKMetadataKeyWasUserEntered`;
  - observador + entrega em segundo plano chamando **sempre** o completion handler (3 falhas e o iOS para de entregar);
  - autenticação em segundo plano pela **chave por aparelho** no Keychain (`AfterFirstUnlockThisDeviceOnly`); nada em UserDefaults/Preferences; nada em iCloud.
- **Android:**
  - Health Connect com permissões por tipo; `READ_HEALTH_DATA_IN_BACKGROUND`; WorkManager a cada 1 h;
  - filtros: `recordingMethod != MANUAL_ENTRY`, `metadata.device.type in (WATCH, RING)`, `dataOrigin` = app da marca do relógio (Samsung Health, Fitbit/Pixel [CP]);
  - chave no Android Keystore.
- **Ponte JS:** só `requestAuthorization()`, `syncNow()`, `status()`; nenhum valor de saúde cruza a ponte.

### 9.8 O que dá para construir JÁ, sem credenciais

1. Catálogo TS + SQL, matriz por modelo e tabela de uma página (§13.1–13.6).
2. Schema `health`, papel `health_ingest`, grants, RLS, gatilhos e cenários (inclusive 42501 para `service_role`), `anonymize_user_data` com fila de revogações, `delete_my_account` endurecida, retenção.
3. Adaptadores com **lista permitida** e fixtures: Garmin (campos [OW], marcados), Oura, WHOOP, Polar; `apple_health`/`health_connect` a partir do DTO bruto definido por nós.
4. `/ingest/device` testável com `curl` e fixtures **em local/staging** (recusa fixtures em produção).
5. OAuth genérico e webhooks com verificação; provedor desligado sem env ou sem interruptor.
6. Consentimento por categoria (textos arquivados, reautenticação), Relógios e anéis, desconectar, exportar.
7. **UI completa do novo Hoje** (dois blocos), detalhe, estados, dicas RF-17, **gerador demo**.
8. Painel de admin (com guarda anti-demo), auditoria, limpeza do `localStorage`, "Continue seus programas".
9. Documentos: `privacy-and-retention.md`, insumos do RIPD (inclusive Vercel/Supabase como operadores estrangeiros), `legal.json`, plano de incidente.

### 9.9 Gerador determinístico de demonstração

**Princípios:**
- Função pura em `src/lib/health/demo/generate.ts`, no servidor; **nunca grava** e nunca usa dado real.
- Só quando `app_metadata.ultra_hero_demo === true` lido no servidor.
- Mesmo formato de `my_health_today`, tudo com `demo: true`.
- Usa as **mesmas** funções TS de validação, linha de base e derivados (`derived.ts`) que o worker.
- Só emite códigos **v1/v1d ∩ coluna da matriz do modelo simulado** (RN-22).

**Persona por conta:**

| Conta | Dispositivo simulado | O que demonstra |
|---|---|---|
| admin | Apple Watch Series 12 | Anéis com metas, luz do dia e ruído (linha de Ambiente), VFC noturna (SDNN/RMSSD) e VFC diurna no detalhe, Disposição UH principal + nota "a Apple não compartilha a Prontidão" |
| herói | Garmin fēnix 9 | Body Battery com horário e carregado/gasto, estresse, Sleep Score Garmin, passos vs. meta, intensidade semanal vs. meta, idade fitness no detalhe, treinos com ritmo, zonas e carga do dia, nota "a Garmin não compartilha Training Readiness" |
| fornecedor | Galaxy Watch9 via Health Connect | O que a Samsung realmente envia: passos, FC, sono com estágios, SpO₂, treinos com VO₂máx. **Sem** VFC, FC de repouso, temperatura, respiração, andares, Disposição UH e estresse (escondidos) |
| premium | Garmin Forerunner 970 + Oura Ring 4 | Duas fontes: sono, temperatura e Sinais da noite do anel; atividade do relógio; Readiness Oura principal e Disposição UH recolhida |
| gratuito | Apple Watch SE 3 | Métricas escondidas: sem SpO₂; VFC com poucas leituras (às vezes escondida, RN-21); sem nota de Prontidão Apple |

**Algoritmo (determinístico por conta e data):**

```
seed(d)  = fnv1a32(`${kind}:${d}`) → mulberry32
persona  = { rhr0: 52..64, hrv0: 35..70 (método da fonte), sleepNeed: 7.5h, steps0: 6–11k, vo2: 38..52,
             trainingDays, wakeTime: 6:30±0:40, capabilities: coluna da §13.3 }
episódio = a cada ~23 dias, 3 dias "corpo pedindo pausa": temp +0,3..0,6 °C, FC rep. +3..6, VFC −15..25%, resp +0,8, sono +40 min
para cada dia d (d−35 … hoje):
  loadPrev  = TRIMP de d−1
  sleepQ    = N(0, 0,8) − 0,35·[loadPrev alto e tardio] − 0,5·[sexta/sábado] + 0,6·[episódio]
  sleepMin  = sleepNeed·60 + 35·sleepQ ± 20, limitado a 300..560
  deep/rem  = 15–22% / 20–25%; awake = 3–8%
  hrv       = hrv0 · exp(0,08·sleepQ − 0,06·z(loadPrev) − 0,2·[episódio] + N(0, 0,05)); nº de amostras conforme o modelo (SE 3: 0–3)
  rhr       = rhr0 − 1,5·sleepQ + 1,2·z(loadPrev) + 4·[episódio] + N(0, 0,8)
  spo2, resp, tempDelta, steps, treino (com distância → ritmo), stress, Body Battery (com horário da última amostra)
  derivados = MESMAS funções de derived.ts (disposition_uh, night_vitals_uh, cardio_load_day_uh…)
  filtro    = descarta todo código fora de capabilities ∩ {v1, v1d}
hoje: acumulativos cortados pela hora local do perfil ("até HH:MM"); a noite passada completa
```

**Testes de propriedade** (365 dias por persona): correlações sono×VFC > 0,3, sono×Disposição > 0,4, FC rep.×VFC < −0,3; 100% plausível; determinismo; **nenhum código fora de (v1 ∪ v1d) ∩ capacidades da persona**; Galaxy nunca emite `hrv_night`, `hr_resting`, `skin_temp_*`, `resp_rate_*`, `floors_*`, `disposition_uh`.

**Rótulo:** "Dados de demonstração — simulam um {dispositivo}. Nada aqui é de uma pessoa real." no cabeçalho, selo "Demo" em cada card e no `aria-label`.

**Contas reais:** "Ver um exemplo" abre uma prévia estática da persona Apple Watch Series 12 com a mesma faixa.

---

## 10. Automações

| Automação | Gatilho | O que faz |
|---|---|---|
| Processar webhook / lote | `after()` após o 200 | Lista permitida → filtros → normaliza → valida → upsert (`for share`) → recalcula derivados em TS → `capabilities`, `last_data_at` |
| Tique de wearables | `pg_cron` a cada 10 min → `/api/cron/wearables` (`WEARABLES_TICK_SECRET` no Vault) | Novas tentativas; revogações pendentes; renovação de tokens (< 24 h; 3 falhas → `token_expired`); recálculo das 04:00 locais; conexões paradas |
| Revogações pendentes | tique | Tenta `adapter.revoke`; sucesso ou 7 dias → apaga a linha |
| Histórico inicial | callback / 1ª autorização no app | 30 dias quando a fonte permite; Garmin Starter não tem |
| Dica de recurso desligado | tique diário por conexão com ≥ 7 dias e modelo conhecido | Matriz esperada − `capabilities` → dica única (RF-17) |
| Conexão parada | tique | > 72 h: card; > 180 dias: aviso; 12 meses: desconecta e apaga |
| Revogação pela marca | evento / 401 | `revoked_by_provider`; após 30 dias, apaga |
| Mudança material da política | publicação de `consent_texts` com `material = true` | Conexões → `consent_outdated`, ingestão pausada, card pede novo aceite; após N dias (Q20), apaga |
| Retenção | `/api/cron/retention` (diário) | Prazos da §8.10 |
| Exclusão de conta | server action → `delete_account_for` | `anonymize_user_data` enfileira revogações e apaga tudo na mesma transação |
| Interruptor por provedor | admin não demo | Webhook responde 200 e marca `ignored` sem payload; OAuth bloqueado; dados antigos visíveis |
| Limpeza local | 1ª renderização do novo Hoje no aparelho | Remove `uh:today:*` |

**Sem notificações push na v1.**

---

## 11. Relatórios

1. **Para a pessoa**
   - **"Sua semana"** (v2).
   - **Exportação** (RF-10): JSON + CSV com métricas diárias, sono, treinos, derivados, conexões e consentimentos; reautenticação ≤ 5 min; até 3/dia; download imediato com `Cache-Control: no-store`; auditada; desligada em contas demo.
2. **Operacional (admin não demo, sem valores):** conexões ativas por provedor; novas e revogadas por dia; taxa de sucesso; latência p50/p95; `failed`/`dead` por código; assinaturas inválidas recusadas (contador); revogações pendentes; tokens expirados; conexões paradas > 72 h; prazo de exclusão.
3. **Conformidade (encarregado):** consentimentos por versão e categoria; reduções de categoria; exclusões; exceções de retenção abertas; incidentes registrados (Res. 15/2024, guarda de 5 anos); operadores e transferências (Vercel, Supabase, agregador se houver).

## 12. Dashboards

- **Pessoa:** o próprio Hoje e os detalhes (§6).
- **Admin `/admin/wearables`** (guarda `is_admin() and not is_demo`): cards de contagem; eventos por status (24 h / 7 d); provedores com interruptor e estado das envs; fila `dead` com "reprocessar" (tipo, data e **código** de erro, sem payload); células com n < 5 aparecem como "< 5".
- **Heróis e fornecedores:** nenhum painel com dado de relógio (RN-15).

## 13. Indicadores

### 13.1 Catálogo canônico de métricas

Legenda:
- **Modo:** A = automático; T = treino iniciado no relógio ou detectado; C = calculado pelo Ultra Hero.
- **Status:** **v1** = no card do Hoje; **v1d** = v1, só no detalhe; v2 = depois; ✕reg = regulado; ✕ação = exige gesto da pessoa no relógio (fora até Q13); ✕man = digitado/registro manual; ✕vend = só no app da marca; ✕fora = não é medido pelo relógio; ✕desc = descartado por decisão.

**Índices do dia (categoria `readiness`)**

| Código | Nome pt-BR | Unid. | Agregação | Freq. | Modo | Status |
|---|---|---|---|---|---|---|
| `readiness_vendor` | Índice de prontidão da marca (Oura Readiness, WHOOP Recovery, Polar Nightly Recharge) | escala original (`value` + `scale` + `value_label`) | last | diária | A | v1 (principal quando existe) |
| `body_battery_now` | Body Battery™ (último valor e horário, `bodyBatteryMostRecentValue` [OW]) | 5–100 | last | 3 min | A | v1 |
| `body_battery_high` / `_low` | Body Battery máx. / mín. | 5–100 | max / min | 3 min | A | v1 |
| `body_battery_charged` / `_drained` | Body Battery carregado / gasto | pontos | sum | diária | A | v1 [OW] |
| `day_strain` | Strain do dia (WHOOP) | 0–21 | last | contínua | A | v1 |
| `cardio_load_vendor` | Carga cardio da marca (Polar) | escala original | sum | diária | A | v1d (F6) |
| `resilience_level` | Resiliência (Oura) | 1–5 | last | diária | A | v2 |
| `disposition_uh` | **Disposição Ultra Hero** (faixa: abaixo / no / acima do seu habitual; 0–100 só no detalhe) | faixa + 0–100 | computed | diária | C | v1 (principal só sem índice da marca; exige VFC ou FC de repouso) |
| `night_vitals_uh` | **Sinais da noite** (5 componentes vs. faixa habitual) | n de 5 | computed | noite | C | v1 |
| `cardio_load_day_uh` | **Carga do dia** (TRIMP de Edwards pelas zonas do dia e dos treinos) vs. faixa habitual | pontos | computed | diária | C | v1 |
| `training_load_acute_7d` / `_chronic_28d` / `load_ratio` | Carga 7 d / 28 d / razão | pontos / razão | computed | diária | C | v1d |

**Sono**

| Código | Nome pt-BR | Unid. | Agregação | Freq. | Modo | Status |
|---|---|---|---|---|---|---|
| `sleep_asleep_min` | Tempo dormindo | min | night | noite | A | v1 |
| `sleep_deep_min` / `_light_min` / `_rem_min` / `_awake_min` | Profundo / Leve / REM / Acordado | min | night | noite | A | v1 |
| `sleep_start_local` / `sleep_end_local` | Dormiu / acordou | min desde 12:00 | night | noite | A | v1 |
| `sleep_score_vendor` | Nota do sono da marca (Garmin, Oura, WHOOP, Polar) | escala original | night | noite | A | v1 |
| `sleep_in_bed_min` | Tempo na cama | min | night | noite | A | v1d (escondido para Apple: vem do iPhone [NC]) |
| `sleep_efficiency_pct` | Eficiência do sono | % | night | noite | A/C | v1d (Apple: dormindo ÷ (dormindo + acordado)) |
| `sleep_latency_min` | Tempo para adormecer | min | night | noite | A | v2 (escondido para Apple) |
| `sleep_regularity` | Regularidade do sono | 0–100 | computed (13 noites) | diária | C | v1d |
| `nap_count` / `nap_min` | Cochilos | n / min | sum | evento | A | v1d |
| `sleep_hr_lowest` | FC mais baixa no sono | bpm | min | noite | A | v1d |
| `sleep_need_min` / `sleep_debt_min` | Necessidade / débito de sono | min | last | diária | A | v2 |
| `sleep_breathing_disturbances` | Distúrbios respiratórios no sono | n/h | night | noite | A | v2 (só com parecer) |
| `sleep_score_uh` | Nota do sono Ultra Hero | — | — | — | — | ✕desc (competiria com a nota da Apple; mostramos os componentes) |

**Coração**

| Código | Nome pt-BR | Unid. | Agregação | Freq. | Modo | Status |
|---|---|---|---|---|---|---|
| `hr_resting` | FC de repouso | bpm | last | diária | A | v1 (em Sinais da noite) |
| `hrv_night` | VFC noturna (`method` sdnn/rmssd; RN-21) | ms | night | noite | A | v1 (em Sinais da noite) |
| `vo2max` | VO₂máx estimado / Aptidão cardio | mL/kg·min | last | após treino | T | v1 (detalhe de Treinos e card quando muda) |
| `hr_avg` / `hr_min` / `hr_max` | FC média / mín. / máx. do dia | bpm | avg/min/max | contínua | A | v1d |
| `hr_walking_avg` | FC média caminhando (Apple) | bpm | last | diária | A | v1d |
| `hrv_day_avg` | VFC diurna | ms | avg | periódica | A | v1d |
| `hr_recovery_1min` | Recuperação da FC em 1 min | bpm | last (por treino) | treino | T | v1d |
| `fitness_age` | Idade fitness (Garmin, `userMetrics` [OW]) | anos | last | semanal | A | v1d |
| `hr_zone1_min` … `hr_zone5_min` | Tempo em zonas de FC | min | sum | contínua | A/T | v1d |
| `cardiovascular_age` | Idade cardiovascular (Oura) | anos | last | semanal | A | v2 |
| `ecg_*`, `irregular_rhythm_event`, `afib_burden`, `hypertension_event`, `high_hr_event`, `low_hr_event`, `low_cardio_fitness_event` | Funções e notificações cardíacas | — | — | — | — | ✕reg (RN-03) |

**Atividade**

| Código | Nome pt-BR | Unid. | Agregação | Freq. | Modo | Status |
|---|---|---|---|---|---|---|
| `steps` | Passos (só relógio, salvo Q14) | n | sum | contínua | A | v1 |
| `distance_m` | Distância | m | sum | contínua | A | v1 |
| `active_kcal` / `basal_kcal` | Calorias ativas / em repouso | kcal | sum | contínua | A | v1 / v1d |
| `move_goal_kcal`, `exercise_goal_min`, `stand_goal_h` | Metas dos anéis (Apple, `HKActivitySummary` [CP]) | kcal / min / h | last | diária | A | v1 (Apple) |
| `exercise_min` | Exercício (anel Apple) | min | sum | contínua | A | v1 (Apple) |
| `stand_hours` / `stand_min` | Em pé (anel Apple) / minutos em pé | h / min | sum | por hora | A | v1 / v1d |
| `steps_goal` | Meta de passos do relógio (Garmin `dailyStepGoal` [OW]) | n | last | diária | A | v1 |
| `intensity_min_week` / `intensity_goal_week_min` | Minutos de intensidade da semana (vigoroso ×2) / meta (Garmin `intensityDurationGoalInSeconds` [OW]) | min | week | diária | A | v1 (Garmin) |
| `intensity_min_moderate` / `_vigorous` | Minutos moderados / vigorosos do dia | min | sum | contínua | A | v1d |
| `intensity_min_weighted` | Minutos de intensidade calculados (fontes sem métrica própria) | min | computed | diária | C | v1 (não Apple, não Garmin) |
| `floors_climbed` / `floors_descended` | Andares subidos / descidos (`floorsDescended` [OW]) | n | sum | contínua | A | v1 / v1d |
| `floors_goal` | Meta de andares (Garmin `floorsClimbedGoal` [OW]) | n | last | diária | A | v1d |
| `sedentary_min` | Tempo sedentário (Garmin epochs; Apple não) | min | sum | contínua | A | v1d |
| `wheelchair_pushes` / `wheelchair_distance_m` | Impulsos / distância em cadeira de rodas | n / m | sum | contínua | A | v1 |
| `active_zone_min` | Minutos em Zona Ativa (Fitbit/Pixel) | min | sum | contínua | A | v2 (F7) |
| `move_min`, `physical_effort_met`, `handwashing_count` | Movimento / esforço físico / lavagem de mãos | — | — | — | A | v2 |
| `six_min_walk_m` | Caminhada de 6 min estimada | m | last | semanal | A | v2 [NC: estimada com sensores do iPhone] |
| `consumed_kcal`, `hydration_ml`, `weight`, `body_fat`, `bmr_scale` | Alimentação, água, peso e composição | — | — | — | — | ✕man / ✕ação (RN-02) |

**Treinos** (`health.workouts` + agregados)

| Código | Nome pt-BR | Unid. | Agregação | Freq. | Modo | Status |
|---|---|---|---|---|---|---|
| `workout_count` / `workout_min` / `workout_kcal` / `workout_distance_m` | Treinos, tempo, kcal, distância | n / min / kcal / m | sum | evento | T | v1 |
| `workout_pace_s_per_km` | Ritmo/velocidade (distância ÷ duração, por sessão) | s/km ou km/h | session | evento | T/C | v1 |
| `sweat_loss_ml` | Perda de suor estimada pelo relógio (Garmin `sweatLossInMilliliters` [OW]) | mL | sum | diária | A | v2 (detalhe de Treinos) |

- Por sessão (v1): esporte, origem, duração, distância, **ritmo/velocidade**, kcal, FC média/máx, zonas, desnível, carga UH, recuperação da FC (v1d).
- Por sessão (v2): cadência, potência, dinâmica de corrida, natação, mergulho, temperatura da água, esforço **estimado** pela marca.
- Fora: rota GPS (decisão); esforço dado pela pessoa, treino digitado, upload pela web (✕man).

**Respiração / O₂ (exibidos em Sinais da noite)**

| Código | Nome pt-BR | Unid. | Agregação | Freq. | Modo | Status |
|---|---|---|---|---|---|---|
| `resp_rate_sleep` | Respiração no sono | rpm | night (RN-21) | noite | A | v1 |
| `spo2_night_avg` / `spo2_night_min` | SpO₂ noturna média / mínima (Apple: só na janela do sono, ≥ 3 amostras) | % | night | noite | A | v1 |
| `resp_rate_day_avg` | Respiração ao longo do dia (Garmin `allDayRespiration`) | rpm | avg | contínua | A | v1d |
| `spo2_spot` | SpO₂ sob demanda | % | — | — | — | ✕ação (Q13); Garmin `onDemandReadings` ignorado |
| `health_snapshot` | Health Snapshot (Garmin) | — | — | — | — | ✕ação (Q13) |

**Temperatura (exibida em Sinais da noite)**

| Código | Nome pt-BR | Unid. | Agregação | Freq. | Modo | Status |
|---|---|---|---|---|---|---|
| `skin_temp_delta_c` | Temperatura da pele/pulso vs. seu normal (da marca ou derivada de `skin_temp_c` com a linha de base) | °C (desvio) | night | noite | A/C | v1 |
| `skin_temp_c` | Temperatura da pele absoluta (WHOOP, quando a fonte manda) | °C | night | noite | A | v1d |

**Estresse**

| Código | Nome pt-BR | Unid. | Agregação | Freq. | Modo | Status |
|---|---|---|---|---|---|---|
| `stress_avg` / `stress_max` | Estresse médio / máximo (Garmin) | 0–100 | avg / max | 3 min | A | v1 / v1d |
| `stress_rest_min` / `_low_min` / `_medium_min` / `_high_min` | Tempo em repouso / baixo / médio / alto | min | sum | 3 min | A | v1d |
| `stress_high_min` + `recovery_high_min` | Estresse alto / recuperação alta (Oura) | min | sum | diária | A | v1 |
| `stress_day_summary` | Resumo do dia (Oura) | enum | last | diária | A | v2 |

**Ambiente (linha dentro de "Seu dia")**

| Código | Nome pt-BR | Unid. | Agregação | Freq. | Modo | Status |
|---|---|---|---|---|---|---|
| `env_noise_db_avg` | Ruído ambiente médio | dB(A) | avg | contínua | A | v1 |
| `env_noise_alerts` | Avisos de ruído | n | sum | evento | A | v1d |
| `daylight_min` | Tempo à luz do dia | min | sum | diária | A | v1 |
| `headphone_db`, `uv_exposure` | Volume nos fones / UV | — | — | — | — | ✕fora |

**Segurança**

| Código | Nome pt-BR | Unid. | Agregação | Freq. | Modo | Status |
|---|---|---|---|---|---|---|
| `falls_detected` | Quedas detectadas | n | sum | evento | A | v1 (só se > 0) |
| `crash_detection`, `incident_detection`, `loss_of_pulse` | Acidente / incidente / perda de pulso | — | — | — | A | ✕vend |

**Só no app da marca (✕vend), não disponível para apps de terceiros:**
- **Apple:** Prontidão (Series 12/Ultra 4), Pontuação do sono, alertas de Sinais Vitais, Carga de treino. Indisponíveis no Brasil, segundo a crítica e sem confirmação oficial [NC]: Idade de Saúde, detecção de pista, Workout Buddy.
- **Garmin:** Training Readiness, Training Status, Carga aguda/foco, Tempo de recuperação, HRV Status (*há `HrvSummaryDTO` só na API Personal*), Health Status, Sleep Coach, Endurance/Hill Score, previsões de prova, limiar de lactato, FTP, Morning Report, **Training Effect, aclimatação a calor e altitude, potência de corrida pelo pulso, Running Tolerance, stamina** [NC: alguns podem aparecer em `activityDetails`, que não lemos].
- **Samsung:** Energy Score, Vascular Load, Bedtime Guidance, Antioxidant (✕ação); e, pelo Health Connect, VFC, FC de repouso, temperatura, respiração e andares (§13.3).
- **Google:** Daily Readiness, Cardio Load, Target Load, Health Guardian.
- **WHOOP:** Healthspan, Stress Monitor, BP Insights.
- **Oura:** Health Radar / Symptom Radar [NC].

**Recomendação sobre os ✕vend:** não mostrar como card nem valor vazio. Garmin: nota fixa no card e no detalhe do índice. Apple: nota condicionada ao modelo (§6.2). Lista completa em "Sobre seus dados". Equivalente calculado (Disposição, Sinais da noite, Carga do dia) sempre rotulado.

### 13.2 Mapeamento de origem e lista permitida (métricas v1/v1d)

`○` = mede, mas não sai por API · `—` = não mede/não envia · `calc` = derivado por nós · `?` = não confirmado. Os campos desta tabela **são** a lista permitida de cada adaptador (RN-02b); campos Garmin vêm do esquema do Open Wearables [OW], não da especificação oficial.

| Código | Apple HealthKit (só `HKDevice.model == "Watch"`) | Garmin Health API [OW] | Health Connect (filtro WATCH/RING) | Google Health API | Oura v2 | WHOOP v2 | Polar AccessLink |
|---|---|---|---|---|---|---|---|
| readiness_vendor | ○ (Readiness) | ○ (Training Readiness) | — | ○ | `daily_readiness.score` | `recovery.score.recovery_score` | `nightly_recharge` status + `ans_charge` (escala original) [CP] |
| body_battery_* | — | `dailies.bodyBatteryMostRecentValue`, `bodyBatteryHighestValue/LowestValue`, `bodyBatteryChargedValue/DrainedValue`; `stressDetails.timeOffsetBodyBatteryValues` | — | — | — | — | — |
| day_strain | — | — | — | — | — | `cycle.score.strain` | — |
| cardio_load_vendor | — | — | — | ○ | — | — | `cardio-load` [CP] |
| sleep_* (estágios) | `sleepAnalysis` (asleepCore/Deep/REM, awake; **`inBed` ignorado**) | `sleeps` (`deep/light/remSleepInSeconds`, `awakeDurationInSeconds`, `sleepLevelsMap`; `validation` ≠ MANUAL/AUTO_MANUAL) | `SleepSessionRecord.stages` | sleep [NC id] | `sleep` (`deep/light/rem_sleep_duration`, `awake_time`, `efficiency`, `latency`, `type`) [CP] | `sleep.score.stage_summary` [CP] | sleep [CP] |
| sleep_score_vendor | ○ | `overallSleepScore` | — | ○ | `daily_sleep.score` | `sleep_performance_percentage` | `sleep_score` [CP] |
| nap_* | sessões curtas fora da principal | `sleeps` com tipo de cochilo [NC] | sessões curtas | ? | `sleep.type = 'late_nap'/'rest'` [CP] | `sleep.nap` [CP] | — |
| hr_resting | `restingHeartRate` | `dailies.restingHeartRateInBeatsPerMinute` | `RestingHeartRateRecord` (Galaxy não envia) | resting-heart-rate [NC id] | `sleep.lowest_heart_rate` (aprox.) [CP] | `recovery.score.resting_heart_rate` | nightly recharge `heart_rate_avg` [CP] |
| hr_avg/min/max | `heartRate` | `dailies.average/min/maxHeartRateInBeatsPerMinute`, `timeOffsetHeartRateSamples` | `HeartRateRecord` | heart-rate | `heartrate` | `cycle.score.average/max_heart_rate` | FC contínua |
| hr_walking_avg | `walkingHeartRateAverage` | — | — | — | — | — | — |
| hrv_night | `heartRateVariabilitySDNN` / `…RMSSD` (iOS 27) **na janela do sono, ≥ 2** | `hrv.lastNightAvg` (método ?) | `HeartRateVariabilityRmssdRecord` na sessão, ≥ 2 (Galaxy não envia) | daily-hrv | `sleep.average_hrv` (rmssd) | `recovery.score.hrv_rmssd_milli` | `heart_rate_variability_avg` [CP] |
| hrv_day_avg | as mesmas amostras fora do sono | — | fora da sessão | hrv | — | — | — |
| hr_recovery_1min | `heartRateRecoveryOneMinute` [CP] | ? | — | — | — | — | — |
| vo2max | `vo2Max` | `userMetrics.vo2Max` | `Vo2MaxRecord` (Galaxy: no exercício) | vo2-max | `vO2_max` | — | ? |
| fitness_age | — | `userMetrics.fitnessAge` [OW/NC] | — | — | — | — | — |
| hr_zone*_min | calc (`HKWorkoutZoneGroup`, iOS 27) | calc | calc | time-in-hr-zone | — | `workout.score.zone_durations` | calc |
| steps / steps_goal | `stepCount` (predicado relógio) / — | `dailies.steps` / `dailyStepGoal` | `StepsRecord` | steps | `daily_activity.steps` | — | atividade diária |
| distance_m | `distanceWalkingRunning` (predicado relógio) | `distanceInMeters` | `DistanceRecord` (Galaxy: só em exercício) | distance | `equivalent_walking_distance` | — | ? |
| floors_* | `flightsClimbed` | `floorsClimbed`, `floorsDescended`, `floorsClimbedGoal` | `FloorsClimbedRecord` (Galaxy não envia) | floors [NC] | — | — | — |
| active_kcal / basal_kcal | `activeEnergyBurned` / `basalEnergyBurned` | `activeKilocalories` / `bmrKilocalories` | `ActiveCaloriesBurnedRecord` / — (Galaxy: só `TotalCaloriesBurned` no exercício) | calories [NC] | `daily_activity.active_calories` | `cycle.score.kilojoule` | calorias [CP] |
| anéis Apple | `appleExerciseTime`, `appleStandHour`, `appleStandTime`; `HKActivitySummary` (`activeEnergyBurnedGoal`, `appleExerciseTimeGoal`/`exerciseTimeGoal`, `appleStandHoursGoal`/`standHoursGoal`) [CP] | — | — | — | — | — | — |
| intensity_* | calc | `moderate/vigorousIntensityDurationInSeconds`, `intensityDurationGoalInSeconds` | calc | active-zone-minutes | `medium/high_activity_time` | — | ? |
| sedentary_min | — | epochs `intensity = SEDENTARY` | — | ? | `sedentary_time` [CP] | — | — |
| workouts | `HKWorkout` (sem `WasUserEntered`; origem relógio) | `activities` (sem `manual`, sem `isWebUpload`) | `ExerciseSessionRecord` (sem `MANUAL_ENTRY`) | exercise [NC] | `workout` (sem `source = manual`) | `workout` | exercises |
| resp_rate_sleep / day | `respiratoryRate` (na sessão) | `timeOffsetSleepRespiration` / `allDayRespiration` | `RespiratoryRateRecord` (Galaxy não envia) | respiratory-rate | `sleep.average_breath` | `sleep.score.respiratory_rate` | `breathing_rate_avg` [CP] |
| spo2_night_* | `oxygenSaturation` **só na sessão, ≥ 3** | `pulseox.sleepSpo2` / `timeOffsetSpo2Values` na janela do sono (**`onDemandReadings` ignorado**) | `OxygenSaturationRecord` na sessão | oxygen-saturation | `daily_spo2.spo2_percentage.average` | `recovery.score.spo2_percentage` | — (Elixir é sob demanda) |
| skin_temp_delta_c / skin_temp_c | `appleSleepingWristTemperature` (desvio) | `skinTemp.avgDeviationCelsius` | `SkinTemperatureRecord` (delta) [CP] (Galaxy não envia) | skin-temperature (beta) | `daily_readiness.temperature_deviation` | `recovery.score.skin_temp_celsius` → **`skin_temp_c`** e desvio pela linha de base | Elixir (contínua noturna) [CP] |
| stress_* | — | `dailies.averageStressLevel`, `maxStressLevel`, `stressDuration…`, `timeOffsetStressLevelValues` | — | ○ | `daily_stress.stress_high / recovery_high` | ○ | — |
| env_noise_* / daylight_min | `environmentalAudioExposure` (+ evento) / `timeInDaylight` | — | — | — | — | — | — |
| falls_detected | `numberOfTimesFallen` | ○ | — | — | — | — | — |
| wheelchair_* | `pushCount` / `distanceWheelchair` | — | `WheelchairPushesRecord` | — | — | — | — |
| **Ignorados por regra** | `inBed`, `dietary*`, `bodyMass`, `bloodPressure*`, `stateOfMind`, `workoutEffortScore`, ECG/FA | `hydrationInMilliliters`, `consumedCalories`, `netCalorieGoal`, `netKilocaloriesGoal`, `bodyComps`, `mct`, `onDemandReadings`, `activityDetails` | `Nutrition`, `Hydration`, `Weight`, `BodyFat`, `BloodPressure`, `BloodGlucose`, `MenstruationFlow` | — | `enhanced_tag`, `rest_mode` manuais | — | RPE, `perceived_load` |

### 13.3 Matriz de disponibilidade por marca e modelo (o que chega até nós)

`●` = mede e chega por API · `◐` = em parte, ou exige recalcular · `○` = mede, mas não sai · `—` = não mede/não envia · `?` = não confirmado

| Categoria / métrica | Apple Watch S12 / Ultra 4 | Apple Watch SE 3 (e S9–S11) | Garmin fēnix 9 / FR 970 | Garmin vívoactive 6 / Instinct 3 | Galaxy Watch9 (Health Connect) | Pixel Watch 4 / Fitbit (Google API) | Oura Ring 4/5 | WHOOP 5.0/MG | Polar Grit X2 / Vantage V3 |
|---|---|---|---|---|---|---|---|---|---|
| Índice da marca por API | ○ (Prontidão) | — (S9–S11/SE 3 não têm Prontidão) | ● Body Battery (○ Training Readiness) | ● Body Battery | ○ (Energy Score) | ○ | ● | ● | ● (escala original) |
| Disposição UH | ● calc (principal) | ◐ calc (VFC escassa) | ◐ calc (recolhida) | ◐ calc (recolhida) | — (sem VFC nem FC rep.) | ● calc | ◐ (recolhida) | ◐ (recolhida) | ◐ (recolhida) |
| Sono e estágios | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| Na cama / latência | — (iPhone [NC]) | — | ● | ● | ? | ● | ● | ● | ? |
| Nota do sono da marca | ○ | ○ | ● | ● | ? | ○ | ● | ● | ● [CP] |
| FC contínua | ● | ● | ● | ● | ● | ● | ● | ● | ● |
| FC de repouso | ● | ● | ● | ● | —/? | ● | ● | ● | ● |
| VFC noturna | ● (SDNN; RMSSD iOS 27) | ◐ (poucas amostras) | ● (método ?) | ● | —/? | ● | ● | ● | ● [CP] |
| VO₂máx | ● | ● | ● | ● | ● (de exercício) | ● | ● | — | ? |
| Passos | ● | ● | ● | ● | ● | ● | ● | — | ● |
| Distância / kcal do dia | ● | ● | ● | ● | ◐ (só em treino) | ● | ● | ◐ (só kcal) | ● |
| Andares | ● | ● | ● | ● / ? | —/? | ? | — | — | — |
| Metas do relógio | ● (anéis) | ● (anéis) | ● (passos, andares, intensidade semanal) | ● | — | ? | — | — | ? |
| Minutos de intensidade | ● (anel Exercício) | ● | ● (semanal) | ● | ◐ calc | ● (AZM) | ● | ◐ (zonas) | ? |
| Treinos | ● | ● | ● | ● | ● | ● | ◐ (detecção) | ● | ● |
| Respiração no sono | ● | ● | ● | ● | —/? | ● | ● | ● | ● |
| SpO₂ noturna | ● (na janela do sono) | — | ● (se ativada) | ● (se ativada) | ● | ● | ● | ● | — |
| Temperatura (desvio) | ● | ● | ● | — / — | —/? | ◐ (beta) | ● | ◐ (absoluta → calc) | ● (Elixir) [CP] |
| Sinais da noite UH | ● (5/5) | ◐ (3–4) | ● | ◐ | ◐ (só SpO₂) | ● | ● | ● | ◐ |
| Estresse | — | — | ● | ● | ○ | ○ | ● | ○ | — |
| Ruído / luz do dia | ● (se ativados) | ● / ? | — | — | ○ | — | — | — | — |
| Quedas | ● | ● | ○ (incidente) | ○ | ? | ○ | — | — | — |
| Caminho técnico | app nativo iOS | app nativo iOS | OAuth no PWA | OAuth no PWA | app nativo Android | OAuth (escopo restrito) | OAuth no PWA | OAuth no PWA | OAuth no PWA |

**Galaxy pelo Health Connect:** coluna baseada na tabela oficial da Samsung (fev/2025), que diz que o escopo "pode mudar conforme a versão do Samsung Health" e que os dados do rastreador de atividade não sincronizam. Versão vigente em 2026: [NC]. **A disponibilidade real vem de `capabilities`**; a matriz só define expectativas, o texto de "Sobre seus dados" e as dicas da RF-17.

### 13.4 Índices calculados pelo Ultra Hero (v1, transparentes)

**Disposição Ultra Hero (`disposition_uh`)**
- **Pré-requisito:** VFC noturna **ou** FC de repouso, mais sono. Sem isso, não é calculada (Galaxy).
- **Entradas** (z-score contra a linha de base de 28 dias, limitado a ±2,5): VFC noturna (ln, por método e fonte); FC de repouso (invertida); sono (dormindo/8 h e eficiência); carga (`load_ratio`, penaliza > 1,3); desvio de temperatura (penaliza |Δ| > 0,3 °C).
- **Pesos iniciais:** VFC 35%, sono 30%, FC de repouso 20%, carga 10%, temperatura 5%; ausência redistribui.
- **Escala interna:** `50 + 15 × Σ(peso × z)`, limitada a 0–100. **Exibição:** faixa "Abaixo do seu habitual" (< 40) / "No seu habitual" (40–69) / "Acima do seu habitual" (≥ 70). O número aparece só no detalhe, com "calculado pelo Ultra Hero · pode diferir do número do seu relógio · não é a Prontidão da Apple nem o Training Readiness da Garmin". Mínimo de 7 noites válidas.
- **Nomes por idioma (para revisão):** pt "Disposição Ultra Hero", en "Ultra Hero Daily Balance", es "Disposición Ultra Hero".

**Sinais da noite (`night_vitals_uh`)**
- Componentes: FC de repouso, VFC noturna, respiração no sono, SpO₂ noturna, desvio de temperatura.
- Cada um: "na sua faixa habitual" ou "acima/abaixo da sua faixa habitual" (RN-07); componente sem linha de base mostra "aprendendo"; ausente, some.
- Resumo: "n de m na sua faixa habitual". Sem cor sozinha, sem "alerta", sem interpretação clínica. Referência de produto: Apple Sinais Vitais, Garmin Health Status, Samsung Vitals, Oura Symptom Radar — nenhum sai por API.

**Carga do dia (`cardio_load_day_uh`)**
- TRIMP de Edwards: Σ minutos na zona *k* × *k* (k = 1…5), somando o dia todo (FC contínua) e os treinos, sem contar duas vezes.
- Zonas: as da marca quando enviadas (Apple `HKWorkoutZoneGroup`, Garmin); senão, % da maior FC observada em 90 dias (≥ 30 dias de dados), porque não temos idade.
- Exibição: valor do dia e "dentro/acima/abaixo da sua faixa habitual" (28 dias). **Sem faixa-alvo** (ver "Críticas não acatadas").

**Sem Nota do sono UH** (✕desc): para Apple, mostramos duração, regularidade e interrupções (acordado), não uma segunda nota.

### 13.5 Indicadores de produto e operação (KPIs)

| Indicador | Definição | Meta inicial [EST] |
|---|---|---|
| Adoção | % de usuários ativos (30 d) com ≥ 1 fonte ativa | 15% em 90 dias após o app nativo |
| Conversão do convite | consentimentos ÷ visualizações do convite | ≥ 25% |
| Tempo até o 1º dado | p50 do consentimento ao 1º upsert | < 2 h (nuvem), < 10 min (nativo) |
| Frescor | % de conexões com dado há < 24 h | ≥ 85% |
| Saúde da ingestão | `done` ÷ recebidos; `dead` por dia | ≥ 99,5%; `dead` < 0,1% |
| Latência | recebimento → upsert, p95 | < 60 s |
| Revogação | revogações ÷ conexões por mês | monitorar (> 10% = investigar) |
| Recurso ativado após dica | dicas RF-17 seguidas de dado novo em 7 dias | monitorar |
| Uso do Hoje | aberturas por usuário conectado por semana | ≥ 4 |
| Retenção | 30 dias, conectados vs. não conectados | +10 p.p. |
| Prazo de exclusão | pedido → exclusão total; revogação na marca em ≤ 7 dias | 100% < 5 min; 100% ≤ 7 dias |

Eventos em `analytics_events` **sem valores de saúde** (`today.view`, `today.detail_open{category}`, `devices.connect_start{provider}`, `today.hint_shown{code}`); a função rejeita chaves do catálogo. **Contas demo excluídas** de todos os KPIs.

### 13.6 Tabela de uma página para o responsável

| O que o relógio mede | Garmin | Apple Watch |
|---|---|---|
| Sono (duração, estágios, horário) | aparece | aparece (sem "na cama") |
| Nota do sono | aparece (nota Garmin) | só no app Apple |
| Energia / prontidão | Body Battery aparece; Training Readiness e Training Status só no app Garmin | Prontidão só no app Apple (S12/Ultra 4); aparece a Disposição UH (cálculo nosso) |
| FC, FC de repouso, VFC | aparece | aparece (VFC escassa no SE 3 e S9–S11) |
| Respiração, SpO₂ e temperatura da noite | aparece (SpO₂ se ativada no relógio) | aparece (SpO₂ não no SE 3) |
| Sinais vitais vs. seu normal | Health Status só no app Garmin; aparece "Sinais da noite" (cálculo nosso) | Sinais Vitais só no app Apple; aparece "Sinais da noite" |
| Passos, distância, calorias, andares | aparece | aparece (só do relógio, salvo Q14) |
| Metas | passos, andares, intensidade semanal | anéis Movimento/Exercício/Em pé |
| Treinos (esporte, tempo, distância, ritmo, FC, zonas) | aparece | aparece |
| VO₂máx | aparece | aparece |
| Idade fitness | aparece (detalhe) | — |
| Carga de treino | carga aguda e Training Effect só no app Garmin; aparece "Carga do dia" (cálculo nosso) | Carga de treino só no app Apple; aparece "Carga do dia" |
| Estresse | aparece | o relógio não mede |
| Ruído e luz do dia | o relógio não mede | aparece (se ativados) |
| Quedas | só no app Garmin | aparece (só se houver) |
| ECG, ritmo irregular, apneia, hipertensão | impossível por regra (regulado) | impossível por regra (regulado) |
| SpO₂ avulsa, Health Snapshot | fora até Q13 (exige gesto) | SpO₂ avulsa fora (só a da noite) |
| Água, comida, peso, humor, ciclo | impossível por regra (é digitado) | impossível por regra (é digitado) |
| Rota GPS | fora por decisão | fora por decisão |

---

## 14. Auditoria

- **`health.audit`** (§8.8): consentimento concedido/ampliado/reduzido/revogado (versão, hash, categorias); conexão criada, revogada, expirada, cancelada pela marca; revogação na marca enfileirada/concluída/expirada; dados apagados (contagens); exportação; histórico e reprocessamento; provedor ligado/desligado; purgas.
- **Nunca** guarda valores, payloads, tokens, e-mail ou mensagens de validador; `detail` passa por função que recusa chaves do catálogo e textos livres.
- `user_id` com FK `on delete set null`: o evento fica, sem pessoa.
- Ações administrativas também em `admin_audit` (ator, ação, justificativa); contas demo não geram ações porque não podem executá-las.
- A pessoa vê a própria trilha em `/profile/devices` › "Histórico de acesso" (RPC).
- **Logs técnicos:** só id do evento, provedor, status, tempo e código de erro. Sem corpo, sem log drain que capture corpo. O token de caminho da Garmin é cortado dos nossos logs; o log de requisição da Vercel está fora do nosso controle (§9.4).
- **Retenção:** 365 dias.

## 15. Segurança (inclui LGPD art. 11)

**Técnica**

1. **Isolamento por construção (barreira de finalidade, RN-15)**
   - Schema `health` fora da API; `revoke all` de `anon`, `authenticated` **e `service_role`**. A `service_role` (usada hoje por `src/lib/recommendations/recalculate.ts:27`, `actions.ts:28`, actions de admin e de herói) ignora RLS, por isso a barreira é por **grant**, não por política.
   - Escrita só pelo papel `health_ingest` (LOGIN, sem BYPASSRLS), cuja credencial existe só nas rotas de ingestão/OAuth/cron de wearables (`src/lib/health/db.ts` com `server-only` + regra de lint de import).
   - Leitura da pessoa só por RPC `security definer` filtrando `auth.uid()`.
   - Teste de RLS: `service_role` → 42501.
2. **Chaves e segredos**
   - `WEARABLE_TOKEN_KEY_V{n}` **só na Vercel**; AES-256-GCM, nonce aleatório de 96 bits, AAD = `connection_id || key_version`.
   - `WEARABLES_TICK_SECRET` próprio, no Supabase Vault, aceito só por `/api/cron/wearables` (o `CRON_SECRET` existente continua só para as rotas atuais).
   - `HEALTH_INGEST_DATABASE_URL`, segredos de webhook e `client_secret` só na Vercel; nada em `NEXT_PUBLIC_*`.
3. **Webhooks:** assinatura (401 sem gravar), tolerância de carimbo, anti-replay por conexão, limite de tamanho e taxa, resposta rápida; Garmin com token de caminho ≥ 128 bits e anti-SSRF no `callbackURL` (§9.4).
4. **OAuth:** PKCE + `state`; `redirect_uri` fixa por ambiente; escopos e endpoints só das categorias consentidas (não registrar `mct`, `bodyComps`); revogação pela fila.
5. **App nativo**
   - Chave por aparelho no Keychain/Keystore, escopo só de ingestão, revogada ao desconectar; nada em UserDefaults/Preferences/iCloud.
   - Ponte JS sem valores de saúde; navegação e ponte só para a origem exata de produção; CSP estrita (um XSS no site não lê HealthKit).
   - Tela nativa de status; Privacy Manifest; só tipos v1/v1d das categorias consentidas.
6. **Ingestão do app:** conexão resolvida pela chave; `connectionId`/`user_id` do corpo ignorados; teste negativo (lote com `connectionId` de outra pessoa grava na conexão do dono da chave ou é recusado).
7. **Concorrência e consistência:** `for share`/`for update`; gatilhos `before insert or update`; derivados apagados por `inputs`.
8. **Validação:** zod, catálogo, categoria consentida, plausibilidade, lista permitida, limites de lote e taxa; erros só como códigos enumerados.
9. **Reautenticação** ≤ 5 min para exportar e para conceder/ampliar consentimento (senha ou código por e-mail, conforme o login da conta); exportação limitada a 3/dia, `no-store`, auditada.
10. **Demo:** gerador só com a marca de demo vinda do servidor; contas demo não conectam, não consentem, não exportam, não usam `/admin/wearables` (`is_admin() and not is_demo(...)`). Antes da F4 (primeiro dado real), tirar o papel admin da conta demo ou desligar `DEMO_ACCOUNTS_PASSWORD` em produção (Q16) — o próprio `accounts.ts` diz "remover antes de abrir ao público".
11. **Ambientes:** fixtures só em local/staging; `/ingest/device` recusa fixtures com `VERCEL_ENV=production`; teste em produção só com o relógio real de alguém da equipe que consentiu. Recomendado: projeto Supabase de produção separado do experimento com contas demo (`docs/architecture.md` já sugere `ultra-hero-staging`/`-prod`; Q17).
12. **Residência e operadores:** Supabase e Vercel são operadores estrangeiros (mapa de transferências do RIPD; DPAs com cláusulas-padrão da ANPD [NC]); agregador, se houver, idem (art. 33; Res. CD/ANPD 19/2024).

**LGPD (dado pessoal sensível — art. 5º II; art. 11)**

- **Base legal:** art. 11 I, consentimento específico e destacado, **por categoria**. A permissão do iOS/Android não substitui. A tela diz: o que lemos (categorias desmarcáveis), para quê, o que **não** fazemos, quanto tempo guardamos (§8.10), quem são os operadores (inclusive estrangeiros), como revogar. Botão inequívoco "Concordo e quero conectar". Prova: texto arquivado em `consent_texts` + hash calculado no servidor + versão, data, canal, idioma (art. 8º §2º), preservada após a exclusão da conta via `subject_ref`.
- **Revogação** (art. 8º §5º): gratuita, facilitada, **nunca bloqueada**; apaga (art. 16), salvo conjunto específico sob guarda legal, retido à parte.
- **Mudança de política:** material → pausa e novo aceite; não material → aviso (RN-13).
- **Necessidade (art. 6º III):** retenção de 13 meses; payload bruto 7 dias (30 para Garmin, se Q15); nada guardado "para melhoria futura".
- **Direitos (art. 18):** acesso/portabilidade (exportação com reautenticação), eliminação (desconectar, reduzir, revogar, excluir conta), informação sobre compartilhamento ("Sobre seus dados"), revogação.
- **Compartilhamento:** art. 11 §4º; não há. Agregador = operador com DPA.
- **RIPD (art. 38)** antes da abertura (dado sensível = alto risco, Res. CD/ANPD 2/2022). Tratamento de alto risco afasta o regime simplificado do agente de pequeno porte (art. 3º da Res. 2/2022): **nomear o encarregado (art. 41) e publicar nome e contato no site antes da F3 em produção** (Res. CD/ANPD 18/2024).
- **Incidente:** plano conforme a Res. CD/ANPD 15/2024 — comunicar a ANPD e os titulares em **3 dias úteis**, registro de incidentes guardado por **5 anos**; prazo em dobro para pequeno porte [NC]. Além do art. 48.
- **Menores:** bloquear < 18 na v1 (RN-17); autodeclaração na tela de consentimento; verificar com o jurídico se a Lei 15.211/2025 (ECA Digital) exige mais que autodeclaração [NC] (Q7).
- **Documentos a mudar antes de qualquer dado real:** `docs/privacy-and-retention.md` (remover "Não coletamos: dados de saúde individuais"; tabelas de coleta e retenção; backups em até 7 dias); `messages/*/legal.json` (nova seção "Dados do seu relógio"); Termos (aviso de bem-estar); página do encarregado. **Revisão jurídica obrigatória.**
- **Regulatório:** RDC Anvisa 657/2022 (bem-estar): não ler funções médicas (RN-03), sem alegação diagnóstica (RN-18), aviso fixo.
- **Lojas:** App Store 5.1.3 e 1.4.1, regra 4.2 (tela nativa); Play "Health apps" (formulário, política pública).
- **Riscos residuais:** incidente com dado sensível; inferência indireta (temperatura e gravidez — não fazemos); aparelho compartilhado (nada de saúde no `localStorage`); token de caminho da Garmin nos logs da Vercel.

---

## 16. Melhorias futuras

1. Intradiário completo e curva do dia no detalhe (F6).
2. "Sua semana" e tendências de 90 dias / 1 ano (dentro dos 13 meses).
3. Modo turno e detecção de jet lag.
4. Disposição UH v2 calibrada com dados reais.
5. Dicas do herói pelo estado do dia (consentimento específico adicional, texto editorial, sem produto, sem IA externa com valores).
6. Sequência contando dias com atividade medida (se Q10 escolher isso).
7. Agregados anônimos para heróis (k ≥ 20, opt-in separado).
8. Métricas v2: necessidade/débito de sono, resiliência, idade cardiovascular, dinâmica de corrida e natação, perda de suor estimada, latência do sono para fontes que a medem.
9. Galaxy: FC de repouso calculada a partir de `HeartRateRecord` no sono (rotulada como nossa), se a Samsung continuar sem enviá-la; rever a coluna a cada versão do Samsung Health.
10. Se Q13 aprovar: modo sob demanda (SpO₂ avulsa, Health Snapshot) rotulado "medida que você fez no relógio".
11. Novas fontes: COROS e Suunto, Amazfit/Zepp via agregador, Garmin Enterprise (histórico, batimento a batimento).
12. Rever funções reguladas (RN-03) com parecer favorável.
13. Widget/complicação no relógio (Connect IQ / watchOS). Longo prazo.

---

## Plano de entrega (fases pequenas, cada uma testável e publicável)

| Fase | Entrega | Depende de | Pronto quando |
|---|---|---|---|
| **F0** (responsável, paralela) | Respostas Q1–Q20 (Q5 e **Q10 antes da F1**); CNPJ, domínio de e-mail, site e política públicos; conta Apple Developer de **organização** + D-U-N-S; Play Console de organização; **encarregado nomeado e publicado**; início do RIPD (com Vercel/Supabase como operadores estrangeiros); decisão de planos pagos (Vercel Pro, Supabase Pro) e de projeto de produção separado; pedido Garmin Starter | — | Pedido Garmin enviado; contas de loja criadas; encarregado publicado |
| **F1** — Hoje sem digitação | Remove Hidratação, Descanso e "Adicionar item"; contas reais sem provedor veem só a linha "Em breve: seu dia medido pelo relógio"; "Continue seus programas" depois do card Evolução; `me.today.description` novo (3 idiomas); migração que desativa `routine_items` e ajusta a sequência conforme Q10; medição prévia de quem perde sequência; aviso único + exportação dos itens; limpeza `uh:today:*`; testes unitários e E2E | Q5, Q10 | Perfil sem nenhum campo de entrada; sequência conforme Q10; E2E verde; publicado |
| **F2** — Novo Hoje com demo | Catálogo TS; `derived.ts`/`baseline.ts`; gerador + testes de propriedade (v1/v1d ∩ capacidades); dois blocos, detalhe, estados, anéis Apple, metas Garmin, Sinais da noite, Carga do dia, notas por marca/modelo, dicas RF-17 (simuladas na demo); "Ver um exemplo" para contas reais | F1 | 5 personas coerentes com a matriz; Galaxy sem VFC/FC rep.; axe sem violações; publicado |
| **F3** — Fundação de dados (em **staging**) | Schema `health`, papel `health_ingest`, grants, RLS, gatilhos, cenários (42501 para `service_role`); consentimento por categoria com textos arquivados e reautenticação; `/profile/devices`; fila de revogações; `delete_my_account` endurecida; inbox (401 sem gravar, conexão antes do payload, códigos de erro); `/ingest/device` com chave por aparelho; adaptadores com lista permitida e fixtures (água/calorias/manuais descartados); `health.derived`; tique `pg_cron` com Vault; retenção de 13 meses; auditoria; admin com guarda anti-demo; exportação | F2 | E2E com fixtures em staging (curl → banco → Hoje); `/ingest/device` recusa fixtures em produção. **Para ligar em produção:** política/legal revisadas, encarregado publicado, RIPD, Vercel Pro e Supabase Pro, demo admin resolvida (Q16) |
| **F4** — Garmin (nuvem) | Adaptador Garmin (lista permitida, `manual`/`isWebUpload`/sono MANUAL descartados, `onDemandReadings` ignorado), OAuth, push endurecido (token, anti-SSRF), Body Battery com horário, estresse, metas, idade fitness; retenção do payload conforme Q15 | F3 em produção + chave Garmin | **Chave de avaliação: só a equipe.** Beta de 10 pessoas **só com chave de produção**; dados por 7 dias; frescor ≥ 85%; nenhum `dead` sem explicação |
| **F5a** — App iOS (Apple Watch) | (1) PoC do shell Capacitor (URL de produção, tela nativa, `allowNavigation` estrito) aprovada no **beta externo do TestFlight**; (2) plugin Swift (âncoras, predicado de relógio, filtro de digitação, entrega em segundo plano, Keychain, DTO bruto); (3) adaptador `apple_health` no servidor; (4) Privacy Manifest e revisão HealthKit/App Store | F3 em produção + **conta Apple de organização pronta (F0)** | Apple Watch real alimenta o Hoje com ≤ ~1 h de atraso típico. **[EST] 10–16 semanas** após a conta Apple (prazo do D-U-N-S [NC] não incluído) |
| **F5b** — App Android (Health Connect) | Plugin Kotlin (filtros WATCH/RING, `MANUAL_ENTRY`, `dataOrigin`), WorkManager, Keystore, formulário "Health apps", teste interno | F5a | Galaxy real alimenta o Hoje com o subconjunto esperado |
| **F6** — Mais marcas e intradiário | Oura, WHOOP (temperatura absoluta → desvio), Polar (escalas originais, carga em `cardio_load_vendor`); curvas intradiárias; v2 selecionadas | F3 (+ contas dev das marcas) | Cada marca entra só com adaptador + fixtures |
| **F7** — Maturidade | Google Health API, Disposição UH v2, "Sua semana", dicas do herói (opt-in), Garmin Enterprise se necessário | Dados reais de F4/F5 | — |

**Riscos principais e mitigação:**
1. **Sem app nativo, sem Apple Watch** — e o app pode ser recusado pela regra 4.2. Mitigação: PoC do shell no TestFlight antes do plugin.
2. **Garmin:** reabertura a confirmar; Starter sem histórico e só push. Mitigação: pedir já; reter payload 30 dias (Q15); agregador como plano B.
3. **Galaxy pelo Health Connect entrega pouco.** Mitigação: comunicar; matriz e `capabilities`; demo honesta.
4. **Índices famosos ficam no app da marca.** Mitigação: índices UH com nomes próprios e notas por marca/modelo.
5. **Jurídico e custos fixos** (encarregado, RIPD, Vercel Pro, Supabase Pro) são o caminho crítico para ligar a F3 em produção.
6. **Sequência quebrando na F1.** Mitigação: Q10 antes; medir; aviso claro.
7. **Atraso de sincronização visto como bug.** Mitigação: horário em todo valor; dica fixa; sem botão Atualizar.
8. **Fitbit Web API desligada em 30/10/2026.** Não construir sobre ela.

**Custos fixos e recorrentes conhecidos** (para Q18; valores [CP] salvo indicação):
- Vercel Pro: US$ 20 por membro desenvolvedor/mês (confirmado na página da Vercel); o Hobby é só para uso pessoal e não comercial.
- Supabase Pro: ~US$ 25/mês por projeto + compute (×2 se houver projeto de produção separado) [CP].
- Apple Developer (organização): US$ 99/ano; D-U-N-S: gratuito [CP], prazo [NC].
- Google Play Console: US$ 25 único.
- Jurídico: RIPD, encarregado (interno ou terceirizado), política e termos — sem estimativa [EST pendente].
- Garmin: Starter grátis (até ~1.000 usuários, sem histórico [NC]); Enterprise pago a partir de 01/04/2027, preço [NC].
- Agregador (opcional): ~US$ 300–500/mês [NC].

---

## Perguntas que só o responsável pode responder

**Produto e regra**
- **Q1.** Autoriza o Ultra Hero a tratar **dado de saúde** (muda a promessa "não coletamos dados de saúde"), com consentimento por categoria, RIPD e encarregado?
- **Q5.** Itens de rotina criados à mão: **apagar** após aviso e 90 dias, ou **mover** para fora do Hoje (ex.: "Lembretes")?
- **Q6.** O Hoje com relógio é para **todos** ou só para **premium**?
- **Q8.** Mostrar as métricas "só no app da marca" como lista em "Sobre seus dados" e como nota no card (Garmin) / por modelo (Apple)?
- **Q9.** Aprova os índices calculados por nós com nomes próprios (**Disposição Ultra Hero**, **Sinais da noite**, **Carga do dia**), sempre rotulados como nossos?
- **Q10 (antes da F1).** A sequência passa a contar só conteúdos concluídos (recomendado já na F1), ou também dias de atividade medida pelo relógio (a partir da F4/F5)?
- **Q12.** Heróis podem dar dicas pelo estado do dia (opt-in), ou o dado de relógio fica 100% isolado?
- **Q13.** Medidas **sob demanda** feitas no relógio (SpO₂ avulsa, Health Snapshot, bioimpedância) entram, rotuladas "medida que você fez no relógio", ou ficam fora (recomendado na v1)? Confirma que **treino iniciado no relógio** conta como "medido pelo uso"?
- **Q14.** Para Apple, passos e distância **só do relógio** (padrão), ou aceitar a soma do app Saúde (relógio + iPhone), que inclui passos dados sem o relógio?

**Contas e contratos**
- **Q2.** Existe CNPJ, domínio de e-mail próprio e site público com política? Sem isso, nem Garmin Starter nem conta Apple de organização.
- **Q3.** Aceita publicar **app nativo** na App Store e no Google Play (única forma de ter Apple Watch, Galaxy e Pixel)? Quem será o titular das contas (organização com D-U-N-S)?
- **Q16.** Antes do primeiro dado real (F4): tirar o papel admin da conta demo compartilhada ou desligar as contas demo em produção?
- **Q17.** Criar um **projeto Supabase de produção** separado do experimento (contas demo, E2E de produção) para receber dado de saúde real, mais um de staging?
- **Q19.** Quem será o **encarregado** (pessoa interna ou serviço terceirizado), para nomear e publicar antes da F3 em produção? Quem faz a revisão jurídica (política, RIPD, DPAs de Vercel/Supabase com cláusulas da ANPD)?

**Custos**
- **Q4.** Orçamento para agregador (~US$ 300–500/mês [NC]) ou só integração direta + app próprio?
- **Q18.** Aprova os custos fixos que passam a ser obrigatórios com dado real: **Vercel Pro** (US$ 20/membro/mês), **Supabase Pro** (~US$ 25/mês por projeto + compute [CP]), Apple Developer (US$ 99/ano), Play (US$ 25), jurídico (RIPD, encarregado, política) e, a partir de 01/04/2027, **Garmin Enterprise** se passar de ~1.000 usuários ou precisar de histórico?

**Prazos e retenção**
- **Q7.** Idade mínima de 18 anos com autodeclaração: ok? O jurídico deve confirmar se o ECA Digital (Lei 15.211/2025) exige mais.
- **Q11.** Prazos: **13 meses** para os dados diários (antes eram 24), 30 dias para o intradiário, 30 dias para decidir após revogação na marca. Ok?
- **Q15.** Garmin Starter não permite re-buscar dados: **reter o payload bruto por 30 dias** (declarado no RIPD) para poder corrigir erros, ou aceitar que um erro descoberto depois de 7 dias vire dado errado permanente?
- **Q20.** Em mudança **material** da política, por quantos dias guardamos os dados enquanto a pessoa não aceita de novo (proposta: 30)?

---

## Críticas não acatadas (ou acatadas em parte)

| Crítica | Decisão | Por quê |
|---|---|---|
| Lente 1, item 10 — "faixa-alvo" de carga derivada da razão 7d/28d | **Em parte.** Criamos `cardio_load_day_uh`, mas comparado com a **faixa habitual** da pessoa, sem alvo | Uma faixa-alvo é prescrição de treino ("coach"), fora do escopo da v1 e contra a RN-18; "dentro/acima/abaixo do seu habitual" dá a mesma leitura sem recomendar |
| Lente 1, item 2 — abrir exceção para passos/distância somados pelo app Saúde | **Em parte.** Virou a Q14; o padrão é **só relógio** | A regra do responsável é "só o que o relógio mede"; é possível filtrar por dispositivo no `HKStatisticsCollectionQuery`, então a exceção não é necessária tecnicamente e fica como escolha dele |
| Lente 2, item 25 — premissa "Ultra Hero tem planos pagos e vendas" | **Conclusão acatada, premissa corrigida** | Hoje os planos e compras são **simulados** (`me.json`: "Assinatura simulada", "Compras demonstrativas, sem cobrança real"). Mesmo assim, abrir a usuários reais com dado de saúde e venda de produtos é uso comercial, e o Hobby é só para uso pessoal e não comercial (vercel.com/docs/plans/hobby). Vercel Pro entra como pré-requisito da F3 em produção (Q18) |
| Lente 2, item 5(b) — "token de caminho removido dos logs" | **Em parte** | Cortamos o token dos **nossos** logs, mas o log de requisição da própria Vercel registra o caminho e não o controlamos [NC]. Mitigação: acesso restrito aos logs, rotação periódica, aceitar só `userId` ativo |
| Lente 2, item 1 — opção "`authenticated` volta a ter `select` sob RLS do dono" | **Não escolhida** (a crítica oferecia duas opções) | Ficamos com acesso só por RPC: com o schema fora da API, não há caminho PostgREST direto e a superfície é menor |
| Lente 1, item 12 — Idade de Saúde, detecção de pista e Workout Buddy "indisponíveis no Brasil" | **Acatada com [NC]** | Não confirmei em fonte oficial da Apple. Entram na lista de "só no app da marca" com essa marca |
| Lente 1, item 2 — descartar Garmin `isWebUpload: true` | **Acatada, com ressalva** | Pode descartar um arquivo FIT legítimo do relógio enviado pelo computador; preferimos perder esse caso raro a aceitar GPX de outro app |

Todos os outros itens das duas lentes foram acatados integralmente.
