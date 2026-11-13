# Aprovação da Presidência e dos ADMs e Hero só pelo aplicativo (0141, 11/11/2026; ADMs: 0144, 13/11/2026)

## Regras

1. **Toda conta nova nasce pendente** — qualquer perfil (Hero/Creator, Marca, Agência, usuário do app, convidado, equipe,
   profissional, fornecedor) e qualquer forma de criação (senha, cadastro rápido, Google, Apple, convite, admin).
   Aprovam ou recusam, com o mesmo poder e na mesma fila (0144): a **Presidência** — a conta
   `presidencia@groscovegroup.com` (Jon), na tabela `access_approvers` — e os **ADMs**: quem tem o papel `admin` da
   plataforma e o Adm da indústria Groscove. Os ADMs entram pela regra do papel (ver "Quem aprova", abaixo); trocar a
   Presidência continua sendo nova migração (não há tela nem RPC para isso).
2. **Hero/Creator só pelo aplicativo** — cadastro e área do Hero só na WebView da casca das lojas. No navegador, conta Hero
   é desconectada e vê "O acesso de Creators é exclusivo pelo aplicativo Ultra Hero. Abra o app para continuar."
   Marca, Agência, usuário comum e os demais perfis seguem na web. Conta que pediu o perfil Hero fica só pelo app em
   qualquer situação — pendente, aprovada (antes e depois de terminar o passo a passo do Hero) ou recusada (0142).

## Onde fica cada trava

| Camada | O que faz |
|---|---|
| Banco, `auth.users` | Gatilho ANTES de inserir grava `app_metadata.access = 'pending'` (o primeiro token já sai pendente); DEPOIS de inserir cria o pedido em `account_approvals` com perfil pedido e origem e avisa a Presidência no sino. Gatilho ANTES de atualizar mantém `access`/`app_only` iguais à tabela (o Auth regrava `app_metadata` no cadastro com Google). |
| Banco, Data API | `pgrst.db_pre_request = public.api_access_gate`: conta pendente/recusada recebe 403 (`account_pending`/`account_rejected`) em toda tabela e RPC, salvo `account_access_status`, `account_request_profile` e `public_settings`. Vale para quem chama a API direto. |
| Banco, decisão | `presidency_access_decide` confere `can_approve_access()` (0144; antes `is_presidency()`) pela identidade do token; grava responsável, horário, nota, histórico (`account_approval_events`) e `admin_audit`. Recusa a decisão se a pessoa trocou o perfil pedido depois que a fila foi aberta (`profile_changed`) e, com vários aprovadores, se outro já decidiu enquanto a tela estava aberta (`already_decided`). Recusada pode ser reconsiderada; aprovada não volta a pendente por aqui (para tirar acesso existe a suspensão). |
| Banco, perfil e origem | O Supabase Auth insere a conta só com o provedor e grava o resto logo depois: o gatilho ANTES de atualizar aplica nesse momento o perfil pedido e a origem (cadastro por perfil, convite, admin, cadastro rápido). Admin e Presidência nunca ficam "só pelo app". |
| Site, middleware | Lê `app_metadata.access`/`app_only` do token (sem ida ao banco). Pendente/recusada → `/aguardando-aprovacao`; conta Hero no navegador → sessão encerrada e `/acesso-pelo-app`; `/heroi` sem sessão e `/comecar/heroi` no navegador → `/acesso-pelo-app`. API e server action bloqueadas recebem 403. Token antigo (sem a chave) é renovado uma vez (cookie de 5 minutos evita repetir). |
| Site, canal do app | Marca `GCHeroApp/<versão> (ios\|android)` no user agent; o servidor grava o cookie HttpOnly `uh-app` quando a vê e o usa nas requisições sem a marca (no Android o service worker refaz navegações com o user agent padrão). O cookie só vale dentro de uma WebView embutida (Android "; wv)" ou WebKit da Apple sem "Safari/"): copiado para um navegador comum junto com a sessão, não conta como app. Dentro do app o service worker não é registrado e o antigo é removido. WebView do Android sem a marca é barrada sem perder a sessão. |
| Fila de aprovação | `/agencia/aprovacoes` (menu, cartão no painel da indústria e no painel do `/admin`, aviso no sino). Nome, e-mail, perfil pedido, origem e data; aviso "E-mail não comprovado" quando a posse do e-mail não foi provada (senha e cadastro rápido; Google/Apple comprovam). "Decididos" mostra quem decidiu. O login sem senha (link mágico) não vale para quem aprova. |
| Site, servidor | `requireUser` repete as duas regras (server actions podem ser chamadas por qualquer caminho); login, primeiro acesso de convite, cadastro por perfil, retorno do Google e as ações que criam Hero conferem o canal antes de criar qualquer coisa. |

## Quem aprova (0144, 13/11/2026)

