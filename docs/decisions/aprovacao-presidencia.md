# Aprovação da Presidência e Hero só pelo aplicativo (0141, 11/11/2026)

## Regras

1. **Toda conta nova nasce pendente** — qualquer perfil (Hero/Creator, Marca, Agência, usuário do app, convidado, equipe,
   profissional, fornecedor) e qualquer forma de criação (senha, cadastro rápido, Google, Apple, convite, admin).
   Só a **Presidência** aprova ou recusa: a conta existente `presidencia@groscovegroup.com` (Jon), cadastrada na tabela
   `access_approvers` pela migração. Trocar ou acrescentar quem aprova = nova migração (não há tela nem RPC para isso).
2. **Hero/Creator só pelo aplicativo** — cadastro e área do Hero só na WebView da casca das lojas. No navegador, conta Hero
   é desconectada e vê "O acesso de Creators é exclusivo pelo aplicativo Ultra Hero. Abra o app para continuar."
   Marca, Agência, usuário comum e os demais perfis seguem na web.

## Onde fica cada trava

| Camada | O que faz |
|---|---|
| Banco, `auth.users` | Gatilho ANTES de inserir grava `app_metadata.access = 'pending'` (o primeiro token já sai pendente); DEPOIS de inserir cria o pedido em `account_approvals` com perfil pedido e origem e avisa a Presidência no sino. Gatilho ANTES de atualizar mantém `access`/`app_only` iguais à tabela (o Auth regrava `app_metadata` no cadastro com Google). |
| Banco, Data API | `pgrst.db_pre_request = public.api_access_gate`: conta pendente/recusada recebe 403 (`account_pending`/`account_rejected`) em toda tabela e RPC, salvo `account_access_status`, `account_request_profile` e `public_settings`. Vale para quem chama a API direto. |
| Banco, decisão | `presidency_access_decide` confere `is_presidency()` pela identidade do token; grava responsável, horário, nota, histórico (`account_approval_events`) e `admin_audit`. Recusada pode ser reconsiderada; aprovada não volta a pendente por aqui (para tirar acesso existe a suspensão). |
| Site, middleware | Lê `app_metadata.access`/`app_only` do token (sem ida ao banco). Pendente/recusada → `/aguardando-aprovacao`; conta Hero no navegador → sessão encerrada e `/acesso-pelo-app`; `/heroi` sem sessão e `/comecar/heroi` no navegador → `/acesso-pelo-app`. API e server action bloqueadas recebem 403. Token antigo (sem a chave) é renovado uma vez. |
| Site, servidor | `requireUser` repete as duas regras (server actions podem ser chamadas por qualquer caminho); login, primeiro acesso de convite, cadastro por perfil, retorno do Google e as ações que criam Hero conferem o canal antes de criar qualquer coisa. |

## Classificação das contas que já existiam (migração)

- Conta que já tinha entrado no app (`last_sign_in_at` preenchido): **aprovada**, origem `legacy`, sem responsável, com a
  nota "Conta já em uso antes da regra de 11/11/2026 (sem histórico de aprovação): mantida aprovada na migração".
  Em 11/11/2026 eram as 43 contas do banco, inclusive a da Presidência.
- Conta criada que nunca entrou: **pendente**, origem `legacy` (vai para a fila no primeiro acesso). Eram 0.
- Convites ainda não usados (260 de Hero do Casting 2027) continuam valendo: a conta nasce no primeiro acesso, pelo app,
  e entra pendente na fila.
- Aprovações que já existiam em outras filas (pedido de acesso à agência, reivindicação de perfil, Hero aprovado pelo
  admin, profissional conferido) seguem valendo: esta regra é sobre a conta, por cima delas.

## Limites conhecidos

- **Canal do aplicativo:** o servidor reconhece o app pelo marcador `GCHeroApp/<versão> (ios|android)` que a casca põe no
  user agent. É conferido no servidor em toda requisição, mas **um navegador pode imitar esse user agent**. Para garantir o
  bloqueio contra quem forja o canal é preciso atestação do aparelho (App Attest no iOS, Play Integrity no Android) trocada
  por um cookie HttpOnly assinado e ligado à sessão — exige build novo da casca nas lojas.
- **PWA instalado** não é o aplicativo: para o servidor, PWA é navegador (não há como provar o modo instalado no servidor).
- Storage e Realtime não passam pela trava da Data API; conta pendente não tem vínculo de negócio, então o risco é baixo.
- Avisos por e-mail dependem do Resend configurado na Vercel; hoje a Presidência é avisada no sino.
- Válvula: `CREATOR_APP_ONLY=false` na Vercel desliga só a regra do Hero (a aprovação continua).
