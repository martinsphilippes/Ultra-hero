# Push no app das lojas

Decisão do responsável (30/10/2026): o app GC Hero avisa por push sobre **posts novos de heróis
favoritados** e outros momentos que valem um aviso. O agente escolheu os outros casos, registrados
aqui: **conquista desbloqueada** (inclui as metas de sequência e de conteúdos concluídos, que são
conquistas no banco), **programa concluído** e **lembrete de sequência**.

Migração: `supabase/migrations/0050_push_notifications.sql`. Cenários: `S61` em
`supabase/tests/rls_scenarios.sql`.

## Como funciona

```
evento no banco ──gatilho──▶ push_outbox ──▶ dispatchPushOutbox ──▶ Expo Push ──▶ APNs / FCM ──▶ celular
 (post no ar, conquista,     (dedupe_key     (after() da ação que     (timeout 10 s,
  programa concluído)         única)          gerou o evento + cron    lote de 100)
 cron diário 22:00 UTC ─────▶ lembrete       diário /api/cron/push)
```

- **A fila é enchida pelo banco**, por gatilhos em `content` (passagem para `published`),
  `user_achievements` (insert) e `enrollments` (passagem para `completed`), e pela função
  `push_enqueue_streak_reminders()` que o cron chama. Qualquer caminho que publique (herói, admin
  "publicar como hero", revisão do admin) ou conclua (manual, automático por progresso) enfileira
  sem depender da ação lembrar.
- **Idempotência**: `dedupe_key` única por evento. O envio pega o lote com `push_claim` (`for update
  skip locked`); linha pega e não marcada como enviada volta em 5 minutos; até 5 tentativas. Cron e
  `after()` podem rodar juntos sem aviso repetido.
- **Consentimento em dois pontos**: só enfileira para quem tem `channel_push` e o tipo ligados e um
  aparelho registrado; o envio confere de novo (a pessoa pode ter desligado no meio).
- **Post que saiu do ar** (voltou a rascunho, herói suspenso) antes do envio não é avisado.
- **Agendado**: entra na fila com `not_before` = data de ir ao ar e sai no primeiro envio depois dela
  (próxima ação que dispare o envio ou o cron diário). Com a Vercel no plano Hobby, o cron é diário:
  um post agendado pode avisar com atraso de até um dia. Com Vercel Pro, basta um cron a cada
  15 minutos em `vercel.json`.
- **Anti-spam**: no máximo um aviso por herói, por pessoa, por dia (UTC). Lembrete de sequência: um
  por dia local, só para quem tem sequência viva e ainda não fez nada no dia.
- **Aparelho desinstalado**: a Expo responde `DeviceNotRegistered` e o token é apagado.
  Recibos de entrega (segunda etapa da API da Expo) não são consultados nesta versão.
- **Sair da conta** no app apaga o token daquele aparelho (cookie `uh-push-token`, lido por
  `/auth/signout`). O mesmo aparelho que entra em outra conta passa o token adiante
  (`register_push_token`).

## Consentimento e pedido de permissão

- Os tipos novos (`hero_posts`, `achievements`) nascem **desligados**, como os outros (0018: opt-in).
- O app **não pede permissão ao abrir**. Pede no contexto: ao favoritar o primeiro herói (com o
  "sim" do sistema, liga `channel_push` e `hero_posts`) ou ao ligar o Push na tela de Notificações.
  Recusar no sistema não desfaz o favorito e não liga nada.
- Com a permissão já dada, o app só renova o token em silêncio (`PushRegistrar`).

## Herói favorito

Não existia: `favorites` só aponta para conteúdo, produto ou programa. A 0050 cria `hero_favorites`
(RLS: só a própria linha; só herói ativo). O botão fica no perfil do herói, na web e no app.

## O que fica com o dono

- Projeto Firebase com o app Android `com.gchero.com`, `mobile/google-services.json` e a chave da
  conta de serviço do FCM v1 subida por `eas credentials` (build de produção sem o arquivo falha de
  propósito: `mobile/app.config.ts`).
- Chave APNs (`.p8`) da conta Apple, por `eas credentials -p ios`.
- Opcional: ligar a "segurança reforçada" no projeto Expo e pôr `EXPO_ACCESS_TOKEN` na Vercel.
- Aplicar a 0050 no projeto Supabase depois do merge.

## Fora desta versão

E-mail; push no navegador (web push); resumo editorial; recibos de entrega; caixa de entrada de
avisos dentro do app.
