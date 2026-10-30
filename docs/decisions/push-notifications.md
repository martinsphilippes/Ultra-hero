# Push no app das lojas

Decisão do responsável (30/10/2026): o app GC Hero avisa por push sobre **posts novos de heróis
favoritados** e outros momentos que valem um aviso. O agente escolheu os outros casos, registrados
aqui: **conquista desbloqueada** (inclui as metas de sequência e de conteúdos concluídos, que são
conquistas no banco), **programa concluído** e **lembrete de sequência**.

Migração: `supabase/migrations/0054_push_notifications.sql`. Cenários: `S65` em
`supabase/tests/rls_scenarios.sql`.

Depois (0061, pedido do responsável): **lance superado nos Colecionáveis** (`auction_outbid`). Detalhes em
`docs/decisions/colecionaveis.md` ("Aviso de lance superado"); cenário `S71`.

## Como funciona

```
evento no banco ──gatilho──▶ push_outbox ──▶ dispatchPushOutbox ──▶ Expo Push ──▶ APNs / FCM ──▶ celular
 (post no ar, conquista,     (dedupe_key     (after() da ação que     (timeout 10 s,
  programa concluído)         única)          gerou o evento + cron    lote de 100)
 cron diário 22:00 UTC ─────▶ lembrete       diário /api/cron/push)
```

- **Envio**: `drainPushOutbox` pede lotes de 200 até esvaziar o que venceu (cron: até 45 s; logo
  depois de uma ação: até 20 s). Publicar pelo herói, pelo admin (aprovar ou publicar agora),
  concluir conteúdo e dar um lance que cobre outro (0061) disparam o envio na hora.
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
- **Reagendado** para mais tarde depois de publicado: o envio vê a data nova e devolve a linha à
  fila para ela, sem gastar tentativa.
- **Agendado**: entra na fila com `not_before` = data de ir ao ar e sai no primeiro envio depois dela
  (próxima ação que dispare o envio ou o cron diário). Com a Vercel no plano Hobby, o cron é diário:
  um post agendado pode avisar com atraso de até um dia. Com Vercel Pro, basta um cron a cada
  15 minutos em `vercel.json`.
- **Anti-spam**: no máximo um aviso por herói, por pessoa, por dia (UTC). Lembrete de sequência: um
  por dia local, só para quem tem sequência viva e ainda não fez nada no dia; se não saiu em 12 h,
  é descartado. Lance superado: um por pessoa e item a cada 2 minutos; o envio descarta se o item
  acabou ou se a pessoa já voltou à frente.
- **Lance superado** (0061): gatilho em `collectibles` (troca do lance vencedor) enfileira só para quem
  vencia antes, com `channel_push` + `auction_outbid` e aparelho; dedupe pelo lance que cobriu. Sai em
  segundos (o `placeBidAction` agenda o envio com `after()`); o cron diário só recolhe sobras. O toque abre
  `/shop/colecionaveis/<id>`, rota bloqueada no app das lojas (cai na aba Hero): ver a decisão pendente em
  `colecionaveis.md`. Em primeiro plano o app mostra o banner (`mobile/src/push.ts`; vale no próximo build).
- **Escala**: o gatilho de post enfileira todos os seguidores dentro da transação que publica. Com
  milhares de seguidores por herói, mover o fan-out para o envio (uma linha por post) antes que a
  publicação chegue perto do limite de tempo do PostgREST.
- **Aparelho desinstalado**: a Expo responde `DeviceNotRegistered` e o token é apagado.
  Recibos de entrega (segunda etapa da API da Expo) não são consultados nesta versão.
- **Sair da conta** pelo app apaga o token daquele aparelho (cookie `uh-push-token`, lido por
  `/auth/signout`). Sessão que expira sem "Sair" deixa o token na conta até a pessoa entrar de novo
  (o token passa para quem entrar) ou desinstalar o app. O mesmo aparelho que entra em outra conta passa o token adiante
  (`register_push_token`).

## Consentimento e pedido de permissão

- Os tipos novos (`hero_posts`, `achievements`; depois `auction_outbid`, 0061) nascem **desligados**,
  como os outros (0018: opt-in). A regra do consentimento está no banco (`push_allowed`) e, igual, em
  `src/lib/push/consent.ts` (`pushAllowedFor`), que o envio usa para conferir de novo.
- O app **não pede permissão ao abrir**. Pede no contexto: ao favoritar o primeiro herói (com o
  "sim" do sistema, liga `channel_push` e `hero_posts`) ou ao ligar o Push na tela de Notificações.
  Recusar no sistema não desfaz o favorito e não liga nada.
- Com a permissão já dada, o app só renova o token em silêncio (`PushRegistrar`).

## Herói favorito

Não existia: `favorites` só aponta para conteúdo, produto ou programa. A 0054 cria `hero_favorites`
(RLS: só a própria linha; só herói ativo). O botão fica no perfil do herói, na web e no app.

## O que fica com o dono

- Projeto Firebase com o app Android `com.gchero.com`, `mobile/google-services.json` e a chave da
  conta de serviço do FCM v1 subida por `eas credentials` (build de produção sem o arquivo falha de
  propósito: `mobile/app.config.ts`).
- Chave APNs (`.p8`) da conta Apple, por `eas credentials -p ios`.
- Opcional: ligar a "segurança reforçada" no projeto Expo e pôr `EXPO_ACCESS_TOKEN` na Vercel.
- Aplicar a 0057 no projeto Supabase depois do merge.
- Aplicar a 0061 no projeto Supabase depois do merge (lance superado e visitas à página do herói).

## Fora desta versão

E-mail; push no navegador (web push); resumo editorial; recibos de entrega; caixa de entrada de
avisos dentro do app (o pop-up de lance superado da 0061 mostra cada aviso uma vez; não há lista).