Pedido do responsável: "todos os ADMs também autorizam o acesso dos usuários, igual à Presidência". Uma regra só no
banco, `is_access_approver(usuário)`, usada pela fila, pela decisão, pelo RLS de `account_approvals` e
`account_approval_events`, pelos avisos e pelo "entrar sem senha" do site:

- **Presidência**: quem está em `access_approvers` (como na 0141).
- **ADM da plataforma**: papel `admin` ativo em `role_assignments`.
- **Adm da indústria Groscove** (dona da plataforma): `agency_members` `admin` ativo da indústria de slug `groscove`, ativa
  — o mesmo grupo de `is_groscove_admin`, que já aprova marcas novas (0126).
- **Nunca**: conta de demonstração (login público), mesmo com o papel; Adm de **outra** indústria (indústrias são clientes:
  liberar contas da plataforma é da dona); gestor/colaborador da Groscove; papel revogado.

Em 13/11/2026 isso dá 6 contas: a Presidência (que também é a Adm da Groscove) e os 5 admins da plataforma.

Decisões:

- **Regra por papel, não lista de nomes**: quem deixa de ser ADM perde o poder (e os avisos) na hora, sem privilégio
  esquecido numa tabela. A Presidência continua na tabela (é uma pessoa, não um papel).
- **Poder igual**: o ADM aprova, recusa e reconsidera recusas, inclusive as da Presidência (e vice-versa). Cada decisão
  guarda quem decidiu (fila "Decididos", `account_approval_events`, `admin_audit`).
- **Vale a primeira decisão**: a tela manda a situação que mostrou (`p_expected_status`: `pending` na fila, `rejected` em
  "Decididos"); se outro aprovador decidiu nesse meio-tempo, o banco responde `already_decided` ("Outra pessoa já decidiu
  este cadastro") em vez de sobrescrever. Repetir a mesma decisão continua sem efeito. Reconsiderar uma recusa é sempre
  um ato deliberado, pela aba "Decididos", vendo a nota de quem recusou.
- **Avisos**: cada conta nova avisa no sino a Presidência e cada ADM (um aviso por pessoa). Decidido o pedido, o aviso
  sai como lido para todos (a tarefa acabou). O painel do `/admin` (que não tem sino) ganhou o cartão "Cadastros
  aguardando aprovação", primeiro das pendências, levando à fila.
- **Senha sempre**: quem aprova nunca entra pelo "entrar só com o e-mail" (`requiresPassword` consulta
  `is_access_approver`; erro na consulta = exige senha).
- **Textos para quem espera**: o título continua "aguardando aprovação da Presidência" (o processo é dela); as frases que
  atribuíam uma decisão específica à Presidência ficaram neutras ("Seu acesso foi aprovado"), porque agora quem decide
  pode ser um ADM.
- `account_app_only` não mudou: Adm de indústria nunca é Hero (um perfil de negócio por conta, 0116) e o admin da
  plataforma e a Presidência já ficavam fora do "só pelo app".

Publicação sem janela quebrada, em qualquer ordem: os nomes das RPCs (`presidency_*`) foram mantidos; o site publicado
antes chama a decisão com 4 parâmetros e cai na assinatura nova pelo valor padrão do 5º; o site novo, num banco ainda sem
a 0144, volta para `is_presidency` (a fila não some) e repete a decisão sem a situação vista (`PGRST202`). Ordem
recomendada: aplicar a 0144 e depois publicar o site. Cenários S144 em `supabase/tests/rls_scenarios.sql`.

## Classificação das contas que já existiam (migração)

- Conta que já tinha entrado no app (`last_sign_in_at` preenchido) e foi criada mais de 1 hora antes da migração:
  **aprovada**, origem `legacy`, sem responsável, com a nota "Conta já em uso antes da regra de 11/11/2026 (sem histórico
  de aprovação): mantida aprovada na migração". Em 11/11/2026 eram as 43 contas do banco, inclusive a da Presidência.
- Conta criada que nunca entrou, ou criada na última hora antes da migração (cadastro feito durante a publicação):
  **pendente**, origem `legacy`, vai para a fila. Eram 0.
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
- Avisos por e-mail dependem do Resend configurado na Vercel; hoje a Presidência e os ADMs são avisados no sino (e os
  admins da plataforma veem a contagem no painel do `/admin`).
- Válvula: `CREATOR_APP_ONLY=false` na Vercel (e nova publicação) desliga só a regra do Hero (a aprovação continua).
- App aberto durante uma publicação (12/11/2026): o cadastro grava no servidor, mas a resposta pode quebrar o JavaScript
  antigo acima de todas as telas. `src/app/global-error.tsx` recarrega sozinho uma vez por minuto e, se não der, mostra
  "Recarregar" (no app não há barra de endereço); antes a pessoa ficava presa em "Application error".
- Emergência da trava da Data API (se ela bloquear o que não deve): `alter role authenticator reset pgrst.db_pre_request;
  notify pgrst, 'reload config';` — o site continua barrando pelas telas; a decisão da Presidência continua no banco.
