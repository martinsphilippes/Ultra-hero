# Groscove Ultra: especificação técnica do módulo de Gestão (agência, marcas e creators)

**Status:** especificação para implementação, sem código de aplicação. Segue o plano aprovado em
[`gestao-creators-marcas-agencia.md`](./gestao-creators-marcas-agencia.md) (seções 13 e 14). Quando os
dois textos divergirem, vale este documento nos detalhes técnicos e o plano aprovado nas decisões de negócio.

**Escopo:** seis etapas publicáveis uma a uma (A a F), uma migração por etapa (0064 a 0069). Tudo o que
envolve dinheiro é **simulado** (registro interno, sem cobrança real). Integrações externas (Google
Agenda, Instagram, TikTok, YouTube, Uber, assinatura eletrônica, pagamento) **não são simuladas como se
funcionassem**: a interface diz "em breve".

**Como ler:** a seção 0 resume as decisões. As seções 1 a 11 seguem a ordem pedida. O apêndice A lista
os arquivos por etapa e o apêndice B traz a checagem de "migração ainda não aplicada". O "Registro de
revisão", no fim, lista cada achado das três revisões independentes e o que foi feito com ele.

---

## 0. Resumo das decisões e convenções

### 0.1 Decisões principais

| # | Decisão | Por quê, em uma linha |
|---|---|---|
| D1 | `app_role` ganha `agency` e `brand`; `role_assignments.scope_type` ganha `agency`, `brand` e `talent`. A **hierarquia** (admin, manager, staff / owner, staff) mora em `agency_members.role` e `brand_members.role`, que são a fonte da verdade da RLS. | Igual ao fornecedor (`seller` + `seller_memberships`). O código que já lê papéis (`getRoles`, `requireRole`, `/configuracoes`, selos do Perfil) passa a mostrar os portais sem mecanismo novo. |
| D2 | Talento sem página pública = linha em `talent_profiles` com `creator_id` nulo. Login opcional por convite (papel `creator`, escopo `talent`, `invitations.talent_id`). Nunca se cria `creator_profiles` "pendente". Quem só tem o escopo `talent` não vê painel nem Novo post: `/creator` leva ao escritório, o selo do Perfil diz "Talento" e o atalho de `/configuracoes` aponta para o escritório (6.4). | Não mexe na contagem de heróis (S1), nas listas do admin nem no "Publicar como hero". |
| D3 | Valores vivem em **6 tabelas próprias**: `commission_rules`, `campaign_request_budgets`, `deal_talent_fees`, `deal_proposals`, `deal_commission_snapshots`, `financial_entries`. Nenhuma tabela que gestor ou colaborador lê tem coluna de valor (guardado pelo cenário S80), nem chave de valor dentro de `jsonb` (checks de forma). O creator também não lê colunas internas da agência: `talent_profiles` e `deal_talents` não têm política para ele; o escritório lê por RPC com lista fechada de campos (`talent_my_context`, `talent_opportunities`). | A RLS é por linha, não por coluna: separar fisicamente (ou servir por RPC) é a única forma de o servidor nunca devolver o que não deve. |
| D4 | O cálculo da comissão é **TS puro** (`src/lib/agency/commission.ts`), executado **no servidor**. A gravação passa pela RPC `agency_proposal_commit`, executável **só pelo service role**, que confere a regra vigente, os cachês do banco e a identidade aritmética antes de gravar o snapshot. | Uma única implementação do cálculo; o navegador não consegue gravar números próprios. |
| D5 | O media kit público (`/kit/[token]`) é resolvido no servidor com o service role (`media_kit_resolve`, sem execute para anon e authenticated). Talento da agência demo não tem link público. **O S14 continua 17.** | Superfície anônima menor e nenhuma das 21 asserções "= 17" muda. |
| D6 | A agência de **demonstração** é outra linha em `agencies` (`is_demo`), criada por botão do admin, **nunca por migração**. **Conta de demonstração (`app_metadata.ultra_hero_demo`) nunca vê nem age na agência real**, mesmo com papel admin: o "AG" do módulo é `is_platform_admin()` (admin **e** não demo), usado em todo `_select_admin` e em `agency_can`; o aceite de convite de agência, marca ou talento real recusa conta demo (`demo_account_forbidden`); `talent_user_id()` ignora conta demo em agência real. A agência demo é **travada** (`demo_locked`): equipe e membros da marca fixos (só o seed mexe), não vincula herói nem marca existentes, não registra consentimento nem gera link público, e cria marcas só com slug `exemplo-*` (até 10). | A 0063 apaga `brands where is_demo` e o S72 apaga `brands where not is_demo`: seed de marca em migração quebraria a suíte e a reaplicação da 0063. As contas demo (inclusive `admin@demo`, `heroi@` = Érick Jacquin real e `agencia@`) ficam no painel público de login. |
| D7 | Marca criada pela agência nasce com `brands.status = 'inactive'`. | Marca ativa é legível por anon: a carteira de clientes da agência não pode ser listada pela API pública. |
| D8 | Caixa de notificações nova (`inbox_notifications`) com `kind` + `params` (texto montado no idioma de quem lê) + `link`. Push só para avisos do escritório do creator, pela fila existente (`push_outbox`, tipo novo `office`, preferência `office_updates`, opt-in). `user_alerts` fica como está. **Agência e marca não recebem nada fora do portal no MVP** (sem push e sem e-mail: 🔌 "e-mail transacional / Web Push para agência e marca", seção 11); a tela de convite e o Início avisam que os avisos ficam no sino. | Os portais `/agencia` e `/marca` são bloqueados no app das lojas; o push da 0054 é Expo (app das lojas), não Web Push; o projeto não envia e-mail transacional hoje. |
| D9 | Tabelas filhas de negócio e de talento carregam `agency_id` (e `brand_id` quando a marca lê) preenchidos por gatilho a partir do pai. As políticas usam funções que devolvem `uuid[]`, sempre em `(select ...)`. | Política simples, avaliada uma vez por consulta (initplan), sem recursão de RLS. |
| D10 | MVP: uma agência ativa por usuário e um talento por usuário (índices únicos parciais). | Resolve o "contexto" sem seletor; o banco já tem `agency_id` para crescer. |
| D11 | 13 etapas do pipeline, a última é `closed` com `outcome` (`won`, `lost`, `cancelled`). Etapas com porteira (`proposal_sent`, `approved`, `production`) só mudam por RPC específica. | Garante que proposta, aceite e contrato não sejam "pulados". |
| D12 | Modelo de 12 tarefas: 5 por negócio + 7 por creator contratado. Com 1 creator, 12 tarefas; com *n*, 5 + 7*n*. O roteiro (passo 4) é enviado com anexo pelo creator e chega à marca, que aprova ou pede ajuste (passo 5, `brand_task_decide`). | Cada creator tem roteiro, aprovação, publicação e comprovação próprios. |
| D13 | Documentos: bucket privado `agency-docs`, caminho por escopo `<agency_id>/<scope_type>/<scope_id>/<document_id>.<ext>`, reserva por RPC, URL assinada de 60 s gerada com o cliente do usuário (a RLS de `documents` decide). Contratos nascem `restricted`; **só ADM/AG** enviam, compartilham e arquivam contrato. Contrato do creator (com o cachê) nunca é compartilhado com a marca, e o da marca (com o total) nunca com o creator (checks). Quem enviou só lê a própria reserva enquanto está `pending`. | Contrato tem preço; o gestor trata "contrato sem valores" (vê status e aceites, não o PDF). |
| D14 | Escritório do creator em `/creator/escritorio/*`. No app das lojas ele aparece, **sem valores** (cachê e repasse escondidos). | Plano aprovado, seção 11. |
| D15 | Nomes de pessoas são denormalizados (`display_name` nas tabelas de membros, `author_label` em mensagens e atividades). A RLS de `profiles` não muda. | Evita abrir `profiles` para outras contas. |
| D16 | Notificação, atividade, auditoria visível, título de tarefa e exportação `.ics` **nunca** carregam valores (check em `inbox_notifications.params`). | Regra 14.1: valor nunca chega ao gestor por nenhum caminho. |
| D17 | Permuta (negócio sem valor) e impostos/nota fiscal ficam fora do MVP. | Total da proposta precisa ser > 0. |
| D18 | **Uma agência ativa por marca** (índice único parcial em `agency_brands(brand_id) where status = 'active'`). Vincular marca que já é cliente de outra agência: só o AG, arquivando o vínculo anterior (transferência). | Já nascem duas agências (real e demo): sem isso uma agência lê e remove a equipe da marca de outra. |
| D19 | **Escopo sempre derivado da linha:** RPC que recebe `p_id` (ou itens com `id`) lê `agency_id`/`brand_id`/`talent_id` da própria linha e confere o papel nesse escopo; o parâmetro de escopo (`p_agency`, `p_brand`, `p_talent`) só vale para criar e, se vier junto com `p_id`, precisa ser igual ao da linha (`not_found`). Todo `update` leva `and agency_id = v_agency` (ou `brand_id`/`talent_id`). | Fecha IDOR entre marcas e entre agências (4, regra comum). |
| D20 | A **consulta de interesse** entra na Etapa C, junto com a proposta. A C entrega o fluxo "briefing até a proposta" inteiro (plano §7, fluxo 3); a D entrega "contratação até o encerramento" (fluxo 4). | Sem consulta não há creator `interested`, e a proposta da C nunca poderia ser enviada. |
| D21 | O **ajuste A** aceito pelo ADM é lançamento próprio (`adjustment`, com justificativa), separado da comissão pela regra, no snapshot, no Financeiro e nos indicadores. | A regra percentual não vira "mínimo" escondido; a receita de comissões fica fiel à regra. |
| D22 | A **recomendação explicada** é regra pura (`src/lib/agency/match.ts`, seção 5.7) com critérios, pesos, nota 0–100 e vetores fixos. A busca da marca não dá nota: mostra os filtros atendidos ou "dados insuficientes". | Única "IA" do MVP; precisa ser verificável (plano §9). |

### 0.2 Convenções obrigatórias (valem para todas as migrações 0064 a 0069)

1. **Idempotência:** `create table if not exists`, `add column if not exists`, `create index if not exists`,
   `drop policy if exists` + `create policy`, `drop trigger if exists` + `create trigger`,
   `drop constraint if exists` + `add constraint`, blocos `do $$ ... $$` para o que não tem `if not exists`.
   Reaplicar não duplica nem desfaz edição.
2. **Valores novos de enum** (`app_role`, `actor_type`) nunca são usados literalmente na mesma migração
   fora de corpo `plpgsql` (o runner remoto, `scripts/db/remote-apply.mjs`, envolve o arquivo em `begin; … commit;`).
   Checks, **políticas** e funções **`language sql`** comparam `role::text` (o corpo de função SQL e a expressão
   da política são analisados na criação e dariam *unsafe use of new enum value*); só corpos `plpgsql` usam os
   valores. O reset local (`scripts/db/local-reset.sh`) roda `psql -f` sem transação única e **não pega** esse
   erro: antes do push, aplicar a migração nova num banco descartável já migrado até a anterior com
   `psql -1 -v ON_ERROR_STOP=1 -f <arquivo>` (mesma transação única do remoto).
3. **PK `id uuid default gen_random_uuid()`** em toda tabela, inclusive as de ligação. Nada de PK composta.
   FKs **nomeadas** (`constraint <tabela>_<coluna>_fk`). Nenhuma unique composta formada só por FKs para
   duas tabelas que já se ligam por FK direta (PGRST201; ver 0051/0055, cenários S65 e S80). Quando duas
   tabelas têm **mais de uma FK entre si**, todo embed usa o hint da FK: `deliverables` →
   `submission:documents!deliverables_submission_doc_fk(...)` e `proof:documents!deliverables_proof_doc_fk(...)`;
   `documents` **não** tem FK de volta para `deliverables` (a coluna `deliverable_id` saiu). As telas que fazem
   esses embeds são lidas de verdade no E2E (Etapa D).
4. **Grants:** `revoke all on table X from public, anon, authenticated;` depois `grant select on table X to authenticated;`
   e `grant all on table X to service_role;`. **Escrita só por RPC**, sem exceção (até "marcar como lida" é RPC).
   Embeds no PostgREST sempre pelo caminho um-para-muitos (`deal_talents(talent:talent_profiles(...))`),
   nunca muitos-para-muitos direto (`deals → talent_profiles`), que pode ficar ambíguo.
5. **Funções:** toda função nova tem `set search_path` (`''` nas `security definer`, com tudo qualificado:
   `public.`, `auth.`, `extensions.`; `public` aceito em funções `invoker`/puras). Toda função nova recebe
   `revoke execute ... from public, anon` explicitamente: o shim local e o Supabase dão `execute` a `anon`
   por *default privileges* e isso quebraria o S14. Funções internas: `revoke ... from public, anon, authenticated` +
   `grant ... to service_role`.
6. **Políticas** sempre `to authenticated`, com toda chamada de função embrulhada em `(select ...)`. Com array, a forma é
   `x = any ((select public.f())::uuid[])`: sem o cast, `any ((select ...))` vira a forma de subconsulta e compara `uuid` com `uuid[]`
   (erro encontrado na 0064). Expressão booleana com função que pode dar `null` (ex.: `brand_member_of(...) = 'owner'`) vai em
   `coalesce(..., false)` antes de `if not`: `not null` não dispara a recusa (falha encontrada pelo S74)
   (regra do S14: nenhuma política avalia `auth.uid()`/`is_admin()` por linha). Uma política por público
   (`<tabela>_select_admin`, `_agency`, `_staff`, `_brand`, `_talent`) para os testes mirarem cada uma.
7. **`updated_at`** com `public.set_updated_at()` em toda tabela que tem a coluna.
8. **Auditoria:** toda escrita sensível chama `public.audit_log(acao, tipo, id, antes, depois, justificativa, ator)`
   com `p_actor_type` explícito (`'agency'`, `'brand'`, `'creator'` ou `'admin'`; nas RPCs da agência,
   `'admin'` quando quem age é o AG sem ser membro). Toda RPC da agência põe `agency_id` em `after_data`
   (ou `before_data`), para o histórico da agência (4.6). RPCs executadas pelo service role gravam em
   `admin_audit` diretamente, com `actor_id = p_actor` (ver 4.3).
9. **Erros** com `raise exception '<codigo>' using errcode = ...` (`42501` permissão, `P0002` não encontrado,
   `22023` entrada inválida, `P0001` regra de negócio). Os códigos estão nas tabelas de RPC (seção 4) e viram
   mensagens em `messages/*/<namespace>.json` (`errors.<codigo>`).
10. **Fim de toda migração:** `notify pgrst, 'reload schema';`.
11. **Numeração:** antes de criar o arquivo, `git pull` e conferir que 0064..0069 continuam livres (dois
    colaboradores enviam para a master).
12. **Suíte RLS reaplica migrações antigas no meio do arquivo** (S65/S71 reaplicam a 0054 e a 0061, S68 a 0058,
    S72 a 0062). Isso desfaz o que 0064–0069 mudam em objetos existentes (`role_assignments_scope_type_check`,
    `invitations_role_check`, `invitations_scope`, `accept_invitation`, `push_allowed`, `push_outbox_kind_check`,
    `admin_brand_delete`). Por isso **cada cenário novo começa reaplicando a própria migração**, na ordem:
    S74 `\ir ../migrations/0064_gestao_fundacao.sql`, S75 → 0065, S76 → 0066, S77 → 0067, S78 → 0068, S79 → 0069
    (padrão do S71). Cascata: reaplicar a 0064 volta `accept_invitation`, `invitations_scope`, as políticas de
    `documents` e `agency_member_remove` à versão da 0064; por isso cada S seguinte reaplica a sua, e o S80 roda
    com o estado final. Toda migração do módulo tem de ser reaplicável **dentro de uma transação** (a suíte roda
    numa só e faz `rollback` no fim).
13. **Função recriada** mantém assinatura e tipo de retorno (`create or replace` não troca retorno;
    `accept_invitation` continua `returns jsonb`). Quando uma função ou política é recriada em várias
    migrações, a versão final é a da última migração que a toca, e o texto dela repete todos os ramos anteriores.

### 0.3 Glossário de papéis usado neste documento

| Sigla | Quem | Onde vem |
|---|---|---|
| **AG** | Admin geral da plataforma (conta real) | `public.is_platform_admin()` = `is_admin()` **e** a conta não é demo (`app_metadata.ultra_hero_demo`). A conta compartilhada `admin@demo.ultrahero.app` tem `is_admin()`, mas **não** é AG neste módulo (D6). |
| **ADM** | Adm da agência | `agency_members.role = 'admin'` |
| **GES** | Gestor da agência | `agency_members.role = 'manager'` |
| **COL** | Colaborador da agência | `agency_members.role = 'staff'` |
| **CRE** | Creator / talento com login | `public.my_talent_id()` não nulo |
| **MO** | Representante da marca, dono | `brand_members.role = 'owner'` |
| **MS** | Representante da marca, equipe | `brand_members.role = 'staff'` |
| **CON** | Consumidor sem outro papel | só `consumer` |
| **ANON** | Visitante | papel `anon` |

"GES+" significa GES ou ADM (ou AG). "COL dono" significa o colaborador responsável (`deals.owner_id`).

---

## 1. Visão por etapa

Cada etapa é publicada sozinha: migração, RLS, cenários SQL, vitest, E2E de leitura, axe, 390 px, build,
deploy e verificação. Uma etapa nunca depende de código de etapa futura. O botão "Criar agência de
demonstração" (seção 8) é reexecutável: cada etapa amplia a função `agency_demo_seed` e o admin clica de novo.

### Etapa A · Fundação (migração 0064)

**Entra**
- Enum: `app_role` + `agency`, `brand`; `actor_type` + `agency`, `brand`; `scope_type` + `agency`, `brand`, `talent`.
- Tabelas: `agencies` (com a agência real semeada), `agency_members`, `agency_brands`, `brand_members`,
  `inbox_notifications`, `documents` (escopos `agency` e `brand`). Colunas novas em `invitations`.
- Bucket privado `agency-docs` e políticas de storage.
- Funções auxiliares de papel (3.2), inclusive `is_demo_account()` e `is_platform_admin()`; RPCs de equipe,
  convites, marcas da agência, caixa de notificações e documentos.
- Políticas **restritivas** que escondem das contas demo os convites de agência/marca/talento e a auditoria da
  agência (`invitations_hide_from_demo`, `admin_audit_hide_agency_from_demo`).
- `admin_brand_delete` recriada: recusa marca vinculada a agência (`brand_linked_to_agency`), com membros
  (`brand_has_members`) ou com documentos (`brand_has_documents`); `documents_brand_fk` e `agency_brands_brand_fk`
  com `on delete restrict`; índice único de vínculo ativo por marca (D18).
- `accept_invitation` com os ramos `agency` e `brand` (nunca rebaixa papel; recusa conta demo em agência real;
  devolve `scope_type`).
- Push: tipo `office` em `push_outbox`, coluna `notification_preferences.office_updates`, `push_allowed` atualizada.
- Casca dos portais: `/agencia` (Início, Marcas, Equipe, Configurações básicas, Notificações) e `/marca`
  (Início, Equipe, Notificações); menu por papel; sino com contagem em tempo real.
- Bloqueio no app das lojas (`/agencia`, `/marca`), rotas protegidas no middleware, `robots`.
- Atalhos dos portais em `/configuracoes`, selos dos papéis no Perfil, convite em `/invite` com os novos papéis.
- Admin: `/admin/agencia` (agências, membros, botão de demonstração), `/admin/users/[id]` com os escopos novos,
  `/admin/invitations` com rótulos e links de agência, marca e talento.
- Telas existentes que ficam tolerantes à 0064 ausente: preferências de notificação (`office_updates`) e
  `/admin/invitations` (embed novo com leitura de reserva). `isMissingSchema` passa a morar em
  `src/lib/supabase/helpers.ts` (com `PGRST200`) e `FilterAnchor` (`<a>` simples) entra para os filtros.
- Contas demo `agencia@`, `colaborador@` e `marca@` (só as contas e os vínculos; dados de exemplo vêm nas
  próximas etapas). Equipe da agência demo e da marca demo fixas (`demo_locked`). O painel de acesso rápido
  e os testes que contam os botões (`demo-access.spec.ts`, `professionals.test.ts`) passam a contar os tipos novos.

**Fica de fora:** casting, pipeline, valores, agenda, financeiro.

**Critérios de aceite**
1. O ADM convida GES e COL; o aceite cria `agency_members` + `role_assignments(agency, agency, <id>)`.
   O COL não abre `/agencia/equipe` (redireciona para `/agencia`) e a RPC recusa (`forbidden`).
2. Não dá para rebaixar nem remover o último ADM (`last_agency_admin`).
3. GES+ cria uma marca (nasce `inactive`) ou vincula uma existente e convida o MO; o MO convida MS.
   A marca A não lê nada da marca B (RLS, S74). Uma marca tem no máximo uma agência ativa (`brand_linked_elsewhere`).
4. Visitante em `/agencia` ou `/marca` vai ao login; CON vai para `/personalities` (o `requireRole` manda para
   `/`, que o `next.config.ts` redireciona); no app das lojas, 307 para o fallback.
5. O sino mostra a contagem de não lidas, abre a lista, marca como lidas e recebe aviso novo sem recarregar.
6. S14 continua 17; nenhuma política nova avalia função por linha; S80 (estrutura) passa.
7. Sem a 0064 no banco: `/agencia` e `/marca` mostram "Módulo indisponível no momento" (sem erro 500),
   `/configuracoes` não mostra os atalhos, `/admin/invitations` e as preferências de notificação continuam funcionando.
8. A conta `admin@demo` (papel admin, conta demo) lê 0 linhas da agência real, dos convites de agência/marca e da
   auditoria da agência; `agency_can` e as RPCs do AG a recusam (`forbidden`). A agência demo recusa convite,
   troca de papel e remoção (`demo_locked`).
9. Remover membro revoga os convites pendentes da mesma pessoa no mesmo escopo; aceitar convite nunca rebaixa
   papel nem reativa quem tem convite antigo revogado.

### Etapa B · Casting e media kit (migração 0065)

**Entra**
- Tabelas: `talent_segments` (10 iniciais por agência), `talent_profiles`, `talent_segment_links`,
  `talent_social_accounts`, `media_kits`. `invitations.talent_id`. `documents` com escopo `talent`.
- `talent_user_id()` e `my_talent_id()` (conta demo nunca vira talento de agência real); RPCs de casting,
  consentimento LGPD, redes declaradas, media kit, link público; `talent_my_context()` (o creator não lê
  `talent_profiles` direto).
- `/agencia/casting` (lista, novo, ficha com redes, media kit, documentos e histórico).
- `/creator/escritorio` (Início mínimo, Media kit, Consentimento, Notificações) com atalho no Perfil; quem só
  tem o escopo `talent` cai direto no escritório (D2).
- `/kit/[token]` público, sem login, com só os campos marcados e gráficos de gênero e faixa etária
  (`MiniBarChart`) quando `audience` está marcado.
- Conta demo `talento@demo.ultrahero.app` (talento sem página da agência demo; a `heroi@` não muda, seção 8).

**Fica de fora:** foto de talento sem página pública (usa iniciais; foto vem do herói ligado), métricas
automáticas das redes (🔌, a tela diz "em breve"), busca da marca (Etapa C).

**Critérios de aceite**
1. Talento com e sem página pública entra no casting; um herói só pode estar em um talento (`creator_already_in_casting`).
2. Toda métrica tem `source` e `as_of`; a tela mostra "dados de DD/MM/AAAA · declarado por {creator ou agência} em
   DD/MM/AAAA" (`as_of`, `declared_side`, `updated_at`); sem dado, "não informado" (nunca zero).
3. `source = 'integration'` não é gravável por nenhuma RPC de usuário.
4. Sem consentimento: não gera link, não entra no catálogo. Revogar o consentimento revoga o link e tira do catálogo.
5. `/kit/<token>` mostra só os campos marcados, para de funcionar quando revogado ou vencido (página "link
   indisponível", status 404, `noindex`) e não exige login. Não mostra nenhum valor, nunca. Talento da agência
   demo não tem link (`demo_locked`; `media_kit_resolve` devolve `null`).
6. COL lê o casting e não edita (`forbidden`).
7. O creator lê 0 linhas de `talent_profiles` pela API (nem `internal_notes`, `commercial_status`,
   `last_contact_at`); o escritório funciona por `talent_my_context()`.
8. A conta `heroi@` (página real do Érick Jacquin) nunca vira talento de agência real: herói ligado a conta demo
   fica "sem login" para a agência real (`talent_user_id` nulo).

### Etapa C · Briefing, pipeline, consulta, busca e comissão (migração 0066)

**Entra** (fluxo "briefing até a proposta" completo, D20)
- Tabelas operacionais: `campaign_requests`, `deals`, `deal_team`, `deal_talents`, `deliverables` (escopo
  e cronograma), `activities`, `deal_messages`. `documents` com escopos `request` e `deal`.
- Tabelas de valor: `campaign_request_budgets`, `commission_rules`, `deal_talent_fees`, `deal_proposals`,
  `deal_commission_snapshots`.
- Briefing da marca em etapas com rascunho automático e anexos; envio cria o negócio e avisa a agência.
- Pipeline de 13 etapas (quadro no desktop, lista agrupada no celular), detalhe do negócio, equipe do negócio,
  shortlist com recomendação explicada (5.7), atividades, conversa registrada (marca↔agência e talento↔agência).
- **Consulta de interesse** (em massa, com prazo, só de creator com cachê definido); o creator aceita, recusa
  com motivo ou pede conversa em `/creator/escritorio/oportunidades` (lista e detalhe); a agência registra a
  resposta só de quem não tem login. Push `opportunity_*` ao creator.
- Motor de comissão (seção 5), regras nos 3 níveis (Configurações e negócio), cachês, proposta à marca,
  decisão da marca (com motivo estruturado), reabertura de proposta aceita (ADM).
- Busca de creators no portal da marca (catálogo autorizado).

**Fica de fora:** aceite do contrato, tarefas e fluxo de aprovação dos entregáveis (D), agenda (E), lançamentos (F).

**Critérios de aceite**
1. Briefing enviado cria o negócio em `briefing_received` na mesma transação e avisa ADM e GES. Com o pipeline
   aberto, o negócio aparece em até 1 s (o sino recebe `briefing_received` por Realtime e a página do pipeline
   chama `router.refresh()`); fechado, aparece no próximo carregamento.
2. GES/COL não recebem valor em nenhuma resposta: `deal_talent_fees`, `deal_proposals`, `commission_rules`,
   `deal_commission_snapshots` e `campaign_request_budgets` devolvem 0 linhas para eles (S76).
3. COL vê só os negócios em que é responsável ou participante e só move etapa dos que são dele.
4. A proposta só sai pelo servidor (ADM), com snapshot da regra; mudar a regra depois não muda a proposta enviada.
   Com proposta `sent`/`accepted`, cachês, elenco e entregáveis ficam travados (`proposal_locked`).
5. A marca vê o total da proposta da própria marca e mais nada de valor (nem o orçamento interno de pedido de
   origem agência).
6. Toda mudança de etapa e de valor fica em `admin_audit`, com autor e data.
7. Busca da marca mostra só talentos com consentimento + liberados pela agência, só os campos autorizados,
   cada card com os filtros atendidos; sem dados suficientes (5.7), "dados insuficientes" e sem nota. Na
   shortlist da agência, cada recomendação traz nota 0–100 e os critérios (vetores M1–M6 do vitest).
8. O creator vê só as oportunidades em que foi consultado; nunca vê comissão, total da marca, outro creator nem
   os critérios internos da shortlist.
9. Mudar o cachê depois do "tenho interesse" volta a oportunidade para "consultado" e avisa o creator.

### Etapa D · Contratação, tarefas e entregas (migração 0067)

**Entra**
- Tabelas: `deal_acceptances`, `tasks`.
- Aceite do contrato pela marca (MO) e pelos creators; confirmação do contrato (GES+) que gera as 12 tarefas.
- Roteiro (passos 4 e 5): o creator envia com anexo, a marca aprova ou pede ajuste.
- Entregáveis: envio para aprovação (arquivo ou link), aprovação/ajuste pela marca, publicação, comprovação.
- "Sugerir campanha" no escritório do creator (`talent_suggest_campaign`).
- Telas: Tarefas no escritório; Tarefas na agência; aprovações e contrato no portal da marca.

**Fica de fora:** assinatura eletrônica (🔌; o aceite é "registrado no app", e a tela diz que a assinatura
eletrônica vem depois), lançamentos financeiros (F).

**Critérios de aceite**
1. O roteiro enviado pelo creator (passo 4, com anexo) aparece para a marca no passo 5; aprovar conclui o passo 5,
   pedir ajuste reabre o passo 4 com o retorno.
2. Confirmar o contrato gera 12 tarefas (1 creator) com prazos; reconfirmar não duplica (S77).
3. Aprovar ou pedir ajuste de entregável é auditado e avisa o creator (push se ele aceitou o tipo).
4. A página de entregas do negócio e da campanha carrega (embeds com hint, sem PGRST201).

### Etapa E · Agenda e calendário comercial (migração 0068)

**Entra**
- Tabelas: `calendar_events`, `commercial_dates`; `campaign_requests.commercial_date_id`.
- Agenda dos três portais (dia, semana, lista) com eventos privados ou de equipe; eventos ligados ao negócio.
- Calendário comercial (cadastrar, publicar) e "Quero uma campanha nesta data": **só navegação** para
  `/marca/campanhas/nova?data=<id>`, que preenche o estado local; o rascunho só nasce no primeiro salvamento
  automático depois que a pessoa digita (nenhuma gravação ao clicar).
- Exportação `.ics` (download autenticado).

**Fica de fora:** Google/Apple Agenda (🔌, "em breve"), URL de assinatura de calendário.

**Critérios de aceite**
1. Evento privado do creator não aparece para ninguém além dele; evento de equipe aparece para a agência.
2. A marca vê só as datas publicadas pelas agências vinculadas e os eventos dela ou compartilhados com ela.
3. O `.ics` abre no Google Agenda/Calendário do iPhone, com fuso correto, e não traz valores.

### Etapa F · Financeiro, relacionamento e dashboards (migração 0069)

**Entra**
- Tabela `financial_entries` (simulados); geração na confirmação do contrato + preenchimento dos negócios já em
  produção. Lançamento próprio para o ajuste (`adjustment`, D21); repasses a partir do snapshot aceito.
- Telas: Financeiro (ADM), Início executivo com indicadores, Início da marca (com creators propostos nas
  campanhas abertas), Início do escritório completo, Documentos por escopo nos três portais.
- Cron diário `/api/cron/agency`: alerta de creator sem contato há N dias, tarefa vencida, expiração de
  propostas vencidas, limpeza de avisos e de documentos pendentes; cada passo pula com `not_migrated` sem a 0069.
- "Publicar patrocínio" (GES+): negócio ganho vira `creator_brands` `sponsor` do herói ligado, com um clique.
- Histórico (auditoria) da agência para o ADM.

**Critérios de aceite**
1. Toda tela de dinheiro mostra "Registro interno, sem cobrança real".
2. `brand_receivable = commission + adjustment + Σ talent_payout` em todo negócio (S79).
3. O alerta de relacionamento sai uma vez por creator por semana e uma vez por tarefa por dia.
4. Os três inícios funcionam a 390 px sem rolagem lateral e passam no axe.

---

## 2. Modelo de dados e DDL por migração

### 2.0 Padrões que se repetem

**Gatilho de escopo (D9).** Tabelas filhas de negócio recebem `agency_id` e, quando a marca lê, `brand_id`
copiados do negócio; filhas de talento recebem `agency_id` do talento. O valor enviado pela RPC é ignorado.
O gatilho também recusa talento de outra agência.

```sql
-- 0066 (fill_talent_scope nasce na 0065)
create or replace function public.fill_deal_scope()
returns trigger language plpgsql set search_path = '' as $$
declare v_agency uuid; v_brand uuid; v_talent_agency uuid;
begin
  if new.deal_id is null then return new; end if;
  select d.agency_id, d.brand_id into v_agency, v_brand from public.deals d where d.id = new.deal_id;
  if v_agency is null then raise exception 'deal_not_found' using errcode = 'P0002'; end if;
  new.agency_id := v_agency;
  if 'with_brand' = any (tg_argv) then new.brand_id := v_brand; end if;
  -- ifs aninhados de propósito: "a and new.talent_id ..." numa expressão só falha em tabela sem a coluna
  if 'with_talent' = any (tg_argv) then
    if new.talent_id is not null then
      select t.agency_id into v_talent_agency from public.talent_profiles t where t.id = new.talent_id;
      if v_talent_agency is distinct from v_agency then raise exception 'talent_agency_mismatch' using errcode = '22023'; end if;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.fill_deal_scope() from public, anon, authenticated;

-- uso: create trigger trg_<t>_scope before insert or update of deal_id, talent_id on public.<t>
--        for each row execute function public.fill_deal_scope('with_brand', 'with_talent');
```

**Bloco de grants e RLS** (aplicado a cada tabela nova, num `do $$ foreach ... $$` como a 0062):

```sql
execute format('revoke all on table public.%I from public, anon, authenticated', t);
execute format('grant select on table public.%I to authenticated', t);
execute format('grant all on table public.%I to service_role', t);
execute format('alter table public.%I enable row level security', t);
execute format('drop policy if exists %1$s_select_admin on public.%1$I', t);
-- AG real, nunca conta demo (D6): is_platform_admin(), não is_admin()
execute format('create policy %1$s_select_admin on public.%1$I for select to authenticated using ((select public.is_platform_admin()))', t);
execute format('drop trigger if exists trg_%1$s_updated on public.%1$I', t);   -- só se a tabela tem updated_at
execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at()', t);
```

**Listas fechadas usadas em checks** (iguais às constantes TS de `src/lib/agency/vocab.ts`):

| Nome | Valores |
|---|---|
| Redes (`NETWORKS`) | `instagram`, `tiktok`, `youtube`, `x`, `facebook`, `kwai`, `twitch`, `linkedin`, `pinterest`, `threads`, `other` |
| Entregáveis (`DELIVERABLE_KINDS`) | `post`, `reels`, `stories`, `video`, `short`, `live`, `event`, `ugc`, `other` |
| Etapas (`DEAL_STAGES`, nesta ordem) | `briefing_received`, `qualification`, `shortlist`, `consultation`, `proposal_prep`, `proposal_sent`, `negotiation`, `approved`, `contracting`, `production`, `approval`, `delivery`, `closed` |
| Faixas etárias (`AGE_BANDS`) | `13-17`, `18-24`, `25-34`, `35-44`, `45-54`, `55+` |
| Campos do media kit (`KIT_FIELDS`) | `photo`, `headline`, `about`, `location`, `segments`, `networks`, `followers`, `views`, `reach`, `engagement`, `audience`, `brands`, `agency_contact` (o nome é sempre visível) |
| UFs | as 27 da 0058 |

### 2.1 Migração 0064 · Fundação

```sql
-- =============================================================================
-- Groscove Ultra · 0064 · Gestão: fundação (agência, marcas, convites, avisos, documentos)
-- docs/requisitos/gestao-spec-tecnica.md, Etapa A. Cenários S74 e S80.
-- Idempotente; valores novos de enum só em corpo de função; S14 segue 17.
-- =============================================================================

-- 1) papéis e escopos ------------------------------------------------------------
alter type public.app_role add value if not exists 'agency';
alter type public.app_role add value if not exists 'brand';
alter type public.actor_type add value if not exists 'agency';
alter type public.actor_type add value if not exists 'brand';

alter table public.role_assignments drop constraint if exists role_assignments_scope_type_check;
alter table public.role_assignments add constraint role_assignments_scope_type_check
  check (scope_type in ('global', 'seller_org', 'creator', 'professional', 'agency', 'brand', 'talent'));

-- 2) agências --------------------------------------------------------------------
create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  status text not null default 'active',
  timezone text not null default 'America/Sao_Paulo',
  relationship_alert_days smallint not null default 30,
  contact_email text,
  is_demo boolean not null default false,
  created_by uuid constraint agencies_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agencies_slug_uq unique (slug),
  constraint agencies_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  constraint agencies_name_check check (char_length(btrim(name)) between 2 and 80),
  constraint agencies_status_check check (status in ('active', 'suspended')),
  constraint agencies_alert_days_check check (relationship_alert_days between 7 and 365),
  constraint agencies_email_check check (contact_email is null or (contact_email = lower(contact_email)
    and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(contact_email) <= 254))
);

-- 3) equipe da agência -----------------------------------------------------------
create table if not exists public.agency_members (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint agency_members_agency_fk references public.agencies (id) on delete cascade,
  user_id uuid not null constraint agency_members_user_fk references auth.users (id) on delete cascade,
  role text not null,
  display_name text not null,
  job_title text,
  invited_by uuid constraint agency_members_invited_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint agency_members_uq unique (agency_id, user_id),
  constraint agency_members_role_check check (role in ('admin', 'manager', 'staff')),
  constraint agency_members_name_check check (char_length(btrim(display_name)) between 1 and 80),
  constraint agency_members_title_check check (job_title is null or char_length(job_title) <= 80)
);
-- D10: uma agência ativa por pessoa
create unique index if not exists agency_members_one_active_idx on public.agency_members (user_id) where revoked_at is null;
create index if not exists agency_members_agency_idx on public.agency_members (agency_id, role) where revoked_at is null;

-- 4) marcas da agência e equipe da marca ------------------------------------------
create table if not exists public.agency_brands (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint agency_brands_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint agency_brands_brand_fk references public.brands (id) on delete restrict,
  status text not null default 'active',
  account_manager_id uuid constraint agency_brands_manager_fk references auth.users (id) on delete set null,
  is_demo boolean not null default false,
  created_by uuid constraint agency_brands_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agency_brands_uq unique (agency_id, brand_id),
  constraint agency_brands_status_check check (status in ('active', 'archived'))
);
-- (agency_brands_brand_fk é "on delete restrict": apagar marca vinculada passa por admin_brand_delete, que recusa)
-- D18: uma agência ativa por marca (transferência só pelo AG, arquivando o vínculo anterior)
create unique index if not exists agency_brands_one_active_idx on public.agency_brands (brand_id) where status = 'active';

create table if not exists public.brand_members (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null constraint brand_members_brand_fk references public.brands (id) on delete cascade,
  user_id uuid not null constraint brand_members_user_fk references auth.users (id) on delete cascade,
  role text not null default 'staff',
  display_name text not null,
  job_title text,
  invited_by uuid constraint brand_members_invited_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint brand_members_uq unique (brand_id, user_id),
  constraint brand_members_role_check check (role in ('owner', 'staff')),
  constraint brand_members_name_check check (char_length(btrim(display_name)) between 1 and 80),
  constraint brand_members_title_check check (job_title is null or char_length(job_title) <= 80)
);
create index if not exists brand_members_user_idx on public.brand_members (user_id) where revoked_at is null;

-- 5) convites (checks por texto; os valores novos do enum não são usados aqui) -----
alter table public.invitations add column if not exists agency_id uuid constraint invitations_agency_fk references public.agencies (id) on delete cascade;
alter table public.invitations add column if not exists brand_id uuid constraint invitations_brand_fk references public.brands (id) on delete cascade;
alter table public.invitations add column if not exists member_role text;
alter table public.invitations drop constraint if exists invitations_member_role_check;
alter table public.invitations add constraint invitations_member_role_check
  check (member_role is null or member_role in ('admin', 'manager', 'staff', 'owner'));
alter table public.invitations drop constraint if exists invitations_role_check;
alter table public.invitations add constraint invitations_role_check
  check (role::text in ('creator', 'seller', 'professional', 'agency', 'brand'));
alter table public.invitations drop constraint if exists invitations_scope;
alter table public.invitations add constraint invitations_scope check (
  (role::text = 'seller' and seller_org_id is not null and creator_profile_id is null and professional_id is null
     and agency_id is null and brand_id is null and member_role is null) or
  (role::text = 'creator' and creator_profile_id is not null and seller_org_id is null and professional_id is null
     and agency_id is null and brand_id is null and member_role is null) or
  (role::text = 'professional' and professional_id is not null and seller_org_id is null and creator_profile_id is null
     and agency_id is null and brand_id is null and member_role is null) or
  (role::text = 'agency' and agency_id is not null and member_role in ('admin', 'manager', 'staff')
     and brand_id is null and seller_org_id is null and creator_profile_id is null and professional_id is null) or
  (role::text = 'brand' and brand_id is not null and agency_id is not null and member_role in ('owner', 'staff')
     and seller_org_id is null and creator_profile_id is null and professional_id is null));
-- (a 0065 recria este check com o ramo do talento: role 'creator' + talent_id)
create index if not exists invitations_agency_idx on public.invitations (agency_id) where agency_id is not null;
-- revogação em massa por e-mail + escopo (remover membro, convite novo substitui o anterior)
create index if not exists invitations_pending_email_idx on public.invitations (lower(email::text), role) where status = 'pending';

-- D6: conta demo não lê convite de agência/marca/talento (restritiva: soma com as permissivas existentes)
drop policy if exists invitations_hide_from_demo on public.invitations;
create policy invitations_hide_from_demo on public.invitations as restrictive for select to authenticated
  using ((agency_id is null and brand_id is null) or not (select public.is_demo_account()));
-- D6: conta demo (inclusive admin@demo) não lê a auditoria do módulo (commission_rule.save guarda parâmetros)
drop policy if exists admin_audit_hide_agency_from_demo on public.admin_audit;
create policy admin_audit_hide_agency_from_demo on public.admin_audit as restrictive for select to authenticated
  using (not (select public.is_demo_account())
         or coalesce(after_data ->> 'agency_id', before_data ->> 'agency_id') is null);
-- (as duas políticas são criadas depois dos helpers da 3.2, na ordem descrita no item 9)

-- 6) caixa de notificações ------------------------------------------------------
create table if not exists public.inbox_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null constraint inbox_notifications_user_fk references auth.users (id) on delete cascade,
  kind text not null,
  params jsonb not null default '{}'::jsonb,
  link text not null,
  agency_id uuid constraint inbox_notifications_agency_fk references public.agencies (id) on delete cascade,
  entity_type text,
  entity_id uuid,
  dedupe_key text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint inbox_notifications_kind_check check (kind in (
    'member_joined', 'brand_member_joined',
    'talent_consent_given', 'talent_consent_revoked',
    'briefing_received', 'deal_assigned', 'campaign_status_changed', 'proposal_received', 'proposal_decided', 'message_received',
    'opportunity_received', 'opportunity_updated', 'opportunity_answered', 'contract_acceptance_requested', 'contract_confirmed',
    'task_assigned', 'deliverable_submitted', 'deliverable_decided', 'deliverable_published', 'talent_suggestion',
    'calendar_event_added', 'commercial_date_published',
    'relationship_alert', 'task_overdue', 'payout_updated')),
  constraint inbox_notifications_link_check check (link ~ '^/[A-Za-z0-9/_?=&%#.-]*$' and char_length(link) <= 300),
  -- D16: aviso nunca carrega valor
  constraint inbox_notifications_params_check check (jsonb_typeof(params) = 'object' and pg_column_size(params) <= 2048
    and not (params ?| array['amount', 'amount_cents', 'fee_cents', 'total_cents', 'value', 'price', 'commission', 'budget'])),
  constraint inbox_notifications_entity_check check (entity_type is null or entity_type in
    ('agency', 'brand', 'talent', 'request', 'deal', 'deal_talent', 'deliverable', 'task', 'proposal', 'event', 'commercial_date', 'entry'))
);
create unique index if not exists inbox_notifications_dedupe_idx on public.inbox_notifications (dedupe_key) where dedupe_key is not null;
create index if not exists inbox_notifications_user_idx on public.inbox_notifications (user_id, created_at desc);
create index if not exists inbox_notifications_unread_idx on public.inbox_notifications (user_id) where read_at is null;

-- 7) documentos (bucket privado agency-docs) -----------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint documents_agency_fk references public.agencies (id) on delete cascade,
  scope_type text not null,
  -- restrict: "set null" violaria documents_scope_shape (escopos brand/request exigem brand_id)
  brand_id uuid constraint documents_brand_fk references public.brands (id) on delete restrict,
  talent_id uuid,          -- FK documents_talent_fk na 0065
  request_id uuid,         -- FK documents_request_fk na 0066
  deal_id uuid,            -- FK documents_deal_fk na 0066
  -- sem deliverable_id: deliverables aponta para documents (duas FKs); FK de volta tornaria o embed ambíguo (PGRST201)
  kind text not null,
  title text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  restricted boolean not null default false,
  share_brand boolean not null default false,
  share_talent boolean not null default false,
  status text not null default 'pending',
  uploaded_by uuid constraint documents_uploaded_by_fk references auth.users (id) on delete set null,
  uploader_side text not null,
  retention_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint documents_path_uq unique (storage_path),
  constraint documents_scope_check check (scope_type in ('agency', 'brand', 'talent', 'request', 'deal')),
  constraint documents_scope_shape check (
    (scope_type = 'agency' and brand_id is null and talent_id is null and request_id is null and deal_id is null) or
    (scope_type = 'brand' and brand_id is not null and talent_id is null and request_id is null and deal_id is null) or
    (scope_type = 'talent' and talent_id is not null and brand_id is null and request_id is null and deal_id is null) or
    (scope_type = 'request' and request_id is not null and brand_id is not null and deal_id is null) or
    (scope_type = 'deal' and deal_id is not null)),
  constraint documents_kind_check check (kind in ('contract', 'brief_attachment', 'proof', 'submission', 'report', 'media', 'other')),
  constraint documents_title_check check (char_length(btrim(title)) between 1 and 120),
  constraint documents_mime_check check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  constraint documents_size_check check (size_bytes between 1 and 20971520),
  -- caminho por escopo: <agency_id>/<scope_type>/<id do escopo>/<document_id>.<ext>
  constraint documents_path_check check (storage_path ~ ('^' || agency_id::text || '/' || scope_type || '/'
    || coalesce(deal_id, request_id, talent_id, brand_id, agency_id)::text || '/' || id::text || '\.(pdf|jpg|png|webp)$')),
  constraint documents_status_check check (status in ('pending', 'ready', 'archived')),
  constraint documents_side_check check (uploader_side in ('agency', 'brand', 'talent')),
  -- contrato tem preço: só o Adm (e as partes, pelos flags de compartilhamento)
  constraint documents_contract_restricted check (kind <> 'contract' or restricted),
  -- contrato do creator (talent_id, com o cachê) nunca vai à marca; o da marca (sem talent_id, com o total) nunca ao creator
  constraint documents_contract_share check (kind <> 'contract'
    or (talent_id is not null and not share_brand) or (talent_id is null and not share_talent))
);
create index if not exists documents_agency_idx on public.documents (agency_id, scope_type, created_at desc);
create index if not exists documents_brand_idx on public.documents (brand_id) where brand_id is not null;

-- 8) push do escritório (fila da 0054) -------------------------------------------
alter table public.notification_preferences add column if not exists office_updates boolean not null default false;
alter table public.push_outbox drop constraint if exists push_outbox_kind_check;
alter table public.push_outbox add constraint push_outbox_kind_check
  check (kind in ('hero_post', 'achievement', 'program_completed', 'streak_reminder', 'auction_outbid', 'office'));
-- push_allowed: mesma função da 0061 + "when 'office' then p.office_updates"

-- 9) updated_at, grants, RLS (bloco 2.0) para: agencies, agency_members, agency_brands, brand_members,
--    documents; inbox_notifications recebe grants e RLS mas FICA FORA do _select_admin (o AG lê só os
--    próprios avisos) e não tem updated_at.
-- Ordem dentro do arquivo: tabelas → helpers (3.2) → políticas → RPCs → storage → realtime → seed.
-- Na 0066, commission_rule_valid é criada ANTES de commission_rules (o check usa a função).
-- 10) helpers (3.2) · 11) políticas (3.3) · 12) RPCs (4.1) · 13) storage (3.4)

-- 14) Realtime do sino (RLS: cada um recebe só as próprias linhas) ---------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inbox_notifications') then
    alter publication supabase_realtime add table public.inbox_notifications;
  end if;
end $$;

-- 15) seed: a agência real (nome editável em Configurações). Sem marcas, sem membros. -------
insert into public.agencies (id, slug, name)
values (public.seed_uuid('agency:groscove'), 'groscove', 'Agência Groscove')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
```

**Notas da 0064**
- `brands` ganha duas políticas de leitura (seção 3.3): membro da marca e agência vinculada. A pública (`status = 'active'`) não muda.
- `invitations` ganha políticas de leitura para ADM/GES da agência e para o MO (seção 3.3) e a restritiva
  `invitations_hide_from_demo`. A do admin não muda. Nenhuma dessas políticas compara `role` com literal novo do
  enum (0.2 item 2): o "exceto convites de equipe" do GES é escrito por coluna, sem o enum
  (`agency_id = any(my_agency_ids('manager')) and (brand_id is not null or talent_id is not null)`).
- `admin_brand_delete` é **recriada na 0064** (mesma assinatura, `returns void`): além do que faz hoje, recusa
  marca com vínculo em `agency_brands` em qualquer status (`brand_linked_to_agency`), com membros
  (`brand_has_members`) ou com documentos (`brand_has_documents`), antes do `delete`. Como `deals` e
  `campaign_requests` exigem o vínculo (FK composta para `agency_brands`), essa trava cobre também os negócios;
  a 0066 não precisa de `brand_has_deals`. O S72 reaplica a 0062 (versão antiga); o S74 reaplica a 0064 (0.2 item 12).
- `agency_brand_link` recusa marca `brands.is_demo = true` (`demo_brand`): a 0063 apaga essas marcas e o vínculo
  (`restrict`) quebraria a reaplicação dela.

### 2.2 Migração 0065 · Casting e media kit

```sql
-- talent_segments ----------------------------------------------------------------
create table if not exists public.talent_segments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint talent_segments_agency_fk references public.agencies (id) on delete cascade,
  slug text not null,
  name text not null,
  sort_order smallint not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint talent_segments_uq unique (agency_id, slug),
  constraint talent_segments_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40),
  constraint talent_segments_name_check check (char_length(btrim(name)) between 2 and 60)
);

-- talent_profiles (lado privado; 1:1 opcional com creator_profiles) -------------
-- Só a agência lê (internal_notes, commercial_status, manager_id, last_contact_at são internos): o creator NÃO
-- tem política aqui; o escritório lê por talent_my_context() (lista fechada de campos, 4.2).
create table if not exists public.talent_profiles (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint talent_profiles_agency_fk references public.agencies (id) on delete restrict,
  creator_id uuid constraint talent_profiles_creator_fk references public.creator_profiles (id) on delete set null,
  user_id uuid constraint talent_profiles_user_fk references auth.users (id) on delete set null,
  display_name text not null,
  city text,
  state text,
  country text not null default 'BR',
  manager_id uuid constraint talent_profiles_manager_fk references auth.users (id) on delete set null,
  commercial_status text not null default 'prospect',
  availability text not null default 'available',
  availability_note text not null default '',
  contact_email text,
  contact_phone text,
  internal_notes text not null default '',
  last_contact_at timestamptz,
  consent_at timestamptz,
  consent_version text,
  consent_revoked_at timestamptz,
  catalog_visible boolean not null default false,
  is_demo boolean not null default false,
  created_by uuid constraint talent_profiles_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint talent_profiles_creator_uq unique (creator_id),          -- um herói, um talento (MVP)
  constraint talent_profiles_user_uq unique (user_id),                -- login próprio só de talento sem página
  constraint talent_profiles_one_login check (creator_id is null or user_id is null),
  constraint talent_profiles_name_check check (char_length(btrim(display_name)) between 2 and 80),
  constraint talent_profiles_state_check check (state is null or state in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  constraint talent_profiles_country_check check (country ~ '^[A-Z]{2}$'),
  constraint talent_profiles_city_check check (city is null or char_length(city) <= 60),
  constraint talent_profiles_status_check check (commercial_status in ('prospect', 'active', 'paused', 'inactive')),
  constraint talent_profiles_availability_check check (availability in ('available', 'limited', 'unavailable')),
  constraint talent_profiles_av_note_check check (char_length(availability_note) <= 280),
  constraint talent_profiles_email_check check (contact_email is null or (contact_email = lower(contact_email) and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  constraint talent_profiles_phone_check check (contact_phone is null or contact_phone ~ '^\+?[0-9 ()-]{8,20}$'),
  constraint talent_profiles_notes_check check (char_length(internal_notes) <= 2000),
  constraint talent_profiles_catalog_consent check (not catalog_visible or (consent_at is not null and consent_revoked_at is null))
);
create index if not exists talent_profiles_agency_idx on public.talent_profiles (agency_id, commercial_status) where archived_at is null;
create index if not exists talent_profiles_manager_idx on public.talent_profiles (manager_id) where archived_at is null;
create index if not exists talent_profiles_contact_idx on public.talent_profiles (agency_id, last_contact_at) where archived_at is null;

create table if not exists public.talent_segment_links (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint talent_segment_links_agency_fk references public.agencies (id) on delete cascade,
  talent_id uuid not null constraint talent_segment_links_talent_fk references public.talent_profiles (id) on delete cascade,
  segment_id uuid not null constraint talent_segment_links_segment_fk references public.talent_segments (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint talent_segment_links_uq unique (talent_id, segment_id)
);
create index if not exists talent_segment_links_segment_idx on public.talent_segment_links (segment_id);

create table if not exists public.talent_social_accounts (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint talent_social_accounts_agency_fk references public.agencies (id) on delete cascade,
  talent_id uuid not null constraint talent_social_accounts_talent_fk references public.talent_profiles (id) on delete cascade,
  network text not null,
  handle text not null,
  url text,
  followers integer,
  avg_views integer,
  avg_reach integer,
  engagement_bp integer,          -- 2,35% = 235 (pontos-base)
  audience jsonb not null default '{}'::jsonb,
  source text not null default 'declared',
  as_of date not null,
  declared_by uuid constraint talent_social_accounts_declared_by_fk references auth.users (id) on delete set null,
  declared_side text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint talent_social_accounts_uq unique (talent_id, network, handle),
  constraint talent_social_accounts_network_check check (network in ('instagram','tiktok','youtube','x','facebook','kwai','twitch','linkedin','pinterest','threads','other')),
  constraint talent_social_accounts_handle_check check (char_length(handle) between 1 and 60 and handle !~ '\s'),
  constraint talent_social_accounts_url_check check (url is null or public.brand_https_url_ok(url)),
  constraint talent_social_accounts_followers_check check (followers is null or followers between 0 and 1000000000),
  constraint talent_social_accounts_views_check check (avg_views is null or avg_views between 0 and 1000000000),
  constraint talent_social_accounts_reach_check check (avg_reach is null or avg_reach between 0 and 1000000000),
  constraint talent_social_accounts_eng_check check (engagement_bp is null or engagement_bp between 0 and 10000),
  constraint talent_social_accounts_audience_check check (jsonb_typeof(audience) = 'object' and pg_column_size(audience) <= 4096),
  constraint talent_social_accounts_source_check check (source in ('declared', 'integration')),
  constraint talent_social_accounts_side_check check (declared_side in ('talent', 'agency', 'integration'))
);
create index if not exists talent_social_accounts_talent_idx on public.talent_social_accounts (talent_id);

create table if not exists public.media_kits (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint media_kits_agency_fk references public.agencies (id) on delete cascade,
  talent_id uuid not null constraint media_kits_talent_fk references public.talent_profiles (id) on delete cascade,
  headline text not null default '',
  about text not null default '',
  visible_fields text[] not null default '{headline,about,segments,networks,followers}',
  share_token_hash text,
  share_expires_at timestamptz,
  share_revoked_at timestamptz,
  share_created_by uuid constraint media_kits_share_created_by_fk references auth.users (id) on delete set null,
  share_created_at timestamptz,
  view_count integer not null default 0,
  last_viewed_at timestamptz,
  updated_by uuid constraint media_kits_updated_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_kits_talent_uq unique (talent_id),
  constraint media_kits_token_uq unique (share_token_hash),
  constraint media_kits_headline_check check (char_length(headline) <= 140),
  constraint media_kits_about_check check (char_length(about) <= 1500),
  constraint media_kits_fields_check check (visible_fields <@ array['photo','headline','about','location','segments','networks',
    'followers','views','reach','engagement','audience','brands','agency_contact']::text[]),
  constraint media_kits_token_check check (share_token_hash is null or share_token_hash ~ '^[0-9a-f]{64}$'),
  constraint media_kits_share_shape check ((share_token_hash is null) = (share_expires_at is null))
);

-- convites de talento sem página pública (papel creator + talent_id)
alter table public.invitations add column if not exists talent_id uuid constraint invitations_talent_fk references public.talent_profiles (id) on delete cascade;
-- invitations_scope recriado: o ramo 'creator' passa a aceitar
--   (creator_profile_id is not null and talent_id is null) OR (talent_id is not null and creator_profile_id is null and agency_id is not null)
-- e todos os outros ramos ganham "and talent_id is null".

-- documentos de talento
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'documents_talent_fk') then
    alter table public.documents add constraint documents_talent_fk foreign key (talent_id) references public.talent_profiles (id) on delete cascade;
  end if;
end $$;

-- gatilhos de escopo: fill_talent_scope() (análogo a fill_deal_scope) em talent_segment_links,
-- talent_social_accounts e media_kits; e em documents quando talent_id não é nulo (confere a agência).
-- 10 segmentos iniciais em toda agência existente: perform public.agency_seed_defaults(id) from public.agencies;
-- accept_invitation recriada com o ramo do talento (repetindo os ramos da 0064, 0.2 item 13).
```

**Gráficos do media kit:** com `audience` marcado, o editor e o `/kit` mostram `MiniBarChart` de gênero e de
faixa etária (somando as redes pela maior base de seguidores declarada; sem `audience` em nenhuma rede, "não
informado"). Cada gráfico traz a legenda "dados de {as_of} · declarado por {creator ou agência}".

**Os 10 segmentos iniciais** (`agency_seed_defaults`, `on conflict (agency_id, slug) do nothing`; nomes
editáveis pela agência, por isso não vão para o i18n):

| sort | slug | nome |
|---|---|---|
| 10 | `fitness` | Fitness e musculação |
| 20 | `corrida` | Corrida e endurance |
| 30 | `esportes` | Esportes e alto rendimento |
| 40 | `nutricao` | Nutrição e alimentação saudável |
| 50 | `gastronomia` | Gastronomia e culinária |
| 60 | `bem-estar` | Bem-estar e saúde mental |
| 70 | `rotina` | Rotina, sono e produtividade |
| 80 | `lifestyle` | Lifestyle e viagens |
| 90 | `beleza` | Beleza e autocuidado |
| 100 | `familia` | Maternidade, paternidade e família |

**Formato de `audience`** (validado na RPC `talent_social_save` e no zod `audienceSchema`; tudo em pontos-base):
`{"gender": {"female": 6200, "male": 3600, "other": 200}, "age": {"18-24": 3100, "25-34": 4200, ...},
"top_states": ["SP", "RJ"], "top_countries": ["BR", "PT"]}` — cada grupo soma no máximo 10000; até 5 estados e 5 países.

### 2.3 Migração 0066 · Briefing, pipeline, consulta, busca e comissão

```sql
-- briefing da marca (sem valor: o orçamento vai para campaign_request_budgets) ---------
create table if not exists public.campaign_requests (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint campaign_requests_agency_fk references public.agencies (id) on delete restrict,
  brand_id uuid not null constraint campaign_requests_brand_fk references public.brands (id) on delete restrict,
  origin text not null,
  created_by uuid constraint campaign_requests_created_by_fk references auth.users (id) on delete set null,
  title text not null default '',
  objective text,
  product text not null default '',
  target_audience text not null default '',
  target_age_bands text[] not null default '{}',
  target_states text[] not null default '{}',
  region_note text not null default '',
  period_start date,
  period_end date,
  networks text[] not null default '{}',
  deliverables jsonb not null default '[]'::jsonb,   -- desejo da marca: [{kind, quantity, network}]
  segment_ids uuid[] not null default '{}',
  notes text not null default '',
  status text not null default 'draft',
  submitted_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_requests_origin_check check (origin in ('brand', 'agency')),
  constraint campaign_requests_title_check check (char_length(title) <= 120),
  constraint campaign_requests_objective_check check (objective is null or objective in ('awareness', 'engagement', 'conversion', 'launch', 'content', 'event', 'other')),
  constraint campaign_requests_texts_check check (char_length(product) <= 300 and char_length(target_audience) <= 500
    and char_length(region_note) <= 200 and char_length(notes) <= 2000),
  constraint campaign_requests_ages_check check (target_age_bands <@ array['13-17','18-24','25-34','35-44','45-54','55+']::text[]),
  constraint campaign_requests_states_check check (cardinality(target_states) <= 27),
  constraint campaign_requests_period_check check (period_end is null or period_start is null or period_end >= period_start),
  constraint campaign_requests_networks_check check (networks <@ array['instagram','tiktok','youtube','x','facebook','kwai','twitch','linkedin','pinterest','threads','other']::text[]),
  -- cada item só com {kind, quantity, network}, listas fechadas (nenhuma chave de valor chega ao GES/COL)
  constraint campaign_requests_deliverables_check check (public.campaign_deliverables_valid(deliverables)),
  constraint campaign_requests_status_check check (status in ('draft', 'submitted', 'converted', 'declined', 'cancelled')),
  constraint campaign_requests_submitted_check check (status = 'draft' or submitted_at is not null),
  constraint campaign_requests_agency_brand_fk foreign key (agency_id, brand_id) references public.agency_brands (agency_id, brand_id)
);
create index if not exists campaign_requests_brand_idx on public.campaign_requests (brand_id, updated_at desc);
create index if not exists campaign_requests_agency_idx on public.campaign_requests (agency_id, status);

-- negócio (nenhuma coluna de valor; lida também por marca e creator: nada interno aqui) -----
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deals_agency_fk references public.agencies (id) on delete restrict,
  brand_id uuid not null constraint deals_brand_fk references public.brands (id) on delete restrict,
  request_id uuid constraint deals_request_fk references public.campaign_requests (id) on delete set null,
  title text not null,
  stage text not null default 'briefing_received',
  outcome text,
  owner_id uuid constraint deals_owner_fk references auth.users (id) on delete set null,
  created_by uuid constraint deals_created_by_fk references auth.users (id) on delete set null,
  brand_visible boolean not null default true,
  talent_brief text not null default '',
  segment_ids uuid[] not null default '{}',
  expected_start date,
  expected_end date,
  stage_changed_at timestamptz not null default now(),
  contract_confirmed_at timestamptz,
  closed_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deals_request_uq unique (request_id),
  constraint deals_title_check check (char_length(btrim(title)) between 3 and 120),
  constraint deals_stage_check check (stage in ('briefing_received','qualification','shortlist','consultation','proposal_prep',
    'proposal_sent','negotiation','approved','contracting','production','approval','delivery','closed')),
  constraint deals_outcome_check check (outcome is null or outcome in ('won', 'lost', 'cancelled')),
  constraint deals_outcome_closed check ((stage = 'closed') = (outcome is not null)),
  constraint deals_brief_check check (char_length(talent_brief) <= 3000),
  constraint deals_period_check check (expected_end is null or expected_start is null or expected_end >= expected_start),
  constraint deals_agency_brand_fk foreign key (agency_id, brand_id) references public.agency_brands (agency_id, brand_id)
);
create index if not exists deals_agency_stage_idx on public.deals (agency_id, stage, stage_changed_at desc);
create index if not exists deals_owner_idx on public.deals (owner_id) where stage <> 'closed';
create index if not exists deals_brand_idx on public.deals (brand_id, updated_at desc);

create table if not exists public.deal_team (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deal_team_agency_fk references public.agencies (id) on delete cascade,
  deal_id uuid not null constraint deal_team_deal_fk references public.deals (id) on delete cascade,
  user_id uuid not null constraint deal_team_user_fk references auth.users (id) on delete cascade,
  added_by uuid constraint deal_team_added_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint deal_team_uq unique (deal_id, user_id)
);
create index if not exists deal_team_user_idx on public.deal_team (user_id);

create table if not exists public.deal_talents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deal_talents_agency_fk references public.agencies (id) on delete cascade,
  deal_id uuid not null constraint deal_talents_deal_fk references public.deals (id) on delete cascade,
  talent_id uuid not null constraint deal_talents_talent_fk references public.talent_profiles (id) on delete restrict,
  status text not null default 'suggested',
  reasons jsonb not null default '[]'::jsonb,        -- critérios explicados (5.7): [{code, met, detail}]; só a agência lê
  terms_ready boolean not null default false,        -- o ADM já definiu o cachê (sinal sem valor para o GES; 4.3)
  suggested_by uuid constraint deal_talents_suggested_by_fk references auth.users (id) on delete set null,
  consulted_by uuid constraint deal_talents_consulted_by_fk references auth.users (id) on delete set null,
  consulted_at timestamptz,
  respond_by timestamptz,
  responded_at timestamptz,
  response_note text not null default '',
  response_channel text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deal_talents_uq unique (deal_id, talent_id),
  constraint deal_talents_status_check check (status in ('suggested','consulted','interested','talk_requested','declined','proposed','contracted','removed')),
  constraint deal_talents_reasons_check check (jsonb_typeof(reasons) = 'array' and jsonb_array_length(reasons) <= 10),
  constraint deal_talents_note_check check (char_length(response_note) <= 500),
  constraint deal_talents_channel_check check (response_channel is null or response_channel in ('app', 'agency_record')),
  constraint deal_talents_consulted_check check (status in ('suggested', 'removed') or consulted_at is not null)
);
create index if not exists deal_talents_talent_idx on public.deal_talents (talent_id, status);
-- O creator NÃO tem política em deal_talents (reasons, suggested_by etc. são internos): o escritório lê por
-- talent_opportunities() (4.3). Gatilho AFTER UPDATE OF status: declined/removed → deliverables do par
-- (planned/in_production) viram 'cancelled' (definição única da contagem por entregável, 5.4).

-- entregáveis (cronograma e escopo da proposta; fluxo de aprovação na 0067) -----------
create table if not exists public.deliverables (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deliverables_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint deliverables_brand_fk references public.brands (id) on delete restrict,
  deal_id uuid not null constraint deliverables_deal_fk references public.deals (id) on delete cascade,
  deal_talent_id uuid not null constraint deliverables_deal_talent_fk references public.deal_talents (id) on delete cascade,
  talent_id uuid not null constraint deliverables_talent_fk references public.talent_profiles (id) on delete restrict,
  kind text not null,
  network text,
  title text not null default '',
  brief text not null default '',
  due_at timestamptz,
  publish_at timestamptz,
  status text not null default 'planned',
  submission_url text,
  submission_document_id uuid constraint deliverables_submission_doc_fk references public.documents (id) on delete set null,
  submission_note text not null default '',
  submitted_at timestamptz,
  revision smallint not null default 0,
  brand_feedback text not null default '',
  decided_at timestamptz,
  decided_by uuid constraint deliverables_decided_by_fk references auth.users (id) on delete set null,
  decided_side text,
  published_url text,
  published_at timestamptz,
  proof_url text,
  proof_document_id uuid constraint deliverables_proof_doc_fk references public.documents (id) on delete set null,
  proof_at timestamptz,
  created_by uuid constraint deliverables_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deliverables_kind_check check (kind in ('post','reels','stories','video','short','live','event','ugc','other')),
  constraint deliverables_network_check check (network is null or network in ('instagram','tiktok','youtube','x','facebook','kwai','twitch','linkedin','pinterest','threads','other')),
  constraint deliverables_texts_check check (char_length(title) <= 120 and char_length(brief) <= 1000
    and char_length(submission_note) <= 1000 and char_length(brand_feedback) <= 1000),
  constraint deliverables_status_check check (status in ('planned','in_production','submitted','changes_requested','approved','published','proof_submitted','done','cancelled')),
  constraint deliverables_urls_check check ((submission_url is null or public.brand_https_url_ok(submission_url))
    and (published_url is null or public.brand_https_url_ok(published_url)) and (proof_url is null or public.brand_https_url_ok(proof_url))),
  constraint deliverables_side_check check (decided_side is null or decided_side in ('brand', 'agency'))
);
create index if not exists deliverables_deal_idx on public.deliverables (deal_id, status);
create index if not exists deliverables_talent_idx on public.deliverables (talent_id, due_at);
-- gatilho: fill_deal_scope('with_brand','with_talent'); talent_id copiado de deal_talents (confere deal_id igual).
-- O gatilho dispara em INSERT e em UPDATE OF deal_id, talent_id, deal_talent_id; a RPC nunca muda deal_id de um item
-- existente (D19: item com id precisa ser do mesmo negócio).
-- Embed: duas FKs para documents → sempre com hint (0.2 item 3).

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint activities_agency_fk references public.agencies (id) on delete cascade,
  subject_type text not null,
  deal_id uuid constraint activities_deal_fk references public.deals (id) on delete cascade,
  talent_id uuid constraint activities_talent_fk references public.talent_profiles (id) on delete cascade,
  subject_brand_id uuid constraint activities_brand_fk references public.brands (id) on delete cascade,
  kind text not null,
  body text not null default '',
  -- motivo estruturado, sem valor (ex.: pedido de ajuste da marca): o GES/COL lê o que a marca pediu
  reason_codes text[] not null default '{}',
  occurred_at timestamptz not null default now(),
  author_id uuid constraint activities_author_fk references auth.users (id) on delete set null,
  author_label text not null default '',
  created_at timestamptz not null default now(),
  constraint activities_reason_codes_check check (reason_codes <@ array['price','talents','deliverables','timeline','scope','other']::text[]),
  constraint activities_subject_check check (
    (subject_type = 'deal' and deal_id is not null and talent_id is null and subject_brand_id is null) or
    (subject_type = 'talent' and talent_id is not null and deal_id is null and subject_brand_id is null) or
    (subject_type = 'brand' and subject_brand_id is not null and deal_id is null and talent_id is null)),
  constraint activities_kind_check check (kind in ('call', 'meeting', 'message', 'email', 'note', 'stage_change', 'system')),
  constraint activities_body_check check (char_length(body) <= 4000)
);
create index if not exists activities_deal_idx on public.activities (deal_id, occurred_at desc) where deal_id is not null;
create index if not exists activities_talent_idx on public.activities (talent_id, occurred_at desc) where talent_id is not null;
-- gatilho AFTER INSERT: kind in (call, meeting, message, email) e talent_id → talent_profiles.last_contact_at = greatest(atual, occurred_at)

create table if not exists public.deal_messages (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deal_messages_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint deal_messages_brand_fk references public.brands (id) on delete restrict,
  deal_id uuid not null constraint deal_messages_deal_fk references public.deals (id) on delete cascade,
  channel text not null,
  talent_id uuid constraint deal_messages_talent_fk references public.talent_profiles (id) on delete cascade,
  author_id uuid constraint deal_messages_author_fk references auth.users (id) on delete set null,
  author_side text not null,
  author_label text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint deal_messages_channel_check check (channel in ('brand_agency', 'talent_agency')),
  constraint deal_messages_talent_check check ((channel = 'talent_agency') = (talent_id is not null)),
  constraint deal_messages_side_check check (author_side in ('agency', 'brand', 'talent')),
  constraint deal_messages_body_check check (char_length(btrim(body)) between 1 and 4000)
);
create index if not exists deal_messages_deal_idx on public.deal_messages (deal_id, channel, created_at);

-- ============================ tabelas de VALOR (só ADM + AG; exceções na 3.3) ==============
-- Orçamento do pedido: o da marca (origin = 'brand', a marca lê o próprio) ou a estimativa interna do ADM
-- (origin = 'agency', a marca NUNCA lê: a política da marca exige origin = 'brand').
create table if not exists public.campaign_request_budgets (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint campaign_request_budgets_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint campaign_request_budgets_brand_fk references public.brands (id) on delete cascade,
  request_id uuid not null constraint campaign_request_budgets_request_fk references public.campaign_requests (id) on delete cascade,
  budget_min_cents bigint,
  budget_max_cents bigint,
  note text not null default '',
  updated_by uuid constraint campaign_request_budgets_updated_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_request_budgets_request_uq unique (request_id),
  constraint campaign_request_budgets_range_check check (
    (budget_min_cents is null or budget_min_cents between 0 and 10000000000) and
    (budget_max_cents is null or budget_max_cents between 0 and 10000000000) and
    (budget_min_cents is null or budget_max_cents is null or budget_min_cents <= budget_max_cents)),
  constraint campaign_request_budgets_note_check check (char_length(note) <= 300)
);

create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint commission_rules_agency_fk references public.agencies (id) on delete cascade,
  scope text not null,
  brand_id uuid constraint commission_rules_brand_fk references public.brands (id) on delete cascade,
  deal_id uuid constraint commission_rules_deal_fk references public.deals (id) on delete cascade,
  type text not null,
  params jsonb not null,              -- exatamente o objeto do zod (camelCase), sem minCents/maxCents
  min_cents bigint,
  max_cents bigint,
  version integer not null default 1,
  active boolean not null default true,
  justification text not null default '',
  created_by uuid constraint commission_rules_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  constraint commission_rules_scope_check check (
    (scope = 'agency_default' and brand_id is null and deal_id is null) or
    (scope = 'brand' and brand_id is not null and deal_id is null) or
    (scope = 'deal' and deal_id is not null and brand_id is null)),
  constraint commission_rules_type_check check (type in ('percent', 'fixed', 'hybrid', 'tiered', 'per_deliverable', 'markup')),
  constraint commission_rules_params_check check (public.commission_rule_valid(type, params, min_cents, max_cents)),
  constraint commission_rules_active_check check (active = (superseded_at is null))
);
create unique index if not exists commission_rules_default_uq on public.commission_rules (agency_id) where scope = 'agency_default' and active;
create unique index if not exists commission_rules_brand_uq on public.commission_rules (agency_id, brand_id) where scope = 'brand' and active;
create unique index if not exists commission_rules_deal_uq on public.commission_rules (deal_id) where scope = 'deal' and active;

create table if not exists public.deal_talent_fees (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deal_talent_fees_agency_fk references public.agencies (id) on delete cascade,
  deal_id uuid not null constraint deal_talent_fees_deal_fk references public.deals (id) on delete cascade,
  deal_talent_id uuid not null constraint deal_talent_fees_deal_talent_fk references public.deal_talents (id) on delete cascade,
  talent_id uuid not null constraint deal_talent_fees_talent_fk references public.talent_profiles (id) on delete restrict,
  fee_cents bigint not null,
  currency text not null default 'BRL',
  set_by uuid constraint deal_talent_fees_set_by_fk references auth.users (id) on delete set null,
  set_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deal_talent_fees_dt_uq unique (deal_talent_id),
  constraint deal_talent_fees_fee_check check (fee_cents between 0 and 10000000000),
  constraint deal_talent_fees_currency_check check (currency = 'BRL')
);

create table if not exists public.deal_proposals (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deal_proposals_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint deal_proposals_brand_fk references public.brands (id) on delete restrict,
  deal_id uuid not null constraint deal_proposals_deal_fk references public.deals (id) on delete cascade,
  version integer not null,
  status text not null default 'draft',
  total_cents bigint not null,       -- o que a marca paga (= brand_total do snapshot)
  currency text not null default 'BRL',
  valid_until date,
  scope_summary text not null default '',
  sent_at timestamptz,
  sent_by uuid constraint deal_proposals_sent_by_fk references auth.users (id) on delete set null,
  decided_at timestamptz,
  decided_by uuid constraint deal_proposals_decided_by_fk references auth.users (id) on delete set null,
  decided_side text,
  decision_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deal_proposals_version_uq unique (deal_id, version),
  constraint deal_proposals_status_check check (status in ('draft','sent','accepted','changes_requested','withdrawn','superseded','expired')),
  constraint deal_proposals_total_check check (total_cents between 1 and 10000000000),
  constraint deal_proposals_currency_check check (currency = 'BRL'),
  constraint deal_proposals_texts_check check (char_length(scope_summary) <= 2000 and char_length(decision_note) <= 1000),
  constraint deal_proposals_side_check check (decided_side is null or decided_side in ('brand', 'agency'))
);
-- no máximo uma proposta "viva" por negócio
create unique index if not exists deal_proposals_live_uq on public.deal_proposals (deal_id) where status in ('sent', 'accepted');

create table if not exists public.deal_commission_snapshots (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deal_commission_snapshots_agency_fk references public.agencies (id) on delete cascade,
  deal_id uuid not null constraint deal_commission_snapshots_deal_fk references public.deals (id) on delete cascade,
  proposal_id uuid not null constraint deal_commission_snapshots_proposal_fk references public.deal_proposals (id) on delete cascade,
  rule_id uuid constraint deal_commission_snapshots_rule_fk references public.commission_rules (id) on delete set null,
  rule_snapshot jsonb not null,      -- {ruleId, scope, version, type, params, minCents, maxCents}
  inputs jsonb not null,             -- {contractValueCents, talentFees:[{dealTalentId, feeCents}], deliverables:[{kind, quantity}]}
  basis text not null,
  contract_value_cents bigint not null,
  talent_fees_total_cents bigint not null,
  commission_rule_cents bigint not null,
  commission_cents bigint not null,
  adjustment_cents bigint not null default 0,
  adjustment_note text not null default '',   -- justificativa do ADM ao aceitar A > 0 (D21)
  brand_total_cents bigint not null,
  clamp text,
  lines jsonb not null,
  engine_version text not null,
  computed_by uuid constraint deal_commission_snapshots_computed_by_fk references auth.users (id) on delete set null,
  computed_at timestamptz not null default now(),
  constraint deal_commission_snapshots_proposal_uq unique (proposal_id),
  constraint deal_commission_snapshots_basis_check check (basis in ('contract', 'fees')),
  constraint deal_commission_snapshots_clamp_check check (clamp is null or clamp in ('floor', 'ceiling')),
  constraint deal_commission_snapshots_identity check (
    brand_total_cents = commission_cents + talent_fees_total_cents + adjustment_cents
    and contract_value_cents = brand_total_cents and adjustment_cents >= 0 and commission_cents >= 0
    and brand_total_cents between 1 and 10000000000),
  constraint deal_commission_snapshots_adj_note_check check (
    char_length(adjustment_note) <= 500 and (adjustment_cents = 0 or char_length(btrim(adjustment_note)) >= 5))
);

-- documentos de pedido e de negócio
-- alter table public.documents add constraint documents_request_fk (request_id) → campaign_requests on delete cascade;
-- documents_deal_fk (deal_id) → deals on delete cascade (guardados por do $$ if not exists $$).
-- Sem FK documents → deliverables (0.2 item 3). Gatilho fill_deal_scope('with_brand','with_talent') em documents
-- (só quando deal_id não é nulo).
```

**`commission_rule_valid(type, params, min, max)`** (`immutable`, `search_path = ''`, sem execute para anon)
confere no banco o mesmo formato do zod da seção 5: chaves permitidas por tipo, inteiros nos limites,
faixas em ordem estritamente crescente com a última sem teto, `min <= max`, tipos de entregável conhecidos e,
no `per_deliverable`, **pelo menos um preço** (`defaultUnitCents` ou uma chave em `unitByKind`).
O zod é a validação da tela; esta função é a trava para quem chamar a RPC direto.

**`campaign_deliverables_valid(p jsonb)`** (`immutable`, `search_path = ''`, criada antes de `campaign_requests`):
array com até 30 itens; cada item é objeto com exatamente as chaves `kind` (∈ `DELIVERABLE_KINDS`),
`quantity` (inteiro 1..100) e, opcional, `network` (∈ `NETWORKS` ou `null`). Qualquer outra chave (ex.:
`budget_cents`) → check recusa. O zod `requestDeliverablesSchema` usa `.strict()` com as mesmas listas.

### 2.4 Migração 0067 · Contratação, tarefas e entregas

```sql
create table if not exists public.deal_acceptances (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deal_acceptances_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint deal_acceptances_brand_fk references public.brands (id) on delete restrict,
  deal_id uuid not null constraint deal_acceptances_deal_fk references public.deals (id) on delete cascade,
  party text not null,
  deal_talent_id uuid constraint deal_acceptances_deal_talent_fk references public.deal_talents (id) on delete cascade,
  talent_id uuid constraint deal_acceptances_talent_fk references public.talent_profiles (id) on delete restrict,
  proposal_id uuid not null constraint deal_acceptances_proposal_fk references public.deal_proposals (id) on delete cascade,
  document_id uuid constraint deal_acceptances_document_fk references public.documents (id) on delete set null,
  method text not null,
  accepted_by uuid constraint deal_acceptances_accepted_by_fk references auth.users (id) on delete set null,
  accepted_at timestamptz not null default now(),
  note text not null default '',
  constraint deal_acceptances_party_check check (party in ('brand', 'talent')),
  constraint deal_acceptances_shape check ((party = 'talent') = (deal_talent_id is not null and talent_id is not null)),
  constraint deal_acceptances_method_check check (method in ('in_app', 'recorded_by_agency')),
  constraint deal_acceptances_note_check check (char_length(note) <= 500)
);
create unique index if not exists deal_acceptances_uq on public.deal_acceptances (proposal_id, party, deal_talent_id) nulls not distinct;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint tasks_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid constraint tasks_brand_fk references public.brands (id) on delete restrict,
  scope_type text not null,
  deal_id uuid constraint tasks_deal_fk references public.deals (id) on delete cascade,
  talent_id uuid constraint tasks_talent_fk references public.talent_profiles (id) on delete cascade,
  deliverable_id uuid constraint tasks_deliverable_fk references public.deliverables (id) on delete set null,
  template_step smallint,
  title text not null default '',            -- vazio quando template_step: o texto vem do i18n (commercial.taskSteps.<n>)
  description text not null default '',
  side text not null default 'agency',
  assignee_id uuid constraint tasks_assignee_fk references auth.users (id) on delete set null,
  due_at timestamptz,
  status text not null default 'todo',
  completed_at timestamptz,
  completed_by uuid constraint tasks_completed_by_fk references auth.users (id) on delete set null,
  attachment_url text,
  attachment_document_id uuid constraint tasks_attachment_doc_fk references public.documents (id) on delete set null,
  feedback text not null default '',          -- retorno da marca no roteiro (passo 5 → passo 4); sem valor
  created_by uuid constraint tasks_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_scope_check check (
    (scope_type = 'deal' and deal_id is not null) or
    (scope_type = 'talent' and talent_id is not null and deal_id is null) or
    (scope_type = 'agency' and deal_id is null and talent_id is null)),
  constraint tasks_step_check check (template_step is null or (template_step between 1 and 12 and deal_id is not null)),
  constraint tasks_title_check check ((template_step is not null and title = '') or char_length(btrim(title)) between 3 and 160),
  constraint tasks_desc_check check (char_length(description) <= 2000 and char_length(feedback) <= 1000),
  constraint tasks_side_check check (side in ('agency', 'talent', 'brand')),
  constraint tasks_status_check check (status in ('todo', 'doing', 'blocked', 'done', 'cancelled')),
  constraint tasks_done_check check ((status = 'done') = (completed_at is not null)),
  constraint tasks_url_check check (attachment_url is null or public.brand_https_url_ok(attachment_url))
);
-- idempotência da geração: um passo por negócio (passos de negócio) ou por negócio+talento (passos por creator)
create unique index if not exists tasks_template_uq on public.tasks (deal_id, template_step, talent_id) nulls not distinct where template_step is not null;
create index if not exists tasks_assignee_idx on public.tasks (assignee_id, status, due_at);
create index if not exists tasks_due_idx on public.tasks (agency_id, due_at) where status in ('todo', 'doing', 'blocked');
-- gatilho fill_deal_scope('with_brand','with_talent') quando deal_id não é nulo; fill_talent_scope quando só talent_id
```

### 2.5 Migração 0068 · Agenda e calendário comercial

```sql
create table if not exists public.commercial_dates (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint commercial_dates_agency_fk references public.agencies (id) on delete cascade,
  title text not null,
  description text not null default '',
  category text not null,
  starts_on date not null,
  ends_on date not null,
  published boolean not null default false,
  published_at timestamptz,
  created_by uuid constraint commercial_dates_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_dates_title_check check (char_length(btrim(title)) between 2 and 120),
  constraint commercial_dates_desc_check check (char_length(description) <= 1000),
  constraint commercial_dates_category_check check (category in ('holiday', 'retail', 'sports', 'culture', 'seasonal', 'industry', 'other')),
  constraint commercial_dates_range_check check (ends_on >= starts_on and ends_on - starts_on <= 92),
  constraint commercial_dates_published_check check (not published or published_at is not null)
);
create index if not exists commercial_dates_agency_idx on public.commercial_dates (agency_id, starts_on);
create unique index if not exists commercial_dates_seed_uq on public.commercial_dates (agency_id, title, starts_on);  -- idempotência do seed

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint calendar_events_agency_fk references public.agencies (id) on delete cascade,
  owner_type text not null,
  owner_user_id uuid constraint calendar_events_owner_user_fk references auth.users (id) on delete cascade,
  talent_id uuid constraint calendar_events_talent_fk references public.talent_profiles (id) on delete cascade,
  brand_id uuid constraint calendar_events_brand_fk references public.brands (id) on delete cascade,
  deal_id uuid constraint calendar_events_deal_fk references public.deals (id) on delete set null,
  deliverable_id uuid constraint calendar_events_deliverable_fk references public.deliverables (id) on delete set null,
  title text not null,
  description text not null default '',
  location text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  kind text not null default 'meeting',
  visibility text not null default 'team',
  share_with_brand boolean not null default false,
  created_by uuid constraint calendar_events_created_by_fk references auth.users (id) on delete set null,
  created_side text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint calendar_events_owner_check check (
    (owner_type = 'agency' and talent_id is null and owner_user_id is not null) or
    (owner_type = 'talent' and talent_id is not null) or
    (owner_type = 'brand' and brand_id is not null and talent_id is null)),
  constraint calendar_events_title_check check (char_length(btrim(title)) between 1 and 120),
  constraint calendar_events_texts_check check (char_length(description) <= 2000 and char_length(location) <= 200),
  constraint calendar_events_range_check check (ends_at >= starts_at and ends_at - starts_at <= interval '31 days'),
  constraint calendar_events_kind_check check (kind in ('meeting', 'recording', 'publication', 'event', 'travel', 'deadline', 'personal', 'other')),
  constraint calendar_events_visibility_check check (visibility in ('private', 'team')),
  constraint calendar_events_side_check check (created_side in ('agency', 'talent', 'brand')),
  constraint calendar_events_share_check check (not share_with_brand or (deal_id is not null and visibility = 'team'))
);
create index if not exists calendar_events_agency_idx on public.calendar_events (agency_id, starts_at) where cancelled_at is null;
create index if not exists calendar_events_talent_idx on public.calendar_events (talent_id, starts_at) where cancelled_at is null;
create index if not exists calendar_events_brand_idx on public.calendar_events (brand_id, starts_at) where cancelled_at is null;
-- gatilho: com deal_id, agency_id e brand_id vêm do negócio; owner 'talent' confere a agência do talento

alter table public.campaign_requests add column if not exists commercial_date_id uuid
  constraint campaign_requests_commercial_date_fk references public.commercial_dates (id) on delete set null;
-- agency_seed_defaults ganha as datas comerciais (rascunho, published = false) — lista na seção 7.6
```

### 2.6 Migração 0069 · Financeiro, relacionamento e dashboards

```sql
create table if not exists public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint financial_entries_agency_fk references public.agencies (id) on delete cascade,
  deal_id uuid not null constraint financial_entries_deal_fk references public.deals (id) on delete restrict,
  brand_id uuid not null constraint financial_entries_brand_fk references public.brands (id) on delete restrict,
  talent_id uuid constraint financial_entries_talent_fk references public.talent_profiles (id) on delete restrict,
  deal_talent_id uuid constraint financial_entries_deal_talent_fk references public.deal_talents (id) on delete restrict,
  snapshot_id uuid not null constraint financial_entries_snapshot_fk references public.deal_commission_snapshots (id) on delete restrict,
  kind text not null,
  amount_cents bigint not null,
  currency text not null default 'BRL',
  status text not null default 'planned',
  due_on date,
  settled_at timestamptz,
  settled_by uuid constraint financial_entries_settled_by_fk references auth.users (id) on delete set null,
  note text not null default '',
  simulated boolean not null default true,
  created_by uuid constraint financial_entries_created_by_fk references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_entries_kind_check check (kind in ('brand_receivable', 'commission', 'adjustment', 'talent_payout')),
  constraint financial_entries_talent_shape check ((kind = 'talent_payout') = (talent_id is not null and deal_talent_id is not null)),
  constraint financial_entries_amount_check check (amount_cents between 0 and 10000000000),
  constraint financial_entries_currency_check check (currency = 'BRL'),
  constraint financial_entries_status_check check (status in ('planned', 'due', 'settled', 'cancelled')),
  constraint financial_entries_settled_check check ((status = 'settled') = (settled_at is not null)),
  constraint financial_entries_note_check check (char_length(note) <= 500),
  constraint financial_entries_simulated_check check (simulated)     -- nada é cobrança real
);
create unique index if not exists financial_entries_uq on public.financial_entries (snapshot_id, kind, deal_talent_id) nulls not distinct;
create index if not exists financial_entries_agency_idx on public.financial_entries (agency_id, status, due_on);
create index if not exists financial_entries_talent_idx on public.financial_entries (talent_id) where talent_id is not null;
```

O lançamento `commission` é `commission_cents` do snapshot aceito (só a comissão da regra, depois de piso/teto);
o ajuste aceito pelo ADM vira lançamento próprio `adjustment` (`adjustment_cents`, só quando > 0, com a
justificativa do snapshot na `note`). Os `talent_payout` saem de `snapshot.inputs.talentFees` (nunca da tabela
viva `deal_talent_fees`). Invariante por snapshot: `brand_receivable = commission + adjustment + Σ talent_payout`.

---

## 3. Papéis, funções auxiliares e matriz de RLS

### 3.1 Decisão de papéis (D1)

- **Duas camadas, como o fornecedor já faz.** `role_assignments` diz *quais portais* a pessoa abre:
  `('agency', 'agency', <agency_id>)`, `('brand', 'brand', <brand_id>)` e, para talento sem página pública,
  `('creator', 'talent', <talent_id>)`. `agency_members.role` e `brand_members.role` dizem *o que* ela pode
  fazer lá dentro. A RLS lê só as tabelas de membros; o código de layout lê `role_assignments` (via
  `getRoles`/`requireRole`) e depois o contexto do membro.
- **Sincronia:** só as RPCs mexem nas duas camadas, na mesma transação: aceite de convite insere as duas;
  remover membro põe `revoked_at` nas duas; trocar o papel interno não mexe em `role_assignments`.
- **Admin geral (AG):** é `is_platform_admin()` (admin **e** conta não demo, D6). Passa em qualquer portal
  (`requireRole` já deixa) e lê tudo pela política `_select_admin`. Nas RPCs da agência, `agency_can()` trata o AG
  como ADM (suporte), e a auditoria registra `actor_type = 'admin'`. Nas RPCs da **marca** e do **creator**, o AG
  **não** age no lugar deles (a RPC exige ser membro/o próprio).
- **Conta demo com papel admin** (`admin@demo`): `requireRole` a deixa entrar em `/agencia` e `/marca`, mas
  `getAgencyContext()`/`getBrandContext()` usam `is_platform_admin` e mostram "Indisponível para conta de
  demonstração" (sem consulta); a RLS devolve 0 linhas de todo o módulo e as RPCs a recusam. `/admin/agencia` também
  fica indisponível para ela (o botão "Criar agência de demonstração" exige AG real).
- **Conta demo como membro:** só existe na agência demo (o seed grava os vínculos); o aceite de convite de
  agência, marca ou talento de agência **não demo** recusa conta demo (`demo_account_forbidden`).
- **Código TS que muda:** `AppRole` e `RoleAssignment.scope_type` em `src/lib/auth/session.ts`;
  `SettingsPortalRole` + `PORTALS` em `src/lib/settings/sections.ts` (`agency → /agencia`, `brand → /marca`);
  `Portal`, `PORTAL_ROOT`, `PORTAL_LINKS` em `portal-nav.ts`; `/admin/users/[id]` (escopos `agency`, `brand`,
  `talent` com links próprios: `/admin/agencia`, `/admin/marcas/<id>`, `/agencia/casting/<id>`);
  `InviteAcceptCard` e `acceptInvitation` (papéis `agency`, `brand`); `me.profile.roles.agency|brand`.

### 3.2 Funções auxiliares

Todas `stable security definer set search_path = ''`, `revoke execute ... from public, anon`,
`grant execute ... to authenticated, service_role`. **Nenhuma é executável por anon** (S14 fica em 17).
Lêem as tabelas como dono (sem RLS), por isso podem ser usadas nas políticas sem recursão.

```sql
-- 0064 ---------------------------------------------------------------------------
-- conta de demonstração (painel público de login); mesmo critério de health.is_demo_user (0038)
create or replace function public.is_demo_account()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select u.raw_app_meta_data ->> 'ultra_hero_demo' from auth.users u where u.id = auth.uid()), '') = 'true'
$$;

-- AG do módulo: admin da plataforma com conta real (D6)
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() and not public.is_demo_account()
$$;

create or replace function public.agency_role_rank(p_role text)
returns int language sql immutable set search_path = '' as $$
  select case p_role when 'staff' then 1 when 'manager' then 2 when 'admin' then 3 else 0 end
$$;

-- papel do usuário logado na agência (null se não é membro ativo ou a agência está suspensa)
create or replace function public.agency_role_of(p_agency uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.agency_members m
  join public.agencies a on a.id = m.agency_id and a.status = 'active'
  where m.agency_id = p_agency and m.user_id = auth.uid() and m.revoked_at is null
$$;

-- pode pelo menos p_min? (AG real sempre pode: suporte; conta demo com papel admin NÃO)
create or replace function public.agency_can(p_agency uuid, p_min text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (public.is_platform_admin()
    or public.agency_role_rank(public.agency_role_of(p_agency)) >= public.agency_role_rank(p_min))
$$;

-- agência demo? (RPCs de escrita recusam com demo_locked o que a 0.1 D6 trava)
create or replace function public.agency_is_demo(p_agency uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select a.is_demo from public.agencies a where a.id = p_agency), false)
$$;

create or replace function public.is_agency_admin(p_agency uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.agency_can(p_agency, 'admin')
$$;

-- agências em que o usuário tem pelo menos p_min (para políticas: (select public.my_agency_ids('manager')))
create or replace function public.my_agency_ids(p_min text default 'staff')
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.agency_id), '{}'::uuid[])
  from public.agency_members m join public.agencies a on a.id = m.agency_id and a.status = 'active'
  where m.user_id = auth.uid() and m.revoked_at is null
    and public.agency_role_rank(m.role) >= public.agency_role_rank(p_min)
$$;

-- papel do usuário na marca ('owner' | 'staff' | null); a marca precisa estar vinculada a agência ativa
create or replace function public.brand_member_of(p_brand uuid)
returns text language sql stable security definer set search_path = '' as $$
  select bm.role from public.brand_members bm
  where bm.brand_id = p_brand and bm.user_id = auth.uid() and bm.revoked_at is null
    and exists (select 1 from public.agency_brands ab join public.agencies a on a.id = ab.agency_id and a.status = 'active'
                where ab.brand_id = bm.brand_id and ab.status = 'active')
$$;

create or replace function public.my_brand_ids(p_owner_only boolean default false)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct bm.brand_id), '{}'::uuid[]) from public.brand_members bm
  where bm.user_id = auth.uid() and bm.revoked_at is null and (not p_owner_only or bm.role = 'owner')
    and exists (select 1 from public.agency_brands ab join public.agencies a on a.id = ab.agency_id and a.status = 'active'
                where ab.brand_id = bm.brand_id and ab.status = 'active')
$$;

-- marcas vinculadas às agências do usuário (qualquer papel). p_active_only = true para o que é da equipe da
-- marca (brand_members, convites): só o vínculo ativo, que é único por marca (D18). false para ler nome/logo de
-- marca de negócio antigo.
create or replace function public.my_agency_brand_ids(p_active_only boolean default false)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct ab.brand_id), '{}'::uuid[]) from public.agency_brands ab
  where ab.agency_id = any (public.my_agency_ids('staff')) and (not p_active_only or ab.status = 'active')
$$;

-- agências vinculadas às marcas do usuário
create or replace function public.my_brand_agency_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct ab.agency_id), '{}'::uuid[]) from public.agency_brands ab
  where ab.status = 'active' and ab.brand_id = any (public.my_brand_ids(false))
$$;

-- 0065 ---------------------------------------------------------------------------
-- QUEM AGE COMO O TALENTO: login próprio (sem página) ou usuário do herói ligado (não suspenso).
-- Conta demo só age como talento de agência demo (D6: a heroi@ é a página real do Érick Jacquin).
-- Fonte única: my_talent_id, "talento com login", responsável das tarefas do creator e destinatário dos avisos.
-- Interna (sem execute para authenticated): devolve id de usuário de outra pessoa.
create or replace function public.talent_user_id(p_talent uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select u.id from public.talent_profiles t
  join public.agencies a on a.id = t.agency_id
  left join public.creator_profiles c on c.id = t.creator_id and c.status <> 'suspended'
  join auth.users u on u.id = coalesce(t.user_id, c.user_id)
  where t.id = p_talent
    and (a.is_demo or coalesce(u.raw_app_meta_data ->> 'ultra_hero_demo', '') <> 'true')
$$;
revoke execute on function public.talent_user_id(uuid) from public, anon, authenticated;
grant execute on function public.talent_user_id(uuid) to service_role;

-- talento do usuário logado (D10: no máximo um)
create or replace function public.my_talent_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select t.id from public.talent_profiles t
  join public.agencies a on a.id = t.agency_id and a.status = 'active'
  left join public.creator_profiles c on c.id = t.creator_id
  where t.archived_at is null and auth.uid() is not null
    and (t.user_id = auth.uid() or c.user_id = auth.uid())
    and public.talent_user_id(t.id) = auth.uid()
  order by t.created_at limit 1
$$;

-- 0066 ---------------------------------------------------------------------------
-- negócios do colaborador: responsável ou da equipe do negócio
create or replace function public.my_staff_deal_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(d.id), '{}'::uuid[]) from public.deals d
  where d.agency_id = any (public.my_agency_ids('staff'))
    and (d.owner_id = auth.uid() or exists (select 1 from public.deal_team t where t.deal_id = d.id and t.user_id = auth.uid()))
$$;

-- negócios em que o talento do usuário já foi consultado
create or replace function public.my_talent_deal_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(dt.deal_id), '{}'::uuid[]) from public.deal_talents dt
  where dt.talent_id = public.my_talent_id() and dt.consulted_at is not null
$$;

-- marcas desses negócios (o creator lê o nome/logo mesmo de marca "inactive")
create or replace function public.my_talent_brand_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct d.brand_id), '{}'::uuid[]) from public.deals d
  where d.id = any (public.my_talent_deal_ids())
$$;

-- linhas de deal_talents do próprio talento já consultadas (o creator não tem SELECT em deal_talents)
create or replace function public.my_talent_deal_talent_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(dt.id), '{}'::uuid[]) from public.deal_talents dt
  where dt.talent_id = public.my_talent_id() and dt.consulted_at is not null
$$;

-- negócios visíveis para a marca do usuário (brand_visible)
create or replace function public.my_brand_deal_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(d.id), '{}'::uuid[]) from public.deals d
  where d.brand_visible and d.brand_id = any (public.my_brand_ids(false))
$$;

-- creators que a marca pode conhecer: propostos ou contratados em negócio visível a partir de proposal_sent
-- (durante shortlist e consulta a marca não sabe quem está em análise)
create or replace function public.my_brand_deal_talent_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(dt.id), '{}'::uuid[]) from public.deal_talents dt
  join public.deals d on d.id = dt.deal_id
  where d.id = any (public.my_brand_deal_ids()) and dt.status in ('proposed', 'contracted')
    and d.stage in ('proposal_sent','negotiation','approved','contracting','production','approval','delivery','closed')
$$;
```

Funções `pure`/`immutable` que espelham regras TS (mesma tabela, testadas nos dois lados):
`deal_stage_can(p_role text, p_is_owner boolean, p_from text, p_to text)` (seção 4.3),
`task_template_steps()` (seção 4.4), `inbox_kind_pushes(p_kind text)` (seção 7.2),
`commission_rule_valid(...)` (2.3). Todas `set search_path = ''`, sem execute para anon.

**Desempenho:** cada função de array roda uma vez por consulta (initplan). Para o MVP (centenas de negócios)
é suficiente; o risco e o plano B estão na seção 11.

### 3.3 Matriz de RLS (SELECT)

Escrita direta (INSERT/UPDATE/DELETE) é **negada a todos** em todas as tabelas novas (sem grant); toda
escrita passa pelas RPCs da seção 4. 💰 = tabela de valor. "agência" = `agency_id = any(my_agency_ids(...))`.
"✖" = 0 linhas (ou *permission denied* para anon, que não tem grant em nada). **AG** = `is_platform_admin()`:
a conta demo com papel admin cai na coluna CON (0 linhas em tudo do módulo).

| Tabela | AG | ADM | GES | COL | CRE | MO | MS | CON | ANON |
|---|---|---|---|---|---|---|---|---|---|
| `agencies` | todas | a própria | a própria | a própria | a do seu talento | agências vinculadas à marca | idem MO | ✖ | ✖ |
| `agency_members` | todos | da agência | da agência | da agência | ✖ | ✖ | ✖ | ✖ | ✖ |
| `agency_brands` | todos | da agência | da agência | da agência | ✖ | linhas da própria marca | idem | ✖ | ✖ |
| `brands` (novas políticas; a pública segue) | todas | ativas + vinculadas | idem | idem | ativas + marcas dos negócios em que foi consultado | ativas + a própria | idem | ativas | ativas |
| `brand_members` | todos | de marcas com vínculo **ativo** da agência (`my_agency_brand_ids(true)`, D18) | idem | idem | ✖ | da própria marca | da própria marca | ✖ | ✖ |
| `invitations` (novas) | todos | da agência | da agência, exceto convites de equipe | ✖ | ✖ | convites `brand` da própria marca | ✖ | ✖ | ✖ |
| `inbox_notifications` | as próprias | as próprias | as próprias | as próprias | as próprias | as próprias | as próprias | as próprias | ✖ |
| `documents` | todos | da agência | da agência, sem `restricted`; de negócio: todos | sem `restricted`; de negócio: só dos negócios dele | `share_talent` e do próprio talento, `ready` | `share_brand`, `ready`, da própria marca e (se de negócio) de negócio `brand_visible` | idem MO | ✖ | ✖ |
| (quem enviou) `documents_select_uploader` | — | — | só a própria reserva `pending` e não `restricted` | idem | idem | idem | idem | ✖ | ✖ |
| `talent_segments` | todos | da agência | da agência | da agência | da agência do talento (ativos) | ✖ (via RPC) | ✖ | ✖ | ✖ |
| `talent_profiles` | todos | da agência | da agência | da agência (consulta) | ✖ (via `talent_my_context()`: campos não internos) | ✖ (via RPC) | ✖ | ✖ | ✖ |
| `talent_segment_links` | todos | da agência | da agência | da agência | os próprios | ✖ | ✖ | ✖ | ✖ |
| `talent_social_accounts` | todos | da agência | da agência | da agência | as próprias | ✖ (via RPC) | ✖ | ✖ | ✖ |
| `media_kits` | todos | da agência | da agência | da agência | o próprio | ✖ | ✖ | ✖ | ✖ (via servidor) |
| `campaign_requests` | todos | da agência, menos rascunho de origem marca | idem | só as dos negócios dele | ✖ | da própria marca: as de origem marca (inclusive rascunho) e as de origem agência cujo negócio está `brand_visible` | idem | ✖ | ✖ |
| 💰 `campaign_request_budgets` | todos | da agência, menos rascunho | ✖ | ✖ | ✖ | da própria marca, **só de pedido `origin = 'brand'`** | idem | ✖ | ✖ |
| `deals` | todos | da agência | da agência | só os dele (responsável ou equipe) | onde foi consultado | da marca com `brand_visible` | idem | ✖ | ✖ |
| `deal_team` | todos | da agência | da agência | dos negócios dele | ✖ | ✖ | ✖ | ✖ | ✖ |
| `deal_talents` | todos | da agência | da agência | dos negócios dele | ✖ (via `talent_opportunities()`: sem `reasons`, sem quem sugeriu) | ✖ (via RPC) | ✖ | ✖ | ✖ |
| `deliverables` | todos | da agência | da agência | dos negócios dele | os próprios, só depois de consultado (`deal_talent_id = any(my_talent_deal_talent_ids())`) | só de creators `proposed`/`contracted`, negócio `brand_visible` a partir de `proposal_sent` (`my_brand_deal_talent_ids()`) | idem | ✖ | ✖ |
| `activities` | todas | da agência | da agência | de talento/marca: todas; de negócio: dos dele | ✖ | ✖ | ✖ | ✖ | ✖ |
| `deal_messages` | todas | da agência | da agência | dos negócios dele | `talent_agency` da própria conversa | `brand_agency` da marca | idem | ✖ | ✖ |
| 💰 `commission_rules` | todas | da agência | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| 💰 `deal_talent_fees` | todos | da agência | ✖ | ✖ | **o próprio cachê**, depois de consultado | ✖ | ✖ | ✖ | ✖ |
| 💰 `deal_proposals` | todas | da agência | ✖ | ✖ | ✖ | **da marca, exceto `draft`** | idem MO | ✖ | ✖ |
| 💰 `deal_commission_snapshots` | todos | da agência | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| `deal_acceptances` | todos | da agência | da agência | dos negócios dele | os próprios | os da marca | idem | ✖ | ✖ |
| `tasks` | todas | da agência | da agência | atribuídas a ele, criadas por ele ou dos negócios dele | lado `talent` do próprio talento | lado `brand` de negócios `brand_visible` da marca | idem | ✖ | ✖ |
| `calendar_events` | todos | da agência: `team` + os próprios `private` | idem | idem | do próprio talento (todas as visibilidades) | da marca (`owner_type = 'brand'`) + `share_with_brand` | idem | ✖ | ✖ |
| `commercial_dates` | todas | da agência | da agência | da agência | ✖ | publicadas das agências vinculadas | idem | ✖ | ✖ |
| 💰 `financial_entries` | todos | da agência | ✖ | ✖ | **repasses próprios** (`talent_payout`) | ✖ | ✖ | ✖ | ✖ |
| `storage.objects` (`agency-docs`) | segue `documents` | idem | idem | idem | idem | idem | idem | ✖ | ✖ |

**Políticas escritas** (exemplos que fixam a forma; as demais seguem a tabela acima com o mesmo padrão):

```sql
-- deals (0066)
create policy deals_select_agency on public.deals for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]));
create policy deals_select_staff on public.deals for select to authenticated
  using (id = any ((select public.my_staff_deal_ids())::uuid[]));
create policy deals_select_brand on public.deals for select to authenticated
  using (brand_visible and brand_id = any ((select public.my_brand_ids(false))::uuid[]));
create policy deals_select_talent on public.deals for select to authenticated
  using (id = any ((select public.my_talent_deal_ids())::uuid[]));
-- + deals_select_admin do bloco 2.0

-- tabela de valor com exceção do creator (0066). O creator não tem SELECT em deal_talents: a condição
-- "já consultado" vem do helper security definer, não de um exists sob a RLS de quem lê.
create policy deal_talent_fees_select_agency on public.deal_talent_fees for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('admin'))::uuid[]));
create policy deal_talent_fees_select_talent on public.deal_talent_fees for select to authenticated
  using (deal_talent_id = any ((select public.my_talent_deal_talent_ids())::uuid[]));

-- orçamento: a marca lê só o que ela mesma informou (origem marca); a estimativa interna do ADM fica de fora (0066)
create policy campaign_request_budgets_select_agency on public.campaign_request_budgets for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('admin'))::uuid[])
         and exists (select 1 from public.campaign_requests r where r.id = campaign_request_budgets.request_id));
create policy campaign_request_budgets_select_brand on public.campaign_request_budgets for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[])
         and exists (select 1 from public.campaign_requests r
                     where r.id = campaign_request_budgets.request_id and r.origin = 'brand'));

-- entregáveis para a marca: só de creators já propostos (0066)
create policy deliverables_select_brand on public.deliverables for select to authenticated
  using (deal_talent_id = any ((select public.my_brand_deal_talent_ids())::uuid[]));

-- tabela de valor com exceção da marca (0066)
create policy deal_proposals_select_agency on public.deal_proposals for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('admin'))::uuid[]));
create policy deal_proposals_select_brand on public.deal_proposals for select to authenticated
  using (status <> 'draft' and brand_id = any ((select public.my_brand_ids(false))::uuid[]));

-- documents (forma final, 0066; a 0064 cria as duas primeiras sem os ramos de 'request'/'deal',
-- porque deals, campaign_requests e my_staff_deal_ids ainda não existem, e a 0066 faz drop + create)
create policy documents_select_agency_admin on public.documents for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('admin'))::uuid[])
         -- anexo de briefing em rascunho da marca: a agência não vê (a RLS de campaign_requests decide)
         and (scope_type <> 'request' or exists (select 1 from public.campaign_requests r where r.id = documents.request_id)));
create policy documents_select_agency on public.documents for select to authenticated
  using (not restricted and status <> 'archived' and agency_id = any ((select public.my_agency_ids('staff'))::uuid[])
         and (
           (scope_type in ('agency', 'brand', 'talent'))
           or (scope_type = 'deal' and (agency_id = any ((select public.my_agency_ids('manager'))::uuid[])
                                        or deal_id = any ((select public.my_staff_deal_ids())::uuid[])))
           -- GES+ vê pedidos não-rascunho; COL só os pedidos dos negócios dele (as duas coisas pela RLS de campaign_requests)
           or (scope_type = 'request' and exists (select 1 from public.campaign_requests r where r.id = documents.request_id))));
create policy documents_select_brand on public.documents for select to authenticated
  using (share_brand and status = 'ready' and brand_id = any ((select public.my_brand_ids(false))::uuid[])
         and (deal_id is null or deal_id = any ((select public.my_brand_deal_ids())::uuid[])));
create policy documents_select_talent on public.documents for select to authenticated
  using (share_talent and status = 'ready' and talent_id = (select public.my_talent_id()));
-- quem enviou só enxerga a própria reserva enquanto envia (necessário para a política de insert do Storage);
-- depois de "ready" vale a política do seu papel. Contrato (restricted) nunca: só o ADM o reserva (4.1).
create policy documents_select_uploader on public.documents for select to authenticated
  using (uploaded_by = (select auth.uid()) and status = 'pending' and not restricted);

-- inbox (0064)
create policy inbox_notifications_select_own on public.inbox_notifications for select to authenticated
  using (user_id = (select auth.uid()));
-- (sem _select_admin: o AG vê só os próprios avisos)

-- brands: duas políticas novas (0064); a pública da 0062 não muda
create policy brands_select_member on public.brands for select to authenticated
  using (id = any ((select public.my_brand_ids(false))::uuid[]));
create policy brands_select_agency on public.brands for select to authenticated
  using (id = any ((select public.my_agency_brand_ids())::uuid[]));
create policy brands_select_talent on public.brands for select to authenticated     -- 0066
  using (id = any ((select public.my_talent_brand_ids())::uuid[]));
```

**Exceções controladas (14.1), com o mecanismo:**
1. *Creator vê só o próprio cachê:* `deal_talent_fees_select_talent` + `financial_entries_select_talent`
   (`kind = 'talent_payout' and talent_id = my_talent_id()`). No app das lojas, a tela esconde os dois (D14).
2. *Marca vê só o total da proposta:* `deal_proposals_select_brand` (só `total_cents`, sem snapshot). Snapshot,
   cachês e lançamentos não têm política para a marca. Do orçamento, só o que ela mesma informou (origem marca).
   Contrato do creator nunca é compartilhado com ela (`documents_contract_share`).
3. *Colaborador só nos negócios dele:* nenhuma política de filha de negócio usa `my_agency_ids('staff')` sozinha;
   o ramo do COL é sempre `deal_id = any(my_staff_deal_ids())`.
4. *Valores em texto livre:* conversa, atividade e nota interna são texto livre e podem receber um número
   digitado. As telas avisam ("Não envie valores por aqui; use a proposta"). A negociação de preço com a marca
   acontece em `deal_proposals.decision_note`, que é tabela de valor; o **motivo** do pedido de ajuste (códigos
   `price`, `talents`, `deliverables`, `timeline`, `scope`, `other`) vai para `activities.reason_codes`, que o
   GES/COL do negócio lê.
5. *Creator sem colunas internas:* o creator não tem SELECT em `talent_profiles` nem em `deal_talents`; lê por
   `talent_my_context()` e `talent_opportunities()`, que devolvem lista fechada de campos (4.2, 4.3).
6. *Conta demo:* nenhuma política do módulo dá linha da agência real a conta demo (D6); as restritivas de
   `invitations` e `admin_audit` fecham o que o papel admin dela abriria nas tabelas antigas.

### 3.4 Storage (bucket `agency-docs`)

Criado na 0064 só se o schema `storage` existir (mesmo padrão da 0028), privado, 20 MB, MIME
`application/pdf`, `image/jpeg`, `image/png`, `image/webp`. Caminho por escopo
`<agency_id>/<scope_type>/<id do escopo>/<document_id>.<ext>` (ex.: `<agência>/deal/<negócio>/<doc>.pdf`),
montado só pela RPC `document_reserve` e conferido pelo check `documents_path_check`; o cliente nunca escolhe o caminho.

```sql
-- leitura (URL assinada): a RLS de documents decide
create policy agency_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'agency-docs'
         and exists (select 1 from public.documents d where d.storage_path = storage.objects.name and d.status <> 'archived'));
-- envio: só para uma reserva "pending" do próprio usuário, feita há menos de 1 hora
create policy agency_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'agency-docs'
              and exists (select 1 from public.documents d where d.storage_path = storage.objects.name
                          and d.status = 'pending' and d.uploaded_by = (select auth.uid())
                          and d.created_at > now() - interval '1 hour'));
-- sem update e sem delete para authenticated: arquivo é imutável; limpeza só pelo cron (service role, API do Storage)
```

URL assinada: `supabase.storage.from('agency-docs').createSignedUrl(path, 60)` com o **cliente do usuário**
(a política acima decide). Nunca com o service role, salvo em `/kit` (que não serve documentos).

---

## 4. RPCs

Regras comuns: `security definer set search_path = ''`; primeira linha confere `auth.uid()` (exceto as de
service role); `revoke execute ... from public, anon`; grant para `authenticated, service_role` (as de
usuário) ou só `service_role` (as internas). Toda RPC de escrita grava `audit_log` com o `p_actor_type`
indicado. `p_data jsonb` é validado campo a campo (o zod da tela é só conveniência). Nenhuma devolve valor
para quem não é ADM/AG, salvo as exceções 3.3.

**Escopo derivado da linha (D19, vale para todas as tabelas abaixo):**
1. Com `p_id` (ou item com `id`): `select agency_id, brand_id, talent_id into v_... from <tabela> where id = p_id for update`;
   sem linha → `not_found`. O papel é conferido **nesse** escopo (`agency_can(v_agency, ...)`, `brand_member_of(v_brand)`,
   `v_talent = my_talent_id()`), nunca no parâmetro.
2. Se o chamador também mandou `p_agency`/`p_brand`/`p_talent`, ele precisa ser igual ao da linha (`not_found`, sem
   dizer que a linha existe em outro escopo).
3. Todo `update`/`delete` leva `and agency_id = v_agency` (ou `brand_id = v_brand`, `talent_id = v_talent`).
4. Alvo referenciado (`p_target`, `deal_talent_id`, `segment_id`, `document_id`, `manager_id`, `owner_id`, `deal_id`
   de evento) precisa pertencer ao mesmo escopo (`not_found`).
5. Cada RPC tem um cenário negativo no S74–S79 com o id de outra marca/agência/talento.

**Agência demo (D6):** RPCs de equipe, de vínculo de marca/herói existentes, de consentimento registrado e de link
público recusam `demo_locked` quando `agency_is_demo(v_agency)`. **Conta demo:** RPCs do AG exigem
`is_platform_admin()`; aceite de convite de escopo não demo recusa `demo_account_forbidden`.

Legenda "Quem": AG (`is_platform_admin()`) sempre passa onde está escrito ADM, GES+ ou COL+ (suporte).

### 4.1 Etapa A (0064)

| RPC | Quem | Valida | Audita (`action`) | Avisa |
|---|---|---|---|---|
| `agency_invite_member(p_agency uuid, p_email text, p_role text, p_days int default 7) returns table(invitation_id uuid, token text)` | ADM | `p_role in (admin, manager, staff)`; e-mail válido; ninguém com esse e-mail já ativo na agência; 1..30 dias; revoga (`status = 'revoked'`) os convites `pending` anteriores do mesmo e-mail para a mesma agência; agência demo → `demo_locked` | `agency.member_invite` (e-mail, papel) | — |
| `agency_member_set_role(p_agency uuid, p_user uuid, p_role text, p_justification text)` | ADM | membro ativo; não rebaixa o último ADM (`last_agency_admin`); justificativa ≥ 5; agência demo → `demo_locked` | `agency.member_role` (antes/depois) | — |
| `agency_member_remove(p_agency uuid, p_user uuid, p_justification text)` | ADM | não remove o último ADM; põe `revoked_at` no membro e no `role_assignments(agency)`; **revoga todo convite `pending` de agência com o e-mail dele para essa agência**; agência demo → `demo_locked`; a partir da 0066 (função recriada) também tira de `deal_team` e deixa os negócios dele sem responsável (`owner_id = null`) | `agency.member_remove` | — |
| `agency_member_update_self(p_display_name text, p_job_title text)` | membro | 1..80 / ≤ 80 | — | — |
| `agency_settings_save(p_agency uuid, p_data jsonb)` | GES+ | `name`, `timezone` (existe em `pg_timezone_names`), `relationship_alert_days` 7..365, `contact_email` | `agency.settings` | — |
| `agency_brand_create(p_agency uuid, p_data jsonb) returns uuid` | GES+ | `name`, `slug` único, `site_url` (`brand_https_url_ok`), `logo_url` opcional; cria `brands` com `status = 'inactive'` (D7) + `agency_brands`. Agência demo: slug forçado `exemplo-<slug>`, `agency_brands.is_demo = true`, no máximo 10 marcas (`demo_limit`) | `agency.brand_create` | — |
| `agency_brand_link(p_agency uuid, p_brand uuid, p_on boolean, p_account_manager uuid default null)` | GES+ (ligar marca com vínculo ativo em **outra** agência: só AG, que arquiva o vínculo anterior na mesma transação) | marca existente e visível para quem chama; não `brands.is_demo` (`demo_brand`); sem vínculo ativo em outra agência (`brand_linked_elsewhere`, D18); agência demo → `demo_locked`; desligar = `archived` (não apaga) | `agency.brand_link` | — |
| `agency_invite_brand_member(p_agency uuid, p_brand uuid, p_email text, p_role text, p_days int default 7) returns table(...)` | GES+ | marca com vínculo **ativo** nesta agência (o único, D18); `p_role in (owner, staff)`; revoga os `pending` anteriores do mesmo e-mail para a marca; agência demo → `demo_locked` | `brand.member_invite` | — |
| `brand_invite_member(p_brand uuid, p_email text, p_days int default 7) returns table(...)` | MO | só `staff`; `invitations.agency_id` = a agência do vínculo ativo (única, D18); revoga os `pending` anteriores do mesmo e-mail para a marca; marca de agência demo → `demo_locked` | `brand.member_invite` (`actor_type = 'brand'`) | — |
| `brand_member_remove(p_brand uuid, p_user uuid)` | MO (não o último dono) ou GES+ da agência do vínculo **ativo** | revoga membro e `role_assignments(brand)` e todo convite `pending` de marca com o e-mail dele para essa marca; marca de agência demo → `demo_locked` | `brand.member_remove` | — |
| `agency_invitation_revoke(p_id uuid, p_justification text)` | ADM (qualquer da agência), GES+ (de marca e talento), MO (staff da marca) | `status = 'pending'`; escopo derivado do convite (D19) | `invitation.revoke` | — |
| `accept_invitation(p_token text)` (recriada) | o convidado | ramos novos abaixo; conta demo em escopo não demo → `demo_account_forbidden`; **nunca rebaixa** papel de membro ativo | `invitation.accept` (já existe) | `member_joined` (ADMs) ou `brand_member_joined` (MO + GES da agência) |
| `inbox_notify(...)`, `inbox_notify_agency(...)`, `inbox_notify_brand(...)` | **interna** (service role e outras RPCs) | ver 7.2 | — | — |
| `inbox_mark_read(p_ids uuid[] default null) returns int` | dono | `null` = todas; só as próprias | — | — |
| `document_reserve(p_agency uuid, p_scope_type text, p_scope_id uuid, p_meta jsonb) returns jsonb` (`{id, path}`) | por escopo (abaixo) | MIME e tamanho; título; flags | — (`document.confirm` audita) | — |
| `document_confirm(p_id uuid)` | quem reservou | objeto existe em `storage.objects`; `pending → ready` | `document.upload` | — |
| `document_archive(p_id uuid, p_reason text)` | quem enviou (não contrato); GES+ (não contrato); **contrato/restrito: só ADM** | `ready → archived` | `document.archive` | — |
| `document_set_sharing(p_id uuid, p_share_brand boolean, p_share_talent boolean)` | GES+ (não contrato); **contrato: só ADM** | respeita `documents_contract_share` e os escopos (`talent` nunca `share_brand`) | `document.sharing` | — |
| `admin_agency_save(p_id uuid, p_data jsonb) returns uuid` | AG (`is_platform_admin`) | `slug`, `name`, `status`, `is_demo`; ao criar chama `agency_seed_defaults` | `agency.create` / `agency.update` | — |
| `admin_brand_delete(p_id uuid)` (recriada, mesma assinatura) | `is_admin()` (como hoje) | além da 0062: recusa `brand_linked_to_agency`, `brand_has_members`, `brand_has_documents` | `brand.delete` (já existe) | — |
| `agency_seed_defaults(p_agency uuid)` | interna | segmentos (0065), datas comerciais (0068); idempotente | — | — |
| `agency_demo_seed(p_agency uuid, p_emails jsonb, p_actor uuid) returns jsonb` | **service role** | só agência `is_demo`; resolve cada e-mail em `auth.users` e recusa conta sem `ultra_hero_demo` (`not_demo_account`); ampliada a cada etapa | `demo.agency_seed` (`actor_id = p_actor`) | — |

**Quem reserva documento, por escopo** (`document_reserve`): `agency` → GES+; `brand` → GES+ da agência
vinculada ou membro da marca (então `share_brand = true`, `restricted = false` forçados); `talent` (0065) →
GES+ ou o próprio CRE (`share_talent = true` e `share_brand = false` forçados); `request` (0066) → membro da marca ou GES+;
`deal` (0066) → GES+, COL dono, CRE do negócio (só `kind in ('submission','proof')`, `share_talent` forçado),
membro da marca (só `brief_attachment`). **`kind = 'contract'` → só ADM/AG** (`restricted` sempre true; com
`talent_id` é o contrato do creator e só pode ter `share_talent`; sem `talent_id` é o da marca e só pode ter
`share_brand`). GES e COL veem do contrato só o status e os aceites (`deal_acceptances`), nunca o PDF.

**Ramos novos de `accept_invitation`** (a função inteira é recriada a partir da 0058, mantendo os ramos antigos,
`returns jsonb` e a mesma assinatura). Antes dos ramos novos, uma checagem comum:

```sql
-- D6: conta demo não entra em agência real (nem na marca/talento dela)
if v_inv.agency_id is not null and not public.agency_is_demo(v_inv.agency_id) and public.is_demo_account() then
  perform set_config('app.trusted', 'off', true); raise exception 'demo_account_forbidden';
end if;
```

```sql
elsif v_inv.role::text = 'agency' then
  if exists (select 1 from public.agencies a where a.id = v_inv.agency_id and a.status <> 'active') then
    perform set_config('app.trusted', 'off', true); raise exception 'partner_suspended';
  end if;
  if exists (select 1 from public.agency_members m where m.user_id = v_uid and m.revoked_at is null and m.agency_id <> v_inv.agency_id) then
    perform set_config('app.trusted', 'off', true); raise exception 'agency_member_elsewhere';   -- D10
  end if;
  insert into public.agency_members (agency_id, user_id, role, display_name, invited_by)
  values (v_inv.agency_id, v_uid, v_inv.member_role,
          left(coalesce(nullif(btrim((select p.display_name from public.profiles p where p.id = v_uid)), ''), split_part(v_email, '@', 1)), 80),
          v_inv.created_by)
  -- membro ativo: o convite não mexe no papel (troca de papel só por agency_member_set_role, que guarda o último ADM);
  -- membro removido: volta com o papel do convite (os convites antigos dele foram revogados na remoção)
  on conflict (agency_id, user_id) do update
    set role = case when public.agency_members.revoked_at is null then public.agency_members.role else excluded.role end,
        revoked_at = null, updated_at = now();
  insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
  values (v_uid, 'agency', 'agency', v_inv.agency_id, v_inv.created_by)
  on conflict (user_id, role, scope_id) do update set revoked_at = null;
  perform public.inbox_notify_agency(v_inv.agency_id, 'admin', 'member_joined', '/agencia/equipe', '{}'::jsonb, 'agency', v_inv.agency_id, null);
elsif v_inv.role::text = 'brand' then
  if not exists (select 1 from public.agency_brands ab where ab.agency_id = v_inv.agency_id and ab.brand_id = v_inv.brand_id and ab.status = 'active') then
    perform set_config('app.trusted', 'off', true); raise exception 'brand_not_linked';
  end if;
  insert into public.brand_members (brand_id, user_id, role, display_name, invited_by) values (...)
  -- mesma regra: nunca rebaixa membro ativo (o último dono continua dono)
  on conflict (brand_id, user_id) do update
    set role = case when public.brand_members.revoked_at is null then public.brand_members.role else excluded.role end,
        revoked_at = null, updated_at = now();
  insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
  values (v_uid, 'brand', 'brand', v_inv.brand_id, v_inv.created_by)
  on conflict (user_id, role, scope_id) do update set revoked_at = null;
  -- avisa: membros donos da marca e GES+ da agência
elsif v_inv.role::text = 'creator' and v_inv.talent_id is not null then           -- 0065
  -- talento sem página pública: precisa não ter outro talento (D10) e o talento não ter herói ligado
  update public.talent_profiles set user_id = v_uid where id = v_inv.talent_id and creator_id is null and (user_id is null or user_id = v_uid);
  if not found then perform set_config('app.trusted', 'off', true); raise exception 'talent_already_linked'; end if;
  insert into public.role_assignments (user_id, role, scope_type, scope_id, granted_by)
  values (v_uid, 'creator', 'talent', v_inv.talent_id, v_inv.created_by)
  on conflict (user_id, role, scope_id) do update set revoked_at = null;
```

O retorno passa a ser `jsonb_build_object('role', v_inv.role, 'scope_type', <'seller_org'|'creator'|'professional'|'agency'|'brand'|'talent'>, 'scope_id', <id do escopo>)`
(`scope_type` e `scope_id` calculados por ramo, sem `coalesce` ambíguo). O convite de talento devolve
`role = 'creator'` e `scope_type = 'talent'`: `acceptInvitation` e o `InviteAcceptCard` usam `scope_type` para
mostrar `successTalent`/`goOffice` (link `/creator/escritorio`) em vez do texto e do link do herói.

### 4.2 Etapa B (0065)

| RPC | Quem | Valida | Audita | Avisa |
|---|---|---|---|---|
| `agency_talent_save(p_id uuid, p_agency uuid, p_data jsonb) returns uuid` | GES+ | com `p_id`: escopo da linha (D19), `p_agency` igual ao dela; campos de `talent_profiles` (não mexe em consentimento, `catalog_visible`, `user_id`, `creator_id`); `manager_id` precisa ser membro ativo GES+ da mesma agência | `talent.create` / `talent.update` | — |
| `agency_talent_set_segments(p_talent uuid, p_segment_ids uuid[])` | GES+ | segmentos ativos da mesma agência; até 5 | `talent.segments` | — |
| `agency_talent_link_creator(p_talent uuid, p_creator uuid)` | GES+ | herói `active`; não está em outro talento (`creator_already_in_casting`); o usuário do herói não tem talento próprio (`user_has_talent`, pela `talent_user_id`); talento sem `user_id`; **agência demo → `demo_locked`** (nenhum herói real em negócio inventado). Herói cuja conta é demo (a `heroi@` é a página real do Érick Jacquin) **pode** entrar na agência real, mas fica "sem login" (`talent_user_id` nulo): a ficha avisa "a página deste herói está numa conta de demonstração; o escritório fica desligado até o admin trocar a conta" | `talent.link_creator` | — |
| `agency_talent_archive(p_talent uuid, p_justification text)` | ADM | sem negócio aberto (`talent_has_open_deals`); revoga link do kit; `catalog_visible = false` | `talent.archive` | — |
| `agency_invite_talent(p_talent uuid, p_email text, p_days int default 7) returns table(...)` | GES+ | talento sem herói e sem login (`talent_user_id` nulo e `user_id` nulo); revoga `pending` anteriores do talento; agência demo → `demo_locked` | `invitation.create` | — |
| `talent_set_consent(p_on boolean, p_version text)` | CRE (o próprio) | ligar: `consent_at = now()`, `consent_version`, `consent_revoked_at = null`; desligar: `consent_revoked_at = now()`, `catalog_visible = false`, `share_revoked_at = now()` no kit | `talent.consent` (`actor_type = 'creator'`) | `talent_consent_given` / `_revoked` (gestor responsável ou GES+) |
| `agency_talent_record_consent(p_talent uuid, p_version text, p_document uuid)` | GES+ | talento **sem login** (`talent_user_id` nulo; com login, só ele consente: `talent_has_login`); exige documento do **mesmo talento**, `scope_type = 'talent'`, `ready` (termo assinado); agência demo → `demo_locked` (o seed grava o consentimento fictício); mesma gravação do ligar acima | `talent.consent` (`actor_type = 'agency'`) | — |
| `agency_talent_set_catalog(p_talent uuid, p_visible boolean)` | GES+ | ligar exige consentimento vigente (`consent_required`) | `talent.catalog` | — |
| `talent_social_save(p_talent uuid, p_id uuid, p_data jsonb) returns uuid` | CRE (o próprio) ou GES+ | com `p_id`: a conta precisa ser do `p_talent` (D19, `not_found`); `source` sempre `'declared'` (nunca vem do cliente); `declared_side` = lado de quem grava; `as_of` entre hoje − 2 anos e hoje; `audience` no formato 2.2; números nulos = "não informado" | `talent.social_save` | — |
| `talent_social_delete(p_id uuid)` | CRE (o próprio) ou GES+ | só `source = 'declared'`; escopo da linha | `talent.social_delete` | — |
| `media_kit_save(p_talent uuid, p_data jsonb)` | CRE (o próprio) ou GES+ | `headline`, `about`, `visible_fields` ⊂ `KIT_FIELDS` (cria a linha se não existe) | `media_kit.save` | — |
| `media_kit_share(p_talent uuid, p_days int default 30) returns text` | CRE (o próprio) ou GES+ | consentimento vigente (`consent_required`); 1..90 dias; agência demo → `demo_locked` (a tela mostra só a prévia); gera token novo (32 bytes hex) e guarda só o SHA-256; o token só existe nesta resposta | `media_kit.share` (sem o token) | — |
| `media_kit_revoke(p_talent uuid)` | CRE (o próprio) ou GES+ | `share_revoked_at = now()` | `media_kit.revoke` | — |
| `media_kit_resolve(p_token text, p_count boolean default true) returns jsonb` | **service role** | ver abaixo | — | — |
| `talent_my_context() returns jsonb` | CRE | **só** estes campos do próprio talento: `display_name`, `city`, `state`, `availability`, `availability_note`, `consent_at`, `consent_version`, `consent_revoked_at`, `catalog_visible`, `has_public_page`; agência (nome); gestor (nome de `agency_members.display_name`). Nunca `internal_notes`, `commercial_status`, `last_contact_at`, `manager_id`, `created_by` | — | — |

**`media_kit_resolve`** (D5; volátil porque soma a visita; `revoke ... from public, anon, authenticated`):

```sql
create or replace function public.media_kit_resolve(p_token text, p_count boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare k public.media_kits%rowtype; t public.talent_profiles%rowtype; c public.creator_profiles%rowtype;
        f text[]; v jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into k from public.media_kits where share_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found or k.share_revoked_at is not null or k.share_expires_at <= now() then return null; end if;
  select * into t from public.talent_profiles where id = k.talent_id;
  if t.archived_at is not null or t.consent_at is null or t.consent_revoked_at is not null then return null; end if;
  -- agência suspensa ou de demonstração: sem kit público (D5/D6)
  if not exists (select 1 from public.agencies a where a.id = t.agency_id and a.status = 'active' and not a.is_demo) then return null; end if;
  if t.creator_id is not null then select * into c from public.creator_profiles where id = t.creator_id and status = 'active'; end if;
  f := k.visible_fields;
  v := jsonb_build_object('name', t.display_name, 'fields', to_jsonb(f), 'expires_at', k.share_expires_at);
  if 'photo' = any (f) then v := v || jsonb_build_object('photo_url', c.avatar_url); end if;      -- herói ligado; sem herói: null (iniciais)
  if 'headline' = any (f) then v := v || jsonb_build_object('headline', k.headline); end if;
  if 'about' = any (f) then v := v || jsonb_build_object('about', k.about); end if;
  if 'location' = any (f) then v := v || jsonb_build_object('city', t.city, 'state', t.state); end if;
  if 'segments' = any (f) then v := v || jsonb_build_object('segments', (select coalesce(jsonb_agg(s.name order by s.sort_order), '[]')
      from public.talent_segment_links l join public.talent_segments s on s.id = l.segment_id and s.active where l.talent_id = t.id)); end if;
  if 'networks' = any (f) then
    v := v || jsonb_build_object('networks', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'network', a.network, 'handle', a.handle, 'url', a.url, 'source', a.source, 'as_of', a.as_of,
      'declared_side', a.declared_side, 'declared_at', a.updated_at::date,   -- "declarado por … em …" (2.2)
      'followers', case when 'followers' = any (f) then a.followers end,
      'avg_views', case when 'views' = any (f) then a.avg_views end,
      'avg_reach', case when 'reach' = any (f) then a.avg_reach end,
      'engagement_bp', case when 'engagement' = any (f) then a.engagement_bp end,
      'audience', case when 'audience' = any (f) and a.audience <> '{}'::jsonb then a.audience end)) order by a.followers desc nulls last), '[]')
      from public.talent_social_accounts a where a.talent_id = t.id));
  end if;
  if 'brands' = any (f) and c.id is not null then v := v || jsonb_build_object('brands', (select coalesce(jsonb_agg(jsonb_build_object('name', b.name, 'logo_url', b.logo_url) order by cb.sort_order), '[]')
      from public.creator_brands cb join public.brands b on b.id = cb.brand_id and b.status = 'active'
      where cb.creator_id = c.id and cb.status = 'active')); end if;                           -- só o que já é público
  if 'agency_contact' = any (f) then v := v || (select jsonb_build_object('agency', a.name, 'agency_email', a.contact_email) from public.agencies a where a.id = t.agency_id); end if;
  if p_count then update public.media_kits set view_count = view_count + 1, last_viewed_at = now() where id = k.id; end if;
  return v;
end $$;
revoke execute on function public.media_kit_resolve(text, boolean) from public, anon, authenticated;
grant execute on function public.media_kit_resolve(text, boolean) to service_role;
```

**Impacto no S14:** nenhum. A lista de 17 nomes e as 21 asserções "= 17" ficam como estão (as funções novas
`is_demo_account`, `is_platform_admin`, `agency_is_demo` e `talent_user_id` também têm `revoke ... from anon`).
O cenário S75 confere `not has_function_privilege('anon', 'public.media_kit_resolve(text, boolean)', 'execute')`
e o mesmo para `authenticated`. *Alternativa descartada:* RPC anônima `media_kit_public(p_token)` → S14 = 18, troca das
21 asserções e do `string_agg` do S14; só faria sentido sem service role no servidor.

### 4.3 Etapa C (0066)

**Regra de etapas (`deal_stage_can`, espelho de `src/lib/agency/stages.ts`):**

| Movimento | Quem | Regra |
|---|---|---|
| Para a frente, sem atravessar porteira | GES+ em qualquer negócio; COL só se `owner_id = auth.uid()` | porteiras: `proposal_sent`, `approved`, `production` |
| Para trás | idem | nota obrigatória (≥ 5); não volta de `production`..`delivery` para antes de `production` |
| `proposal_prep → proposal_sent` | só `agency_proposal_commit(send = true)` (ADM, pelo servidor) | — |
| `proposal_sent → negotiation` | só `brand_proposal_decide('changes')` ou `agency_proposal_record_decision` | — |
| `proposal_sent`/`negotiation → approved` | só decisão `accept` (marca MO ou ADM registrando) | — |
| `approved`/`contracting → negotiation` | só `agency_proposal_reopen` (ADM) | sem contrato confirmado; nota ≥ 5 |
| `approved → contracting` | GES+ | precisa de documento `kind = 'contract'` `ready` no negócio |
| `contracting → production` | só `agency_contract_confirm` | aceites + tarefas |
| `delivery → closed (won)` | GES+ | todos os entregáveis `done` ou `cancelled`; senão ADM com justificativa (`force`) |
| qualquer até `contracting` → `closed (lost/cancelled)` | GES+ | nota ≥ 5 (vai para `activities`, nunca para `deals`) |
| `production`..`delivery` → `closed (cancelled)` | ADM | nota; na 0069 cancela lançamentos `planned`/`due` |
| `closed → ` reabrir (volta à etapa anterior) | ADM | nota |

**Etapa vista pela marca** (`brandStatus`): `received` (1–2), `building` (3–5), `proposal` (6–7),
`contracting` (8–9), `running` (10–12), `done` (13 `won`), `cancelled` (13 `lost`/`cancelled`).

| RPC | Quem | Valida | Audita | Avisa |
|---|---|---|---|---|
| `brand_request_save(p_id uuid, p_brand uuid, p_data jsonb) returns uuid` | MO/MS | com `p_id`: o pedido precisa ser da `p_brand` e `origin = 'brand'` (D19, `not_found`); só `draft`; campos de 2.3; `deliverables` no formato de `campaign_deliverables_valid`; `budget_min/max_cents` → `campaign_request_budgets`; (0068) `commercial_date_id` de data publicada de agência com vínculo ativo | — (rascunho) | — |
| `agency_request_save(p_id uuid, p_agency uuid, p_brand uuid, p_data jsonb) returns uuid` | COL+ | `origin = 'agency'`; com `p_id`: escopo da linha; marca com vínculo ativo nesta agência; orçamento só ADM (`values_forbidden`) e é estimativa interna (a marca não lê, 3.3) | `request.save` | — |
| `brand_request_submit(p_id uuid) returns uuid` (deal_id) | MO/MS | pedido da própria marca (escopo da linha); obrigatórios: título ≥ 3, objetivo, período, ≥ 1 rede, ≥ 1 entregável; cria `deals` (`briefing_received`, `owner_id = agency_brands.account_manager_id`, `segment_ids` e período copiados, `brand_visible = true`) e `status = 'converted'` | `request.submit` (`actor_type = 'brand'`) | `briefing_received` (GES+ e responsável) |
| `agency_deal_create(p_agency uuid, p_brand uuid, p_data jsonb) returns uuid` | COL+ (COL vira responsável) | marca com vínculo ativo nesta agência; cria também o `campaign_requests` (`origin = 'agency'`, `status = 'converted'`) para todo negócio ter `request_id` (a rota da marca é `/marca/campanhas/<request>`); `brand_visible = false` até a proposta | `deal.create` | `deal_assigned` |
| `agency_deal_update(p_deal uuid, p_data jsonb)` | GES+; COL dono (sem trocar responsável) | `title`, `talent_brief`, período, `segment_ids` (da mesma agência); `owner_id` só GES+ (membro ativo da mesma agência) | `deal.update` | `deal_assigned` se mudou o responsável |
| `agency_deal_team_set(p_deal uuid, p_user_ids uuid[])` | GES+ | membros ativos da mesma agência; até 10 | `deal.team` | `deal_assigned` aos novos |
| `agency_deal_move(p_deal uuid, p_to text, p_outcome text default null, p_note text default null, p_force boolean default false)` | ver tabela | `deal_stage_can`; porteiras recusadas com `stage_gate` | `deal.stage` (de/para, nota) | `campaign_status_changed` (marca) quando muda o `brandStatus` e `brand_visible` |
| `agency_shortlist_set(p_deal uuid, p_items jsonb)` | GES+ | `[{talent_id, reasons}]`; talentos ativos da mesma agência, não arquivados; `reasons` no formato de 5.7 (códigos da lista, sem valor); até 30; remove só os `suggested` | `deal.shortlist` | — |
| `agency_activity_add(p_subject_type text, p_subject_id uuid, p_kind text, p_body text, p_occurred_at timestamptz)` | COL+ (negócio: GES+ ou COL do negócio) | sujeito da mesma agência (D19); `kind` manual (`call, meeting, message, email, note`); `occurred_at` ≤ agora + 1 dia; `reason_codes` não é gravável aqui | — | — |
| `deal_message_post(p_deal uuid, p_channel text, p_talent uuid, p_body text) returns uuid` | agência (com visibilidade do negócio); MO/MS no `brand_agency`; CRE no próprio `talent_agency` | 1..4000; `p_talent` precisa ser `deal_talent` consultado do negócio; `author_label` = nome do membro/talento | — | `message_received` à outra parte (dedupe por negócio+canal+destinatário por hora) |
| `commission_rule_save(p_agency uuid, p_scope text, p_target uuid, p_type text, p_params jsonb, p_min bigint, p_max bigint, p_justification text) returns uuid` | ADM | `commission_rule_valid`; **`p_target` da própria agência** (marca: vínculo desta agência; negócio: `deals.agency_id = p_agency`, senão `not_found`); desativa a anterior do mesmo escopo (`superseded_at`), `version + 1`; negócio: antes de `proposal_sent` **ou em `negotiation`**, e sem proposta `sent`/`accepted` (`proposal_locked`; o snapshot protege as versões já enviadas) | `commission_rule.save` (antes/depois) | — |
| `commission_rule_clear(p_agency uuid, p_scope text, p_target uuid, p_justification text)` | ADM | mesmo escopo de `p_target`; não apaga o padrão da agência (`default_rule_required`) | `commission_rule.clear` | — |
| `commission_rule_effective(p_deal uuid) returns public.commission_rules` | interna | negócio → marca → padrão da agência; nenhuma → `no_commission_rule` | — | — |
| `agency_fee_set(p_deal_talent uuid, p_fee_cents bigint)` | ADM | escopo da linha; 0..10¹⁰; negócio antes de `contracting` **e sem proposta `sent`/`accepted`** (`proposal_locked`: retirar ou reabrir antes); grava `deal_talents.terms_ready = true`; se o creator já estava `interested`/`talk_requested`/`proposed`, volta para `consulted` | `deal_talent.fee` | `opportunity_updated` ao creator (sem valor no texto) |
| `agency_deliverables_save(p_deal uuid, p_items jsonb)` | GES+; COL dono | `[{id?, deal_talent_id, kind, network, title, brief, due_at, publish_at}]`; item com `id` precisa ser deste negócio e `deal_talent_id` deste negócio, fora de `declined`/`removed` (D19); até 60; bloqueado com proposta `sent`/`accepted` (`proposal_locked`): retirar ou reabrir a proposta antes | `deal.deliverables` | — |
| `agency_consult_talents(p_deal uuid, p_deal_talent_ids uuid[], p_respond_by timestamptz, p_message text)` | GES+ | `deal_talents` deste negócio; `suggested`/`declined` → `consulted`; **todos com cachê definido** (`terms_ready`, senão `fee_missing`: a oportunidade mostra o cachê ao creator); prazo futuro ≤ 30 dias; mensagem vira `deal_messages` (`talent_agency`); negócio antes de `approved` e fora de `proposal_sent`; se estiver antes de `consultation`, passa para `consultation` | `deal.consult` | `opportunity_received` (push) a cada talento com login (`talent_user_id`) |
| `talent_opportunity_respond(p_deal_talent uuid, p_response text, p_note text)` | CRE (o próprio) | `consulted`/`talk_requested` → `interested`/`declined`/`talk_requested`; `declined` exige nota ≥ 3; antes do prazo ou até a agência fechar | `deal_talent.respond` (`creator`) | `opportunity_answered` (responsável + GES+) |
| `agency_record_talent_response(p_deal_talent uuid, p_response text, p_note text, p_document uuid default null)` | GES+ | **só talento sem login** (`talent_user_id` nulo; com login, só ele responde: `talent_has_login`); nota ≥ 5 (como e quando a resposta veio); documento opcional de evidência do mesmo talento/negócio; mesma transição, `response_channel = 'agency_record'` | `deal_talent.respond` | — |
| `agency_deal_talent_set_status(p_deal_talent uuid, p_status text)` | GES+ | só `removed`, de qualquer não contratado; `proposed` só sem proposta `sent`/`accepted` (`proposal_locked`); o gatilho cancela os entregáveis dele | `deal_talent.status` | `opportunity_updated` se já consultado |
| `talent_opportunities(p_deal_talent uuid default null) returns jsonb` | CRE | só os próprios `deal_talents` consultados; devolve `status`, `consulted_at`, `respond_by`, `responded_at`, `response_note`; negócio (`title`, `talent_brief`, período, situação pela ótica do creator); marca (nome, logo); entregáveis dele. **Nunca** `reasons`, `suggested_by`, outros creators, etapa interna ou valores (o cachê vem de `deal_talent_fees` pela RLS, só na web) | — | — |
| `agency_proposal_commit(p_actor uuid, p_deal uuid, p_payload jsonb) returns uuid` | **service role** (o servidor, depois de checar ADM) | ver abaixo | `proposal.save` / `proposal.send` (actor = `p_actor`) | `proposal_received` (marca) se `send` |
| `agency_proposal_withdraw(p_proposal uuid, p_note text)` | ADM | `sent → withdrawn`; negócio volta a `proposal_prep`; `proposed → interested` | `proposal.withdraw` | `campaign_status_changed` |
| `agency_proposal_reopen(p_proposal uuid, p_note text)` | ADM | proposta `accepted`, negócio em `approved`/`contracting`, sem `contract_confirmed_at`; nota ≥ 5; proposta → `superseded`; negócio → `negotiation`; `proposed → interested`; os aceites gravados ficam presos à proposta antiga (por `proposal_id`) e não valem para a nova | `proposal.reopen` | `campaign_status_changed` (marca); `opportunity_updated` (creators) |
| `brand_proposal_decide(p_proposal uuid, p_decision text, p_note text, p_reason_codes text[] default '{}')` | `accept`: MO; `changes`: MO ou MS | proposta da própria marca (escopo da linha); `sent` e `valid_until >= hoje` no fuso da agência (senão `proposal_expired`); `changes` exige ≥ 1 código (`price`, `talents`, `deliverables`, `timeline`, `scope`, `other`) e nota ≥ 5; os códigos vão para `activities` (negócio, `kind = 'system'`, `reason_codes`), a nota livre para `decision_note` (tabela de valor) | `proposal.decide` (`actor_type = 'brand'`) | `proposal_decided` (ADMs + responsável, `params.reasons` = códigos) |
| `agency_proposal_record_decision(p_proposal uuid, p_decision text, p_note text, p_reason_codes text[] default '{}')` | ADM | decisão recebida fora do app; `decided_side = 'agency'`; mesmos códigos e mesma gravação em `activities` | `proposal.decide` | `campaign_status_changed` |
| `brand_talent_search(p_brand uuid, p_filters jsonb) returns jsonb` | MO/MS | só talentos da agência com vínculo ativo, `catalog_visible`, consentimento vigente, não arquivados e não `unavailable`; devolve o nome, `available_limited` (agenda limitada), só os campos de `visible_fields` (métricas com `as_of`, `declared_side`, `declared_at`) e `matched` (filtros atendidos) ou `insufficient_data` (5.7); filtros só sobre campos visíveis (filtro por seguidores ignora quem esconde seguidores); até 50 | — | — |
| `brand_campaign_detail(p_request uuid) returns jsonb` | MO/MS | pedido da própria marca; devolve: pedido, `brandStatus`, creators **propostos/contratados** a partir de `proposal_sent` (`my_brand_deal_talent_ids`): nome sempre, campos do kit autorizados **só com consentimento vigente** (sem consentimento, só o nome); propostas não-rascunho (total; `sent` vencida aparece como "vencida"), entregáveis, documentos compartilhados, aceites | — | — |

**`agency_proposal_commit`: o que a RPC confere antes de gravar** (D4; o cálculo veio de `computeCommission` no servidor):

1. `p_actor` é ADM ativo da agência do negócio ou AG (`forbidden`); negócio em `proposal_prep` ou `negotiation` (`invalid_stage`).
2. `p_payload.rule` é **igual** (jsonb) a `{ruleId, scope, version, type, params, minCents, maxCents}` da
   `commission_rule_effective(p_deal)` naquele instante (`rule_changed`: a tela recalcula e tenta de novo).
3. `p_payload.inputs.talentFees` é igual aos `deal_talent_fees` dos `deal_talents` em `interested`/`proposed`
   do negócio, nem mais nem menos (`fees_changed`); há pelo menos um (`no_talents`); todo `interested`/`proposed`
   tem cachê (`fee_missing`, o mesmo código da issue do motor).
4. `p_payload.inputs.deliverables` é igual à contagem por `kind` de `deliverables` não cancelados **dos
   `deal_talents` em `interested`/`proposed`** (`deliverables_changed`). É a definição única, igual à do TS (5.4);
   `declined`/`removed` já tiveram os entregáveis cancelados pelo gatilho de `deal_talents`.
5. Identidade: `brandTotal = commission + talentFeesTotal + adjustment`, `adjustment ≥ 0`, `commission ≥ 0`,
   `talentFeesTotal = Σ fees`, `contractValue = brandTotal`, `1 ≤ brandTotal ≤ 10¹⁰`; `adjustment > 0` exige
   `p_payload.acceptAdjustment = true` (`adjustment_not_accepted`) e `p_payload.adjustmentNote` com ≥ 5 caracteres
   (`adjustment_note_required`, gravada em `adjustment_note`). Para `markup`, `basis = 'fees'` e `adjustment = 0`.
6. Grava `deal_proposals` (`version = max + 1`, `status = 'draft'` ou `'sent'`), o snapshot 1:1, e marca a proposta
   anterior `sent`/`changes_requested` como `superseded`. Com `send`: `deal_talents` `interested → proposed`,
   `deals.stage = 'proposal_sent'`, `brand_visible = true`, `stage_changed_at = now()`.

**Validade:** proposta `sent` com `valid_until` passado aparece como "vencida" para a agência e para a marca já na
C (status derivado na leitura); `brand_proposal_decide` recusa com `proposal_expired`. Na F o cron grava `expired` e
avisa (7.5).
7. Audita em `admin_audit` com `actor_id = p_actor`, `actor_type = 'agency'` (ou `'admin'` se `p_actor` é AG),
   `after_data` com `proposal_id`, `version`, `agency_id` e **sem** números (os números moram no snapshot).

### 4.4 Etapa D (0067)

A consulta de interesse e as respostas (`agency_consult_talents`, `talent_opportunity_respond`,
`agency_record_talent_response`, `agency_deal_talent_set_status`, `talent_opportunities`) estão na 0066 (4.3, D20).

| RPC | Quem | Valida | Audita | Avisa |
|---|---|---|---|---|
| `brand_contract_accept(p_deal uuid)` | MO | proposta `accepted` da própria marca; contrato da marca (`talent_id` nulo) `ready` com `share_brand`; grava `deal_acceptances (party = 'brand', method = 'in_app')` | `contract.accept` (`brand`) | `contract_acceptance_requested` resolvido → GES+ |
| `talent_contract_accept(p_deal_talent uuid)` | CRE (o próprio) | `proposed`; se há contrato com `share_talent` do talento, precisa estar `ready` | `contract.accept` (`creator`) | — |
| `agency_record_acceptance(p_deal uuid, p_party text, p_deal_talent uuid, p_document uuid, p_note text)` | GES+ | aceite fora do app (`recorded_by_agency`), nota ≥ 5; parte `talent` só de talento sem login (`talent_has_login`); `p_deal_talent` e `p_document` deste negócio (D19) | `contract.accept` | — |
| `agency_contract_request_acceptance(p_deal uuid)` | GES+ | negócio em `contracting` | — | `contract_acceptance_requested` (MO + talentos `proposed`, push) |
| `agency_contract_confirm(p_deal uuid)` | GES+ | etapa `contracting`; aceite da marca + de todo `proposed`; `deal_talents proposed → contracted`; `contract_confirmed_at = now()`; etapa `production`; chama `agency_tasks_generate` | `contract.confirm` | `contract_confirmed` (marca, talentos, responsável) |
| `agency_tasks_generate(p_deal uuid) returns int` | interna | ver abaixo; idempotente | — | `task_assigned` (só tarefas novas com responsável) |
| `task_save(p_id uuid, p_data jsonb) returns uuid` | COL+ (COL: escopo `agency`/`talent` ou negócio dele); tarefa de modelo: só datas, responsável e descrição | escopo da linha (D19); `title` 3..160, `side`, `due_at`, `assignee_id` (membro ativo da mesma agência; ou `talent_user_id` do talento quando `side = 'talent'`) | — | `task_assigned` |
| `task_set_status(p_task uuid, p_status text, p_attachment jsonb default null)` | responsável; GES+; COL do negócio; CRE nas `side = 'talent'` dele | passos 4 e 7 exigem anexo (`url` https ou `document_id` deste negócio e deste talento, não contrato). Concluir o **passo 4** copia o anexo para o passo 5 do mesmo talento (o documento ganha `share_brand = true`) e avisa a marca. Passo 5 só por `brand_task_decide`; passo 8 só por decisão de entregável | — | passo 4: `deliverable_submitted` (marca + responsável, `params.step = 'script'`) |
| `brand_task_decide(p_task uuid, p_decision text, p_feedback text)` | MO/MS (tarefa `side = 'brand'` de negócio da própria marca); GES+ registrando decisão recebida fora do app (feedback obrigatório) | só passo 5 com passo 4 concluído; `approve` → passo 5 `done`; `changes` (feedback ≥ 5) → passo 4 volta a `todo` com `feedback` | `task.script_decide` | `deliverable_decided` (talento, push; responsável; `params.step = 'script'`) |
| `talent_suggest_campaign(p_brand uuid default null, p_note text)` | CRE | marca opcional (ativa ou de negócio em que foi consultado); nota 10..1000; até 5 por dia (`rate_limited`); grava `activities` (sujeito `talent`, `kind = 'note'`, `author_label` = nome do talento) | — | `talent_suggestion` (gestor responsável, senão GES+) |
| `talent_deliverable_submit(p_deliverable uuid, p_url text, p_document uuid, p_note text)` | CRE (o próprio) | `planned`/`in_production`/`changes_requested` → `submitted`; `revision + 1`; conclui passo 7 do talento | `deliverable.submit` | `deliverable_submitted` (marca + responsável) |
| `brand_deliverable_decide(p_deliverable uuid, p_decision text, p_feedback text)` | MO/MS | `submitted` → `approved`/`changes_requested`; ajuste exige feedback ≥ 5; aprovar conclui passo 8 | `deliverable.decide` (`brand`) | `deliverable_decided` (talento, push; responsável) |
| `agency_deliverable_decide(p_deliverable uuid, p_decision text, p_feedback text)` | GES+; COL dono | igual, `decided_side = 'agency'` (ex.: marca aprovou por e-mail; nota obrigatória) | `deliverable.decide` | `deliverable_decided` |
| `talent_deliverable_publish(p_deliverable uuid, p_url text)` | CRE | `approved → published`; URL https; passo 9 | `deliverable.publish` | `deliverable_published` (marca + responsável) |
| `talent_deliverable_proof(p_deliverable uuid, p_url text, p_document uuid)` | CRE | `published → proof_submitted`; passo 10 | `deliverable.proof` | responsável (`deliverable_published` com `params.step = 'proof'`) |
| `agency_deliverable_close(p_deliverable uuid, p_status text, p_note text)` | GES+ | `proof_submitted → done`; qualquer → `cancelled` (nota) | `deliverable.close` | — |

**Modelo de 12 tarefas (`task_template_steps()`, D12)** — título no i18n `commercial.taskSteps.<n>`:

| Passo | Título (pt-BR) | Lado | Por creator? | Âncora | Dias |
|---|---|---|---|---|---|
| 1 | Kickoff interno e checklist do briefing | agência | não | contrato (A) | +1 |
| 2 | Enviar o briefing final aos creators | agência | não | A | +2 |
| 3 | Confirmar cronograma com marca e creators | agência | não | A | +3 |
| 4 | Enviar roteiro ou ideia (arquivo ou link) | creator | sim | início (S) | −7 |
| 5 | Aprovar o roteiro | marca | sim | S | −5 |
| 6 | Produzir o conteúdo | creator | sim | S | −3 |
| 7 | Enviar o conteúdo para aprovação (arquivo ou link) | creator | sim | S | −2 |
| 8 | Aprovar o conteúdo | marca | sim | S | −1 |
| 9 | Publicar | creator | sim | S | 0 |
| 10 | Enviar a comprovação (link ou prints) | creator | sim | S | +2 |
| 11 | Relatório da campanha | agência | não | fim (E) | +5 |
| 12 | Encerramento e repasse | agência | não | E | +10 |

(O título do passo 12 não diz "simulado": `commercial` aparece no app das lojas e não pode ter palavra de
demonstração sem sobreposição; o selo "Registro interno, sem cobrança real" vem de `agency.values` nas telas de valor.)

Datas: `A = contract_confirmed_at` no fuso da agência; `S = coalesce(expected_start, A + 14 dias)`;
`E = greatest(coalesce(expected_end, S + 14 dias), S)`. Vencimento = data da âncora + dias, às 18:00 no fuso
da agência, **nunca antes de A + 1 dia** (`greatest`). Responsável: agência → `deals.owner_id`; creator →
`talent_user_id(talent)` (login próprio ou do herói, nunca conta demo em agência real), senão nulo (a agência
acompanha); marca → nulo (`side = 'brand'`, a marca vê e decide o passo 5 por `brand_task_decide`). Inserção com `on conflict (deal_id, template_step, talent_id) where template_step is not null do nothing`.
Contagem: 1 creator = 12; *n* creators = 5 + 7*n*.

### 4.5 Etapa E (0068)

| RPC | Quem | Valida | Audita | Avisa |
|---|---|---|---|---|
| `calendar_event_save(p_id uuid, p_data jsonb) returns uuid` | agência: COL+ (`owner_type = 'agency'`; `private` só do próprio); talento: o CRE ou GES+ (criado pela agência = `visibility = 'team'`); marca: MO/MS (`owner_type = 'brand'`) | escopo da linha (D19); campos de 2.5; `deal_id`/`talent_id`/`brand_id` do mesmo escopo e visíveis para quem cria; `share_with_brand` só GES+ e só com negócio | — | `calendar_event_added` (push) quando a agência cria na agenda do talento |
| `calendar_event_cancel(p_id uuid, p_note text)` | quem criou; GES+ (eventos de agência e talento da agência); CRE (os próprios) | `cancelled_at = now()` | — | — |
| `commercial_date_save(p_id uuid, p_agency uuid, p_data jsonb) returns uuid` | GES+ | com `p_id`: escopo da linha, `p_agency` igual ao dela (D19); 2.5 | `commercial_date.save` | — |
| `commercial_date_publish(p_id uuid, p_on boolean)` | GES+ | escopo da linha | `commercial_date.publish` | `commercial_date_published` aos membros das marcas com vínculo ativo (dedupe por data) |

"Quero uma campanha nesta data" **não grava**: é um `<a href="/marca/campanhas/nova?data=<id>">`. A página
nova lê a data publicada (RLS de `commercial_dates`) e preenche título e período no estado local; o rascunho só
nasce no primeiro salvamento automático depois que a pessoa digita, por `brand_request_save` com
`commercial_date_id` (validado lá). Não existe `brand_request_from_date`.

### 4.6 Etapa F (0069)

| RPC | Quem | Valida | Audita | Avisa |
|---|---|---|---|---|
| `agency_contract_confirm` (recriada) | GES+ | além da 0067: gera os lançamentos do snapshot aceito (abaixo) na mesma transação | `contract.confirm` | — |
| `agency_finance_backfill() returns int` | service role (uma vez, no deploy da F) | negócios com `contract_confirmed_at` e sem lançamentos | `finance.backfill` | — |
| `agency_entry_set_status(p_entry uuid, p_status text, p_note text)` | ADM | `planned → due → settled`; `planned`/`due → cancelled` (nota ≥ 5); `settled` é final | `finance.entry_status` | `payout_updated` (push) ao talento quando um `talent_payout` muda |
| `agency_dashboard(p_agency uuid) returns jsonb` | COL+ | chave `finance` **só** para ADM/AG (ausente para os outros, não zerada) | — | — |
| `brand_dashboard(p_brand uuid) returns jsonb` | MO/MS | só a própria marca; inclui "creators sugeridos pela agência" = propostos nas campanhas abertas (`my_brand_deal_talent_ids`, só nome + campos do kit autorizados com consentimento vigente) | — | — |
| `agency_publish_sponsorship(p_deal_talent uuid)` | GES+ | negócio `closed`/`won`; talento com herói ligado (`creator_id`); marca `active`; insere `creator_brands (relationship = 'sponsor', status = 'active')` com `on conflict (creator_id, brand_id) do nothing` (ação humana, nunca automática; plano §3) | `agency.publish_sponsorship` | — |
| `agency_relationship_scan() returns jsonb` | service role (cron) | ver 7.5 | `agency.relationship_scan` (contagens) | `relationship_alert`, `task_overdue`, `proposal_decided` (`params.status = 'expired'`) |
| `inbox_cleanup() returns int` | service role (cron) | lidas há > 90 dias; não lidas há > 180 dias | — | — |
| `documents_orphans(p_limit int) returns setof text` | service role (cron) | `pending` há > 24 h; o cron apaga pelo Storage e depois a linha | — | — |
| `agency_audit_list(p_agency uuid, p_limit int default 50, p_before bigint default null) returns setof public.admin_audit` | ADM | linhas cujo `after_data->>'agency_id'` ou `before_data->>'agency_id'` = `p_agency` (toda RPC da agência grava `agency_id` no JSON) | — | — |

**Lançamentos gerados na confirmação do contrato** (todos `simulated = true`, `status = 'planned'`):

| `kind` | Valor | Vencimento |
|---|---|---|
| `brand_receivable` | `snapshot.brand_total_cents` | contrato + 30 dias |
| `commission` | `snapshot.commission_cents` (só a regra, D21) | contrato + 30 dias |
| `adjustment` (só se > 0) | `snapshot.adjustment_cents`, `note` = `snapshot.adjustment_note` | contrato + 30 dias |
| `talent_payout` (um por creator contratado) | `feeCents` do creator em **`snapshot.inputs.talentFees`** (o que foi vendido à marca; nunca a tabela viva) | `expected_end` + 15 dias (ou contrato + 45) |

A RPC confere `brand_receivable = commission + adjustment + Σ talent_payout` antes do `commit` (`finance_identity`).
Como cachês e elenco ficam travados com proposta viva (4.3) e a reabertura gera nova proposta e novo snapshot, o
snapshot aceito sempre bate com quem foi contratado.

---

## 5. Motor de comissão (`src/lib/agency/commission.ts`)

### 5.1 Modelo de dinheiro

Três números por negócio, sempre em **centavos inteiros** (BRL):

- **V** = valor do contrato = o que a marca paga (= total da proposta).
- **C** = comissão da agência (cobrada da marca, embutida em V).
- **F** = Σ cachês dos creators = o que os creators recebem (repasse). O cachê de cada creator é o valor que
  ele vê na oportunidade.

Identidade sempre verdadeira: **V = C + F + A**, onde **A** é o ajuste (diferença não alocada, ≥ 0).

- Nos tipos de **base contrato** (`percent`, `fixed`, `hybrid`, `tiered`, `per_deliverable`), o ADM digita V;
  C sai da regra; A = V − C − F. A > 0 só pode ser enviado se o ADM aceitar e justificar (≥ 5 caracteres;
  "ajuste de R$ X, registrado à parte da comissão", D21); A < 0 bloqueia (os cachês passam do que sobra do contrato).
- No **markup** (base cachês), V = F + C e A = 0 sempre.

O botão "Sugerir valor do contrato" (função `suggestContractValue`) acha o menor V com V − C(V) ≥ F e devolve
também o A que sobra nesse V. Quase sempre A = 0; **no modo faixa pode não existir V com A = 0** (na troca de
faixa, V − C(V) salta: com ≤ 50 mil 20% e ≤ 200 mil 15%, todo F entre R$ 40.000,01 e R$ 42.500,00 cai no
buraco), e a tela avisa "Nesta faixa não existe valor sem ajuste: o menor valor deixa um ajuste de R$ X".

### 5.2 Esquemas zod (zod 4)

Parâmetros guardados em `commission_rules.params` exatamente como o objeto abaixo, **sem** `type`,
`minCents` e `maxCents` (que vão para as colunas `type`, `min_cents`, `max_cents`).

```ts
import { z } from "zod";

export const COMMISSION_ENGINE_VERSION = "1";
export const MAX_CENTS = 10_000_000_000;          // R$ 100 milhões
export const BP_100 = 10_000;                     // 100,00%
export const DELIVERABLE_KINDS = ["post", "reels", "stories", "video", "short", "live", "event", "ugc", "other"] as const;
export type DeliverableKind = (typeof DELIVERABLE_KINDS)[number];

const cents = z.number().int().min(0).max(MAX_CENTS);
const bp = z.number().int().min(0).max(BP_100);               // percentuais sobre o contrato: 0..100%
const bounds = { minCents: cents.nullable().default(null), maxCents: cents.nullable().default(null) };

export const percentRule = z.object({ type: z.literal("percent"), bp, ...bounds });
export const fixedRule = z.object({ type: z.literal("fixed"), amountCents: cents, ...bounds });
export const hybridRule = z.object({ type: z.literal("hybrid"), amountCents: cents, bp, ...bounds });
export const tieredRule = z.object({
  type: z.literal("tiered"),
  mode: z.enum(["bracket", "progressive"]),       // bracket = "faixa": a % da faixa vale sobre o total
  tiers: z.array(z.object({ upToCents: cents.min(1).nullable(), bp })).min(1).max(10),
  ...bounds,
}).superRefine((r, ctx) => {
  r.tiers.forEach((t, i) => {
    const last = i === r.tiers.length - 1;
    if (last && t.upToCents !== null) ctx.addIssue({ code: "custom", message: "last_tier_must_be_open", path: ["tiers", i, "upToCents"] });
    if (!last && t.upToCents === null) ctx.addIssue({ code: "custom", message: "only_last_tier_open", path: ["tiers", i, "upToCents"] });
    const prev = i > 0 ? r.tiers[i - 1].upToCents : 0;
    if (!last && t.upToCents !== null && prev !== null && t.upToCents <= prev) ctx.addIssue({ code: "custom", message: "tiers_not_ascending", path: ["tiers", i] });
  });
});
export const perDeliverableRule = z.object({
  type: z.literal("per_deliverable"),
  defaultUnitCents: cents.nullable(),
  unitByKind: z.partialRecord(z.enum(DELIVERABLE_KINDS), cents),   // zod 4: z.record com enum exigiria todas as chaves
  ...bounds,
}).refine((r) => r.defaultUnitCents !== null || Object.keys(r.unitByKind).length > 0,
  { message: "unit_price_required", path: ["defaultUnitCents"] });   // regra sem preço nunca calcularia nada
export const markupRule = z.object({ type: z.literal("markup"), bp: z.number().int().min(0).max(100_000), ...bounds }); // até 1000%

export const commissionRuleSchema = z
  .discriminatedUnion("type", [percentRule, fixedRule, hybridRule, tieredRule, perDeliverableRule, markupRule])
  .refine((r) => r.minCents === null || r.maxCents === null || r.minCents <= r.maxCents, { message: "min_above_max", path: ["maxCents"] });
export type CommissionRule = z.infer<typeof commissionRuleSchema>;

export const commissionInputSchema = z.object({
  contractValueCents: cents.nullable(),           // obrigatório nos tipos de base contrato; ignorado no markup
  talentFeesCents: z.array(cents.nullable()).max(50), // um por creator (interested/proposed); null = cachê não definido → fee_missing
  deliverables: z.array(z.object({ kind: z.enum(DELIVERABLE_KINDS), quantity: z.number().int().min(1).max(100) })).max(60),
});
export type CommissionInput = z.infer<typeof commissionInputSchema>;
```

### 5.3 Saída e API

```ts
export type CommissionIssue =
  | { code: "contract_value_required" }
  | { code: "fee_missing"; count: number }           // creator interested/proposed sem cachê (bloqueia)
  | { code: "missing_unit_price"; kinds: DeliverableKind[] }
  | { code: "commission_exceeds_contract" }          // C > V
  | { code: "fees_exceed_net"; shortCents: number }   // A < 0
  | { code: "adjustment_pending"; cents: number }     // A > 0 (pede aceite)
  | { code: "total_zero" }                            // V = 0 (permuta fora do MVP)
  | { code: "over_max" };                             // algum número > MAX_CENTS

export type CommissionLine =                          // explicação linha a linha (códigos, não textos)
  | { code: "percent"; baseCents: number; bp: number; amountCents: number }
  | { code: "fixed"; amountCents: number }
  | { code: "tier"; tierIndex: number; baseCents: number; bp: number; amountCents: number }
  | { code: "unit"; kind: DeliverableKind; quantity: number; unitCents: number; amountCents: number }
  | { code: "markup"; baseCents: number; bp: number; amountCents: number }
  | { code: "rounding"; amountCents: number }         // só no progressivo: acerta Σ linhas tier ao arredondamento único
  | { code: "floor" | "ceiling"; fromCents: number; amountCents: number };
// Invariante (vitest): Σ amountCents das linhas que não são floor/ceiling = commissionRuleCents; com piso/teto,
// a linha floor/ceiling vai de fromCents (= commissionRuleCents) para amountCents (= commissionCents).

export type CommissionResult = {
  basis: "contract" | "fees";
  contractValueCents: number;       // = brandTotalCents
  talentFeesTotalCents: number;
  commissionRuleCents: number;      // antes de piso/teto
  commissionCents: number;          // depois de piso/teto
  clamp: "floor" | "ceiling" | null;
  adjustmentCents: number;          // V − C − F (pode sair negativo; issues explicam)
  brandTotalCents: number;
  lines: CommissionLine[];
  issues: CommissionIssue[];
  engineVersion: string;
};

/** Cálculo puro. Nunca lança: entrada inválida volta em issues. */
export function computeCommission(rule: CommissionRule, input: CommissionInput): CommissionResult;
/** Pode gravar/enviar? Bloqueia em qualquer issue, exceto adjustment_pending com acceptAdjustment. */
export function canCommit(result: CommissionResult, opts: { acceptAdjustment: boolean }): { ok: true } | { ok: false; code: CommissionIssue["code"] };
/** Menor V (centavos) com V − C(V) ≥ F e o ajuste que sobra nele (A = V − C − F, 0 quase sempre; > 0 no buraco
 *  da troca de faixa). null se impossível (ex.: 100%), acima de MAX_CENTS ou com fee_missing. Só ajuda de tela. */
export function suggestContractValue(rule: CommissionRule, input: Omit<CommissionInput, "contractValueCents">):
  { valueCents: number; adjustmentCents: number } | null;
/** round_half_up(amount × bp / 10000), em BigInt. */
export function applyBp(amountCents: number, bp: number): number;
/** Resolução pura negócio → marca → padrão (espelho de commission_rule_effective). */
export function resolveRule<R extends { scope: "deal" | "brand" | "agency_default" }>(rules: R[]): R | null;
/** Snapshot gravado: {ruleId, scope, version, type, params, minCents, maxCents}. */
export function ruleSnapshot(stored: StoredRule): RuleSnapshot;
```

### 5.4 Aritmética e arredondamento

- Tudo em centavos inteiros; percentuais em **pontos-base** (1 bp = 0,01%; 20% = 2000).
- Produtos em `BigInt`; **arredondamento meio para cima** (half-up) no centavo, **uma única vez por
  componente**: `applyBp(a, bp) = Number((BigInt(a) * BigInt(bp) + 5000n) / 10000n)` (a ≥ 0).
- **Progressivo:** soma o numerador de todas as faixas e arredonda uma vez:
  `C = (Σ parte_i × bp_i + 5000) / 10000`. As linhas `tier` mostram cada parte arredondada só para leitura; a
  diferença entre Σ dessas linhas e C vai numa linha `rounding` (só aparece quando ≠ 0), para Σ linhas = C.
- **Faixa (bracket):** acha a faixa que contém V (limite superior **inclusivo**: "até R$ 50 mil" inclui
  R$ 50.000,00) e aplica `applyBp(V, bp_faixa)`.
- **Híbrida:** `amountCents + applyBp(V, bp)`.
- **Por entregável:** `Σ quantidade × (unitByKind[kind] ?? defaultUnitCents)`; tipo sem preço e sem padrão
  → `missing_unit_price` (a soma ignora esses e a issue bloqueia). Quantidade = número de `deliverables` não
  cancelados por tipo, **só dos `deal_talents` em `interested`/`proposed`** — definição única, igual à da RPC
  (4.3 item 4). O servidor monta isso do banco; quando um creator vai a `declined` ou `removed`, o gatilho de
  `deal_talents` cancela os entregáveis dele (2.3), então as duas contagens coincidem.
- **Cachê ausente:** creator `interested`/`proposed` sem cachê → `fee_missing` (bloqueia; a consulta já exige
  cachê definido, então só aparece se algo mudou no meio).
- **Markup:** `C = applyBp(F, bp)`; `V = F + C`.
- **Piso e teto** depois do arredondamento, em todos os tipos: `C = min(max(C, min), max)`; `clamp` diz qual atuou.
- `suggestContractValue`: em todos os tipos de base contrato, V − C(V) é não decrescente (taxa marginal ≤ 100%;
  piso e teto preservam isso; o arredondamento sobe no máximo 1 centavo por centavo). Busca binária em
  [F, MAX_CENTS]. **Exceção:** no modo faixa, V − C(V) pode cair na troca de faixa; a busca roda dentro de
  cada faixa e devolve o menor V válido entre elas, com o A que sobra (pode ser > 0, vetor E12).

### 5.5 Exemplos numéricos (vetores dourados do vitest)

| # | Regra | Entrada | Resultado |
|---|---|---|---|
| E1 | percentual 20% (2000) | V = R$ 50.000,00; F = R$ 40.000,00 | C = R$ 10.000,00; A = 0; marca paga R$ 50.000,00 |
| E2 | fixo R$ 5.000 | V = R$ 30.000; F = R$ 25.000 | C = R$ 5.000; A = 0 |
| E3 | híbrida R$ 2.000 + 10% | V = R$ 50.000; F = R$ 43.000 | C = 2.000 + 5.000 = R$ 7.000; A = 0 |
| E4a | escalonada, faixa: ≤ 50 mil 20%, ≤ 200 mil 15%, acima 10% | V = R$ 120.000 | C = 15% × 120.000 = R$ 18.000 |
| E4b | mesma, progressiva | V = R$ 120.000 | C = 20% × 50.000 + 15% × 70.000 = R$ 20.500 |
| E4c | faixa | V = R$ 300.000 | C = 10% × 300.000 = R$ 30.000 |
| E4d | progressiva | V = R$ 300.000 | C = 10.000 + 22.500 + 10.000 = R$ 42.500 |
| E4e | faixa e progressiva | V = R$ 50.000,00 (limite) | R$ 10.000 nas duas (limite inclusivo) |
| E4f | faixa | V = R$ 50.000,01 | C = round(5.000.001 × 0,15) = R$ 7.500,00 (queda típica do modo faixa) |
| E4g | progressiva | V = R$ 50.000,01 | numerador 5.000.000 × 2000 + 1 × 1500 = 10.000.001.500 → /10⁴ = 1.000.000,15 → C = R$ 10.000,00 |
| E5a | por entregável: post R$ 500, vídeo R$ 800 | 3 posts + 2 vídeos | C = 1.500 + 1.600 = R$ 3.100 |
| E5b | mesma, sem padrão | + 1 stories | issue `missing_unit_price ['stories']` |
| E5c | mesma, padrão R$ 300 | + 1 stories | C = R$ 3.400 |
| E6 | markup 25% | F = R$ 30.000 | C = R$ 7.500; marca paga R$ 37.500; A = 0 |
| E7a | percentual 10%, piso R$ 3.000, teto R$ 10.000 | V = R$ 20.000 | regra R$ 2.000 → piso: C = R$ 3.000 (`floor`) |
| E7b | mesma | V = R$ 200.000 | regra R$ 20.000 → teto: C = R$ 10.000 (`ceiling`) |
| E7c | mesma | V = R$ 50.000 | C = R$ 5.000 (`clamp = null`) |
| E8 | markup 25%, piso R$ 1.000 | F = R$ 2.000 | regra R$ 500 → C = R$ 1.000; marca paga R$ 3.000 |
| E9a | percentual 12,5% (1250) | V = R$ 100,04 | 10.004 × 1250 = 12.505.000 → +5000 → /10⁴ = 1251: C = R$ 12,51 (meio para cima) |
| E9b | mesma | V = R$ 100,01 | 12.501.250 → 1250: C = R$ 12,50 |
| E10a | percentual 20% | V = R$ 50.000; F = R$ 39.000 | A = R$ 1.000 → `adjustment_pending` (envia só com aceite) |
| E10b | mesma | V = R$ 50.000; F = R$ 41.000 | A = −R$ 1.000 → `fees_exceed_net` (bloqueia) |
| E11 | sugerir V, percentual 20% | F = R$ 40.000,01 | V = R$ 50.000,01 (C = R$ 10.000,00; A = 0) |
| E12 | sugerir V, escalonada faixa do E4a | F = R$ 40.000,50 | `{ valueCents: 5.000.001, adjustmentCents: 249.951 }`: V = R$ 50.000,01, C = R$ 7.500,00, A = R$ 2.499,51 (não existe V com A = 0) |
| E13 | progressiva, faixa 1 até 5.000.005 centavos a 10%, depois 10% | V = 5.000.010 centavos | linhas tier 500.001 + 1 = 500.002; C = (5.000.005×1000 + 5×1000 + 5000)/10⁴ = 500.001 → linha `rounding` −1; Σ linhas = C |
| E14 | por entregável sem preço nenhum | `defaultUnitCents: null`, `unitByKind: {}` | zod recusa (`unit_price_required`); `commission_rule_valid` também |
| E15 | percentual 20%, um creator sem cachê | `talentFeesCents: [4_000_000, null]` | issue `fee_missing` (count 1), `canCommit` bloqueia |

**Casos-limite que o vitest cobre:** V = 0 (`percent` → `total_zero`; `fixed` → `commission_exceeds_contract` +
`total_zero`); F = 0 no markup (`total_zero`); sem entregáveis no `per_deliverable` (C = 0, válido se V > 0);
faixa única aberta; bp 0 e 10000; `bp = 10000` em `suggestContractValue` → `null`; markup acima de 100%;
`min > max` recusado pelo zod; faixas fora de ordem, última com teto ou intermediária aberta recusadas;
V no máximo (`MAX_CENTS`) sem estouro (BigInt); identidade V = C + F + A em 1000 entradas determinísticas
(laço com semente fixa, sem dependência nova).

### 5.6 Onde o cálculo é autoritativo e o que é gravado

1. **Tela (ADM):** `/agencia/negocios/[id]/proposta` importa o módulo puro e mostra a prévia ao vivo
   (client component). Só prévia.
2. **Servidor (autoritativo):** `commitProposalAction` (server action):
   1. `requireAgency('admin')` com o cliente do usuário (confere papel e agência do negócio);
   2. lê com o cliente do usuário: regra efetiva (`commission_rules`), cachês (`deal_talent_fees` de
      `interested`/`proposed`), entregáveis por tipo;
   3. valida o formulário (zod) e roda `computeCommission` + `canCommit`;
   4. chama `agency_proposal_commit` com o **service role**, passando `p_actor = user.id` e o payload
      `{rule, inputs, result, acceptAdjustment, adjustmentNote, validUntil, scopeSummary, send}`;
   5. com `send`, dispara `after(() => drainPushOutbox(admin))` (padrão do push existente).
3. **Banco:** a RPC confere regra, entradas e identidade (4.3) e grava `deal_proposals` + `deal_commission_snapshots`.
4. **Gravado no snapshot:** `rule_snapshot` (tipo, parâmetros, piso, teto, id, escopo e versão da regra),
   `inputs`, `basis`, V, F, C da regra, C final, A, total da marca, `clamp`, `lines`, `engine_version`, quem e quando.
5. **Imutável:** mudar a regra depois não mexe em proposta enviada nem em contrato (o snapshot é cópia).
   A confirmação do contrato usa o snapshot da proposta aceita (inclusive para os repasses, 4.6).

### 5.7 Recomendação explicada (`src/lib/agency/match.ts`, D22)

Função pura, sem IA externa, a mesma no servidor (shortlist) e nos testes. Nunca move etapa, nunca consulta,
nunca aprova: só ordena e explica.

```ts
export type MatchCode = "segment" | "region" | "audience_age" | "network" | "availability";
export type MatchReason = { code: MatchCode; met: boolean; detail: string[] };   // detail = ids/UFs/faixas/redes, nunca texto livre
export type MatchResult = { score: number | null; reasons: MatchReason[]; insufficient: boolean; stale: MatchCode[] };
export function matchTalent(ctx: MatchContext, talent: MatchTalent, today: string): MatchResult;
```

**Entradas.** Contexto (da agência, a partir do negócio e do pedido): `deals.segment_ids`,
`campaign_requests.target_states`, `target_age_bands`, `networks`. Talento: segmentos (`talent_segment_links`),
`state`, `availability`, e por rede declarada `network`, `as_of`, `audience.age`, `audience.top_states`.

**Critérios e pesos** (um critério só conta se é **avaliável**: o contexto pede e o talento tem dado não vencido):

| Código | Avaliável quando | Atendido quando | Peso |
|---|---|---|---|
| `segment` | negócio tem `segment_ids` e o talento tem segmento | interseção não vazia | 30 |
| `audience_age` | pedido tem `target_age_bands` e alguma rede tem `audience.age` com `as_of` ≤ 12 meses | soma das faixas pedidas ≥ 4000 bp (40%) na rede de maior base declarada | 25 |
| `network` | pedido tem `networks` e o talento tem alguma rede declarada | tem conta em pelo menos uma rede pedida | 20 |
| `region` | pedido tem `target_states` e o talento tem `state` ou `audience.top_states` (≤ 12 meses) | `state` ∈ pedido ou interseção com `top_states` | 15 |
| `availability` | sempre | `available` = 10 pontos; `limited` = 5; `unavailable` fica fora da lista (não recebe nota) | 10 |

**Nota:** `score = round(100 × pontos obtidos / soma dos pesos avaliáveis)`, inteiro 0–100. **Mínimo:** com menos
de 2 critérios avaliáveis **além** de `availability`, `score = null`, `insufficient = true` e a tela diz "dados
insuficientes" (sem nota). **Desatualizado:** métrica com `as_of` há mais de 12 meses não pontua; o código vai para
`stale` e a tela diz "desatualizado". Ordem: nota (nulos por último), depois nome. `reasons` vira
`deal_talents.reasons` (só a agência lê).

**Busca da marca (sem campanha):** não há nota. Cada card mostra os filtros que o talento atende (`matched`: o
segmento, a UF, "audiência 18–34 declarada", a rede) só entre campos visíveis do kit. Se o talento tem menos de 2
dados declarados e visíveis (segmento, localização, audiência ≤ 12 meses, rede), o card diz "dados insuficientes".

**Vetores do vitest (`agency-match.test.ts`):**

| # | Contexto | Talento | Resultado |
|---|---|---|---|
| M1 | segmento fitness; UF SP; 18–34; Instagram | fitness; SP; audiência 18–24 3100 + 25–34 4200 (as_of 3 meses); Instagram; available | todos atendidos: 100 |
| M2 | igual ao M1 | corrida; RJ; mesma audiência; TikTok; limited | segment ✗, region ✗, network ✗, audience ✓ (25), availability 5 → 30/100 = 30 |
| M3 | igual ao M1 | fitness; sem UF; sem audiência; Instagram; available | avaliáveis segment, network, availability → 60/60 = 100 |
| M4 | igual ao M1 | sem segmento; sem UF; sem audiência; sem rede; available | só availability avaliável → `score = null`, "dados insuficientes" |
| M5 | igual ao M1 | igual ao M1, mas audiência com `as_of` de 14 meses | audience e region por `top_states` não pontuam, `stale = ['audience_age']`; region pelo `state` SP ✓ → 75/75 = 100 |
| M6 | igual ao M1 | `unavailable` | fora da lista |

---

## 6. Rotas e telas

### 6.1 Padrões de tela (valem para todos os portais)

- **Layout:** `PortalShell` (`portal = "agency" | "brand"`), com `PortalSidebar` no desktop e `Sheet` no
  celular. `PortalShell` ganha a prop `navKeys` (lista calculada no servidor pelo papel) e o sino
  (`NotificationBell`) à direita do cabeçalho para `agency`, `brand` e o escritório do creator.
- **Componentes da base:** `PageHeader`, `Section`, `Card`/`CardBody`, `KpiCard` (admin-ops), `Badge`,
  `EmptyState`, `ErrorState`, `Skeleton`/`SkeletonCard` (em `loading.tsx`), `FormField`, `Input`, `Select`,
  `Textarea`, `Switch`, `Checkbox`, `Dialog`, `Sheet`, `Toast`, `Avatar` (iniciais quando não há foto),
  `SegmentedControl` (só estado local), `ScreenCards` modo `inline` no Início do escritório (como o Hoje),
  `MiniBarChart` (indicadores e media kit), `CopyButton` (link do convite/kit) e **`FilterAnchor`** (novo, em
  `src/components/admin-ops/FilterAnchor.tsx`: mesmo visual do `FilterLink`, mas com `<a href>` comum). O
  `FilterLink` existente usa `next/link` (navegação no cliente) e **não** serve para filtro por parâmetro na
  mesma página (o roteador às vezes aborta: `docs/testing.md`, aba `?aba=lances`).
- **Estados:** toda lista tem vazio (`EmptyState` com a próxima ação), erro (`ErrorState` + `error.tsx` da rota)
  e carregando (`loading.tsx` com `Skeleton`). Tabela não aparece no celular: vira lista de cards.
- **`loading.tsx` e redirect:** nada de `loading.tsx` na raiz de `/agencia`, `/marca` ou `/creator/escritorio`.
  Com um `loading.tsx` acima, o `redirect()` de uma página restrita sai como refresh no cliente com status 200
  (o caso do `/orders`, ver comentário em `next.config.ts`). Regra: a checagem de papel de rota restrita fica num
  `layout.tsx` do próprio segmento (`/agencia/equipe/layout.tsx`, `/agencia/financeiro/layout.tsx`,
  `/agencia/historico/layout.tsx`, `/agencia/configuracoes/layout.tsx`, `/agencia/negocios/[id]/proposta/layout.tsx`),
  sem `loading.tsx` em nenhum segmento acima dele; `loading.tsx` só nas folhas (listas e detalhes). Nos E2E,
  "redireciona" espera a URL com `timeout`.
- **390 px:** nenhuma rolagem lateral na página (`scrollWidth ≤ 390` no E2E). O quadro do pipeline rola
  dentro do próprio contêiner (`overflow-x-auto`, `snap-x`) só no desktop; no celular é lista agrupada por etapa.
- **Abas e filtros:** abas são **rotas** (`/agencia/negocios/[id]/creators`), não parâmetros. Filtros por
  parâmetro na mesma página usam `FilterAnchor` (`<a href>` simples) ou `window.location.replace` (padrão do
  `PeriodSelector`), nunca `next/link`, `FilterLink` nem `router.push` (bug conhecido de navegação por parâmetro).
- **Atualização ao vivo:** o `NotificationBell` dispara o evento de janela `uh:inbox` com o `kind` de cada aviso
  novo; a página do pipeline escuta `briefing_received`/`deal_assigned` e chama `router.refresh()` (sem mudar
  a URL), o que põe o negócio novo na tela em até 1 s (critério 12.4 do plano).
- **Valores:** componentes que mostram dinheiro ficam em `src/components/agency/values/*` e só são
  renderizados em páginas que já passaram por `requireAgency('admin')`. Toda tela de valor mostra o selo
  "Registro interno, sem cobrança real" (`Badge variant="demo"`).
- **Migração ausente:** cada consulta trata `isMissingSchema(error)` (apêndice B) como "indisponível" e a
  página mostra `EmptyState` "Módulo em atualização" (testid `module-unavailable`).

### 6.2 Portal da agência (`/agencia`, só web)

Layout `src/app/agencia/layout.tsx`: `requireRole('agency', '/agencia')` (admin passa) → `getAgencyContext()`
(agência, papel, `isPlatformAdmin` pela RPC/`is_platform_admin`; AG escolhe a agência num seletor gravado no
cookie `uh-agency` por server action + `window.location.replace`; conta demo com papel admin e sem vínculo →
`EmptyState` "Indisponível para conta de demonstração", sem consulta) → `PortalShell portal="agency" navKeys=...`.

| Rota | Etapa | Quem | Conteúdo | Dados |
|---|---|---|---|---|
| `/agencia` | A (completa em F) | COL+ | Início executivo: KPIs (creators ativos, marcas, negócios por etapa, contratos ativos, entregas atrasadas, creators sem contato, tarefas vencidas); **ADM:** receita de comissões, a receber, repasses pendentes (simulados) | `agency_dashboard` |
| `/agencia/equipe` | A | ADM | membros, papéis, convidar, promover, remover | `agency_members`, `invitations` |
| `/agencia/marcas`, `/nova`, `/[id]` | A | COL+ (escrita GES+) | lista; criar ou vincular; ficha com equipe da marca, convites, negócios, atividades | `agency_brands`, `brands`, `brand_members` |
| `/agencia/configuracoes` | A (ampliada em B, C, E) | GES+ (seção de comissão só ADM) | agência, alerta (dias), segmentos, **regras de comissão** (padrão e por marca, com prévia dos exemplos), datas | RPCs de 4.1–4.5 |
| `/agencia/notificacoes` | A | todos | caixa completa (filtro lidas/não lidas por `<a>`) | `inbox_notifications` |
| `/agencia/casting`, `/novo`, `/[id]` (+ `/redes`, `/media-kit`, `/documentos`, `/historico`) | B | COL+ (escrita GES+) | lista com filtros (segmento, disponibilidade, situação, gestor, busca); ficha com consentimento, catálogo, redes declaradas ("declarado em"), media kit e link, documentos, atividades, negócios | tabelas de 2.2 |
| `/agencia/pipeline` | C | COL+ | quadro de 13 colunas (desktop) / lista agrupada (celular); filtros responsável e marca (`FilterAnchor`); COL vê só os dele; atualiza ao vivo com o sino (6.1) | `deals` |
| `/agencia/pipeline/novo` | C | COL+ | novo negócio (briefing em nome da marca) | `agency_request_save`, `agency_deal_create` |
| `/agencia/negocios/[id]` | C | quem vê o negócio | visão geral, mover etapa, linha do tempo (atividades + mudanças), equipe | `deals`, `activities` |
| `/agencia/negocios/[id]/creators` | C | GES+ (COL lê) | shortlist com recomendação explicada (nota e critérios, 5.7); consulta em massa; respostas (registro só de quem não tem login); selo "cachê definido" (`terms_ready`, sem valor) para o GES; **ADM:** coluna cachê | `deal_talents`, `match.ts`; ADM: `deal_talent_fees` |
| `/agencia/negocios/[id]/proposta` | C | **ADM** | regra efetiva, cachês, entregáveis, V, prévia, ajuste (aceite + justificativa), sugerir V (com aviso de faixa), enviar, retirar, reabrir; histórico de versões, validade ("vencida") e decisão da marca (códigos + nota) | tabelas 💰 |
| `/agencia/negocios/[id]/entregas` | C/D | quem vê | cronograma por creator, status, aprovação em nome da marca; embed de documentos com hint de FK (0.2 item 3) | `deliverables` |
| `/agencia/negocios/[id]/contrato` | D | GES+ vê status e aceites, registra aceite e confirma; **PDF do contrato, envio, compartilhamento e arquivamento: só ADM** | contrato anexado, aceites, confirmar | `deal_acceptances`, `documents` |
| `/agencia/negocios/[id]/tarefas` | D | quem vê | as 12 + avulsas | `tasks` |
| `/agencia/negocios/[id]/conversa` | C | quem vê | canais marca↔agência e talento↔agência | `deal_messages` |
| `/agencia/negocios/[id]/documentos` | C/F | quem vê (restritos: ADM) | documentos do negócio | `documents` |
| `/agencia/tarefas` | D | COL+ | minhas · equipe (GES+) · vencidas (filtros por `<a>`) | `tasks` |
| `/agencia/agenda` (+ `/ics`) | E | COL+ | dia/semana/lista (`?vista=` por `<a>`), eventos da equipe e dos talentos | `calendar_events` |
| `/agencia/calendario-comercial` | E | COL+ (escrita GES+) | datas, publicar | `commercial_dates` |
| `/agencia/financeiro` | F | **ADM** | comissão por negócio, a receber, repasses, mudar situação; selo simulado | `financial_entries`, snapshots |
| `/agencia/historico` | F | ADM | auditoria da agência | `agency_audit_list` |

Menu por papel (`navKeys`): COL = Início, Casting, Marcas, Pipeline, Tarefas, Agenda, Calendário comercial,
Notificações. GES = + Configurações. ADM = + Equipe, Financeiro, Histórico. Rota fora do papel:
`redirect('/agencia')` no servidor, no `layout.tsx` do segmento (6.1; não basta esconder o link).

### 6.3 Portal da marca (`/marca`, só web)

Layout: `requireRole('brand', '/marca')` → `getBrandContext()` (marca, papel; mais de uma marca ou AG →
seletor no cookie `uh-brand`). AG só lê (as RPCs da marca exigem membro).

| Rota | Etapa | Quem | Conteúdo |
|---|---|---|---|
| `/marca` | A (completa em F) | MO/MS | Início: campanhas ativas e concluídas, solicitações, propostas recebidas, **creators sugeridos pela agência** (propostos nas campanhas abertas, só campos autorizados), aprovações pendentes, próximas datas publicadas, avisos (`brand_dashboard`); faixa "Os avisos chegam aqui, no sino" (D8) |
| `/marca/equipe` | A | MO (MS lê) | membros, convidar MS, remover |
| `/marca/notificacoes` | A | MO/MS | caixa completa |
| `/marca/campanhas` | C | MO/MS | lista (rascunho, enviada, em andamento, concluída) com `brandStatus` |
| `/marca/campanhas/nova` | C (`?data=` na E) | MO/MS | briefing em 5 passos curtos (objetivo → produto e público → período e região → redes e entregáveis → orçamento e anexos), estado local (o passo não vai para a URL; só `?data=<id>` de entrada, lido uma vez no servidor), rascunho salvo 2 s depois de parar de digitar (`brand_request_save`; nada é gravado antes da primeira digitação), anexos por `document_reserve('request')` |
| `/marca/campanhas/[id]` | C/D | MO/MS | linha do tempo (`brandStatus`), creators propostos (campos autorizados, com consentimento), proposta (**total**; "vencida" quando passou a validade), aceitar (MO) ou pedir ajuste (códigos + nota), contrato e aceite (MO), roteiros e entregas para aprovar, documentos, conversa com a agência (`brand_campaign_detail` + RLS) |
| `/marca/creators` | C | MO/MS | busca no catálogo autorizado com filtros (segmento, UF, rede, seguidores mínimos, disponibilidade); cada card mostra os filtros atendidos ("Fitness", "SP", "audiência 18–34 declarada") ou "dados insuficientes" (5.7); métrica sempre com "dados de {as_of} · declarado por {creator ou agência} em {data}" |
| `/marca/calendario` (+ `/ics`) | E | MO/MS | datas comerciais publicadas + eventos da marca/compartilhados; "Quero uma campanha nesta data" (`<a>` para `/marca/campanhas/nova?data=<id>`, sem gravar) |

### 6.4 Escritório do creator (`/creator/escritorio`, web e app)

`src/app/creator/escritorio/layout.tsx` dentro do layout do `/creator` (que já exige papel `creator`):
`getTalentContext()` (`my_talent_id` + `talent_my_context()`; nunca lê `talent_profiles` direto). Sem talento:
`EmptyState` "Você ainda não faz parte de um casting".

**Talento sem página pública (só escopo `talent`, D2):** o `/creator` hoje é "herói" (selo, Novo post, painel).
Quem tem papel `creator` **só** com `scope_type = 'talent'` (helper `isTalentOnly(roles)` em `src/lib/auth/session.ts`):
`src/app/creator/page.tsx` redireciona para `/creator/escritorio`; `PORTAL_LINKS.creator` esconde "Novo post" e
mostra "Escritório"; `/creator/post/new` mostra "Disponível só para heróis com página pública"; o selo do Perfil
diz "Talento" (`me.profile.roles.talent`) em vez de "Herói"; o atalho de `/configuracoes` aponta para
`/creator/escritorio`; a persona de relógio (`demoPersonaFor`) não muda (só vale para conta demo).
Sem consentimento: faixa no topo do Início e do Media kit com link para `/creator/escritorio/consentimento`;
gerar link e entrar no catálogo ficam bloqueados (oportunidades, tarefas e agenda funcionam). Navegação: barra de abas por **rotas** (`OfficeTabs`, links
`<a>`), rolável no celular, mais o sino. Entrada: card "Escritório" no Perfil (abaixo do Novo post) quando há talento.

| Rota | Etapa | Conteúdo |
|---|---|---|
| `/creator/escritorio` | B (completa em F) | Início: agenda de hoje, próximas entregas, tarefas, oportunidades novas, campanhas em andamento, conteúdos aguardando publicação (herói ligado: mesma contagem do `/creator`), avisos da agência, métricas declaradas com fonte e data |
| `/creator/escritorio/consentimento` | B | termo de uso comercial (versão), aceitar/revogar |
| `/creator/escritorio/media-kit` | B | editor (texto, campos visíveis com `Switch`), redes declaradas ("dados de … · declarado por … em …"), gráficos de gênero e faixa etária (`MiniBarChart`), prévia igual ao `/kit`, gerar link (validade 7/30/90 dias; na agência demo, desligado), copiar, revogar, contador de visitas |
| `/creator/escritorio/oportunidades` e `/[id]` | C (aceite do contrato na D) | lista e detalhe (`talent_opportunities()`): marca, briefing para creators (`talent_brief`), entregáveis, período, prazo, **seu cachê** (web, por `deal_talent_fees`; no app: "veja o valor no site", D14), aceitar / recusar com motivo / pedir conversa, conversa com a agência; na D, aceite do contrato |
| `/creator/escritorio/tarefas` | D | tarefas `side = 'talent'`; passos 4 (roteiro) e 7 com anexo (arquivo ou link); retorno da marca no passo 4 (`feedback`); botão "Sugerir uma campanha" (`talent_suggest_campaign`: marca opcional + ideia) |
| `/creator/escritorio/agenda` (+ `/ics`) | E | dia/semana/lista; criar evento próprio (privado ou equipe) |
| `/creator/escritorio/documentos` | F | documentos compartilhados com ele (só leitura) |
| `/creator/escritorio/notificacoes` | A/B | caixa completa |

### 6.5 Público e comum

| Rota | Etapa | Conteúdo |
|---|---|---|
| `/kit/[token]` (grupo `(focus)`) | B | media kit sem login: nome, campos marcados, cada métrica com "dados de DD/MM/AAAA · declarado por {creator ou agência} em DD/MM/AAAA", gráficos de audiência quando `audience` está marcado; sem token válido (ou talento de agência demo) → "Este link não está disponível" com `notFound()` (404) decidido **antes** do streaming (sem `loading.tsx` na rota); `robots: noindex, nofollow`; nunca valores; visita contada só sem o cookie `uh-e2e=1` |
| `NotificationBell` (cliente) | A | contagem inicial do servidor; Realtime em `inbox_notifications` com `filter: user_id=eq.<uid>` + consulta de reserva a cada 30 s (padrão de `OutbidAlerts`); `Sheet` com as 20 últimas (server action), cada item é `<a href={link}>`; "Marcar todas como lidas"; dispara `uh:inbox` com o `kind` de cada aviso novo (6.1) |
| `/admin/agencia` | A | AG real (`is_platform_admin`; a conta `admin@demo` vê "Indisponível para conta de demonstração"): agências (criar/editar), membros, convites, transferência de marca entre agências (D18); "Ambiente de demonstração" (seção 8); link para `/agencia` |

### 6.6 Mudanças em telas existentes

`src/lib/native-app/surface.ts` (`BLOCKED_PREFIXES` + `/agencia`, `/marca`); `src/middleware.ts`
(`PROTECTED_PREFIXES` + `/agencia`, `/marca`; `/kit` fica público); `src/app/robots.ts` (+ `/agencia`,
`/marca`, `/kit`); `src/lib/settings/sections.ts` (portais `agency`, `brand`; atalho do talento sem página →
escritório); Perfil (card Escritório, selos, "Talento" para o escopo `talent`); `/creator` (`page.tsx` e
`PORTAL_LINKS.creator` para o talento sem página, 6.4).

**Preferências de notificação** (`/profile/notifications`, tipo "Avisos do escritório" = `office_updates`):
`src/components/me/notifications/constants.ts` (`NOTIFICATION_TYPES`, `DEFAULT_NOTIFICATION_PREFERENCES`),
`schema.ts` (`office_updates: z.boolean()` no `.strict()`) e `src/app/(app)/profile/actions.ts`: o fallback de
`PGRST204` hoje só tira `auction_outbid`; passa a tirar **toda chave nova citada na mensagem**
(`auction_outbid`, `office_updates`) e tentar de novo, para a tela não quebrar antes de a 0064 chegar ao remoto.

**Convites:** `/invite` (textos dos papéis novos; no app das lojas, depois do aceite de `agency`/`brand`, o botão
diz "Abra no navegador"; no convite de agência e de marca, a nota "os avisos ficam no sino do portal", D8);
`InviteAcceptCard` + `acceptInvitation` (`src/app/admin/ops-actions.ts`) leem `role` **e** `scope_type`
(talento → `successTalent`/`goOffice`); **`/admin/invitations`** (`src/app/admin/invitations/page.tsx`): rótulos
de papel para `agency`, `brand` e talento (`role = 'creator'` com `talent_id`), links de destino
(`/admin/agencia`, `/admin/marcas/<id>`, `/agencia/casting/<id>`) e leitura tolerante: a consulta com as colunas
novas (`agency_id, brand_id, talent_id, member_role`) cai para a de hoje se der erro de schema (padrão `withPro`);
`/admin/users/[id]` (escopos novos); `PORTAL_LINKS.admin` + `agency`.

---

## 7. Server actions, validações, notificações e cron

### 7.1 Server actions

Padrão do `/profissional/actions.ts`: `"use server"`, zod de forma (`src/lib/agency/schemas.ts`,
`src/lib/brand-portal/schemas.ts`, `src/lib/talent/schemas.ts`), cliente do usuário, RPC, `revalidatePath`
do portal (`'layout'`), erro traduzido por lista de códigos (`agency.errors.<code>`), resultado
`{ ok: true; message } | { ok: false; error }`. O papel é conferido pela RPC; a action confere só sessão,
**exceto** as de valor, que chamam `requireAgency('admin')` antes (e a de proposta usa o service role, 5.6).

| Arquivo | Actions |
|---|---|
| `src/app/agencia/equipe/actions.ts` | `inviteMemberAction`, `setMemberRoleAction`, `removeMemberAction`, `revokeInvitationAction` |
| `src/app/agencia/marcas/actions.ts` | `createBrandAction`, `linkBrandAction`, `inviteBrandMemberAction` |
| `src/app/agencia/configuracoes/actions.ts` | `saveSettingsAction`, `saveSegmentAction`, `saveCommissionRuleAction` (ADM), `clearCommissionRuleAction` (ADM) |
| `src/app/agencia/casting/actions.ts` | `saveTalentAction`, `setSegmentsAction`, `linkCreatorAction`, `archiveTalentAction`, `setCatalogAction`, `inviteTalentAction`, `saveSocialAction`, `deleteSocialAction`, `saveKitAction`, `shareKitAction`, `revokeKitAction` |
| `src/app/agencia/negocios/actions.ts` | C: `createDealAction`, `updateDealAction`, `moveDealAction`, `setTeamAction`, `setShortlistAction`, `addActivityAction`, `postMessageAction`, `saveDeliverablesAction`, `consultAction`, `recordResponseAction`, `removeTalentAction`; D: `requestAcceptanceAction`, `recordAcceptanceAction`, `confirmContractAction`, `decideDeliverableAction`, `closeDeliverableAction`, `decideScriptAction` (GES+ registrando); F: `publishSponsorshipAction` |
| `src/app/agencia/negocios/[id]/proposta/actions.ts` | `setFeeAction`, `commitProposalAction`, `withdrawProposalAction`, `reopenProposalAction`, `recordDecisionAction` (todas ADM) |
| `src/app/agencia/tarefas/actions.ts`, `agenda/actions.ts`, `calendario-comercial/actions.ts`, `financeiro/actions.ts` | tarefas; eventos; datas; `setEntryStatusAction` (ADM) |
| `src/app/marca/actions.ts` | `saveRequestAction` (rascunho; aceita `commercialDateId` na E), `submitRequestAction`, `decideProposalAction` (códigos + nota), `acceptContractAction`, `decideDeliverableAction`, `decideScriptAction`, `postMessageAction`, `inviteStaffAction`, `removeMemberAction`, `saveEventAction`, `searchTalentsAction` |
| `src/app/creator/escritorio/actions.ts` | B: `setConsentAction`, `saveSocialAction`, `saveKitAction`, `shareKitAction`, `revokeKitAction`; C: `respondOpportunityAction`, `postMessageAction`; D: `acceptContractAction`, `submitDeliverableAction`, `publishDeliverableAction`, `proofDeliverableAction`, `setTaskStatusAction`, `suggestCampaignAction`; E: `saveEventAction` |
| `src/lib/inbox/actions.ts` | `listInboxAction({ limit })`, `markReadAction({ ids? })` |
| `src/lib/documents/actions.ts` | `reserveDocumentAction` (devolve `path` para o envio direto ao Storage pelo cliente), `confirmDocumentAction`, `signedUrlAction({ id })` (60 s, cliente do usuário), `archiveDocumentAction`, `setSharingAction` |
| `src/app/admin/agencia/actions.ts` | `saveAgencyAction`, `inviteAgencyMemberAction`, `transferBrandAction` (D18), `createAgencyDemoAction` (seção 8) — todas exigem AG real (`is_platform_admin`; no servidor, `app_metadata.ultra_hero_demo` ≠ true) |

Validações de forma que a action faz antes da RPC: uuid (`z.uuid()`), e-mail (`z.email().max(254)`),
datas ISO, URLs `https://` (mesma regex de `brand_https_url_ok`), textos com `trim` e limites iguais aos
checks, centavos inteiros (o formulário recebe "1.234,56" e converte com `parseBrlToCents`, testado),
`visible_fields` ⊂ `KIT_FIELDS`, `audienceSchema`.

### 7.2 Notificações

**Funções internas (0064):**

```sql
-- grava um aviso (dedupe opcional) e, se o tipo empurra e o link é do escritório, enfileira o push
create or replace function public.inbox_notify(p_user uuid, p_kind text, p_link text, p_params jsonb default '{}'::jsonb,
  p_agency uuid default null, p_entity_type text default null, p_entity_id uuid default null, p_dedupe text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_user is null then return null; end if;
  insert into public.inbox_notifications (user_id, kind, params, link, agency_id, entity_type, entity_id, dedupe_key)
  values (p_user, p_kind, coalesce(p_params, '{}'::jsonb), p_link, p_agency, p_entity_type, p_entity_id, p_dedupe)
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;
  if v_id is not null and public.inbox_kind_pushes(p_kind) and p_link like '/creator/escritorio%' then
    perform public.push_enqueue(p_user, 'office', 'office:' || v_id::text, jsonb_build_object('notification_id', v_id), now());
  end if;
  return v_id;
end $$;
revoke execute on function public.inbox_notify(uuid, text, text, jsonb, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.inbox_notify(uuid, text, text, jsonb, uuid, text, uuid, text) to service_role;
-- inbox_notify_agency(p_agency, p_min_role, ...) e inbox_notify_brand(p_brand, p_owner_only, ...): laço sobre os membros ativos
```

`inbox_kind_pushes(p_kind)` (imutável) é verdadeira só para: `message_received`, `opportunity_received`,
`opportunity_updated`, `contract_acceptance_requested`, `contract_confirmed`, `task_assigned`,
`deliverable_decided`, `calendar_event_added`, `task_overdue`, `payout_updated` (e o push ainda exige link do
escritório). `push_allowed(p_user, 'office')` = `channel_push and office_updates` (opt-in, nasce desligado); `push_enqueue`
já confere consentimento e aparelho. `src/lib/push/dispatch.ts` ganha o ramo `office`: lê a linha de
`inbox_notifications` (service role), descarta se já foi lida, monta título e corpo de `push.json`
(`office.<kind>.title|body`, com os `params`) e usa `link` como URL. `PushKind` + `office`; `consent.ts` +
`office: "office_updates"`.

| `kind` | Etapa | Quem recebe | `link` | Push |
|---|---|---|---|---|
| `member_joined` | A | ADMs | `/agencia/equipe` | não |
| `brand_member_joined` | A | MO da marca; GES+ da agência | `/marca/equipe`; `/agencia/marcas/<brand>` | não |
| `talent_consent_given` / `talent_consent_revoked` | B | gestor responsável (senão GES+) | `/agencia/casting/<talent>` | não |
| `briefing_received` | C | GES+ e responsável da marca | `/agencia/negocios/<deal>` | não |
| `deal_assigned` | C | novo responsável / novos da equipe | `/agencia/negocios/<deal>` | não |
| `campaign_status_changed` | C | MO/MS | `/marca/campanhas/<request>` | não |
| `proposal_received` | C | MO/MS | `/marca/campanhas/<request>` | não |
| `proposal_decided` | C (expiração na F) | ADMs + responsável | `/agencia/negocios/<deal>/proposta` (ADM) ou `/agencia/negocios/<deal>` | não |
| `message_received` | C | a outra parte | portal de quem recebe | só creator |
| `opportunity_received` | C | creator (`talent_user_id`) | `/creator/escritorio/oportunidades/<deal_talent>` | sim |
| `opportunity_updated` | C | creator | idem | sim |
| `opportunity_answered` | C | responsável + GES+ | `/agencia/negocios/<deal>/creators` | não |
| `talent_suggestion` | D | gestor responsável (senão GES+) | `/agencia/casting/<talent>` | não |
| `contract_acceptance_requested` | D | MO; creators propostos | `/marca/campanhas/<request>`; oportunidade | creator sim |
| `contract_confirmed` | D | marca, creators, responsável | portal de cada um | creator sim |
| `task_assigned` | D | responsável da tarefa | `/agencia/tarefas` ou `/creator/escritorio/tarefas` | creator sim |
| `deliverable_submitted` | D | MO/MS + responsável | `/marca/campanhas/<request>#entregas`; `/agencia/negocios/<deal>/entregas` | não |
| `deliverable_decided` | D | creator + responsável | oportunidade; entregas | creator sim |
| `deliverable_published` | D | MO/MS + responsável | campanha; entregas | não |
| `calendar_event_added` | E | creator | `/creator/escritorio/agenda` | sim |
| `commercial_date_published` | E | MO/MS das marcas vinculadas | `/marca/calendario` | não |
| `relationship_alert` | F | gestor responsável (senão GES+) | `/agencia/casting/<talent>` | não |
| `task_overdue` | F | responsável da tarefa (senão o do negócio) | tarefas do portal | creator sim |
| `payout_updated` | F | creator | oportunidade | sim |

`params` só leva nomes, datas e códigos (`brand`, `deal`, `talent`, `step`, `date`, `status`, `reasons`), nunca
valor (check da tabela). Texto: `messages/<locale>/inbox.json` → `kinds.<kind>.title|body` com os mesmos `params`.
São **25** tipos (os 24 da primeira versão + `talent_suggestion`). Destinatário "creator" é sempre
`talent_user_id(talent)`: conta demo nunca recebe aviso de agência real.

### 7.3 Envio de push depois do evento

As server actions que podem enfileirar push (creator como destino) chamam
`after(async () => { await drainPushOutbox(createAdminClient()) })` só quando `hasAdminClient()` (mesmo padrão
dos posts). O cron diário do push (`/api/cron/push`) segue como rede de segurança.

### 7.4 Alerta de relacionamento (cron)

`vercel.json` ganha `{ "path": "/api/cron/agency", "schedule": "50 10 * * *" }` (07:50 em Brasília; o plano
Hobby só permite cron diário). A rota `src/app/api/cron/agency/route.ts` usa `runCronJob(request, "agency", ...)`
(`authorizeCron` com `CRON_SECRET`, como as outras) e chama, em ordem: `agency_relationship_scan`,
`inbox_cleanup`, limpeza de documentos pendentes (`documents_orphans` + `storage.remove` + exclusão da linha
pelo service role), `drainPushOutbox`. Devolve as contagens. **Sem a migração no remoto:** cada passo trata
`PGRST202`, `42883`, `PGRST205` e `42P01` como `{ <passo>_skipped: "not_migrated" }` (padrão de
`src/app/api/cron/_lib/recipe-orphans.ts`) e segue para o próximo; o job não devolve 500 enquanto a 0069 não chega.

### 7.5 `agency_relationship_scan()` (service role)

Para cada agência `active`:
1. **Creator sem contato:** talentos `commercial_status = 'active'`, não arquivados, com
   `coalesce(last_contact_at, created_at) < now() - relationship_alert_days`. Aviso `relationship_alert` ao
   `manager_id` (ou a todos GES+), `dedupe_key = 'rel:' || talent_id || ':' || to_char(now(), 'IYYY-IW')`
   (no máximo um por semana).
2. **Tarefa vencida:** `status in ('todo','doing','blocked') and due_at < now()`. Aviso `task_overdue` ao
   responsável (ou ao responsável do negócio), `dedupe_key = 'overdue:' || task_id || ':' || current_date`.
3. **Proposta vencida:** `deal_proposals.status = 'sent' and valid_until < current_date` (fuso da agência) →
   `expired`; aviso `proposal_decided` (`params.status = 'expired'`) aos ADMs e ao responsável, `dedupe_key =
   'expired:' || proposal_id`. O negócio fica em `proposal_sent` até o ADM retirar ou enviar nova versão.
4. Devolve `{agencies, relationship_alerts, overdue_alerts, expired_proposals}` e audita
   `agency.relationship_scan` (só contagens).

### 7.6 Datas comerciais semeadas (`agency_seed_defaults`, 0068; rascunho na agência real, publicadas na demo)

| Data | Título | Categoria |
|---|---|---|
| 27/11/2026 | Black Friday | retail |
| 30/11/2026 | Cyber Monday | retail |
| 25/12/2026 | Natal | holiday |
| 31/12/2026 | Réveillon | holiday |
| 05/01/2027 a 28/02/2027 | Verão e volta às aulas | seasonal |
| 06/02/2027 a 09/02/2027 | Carnaval | culture |
| 15/03/2027 | Dia do Consumidor | retail |
| 28/03/2027 | Páscoa | holiday |
| 09/05/2027 | Dia das Mães | retail |
| 12/06/2027 | Dia dos Namorados | retail |
| 08/08/2027 | Dia dos Pais | retail |
| 15/09/2027 | Dia do Cliente | retail |
| 12/10/2027 | Dia das Crianças | retail |
| 26/11/2027 | Black Friday | retail |

Idempotente por `(agency_id, title, starts_on)` (índice único parcial criado na 0068 para o seed).

---

## 8. Contas de demonstração

### 8.1 Contas novas

| `kind` | E-mail | Papel | Vê |
|---|---|---|---|
| `agency` | `agencia@demo.ultrahero.app` | ADM da agência de demonstração | tudo da agência demo, inclusive valores simulados |
| `agencyStaff` | `colaborador@demo.ultrahero.app` | COL da agência de demonstração | tarefas, agenda, casting (consulta) e os negócios em que é responsável; nenhum valor |
| `brand` | `marca@demo.ultrahero.app` | MO da marca fictícia "Marca Exemplo" | campanhas, propostas (total), aprovações |
| `talent` (Etapa B) | `talento@demo.ultrahero.app` | talento **sem página pública** "Talento Exemplo" da agência demo (`talent_profiles.user_id`) | escritório: oportunidades, cachê (web), tarefas, agenda, media kit (sem link público) |

A `heroi@demo.ultrahero.app` **não muda**: ela é a página real do Érick Jacquin (0044), já tem herói (o E2E do
Perfil confere o Novo post) e por isso não pode virar talento sem página (D2/2.2: login próprio só de talento sem
página). Também não entra na agência demo (nenhum herói real em negócio inventado) e, se a agência real colocar o
Érick no casting, a `heroi@` continua sem acesso a esse talento (`talent_user_id` ignora conta demo em agência real, D6).
O escritório de demonstração é o da `talento@`.

### 8.2 Como são criadas (padrão de `createProfessionalDemoLogin`)

`createAgencyDemoAction()` em `src/app/admin/agencia/actions.ts`:

1. `admin()` (AG) **e conta não demo** (`app_metadata.ultra_hero_demo` ≠ true; a `admin@demo` recebe
   `forbidden`) + `demoPassword()` + `hasAdminClient()`; sem algum deles → `forbidden` (a senha nunca sai
   do servidor, só existe em `DEMO_ACCOUNTS_PASSWORD`).
2. Cria (ou acha) a agência `slug = 'agencia-demo'`, `is_demo = true`, pelo `admin_agency_save` com o cliente
   do AG (auditado).
3. Para cada e-mail da tabela 8.1: `client.auth.admin.createUser({ email, password, email_confirm: true,
   app_metadata: { ultra_hero_demo: true }, user_metadata: { full_name } })`. Se a conta já existe, o erro de
   "já cadastrado" é ignorado e o passo segue (diferente de `createProfessionalDemoLogin`, que devolve erro). O id
   **não** é buscado no TS (nenhum código do projeto usa `auth.admin.listUsers`, e a tela de usuários usa a RPC
   `admin_list_users`): quem resolve e-mail → id é a própria `agency_demo_seed`, que lê `auth.users` como service
   role. Nenhuma senha em log ou auditoria.
4. Chama `agency_demo_seed(p_agency, p_emails, p_actor)` com o **service role**
   (`p_emails = {admin, staff, brand_owner, talent}` com os e-mails de 8.1; a função recusa e-mail sem conta ou
   sem `ultra_hero_demo = true`, `not_demo_account`): memberships e `role_assignments` (sem convite), marca
   fictícia (`brands.status = 'inactive'`, `brands.is_demo = false`, slug `exemplo-marca`, D6; o caráter
   fictício fica em `agency_brands.is_demo` e `agencies.is_demo`) e, a partir da etapa em que existem, talentos
   fictícios **sem página** (6, entre eles o da `talento@`, com redes declaradas `as_of = current_date` e
   consentimento fictício gravado pelo seed), segmentos, negócios em etapas variadas (um em `consultation`, um
   em `proposal_sent`, um em `production` com tarefas e entregáveis), datas comerciais publicadas, eventos e
   lançamentos. Ids por `public.seed_uuid('demo:<chave>')` + `on conflict do nothing`: reexecutar não duplica
   e **restaura** o que visitantes mudaram nos dados de exemplo (papéis e vínculos voltam ao seed).
5. Audita `demo_account.create` por conta (como o profissional) e `demo.agency_seed`.

**Por que não por migração (D6):** a 0063 faz `delete from brands where is_demo` e o S72 faz
`delete from brands where not is_demo`; uma marca demo com negócios (FK `restrict`) quebraria a reaplicação
da 0063 e o S72/S73. A agência demo separada, somada a `is_platform_admin()`, à recusa de conta demo no aceite
de convite real e a `talent_user_id()`, impede que as contas demo vejam ou operem dados reais.

**Agência demo é pública** (as contas ficam no painel de login): por isso ela é travada (D6, `demo_locked`):
equipe e membros da marca fixos, sem vincular herói ou marca existentes (nenhum herói real, nenhuma marca real),
sem consentimento registrado nem link público de kit, marcas novas só com slug `exemplo-*` (até 10). O que o
visitante pode mexer (negócios, tarefas, mensagens, regras de comissão de exemplo) fica dentro da agência demo e
o botão do admin restaura.

Nomes do seed: claramente fictícios ("Marca Exemplo", "Talento Exemplo", "Bia Treinos (exemplo)"). Nunca
herói real, nunca marca real (Nike etc.) em negócio, cachê ou proposta inventados.

### 8.3 Painel de demonstração

- `src/lib/demo/accounts.ts`: `DEMO_ACCOUNTS` + `{ kind: "agency", email: "agencia@...", home: "/personalities" }`,
  `agencyStaff`, `brand` e (Etapa B) `talent` (mesma regra de hoje: todos entram na aba Hero; os portais ficam a
  um toque em `/configuracoes`). Constantes `AGENCY_DEMO_EMAIL`, `AGENCY_STAFF_DEMO_EMAIL`, `BRAND_DEMO_EMAIL`,
  `TALENT_DEMO_EMAIL`.
- `readyDemoAccounts(accounts, ready)` com `ready: { professional: boolean; agency?: boolean; agencyStaff?: boolean;
  brand?: boolean; talent?: boolean }`: as flags novas são **opcionais e falsas por padrão** (as chamadas de hoje
  continuam compilando e dando o mesmo resultado). Cada conta nova só aparece quando `isAgencyDemoReady()`
  (service role, `cache`) acha a agência `is_demo` com ADM ativo, COL ativo, a marca demo com MO ativo e (B) o
  talento da `talento@`. Sem a 0064 → `false` (consulta trata tabela ausente).
- `DemoAccess`: ícones `Building2` (agency), `BriefcaseBusiness` (agencyStaff), `BadgeCheck` (brand), `Sparkles`
  (talent); textos `demo.kinds.<kind>.label|description`. Continua escondido no app das lojas.
- **Testes que contam o painel:** `tests/e2e/demo-access.spec.ts` deixa de esperar `hasPro ? 5 : 4` e passa a
  esperar 4 + o número de `[data-demo-kind]` opcionais presentes (`professional`, `agency`, `agencyStaff`,
  `brand`, `talent`), conferindo cada um que aparece; `tests/unit/professionals.test.ts` (e `seller-ops.test.ts`,
  se tocar na lista) ganha os casos com as flags novas ligadas e desligadas, mantendo
  `["admin","creator","premium","free"]` quando todas são falsas.
- `tests/e2e/helpers/login.ts`: `DemoKind` + `agency | agencyStaff | brand | talent`; `DEMO_HOME` e `DEMO_PATH`
  ganham as chaves novas (`/agencia`, `/agencia`, `/marca`, `/creator/escritorio`); `loginAs` chama
  `test.skip(true, ...)` quando `panel.locator('[data-demo-kind="<kind>"]').count() === 0` (conta ainda não
  criada pelo admin), em vez de esperar o clique estourar o tempo.
- `src/lib/wearables/demo.ts`: sem mudança (conta demo fora da lista usa a persona do papel; a `talento@` tem
  papel `creator` e ganha a persona `creator`, aceito).
- Admin: `/admin/agencia`, card "Ambiente de demonstração" com o botão, o estado de cada conta (pronta / falta)
  e o aviso de que o botão é reexecutável a cada etapa nova e restaura os dados de exemplo.

---

## 9. i18n

### 9.1 Namespaces novos (os três idiomas, mesmas chaves; `npm run messages:check`)

| Arquivo | Conteúdo |
|---|---|
| `messages/*/agency.json` | portal da agência: `meta`, `dashboard`, `team`, `brands`, `settings`, `casting`, `pipeline`, `deal`, `proposal`, `commission` (nomes dos 6 tipos, campos, exemplos, issues), `tasks`, `agenda`, `commercialDates`, `finance`, `history`, `errors.<codigo>`, `values.*` (rótulos de dinheiro e o selo "Registro interno, sem cobrança real") |
| `messages/*/brandPortal.json` | portal da marca: `meta`, `dashboard`, `team`, `campaigns`, `briefing` (5 passos), `proposal`, `contract`, `approvals`, `search` (critérios, "dados insuficientes"), `calendar`, `errors` |
| `messages/*/talent.json` | escritório: `meta`, `home`, `consent`, `opportunities`, `tasks`, `agenda`, `documents`, `errors`, `values.*` (cachê, repasse: só web) |
| `messages/*/mediaKit.json` | editor e página pública `/kit` (campos, "declarado em {date}", "não informado", link indisponível) |
| `messages/*/inbox.json` | sino, página, `kinds.<kind>.title`/`body` (25 tipos), "marcar todas como lidas" |
| `messages/*/commercial.json` | vocabulário comum aos três portais: `stages.<13>`, `brandStatus.<7>`, `outcomes`, `deliverableKinds`, `networks`, `objectives`, `taskSteps.<1..12>`, `taskStatus`, `eventKinds`, `dateCategories`, `ageBands`, `metricSource` |

**Arquivos existentes que ganham chaves:** `nav.json` (`portals.agency|brand`, `portalDescription.agency|brand`,
`agency.<link>`, `brand.<link>`, `admin.agency`, `office.<aba>`), `demo.json` (`kinds.agency|agencyStaff|brand`),
`me.json` (`profile.roles.agency|brand|talent`, `profile.portals.agency|brand` + `hints`, `profile.office`,
`notifications.types.office_updates`), `push.json` (`office.<kind>.title|body`, só tipos com push),
`adminOps.json` (`invite.grantAgency|grantBrand|grantTalent`, `invite.successAgency|successBrand|successTalent`,
`invite.goAgency|goBrand|goOffice`, `invite.openInBrowser`, `invite.inboxOnlyNote`,
`invitations.roleAgency|roleBrand|roleTalent`), `nav.json` (`creator.office`), `creator.json`
(`post.talentOnly`), `adminCommon.json` ou namespace próprio `adminAgency.json` (tela `/admin/agencia`, inclusive
"Indisponível para conta de demonstração"). Erros novos em `agency.errors`/`brandPortal.errors`/`talent.errors`:
`demo_locked`, `demo_account_forbidden`, `demo_brand`, `demo_limit`, `brand_linked_elsewhere`,
`brand_linked_to_agency`, `brand_has_members`, `brand_has_documents`, `proposal_locked`, `proposal_expired`,
`fee_missing`, `talent_has_login`, `adjustment_note_required`, `rate_limited`, `not_demo_account`.

### 9.2 Cuidados com ICU e com o app das lojas

- **Mesmos tokens nos três idiomas** (o `messages:check` compara `{nome}` seguidos de `,` ou `}`; o teste do
  app compara também tags). Nunca traduzir o nome do token.
- Plural sempre com `one` e `other` (e `=0` quando fizer sentido): `{count, plural, =0 {Nenhuma tarefa} one {# tarefa} other {# tarefas}}`.
- **Dinheiro e data nunca formatados dentro do ICU:** o código passa `{amount}` e `{date}` já formatados por
  `formatCurrency`/`formatPlainDate` (`src/i18n/format.ts`), para o check de tokens e o arredondamento ficarem previsíveis.
- Apóstrofo no ICU escapa o que vem depois; em en/es escrever `''` quando houver `'` antes de `{`.
- Nome de segmento, título de data comercial e título de tarefa avulsa são **dados** (não i18n); títulos das
  12 tarefas do modelo são i18n (`commercial.taskSteps.<n>`).
- **App das lojas** (`tests/unit/native-messages.test.ts`): `/agencia` e `/marca` não existem no app, então
  `NOT_IN_APP` ganha `"agency."`, `"brandPortal."`, `"talent.values."`, `"adminAgency."`. Os namespaces que
  aparecem no app (`talent`, `inbox`, `mediaKit`, `commercial`, `push`) **não usam** "demonstração",
  "simulado", "fictício", "de teste"; se precisarem, a chave ganha sobreposição em `messages-native/*.json`
  (mesmos tokens, nos três idiomas). Textos de valor do creator moram em `talent.values.*` (só web). Por isso o
  passo 12 é "Encerramento e repasse", sem "(simulado)" (4.4), e o aviso "link público desligado na agência demo"
  do media kit fica em `talent.values.*`/`agency.*`, fora dos namespaces do app.

---

## 10. Plano de testes

### 10.1 Como rodar

`LOCAL_DB_NAME=uh_main_local npm run db:local:reset` → **transação única** da migração nova num banco
descartável migrado até a anterior (`psql -1 -v ON_ERROR_STOP=1 -f supabase/migrations/006N_*.sql`, 0.2 item 2) →
`LOCAL_DB_NAME=uh_main_test npm run test:rls` → **atualizar `src/lib/supabase/database.types.ts` à mão** a partir
do DDL da etapa (como vem sendo feito: o `npm run db:types` usa o banco fixo `ultra_hero_local` e o Supabase CLI,
que não está instalado aqui; parametrizá-lo por `LOCAL_DB_NAME` fica como melhoria opcional) → `npm run check`
(tsc, eslint, messages, vitest) → `npm run build` → `npm run test:e2e` (remoto, só leitura). Os cenários novos
entram **depois do S73**, um por etapa, cada um **começando com `\ir` da própria migração** (0.2 item 12), e só
usam objetos da própria migração e das anteriores. Contas de teste novas com o prefixo `74000000-0000-4000-8000-...`:

| Id (final) | Conta | Uso |
|---|---|---|
| `...0a1` | `ag-adm@test.local` | ADM da agência A |
| `...0a2` | `ag-ges@test.local` | GES da agência A |
| `...0a3` | `ag-col@test.local` | COL da agência A (dono de um negócio) |
| `...0a4` | `ag-col2@test.local` | COL da agência A (sem negócio) |
| `...0b1` | `agb-adm@test.local` | ADM da agência B (isolamento entre agências) |
| `...0c1` | `marca-x-dono@test.local` | MO da marca X |
| `...0c2` | `marca-x-equipe@test.local` | MS da marca X |
| `...0c3` | `marca-y-dono@test.local` | MO da marca Y (isolamento entre marcas) |
| `...0d1` | `talento-1@test.local` | talento sem página pública com login |
| `...0e1` | `demo-admin@test.local` | papel `admin` global + `raw_app_meta_data.ultra_hero_demo = true` (espelho da `admin@demo`) |
| `...0e2` | `demo-hero@test.local` | conta demo dona de um herói (espelho da `heroi@`) |
| `...0e3` | `demo-adm@test.local` | conta demo, ADM da agência demo D (espelho da `agencia@`) |
| `10000000-...-0004` | `creator1@test.local` (já existe) | herói ligado a um talento |
| `10000000-...-0002` | `consumer1@test.local` (já existe) | consumidor |

Agências (A e B reais, D demo), marcas e talentos dos cenários são criados como `tests.su()` no começo do S74
(com `seed_uuid('s74:...')`) e reaproveitados pelos cenários seguintes; tudo some no `rollback` final.
Regra de todos os cenários: **cada RPC que recebe `p_id` tem um caso negativo com o id de outra marca, agência
ou talento** (D19), e cada RPC de escrita da agência tem um caso com a agência demo (`demo_locked` onde a D6 trava).

### 10.2 Cenários RLS por etapa (a partir do S74)

**S74 · Fundação (0064)** — começa com `\ir ../migrations/0064_gestao_fundacao.sql`
- `role_assignments_scope_type_check` aceita `agency`, `brand`, `talent`; `app_role` e `actor_type` têm os valores novos.
- Convite: ADM gera, aceite com e-mail certo cria membro + papel; e-mail errado → `invitation_email_mismatch`;
  segundo aceite → `invitation_invalid`; pessoa já ativa em outra agência → `agency_member_elsewhere`.
- GES e COL não convidam equipe (`forbidden`); ninguém rebaixa/remove o último ADM (`last_agency_admin`).
- **Revogação:** remover membro revoga os convites `pending` dele (o convite antigo dá `invitation_invalid`);
  convite novo revoga o anterior do mesmo e-mail; aceitar convite de `staff` sendo ADM ativo **não** rebaixa
  (o papel continua `admin`); o mesmo para o último dono da marca.
- Agência B não lê nada da agência A (`agencies`, `agency_members`, `agency_brands`, `documents`, `inbox`).
- Marca: `agency_brand_create` cria `brands.status = 'inactive'`; anon não a lê; MO da X lê X e não Y;
  MS não convida (`forbidden`); MO convida MS; MO da Y não lê `brand_members` da X.
- **D18:** a agência B tenta vincular a marca X (ativa na A) → `brand_linked_elsewhere`; ADM da B lê 0
  `brand_members` da X e `brand_member_remove`/`agency_invite_brand_member` na X → `forbidden`; o AG transfere
  (vínculo da A vira `archived`, o da B nasce ativo) e o índice único segura dois ativos.
- **D6 (conta demo):** `demo-admin` (papel admin + `ultra_hero_demo`) lê 0 linhas de `agencies` (real),
  `agency_members`, `agency_brands`, `brand_members`, `documents`, convites de agência/marca e da auditoria com
  `agency_id`; `agency_can` é falso para ela; `admin_agency_save` → `forbidden`. Conta demo aceitando convite da
  agência A → `demo_account_forbidden`. Na agência D (demo): `agency_invite_member`, `agency_member_set_role`,
  `agency_member_remove`, `agency_brand_link`, convites e remoção de membros da marca → `demo_locked`;
  `agency_brand_create` força slug `exemplo-*` e para em 10 (`demo_limit`).
- **D19:** `agency_invitation_revoke` com convite de outra agência → `not_found`; `agency_brand_link` com
  `p_account_manager` de outra agência → `not_found`.
- `admin_brand_delete` em marca vinculada → `brand_linked_to_agency`; com membro → `brand_has_members`; com
  documento → `brand_has_documents`; marca sem nada disso continua sendo apagada (S72 segue verde depois da
  reaplicação). `agency_brand_link` em marca `brands.is_demo` → `demo_brand`.
- `inbox_notify` não é executável por `authenticated`; cada um lê só os próprios avisos; `inbox_mark_read`
  só marca os próprios; `params` com `amount_cents` é recusado pelo check.
- Documentos: reserva por escopo; **GES e COL não reservam `kind = 'contract'`** (`forbidden`); só ADM; o GES que
  enviou um documento comum lê a reserva só enquanto `pending`; `restricted` invisível a GES/COL; contrato com
  `talent_id` e `share_brand` → check recusa; contrato sem `talent_id` e `share_talent` → check recusa;
  `scope_type = 'talent'` com `brand_id` → check recusa; envio ao Storage só com reserva própria `pending`
  (insert em `storage.objects` como no S27); marca lê só `share_brand` da própria marca.
- `push_allowed(user, 'office')` segue `office_updates`; `inbox_notify` com link do escritório e consentimento
  enfileira `office`; com link `/agencia` não enfileira.
- Funções novas: todas com `search_path`, nenhuma executável por anon; S14 = 17.

**S75 · Casting e media kit (0065)** — começa com `\ir ../migrations/0065_gestao_casting.sql`
- 10 segmentos por agência; reaplicar a 0065 não duplica.
- Herói em dois talentos → `creator_already_in_casting`; usuário com talento próprio + herói → `user_has_talent`.
- COL lê o casting e não grava (`forbidden`); MO/MS/CON leem 0 talentos; **CRE lê 0 linhas de
  `talent_profiles`** (nem `internal_notes`) e `talent_my_context()` devolve só a lista fechada de campos.
- **D6 / heroi@:** `demo-hero` (dono de herói, conta demo): a agência A liga o herói dele a um talento →
  `talent_user_id` nulo; `demo-hero` tem `my_talent_id()` nulo, lê 0 `deal_talent_fees`/`documents` desse talento
  e `talent_set_consent` → `forbidden`. Na agência D: `agency_talent_link_creator` → `demo_locked`;
  `agency_talent_record_consent` e `media_kit_share` → `demo_locked`; `media_kit_resolve` de talento da D → `null`.
- `agency_talent_record_consent` em talento com login → `talent_has_login`; com documento de outro talento → `not_found`.
- **D19:** `agency_talent_save` com `p_id` da agência B e `p_agency` da A → `not_found`; `talent_social_save` com
  `p_id` de outro talento → `not_found`.
- `talent_social_save` com `source = 'integration'` no `p_data` grava `declared` mesmo assim; `as_of` futuro → `invalid_input`.
- Sem consentimento: `media_kit_share` → `consent_required`, `agency_talent_set_catalog(true)` → `consent_required`.
- `media_kit_resolve` (como `service_role`): token certo devolve só os campos marcados (chave ausente quando o
  campo não está marcado), soma visita; revogado, vencido, consentimento revogado ou talento arquivado → `null`;
  token fora do formato → `null`. `has_function_privilege('anon'|'authenticated', ..., 'execute')` = falso.
- Convite de talento: aceite liga `user_id` e grava `('creator', 'talent', <talent>)`; `my_talent_id()` devolve o talento.

**S76 · Briefing, pipeline, consulta e comissão (0066)** — começa com `\ir ../migrations/0066_gestao_pipeline.sql`
- Marca envia briefing → negócio `briefing_received`, `campaign_requests.status = 'converted'`, aviso para GES+;
  rascunho de origem marca invisível para a agência.
- **Valores:** como GES e COL, `count(*)` = 0 em `campaign_request_budgets`, `commission_rules`,
  `deal_talent_fees`, `deal_proposals`, `deal_commission_snapshots`; `agency_fee_set` e `commission_rule_save`
  → `forbidden`; como ADM, as linhas aparecem. **A marca lê 0 orçamentos de pedido de origem agência** (inclusive
  com o negócio já `brand_visible`) e lê o próprio orçamento de origem marca.
- `campaign_requests.deliverables` com chave extra (`budget_cents`) ou `kind` fora da lista → check recusa.
- **D19:** `brand_request_save` da marca X com `p_id` de rascunho da Y → `not_found`; `commission_rule_save` de
  negócio com `p_target` de negócio da agência B → `not_found`; `agency_deliverables_save` com item `id` de outro
  negócio → `not_found`; `agency_request_save`, `agency_deal_update` e `deal_message_post` com ids de fora → `not_found`.
- **Marca e creators em análise:** com negócio de origem marca em `shortlist`/`consultation`, a marca lê 0
  `deliverables` e 0 `documents` de negócio; depois de `proposal_sent`, lê só os dos creators `proposed`;
  `brand_campaign_detail` não devolve campos do kit de creator sem consentimento vigente.
- **Consulta (D20):** `agency_consult_talents` com creator sem cachê → `fee_missing`; com cachê, talento recebe
  aviso (e push com consentimento e aparelho); CRE lê 0 linhas de `deal_talents` direto e
  `talent_opportunities()` não tem `reasons`; CRE lê o próprio cachê depois de consultado e nunca snapshot,
  proposta ou outro talento. Recusar sem nota → `note_required`; responder oportunidade de outro talento →
  `not_found`; `agency_record_talent_response` em talento com login → `talent_has_login`. Mudar o cachê depois de
  `interested` volta para `consulted` e avisa.
- Remover um creator (`removed`) ou ele recusar (`declined`) cancela os entregáveis dele; a contagem por tipo
  do commit passa a não contá-los (sem `deliverables_changed` eterno).
- COL: vê o negócio dele e não o do outro; move o dele para a frente; o do outro → `not_found`; porteira → `stage_gate`.
- `deal_stage_can` bate com a tabela 4.3 (laço sobre todos os pares de etapas para cada papel, contra uma tabela esperada).
- Marca X não vê negócio, proposta, mensagem nem entregável da marca Y; negócio de origem agência fica
  invisível à marca até a proposta (`brand_visible`).
- `agency_proposal_commit`: não executável por `authenticated`; como `service_role` com `p_actor` COL →
  `forbidden`; regra diferente da vigente → `rule_changed`; cachês diferentes → `fees_changed`; identidade
  quebrada → recusa; `adjustment > 0` sem aceite → `adjustment_not_accepted`; envio válido grava proposta +
  snapshot, move para `proposal_sent`, `brand_visible = true`, audita sem números.
- Marca lê a proposta enviada (só `total_cents`) e não lê o snapshot; MS pede ajuste (sem código → `invalid_input`;
  os códigos aparecem em `activities.reason_codes`, que o GES e o COL do negócio leem); MS aceitar → `forbidden`;
  MO aceita → `approved`; proposta com `valid_until` passado → `proposal_expired`.
- **Trava depois da proposta:** com proposta `sent` ou `accepted`, `agency_fee_set`, `agency_deliverables_save` e
  `agency_deal_talent_set_status('removed')` de `proposed` → `proposal_locked`; `agency_proposal_reopen` em
  `accepted` → proposta `superseded`, negócio `negotiation`, `proposed → interested`; aí o cachê volta a ser editável.
- Regra do negócio editável em `negotiation` sem proposta viva; com proposta `sent` → `proposal_locked`.
- `adjustment > 0` com aceite e sem justificativa → `adjustment_note_required`; com justificativa, o snapshot guarda
  `adjustment_note`.
- Trocar a regra depois do envio não muda `deal_commission_snapshots` (cópia).
- `commission_rule_valid`: os 6 tipos válidos passam; faixas fora de ordem, última com teto, `min > max`,
  tipo de entregável desconhecido, `bp > 10000` (menos markup), `per_deliverable` sem preço nenhum → check recusa.
- Busca da marca: só talentos com consentimento + `catalog_visible`, só campos de `visible_fields`; talento
  de agência não vinculada não aparece.

**S77 · Contratação, tarefas e entregas (0067)** — começa com `\ir ../migrations/0067_gestao_oportunidades.sql`
- Confirmar contrato sem aceite da marca → `acceptance_missing`; com todos os aceites → `production`, 12 tarefas
  (1 creator), datas ≥ A + 1 dia; segunda confirmação/geração não duplica; com 2 creators → 19 tarefas.
- Aceite registrado pela agência para talento com login → `talent_has_login`; aceite de proposta reaberta não vale
  para a nova (é por `proposal_id`).
- **Roteiro:** CRE conclui o passo 4 sem anexo → `attachment_required`; com anexo, o passo 5 recebe o anexo e a
  marca lê; MO pede ajuste sem feedback → `note_required`; com feedback, o passo 4 volta a `todo` com `feedback`;
  MO aprova → passo 5 `done`; `task_set_status` no passo 5 por CRE/COL → `forbidden`; marca Y no passo 5 da X → `not_found`.
- Entregável: CRE envia (passo 7 concluído), MO pede ajuste sem feedback → `note_required`, MO aprova (passo 8),
  CRE publica e comprova; marca Y não decide entregável da X (`not_found`).
- Tarefas: COL vê as dele e as dos negócios dele; marca vê só `side = 'brand'`; CRE só `side = 'talent'` dele;
  `task_save` com `assignee_id` de outra agência → `not_found`.
- `talent_suggest_campaign`: grava `activities` do talento e avisa o gestor; a 6ª no mesmo dia → `rate_limited`.

**S78 · Agenda e calendário comercial (0068)** — começa com `\ir ../migrations/0068_gestao_agenda.sql`
- Evento `private` do CRE: só ele lê; `team` do talento: agência lê; marca não.
- Evento da marca X invisível para a Y; `share_with_brand` sem negócio → check recusa.
- Data comercial em rascunho invisível à marca; publicada aparece só para marcas das agências vinculadas; aviso com dedupe.
- `brand_request_save` com `commercial_date_id` não publicado ou de agência não vinculada → `not_found`;
  com data publicada, o rascunho guarda o vínculo.
- **D19:** `commercial_date_save` com `p_id` da agência B → `not_found`; `calendar_event_save` com `deal_id` de outra
  agência → `not_found`.
- 14 datas semeadas por agência; reaplicar não duplica.

**S79 · Financeiro e relacionamento (0069)** — começa com `\ir ../migrations/0069_gestao_financeiro.sql`
- Confirmar contrato gera `brand_receivable`, `commission`, `adjustment` (só com A > 0) e um `talent_payout` por
  creator, com `brand_receivable = commission + adjustment + Σ talent_payout` e `simulated = true`;
  `simulated = false` → check recusa. Os repasses batem com `snapshot.inputs.talentFees` mesmo que alguém tente
  mudar `deal_talent_fees` depois (a trava recusa, e o lançamento não lê a tabela viva).
- `agency_relationship_scan` marca como `expired` a proposta `sent` vencida e avisa uma vez.
- `agency_publish_sponsorship`: negócio ganho com herói ligado e marca ativa cria `creator_brands` `sponsor`
  (segunda chamada não duplica); negócio aberto ou marca `inactive` → `invalid_stage`/`brand_inactive`.
- GES/COL leem 0 lançamentos; CRE lê só os próprios `talent_payout`; marca lê 0.
- `agency_entry_set_status`: `settled → planned` → `invalid_transition`; GES → `forbidden`; repasse liquidado avisa o creator.
- `agency_dashboard` como GES não tem a chave `finance`; como ADM tem.
- `agency_relationship_scan` (service role): talento sem contato há N+1 dias gera 1 aviso; rodar de novo na
  mesma semana não gera outro; atividade `call` atualiza `last_contact_at` e tira do alerta; tarefa vencida gera
  1 aviso por dia.
- `agency_finance_backfill` só preenche negócio sem lançamento.

**S80 · Estrutura do módulo (roda depois do S79; cresce a cada etapa)**
- Toda tabela nova tem PK só `id` (nenhuma PK composta) e RLS ligada; nenhuma tem grant de escrita para
  `authenticated`/`anon`; `anon` não tem `select` em nenhuma.
- **Nenhuma coluna de valor em tabela operacional:** em `agencies, agency_members, agency_brands, brand_members,
  talent_*, media_kits, campaign_requests, deals, deal_team, deal_talents, deliverables, activities, deal_messages,
  documents, deal_acceptances, tasks, calendar_events, commercial_dates, inbox_notifications` nenhuma coluna
  casa com `(_cents$|amount|fee|price|budget|commission)`.
- Nenhuma política nova avalia `auth.uid()`/`is_admin()`/`is_platform_admin()`/`my_creator_id()` por linha (regex do S14).
- Toda política `_select_admin` das tabelas novas usa `is_platform_admin()`, nunca `is_admin()` (consulta em
  `pg_policies.qual`).
- Lista do S14 = 17 e igual à de hoje; toda função nova com `search_path` fixo.
- S65 (PGRST201) segue verde; nenhuma unique composta só de FKs entre tabelas que já têm FK direta; **nenhum par
  de tabelas novas tem FK nos dois sentidos** e todo par com 2+ FKs entre si está listado na 0.2 item 3 (consulta
  em `pg_constraint`).
- Nenhuma política nem função `language sql` nova compara literal `'agency'`/`'brand'` com coluna `app_role`
  sem `::text` (0.2 item 2; consulta em `pg_policies` e `pg_proc.prosrc`).

### 10.3 Vitest (por etapa)

| Etapa | Arquivo | O que cobre |
|---|---|---|
| A | `tests/unit/agency-roles.test.ts` | matriz `can(role, action)` de `src/lib/agency/roles.ts` (espelho de 14.1): ADM tudo; GES sem `values.*`, `team.*`; COL só `deal.moveOwn`, sem shortlist/consulta/configuração |
| A | `tests/unit/native-app.test.ts` (existente; é onde mora o teste de `isBlockedInNativeApp`) | `/agencia`, `/agencia/x`, `/marca`, `/marca/x` bloqueados; `/marcas` e `/kit/abc` não |
| A | `tests/unit/settings-sections.test.ts` (existente) | portais `agency`/`brand` com `nativeHidden = true`; talento só com escopo `talent` → atalho do escritório |
| A | `tests/unit/professionals.test.ts` (existente; é onde mora o teste de `readyDemoAccounts`) | tipos novos; `readyDemoAccounts` esconde os não prontos; sem as flags novas, a lista continua `["admin","creator","premium","free"]` |
| A | `tests/unit/notifications.test.ts` (existente) | `office_updates` em `NOTIFICATION_TYPES` e no schema `.strict()`; o fallback de `PGRST204` tira `auction_outbid` e `office_updates` |
| A | `tests/unit/inbox-kinds.test.ts` | link por tipo; push só para links `/creator/escritorio` que `isBlockedInNativeApp` não bloqueia; lista de 25 tipos igual ao check SQL (fixture) |
| A | `tests/unit/push-message.test.ts` (existente) | ramo `office`, título/corpo sem valor, `url = link` |
| A | `tests/unit/missing-schema.test.ts` | `isMissingSchema` reconhece `42P01`, `42703`, `42883`, `PGRST200`, `PGRST202`, `PGRST204`, `PGRST205` e nada mais; `isMissingBrandsSchema` continua igual (reexporta) |
| B | `tests/unit/media-kit.test.ts` | filtro de campos visíveis; métrica nula vira "não informado"; rótulo "dados de … · declarado por … em …"; gráficos só com `audience` marcado; nenhuma chave de valor |
| B | `tests/unit/talent-schemas.test.ts` | `audienceSchema` (somas ≤ 10000, até 5 UFs), handle, URL https, `as_of` |
| C | **`tests/unit/agency-commission.test.ts`** | todos os vetores E1–E15; casos-limite de 5.5; `canCommit`; `suggestContractValue` (resultado mínimo e válido em 500 entradas por tipo, `{valueCents, adjustmentCents}`, E12 no buraco da faixa; `null` com 100%); Σ linhas = `commissionRuleCents` em todos os vetores e nas 1000 entradas; `resolveRule`; rejeições do zod (inclusive `unit_price_required`); `applyBp` com BigInt perto de `MAX_CENTS` |
| C | `tests/unit/agency-stages.test.ts` | `canMove(role, isOwner, from, to)` = tabela 4.3 (inclusive a reabertura); `brandStatus` das 13 etapas |
| C | `tests/unit/agency-match.test.ts` | vetores M1–M6 de 5.7; pesos somam 100; < 2 critérios avaliáveis além da disponibilidade → `score = null` ("dados insuficientes"); métrica com `as_of` > 12 meses não pontua ("desatualizado"); `matched` da busca da marca |
| C | `tests/unit/request-deliverables.test.ts` | `requestDeliverablesSchema` (`.strict()`): chave extra recusada; mesma lista do check SQL |
| C | `tests/unit/money-input.test.ts` | `parseBrlToCents`/`formatCents` ("1.234,56" ↔ 123456; vazio; negativo recusado) |
| D | `tests/unit/agency-task-template.test.ts` | 12 passos iguais à tabela 4.4 (passo 12 sem "simulado"); passos 4 e 7 exigem anexo; passo 5 só por decisão da marca; datas com âncoras e `greatest(A+1)`; 1 creator = 12, 3 creators = 26 |
| D | `tests/unit/agency-embeds.test.ts` | as strings de `select` das telas de entregas usam o hint `!deliverables_submission_doc_fk` / `!deliverables_proof_doc_fk` (nenhum embed `documents(` solto a partir de `deliverables`) |
| E | `tests/unit/agency-ics.test.ts` | CRLF, dobra em 75 octetos, escape de `,;\` e quebra de linha, `DTSTART;VALUE=DATE` em dia inteiro, UTC com `Z`, `UID` estável, nenhum campo de valor |
| F | `tests/unit/agency-dashboard.test.ts` | montagem dos KPIs a partir do JSON da RPC; chave `finance` ausente → bloco não renderiza |
| todas | `tests/unit/native-messages.test.ts` (existente) | prefixos novos em `NOT_IN_APP`; nenhuma palavra de demonstração em `talent`, `inbox`, `mediaKit`, `commercial` sem sobreposição |
| F | `tests/unit/agency-finance.test.ts` | montagem dos lançamentos a partir do snapshot: `commission` só da regra, `adjustment` separado com nota, repasses de `inputs.talentFees`; identidade com `adjustment` |

### 10.4 E2E (Playwright, banco remoto, **só leitura**)

Regras: cookie `uh-e2e=1`; nada de enviar formulário, aceitar, mover etapa, marcar lida, gerar link,
digitar em formulário com salvamento automático ou abrir `/kit` válido (contaria visita). Partes que dependem
da migração ou das contas demo se pulam com `test.skip` (padrão do `professionals.spec.ts`; `loginAs` pula
quando o botão do tipo ainda não está no painel, 8.3). Axe (`wcag2a/aa`, sem violação séria ou crítica) e
390 px (`page.setViewportSize({ width: 390, height: 844 })` + `scrollWidth ≤ 390`) em toda tela listada.
"Redireciona" sempre espera a URL com `timeout` (6.1).

| Etapa | Spec | Verifica |
|---|---|---|
| A | `gestao-portals.spec.ts` | visitante em `/agencia` e `/marca` → login; conta `free` → `/personalities` (`LOGIN_LANDING`; o `/` do `requireRole` é redirecionado pelo `next.config.ts`); UA do app em `/agencia` → fallback; ADM demo: Início, Equipe, menu com Financeiro só a partir da F; COL demo: menu sem Equipe/Configurações, `/agencia/equipe` redireciona; marca demo: `/marca`; conta `admin` demo em `/agencia` → "Indisponível para conta de demonstração"; sino visível com contagem; `/configuracoes` com atalhos Agência/Marca; axe + 390 px |
| A | `demo-access.spec.ts` (existente, atualizado) | painel com 4 fixos + os opcionais presentes (8.3) |
| B | `gestao-casting.spec.ts` | casting lista e ficha; "dados de … · declarado por … em …"; COL sem botões de edição; `/kit/token-invalido` → "Este link não está disponível", status 404, `meta robots noindex`; escritório (`talento@` demo): Início e Media kit (sem "Gerar link" na agência demo) |
| C | `gestao-pipeline.spec.ts` | pipeline em lista agrupada a 390 px e quadro no desktop; filtros por `<a>`; COL: detalhe do negócio **sem "R$"** no `main` e `/agencia/negocios/<id>/proposta` redireciona; ADM: proposta com valores e selo "sem cobrança real"; marca: campanhas e busca com filtros atendidos; escritório (`talento@`): oportunidades e detalhe (cachê na web; com UA do app, "veja o valor no site") |
| D | `gestao-oportunidades.spec.ts` | escritório: tarefas (roteiro e envio com anexo); marca: aprovações (roteiro e conteúdo); agência: tarefas, contrato (GES sem o PDF) e **entregas carregando sem `ErrorState`** (embeds com hint, 0.2 item 3) |
| E | `gestao-agenda.spec.ts` | agenda nos três portais, troca de vista por `<a>`; `GET .../ics` devolve `text/calendar` sem "R$"; calendário comercial; "Quero uma campanha nesta data" leva a `/marca/campanhas/nova?data=<id>` com título e período preenchidos (clicar só navega; o teste não digita, então nada é gravado) |
| F | `gestao-dashboards.spec.ts` | Início executivo (ADM com bloco financeiro; COL sem), Início da marca, Início do escritório; Financeiro do ADM; COL em `/agencia/financeiro` redireciona |

---

## 11. Riscos e decisões

| Risco | Mitigação / decisão |
|---|---|
| Valor vazar para GES/COL por coluna, resposta de RPC, aviso, `.ics`, auditoria visível ou documento | D3 (tabelas separadas, S76/S80), D16 (check em `params`), check de forma em `campaign_requests.deliverables`, `agency_dashboard` sem a chave `finance`, contrato `restricted` e só do ADM (D13), componentes de valor só em páginas ADM, E2E "sem R$" |
| **Contas demo públicas** (`admin@demo` com papel admin; `heroi@` = página real do Érick Jacquin; `agencia@` ADM da agência demo) verem ou operarem a agência real | D6: `is_platform_admin()` em todo `_select_admin`, em `agency_can` e nas RPCs do AG; restritivas em `invitations` e `admin_audit`; aceite de convite real recusa conta demo; `talent_user_id()` ignora conta demo em agência real; agência demo travada (`demo_locked`); S74/S75. Continua valendo a pendência registrada em `docs/decisions/hoje-relogio.md`: tirar o papel admin da conta compartilhada antes de abrir ao público |
| Uma agência ler ou mexer na equipe de marca de outra | D18 (um vínculo ativo por marca, índice único); `my_agency_brand_ids(true)` nas políticas de equipe da marca; S74 |
| IDOR: RPC com `p_id` de outra marca/agência/talento | D19 (escopo derivado da linha, `update ... and agency_id = v_agency`); um cenário negativo por RPC no S74–S79 |
| Removido voltar por convite antigo; convite rebaixar o último ADM/dono | Remoção e convite novo revogam os `pending`; aceite nunca rebaixa membro ativo (4.1); S74 |
| Suíte RLS desfazer as migrações novas ao reaplicar as antigas (S65, S68, S71, S72) | Cada S74–S79 começa com `\ir` da própria migração (0.2 item 12) |
| Valor digitado em texto livre (conversa, nota) | Aviso na tela; preço negociado em `decision_note` da proposta (tabela de valor). Não há como travar texto livre: risco aceito |
| Cálculo da comissão divergir entre tela e gravação | Uma implementação (TS); servidor autoritativo; RPC só do service role confere regra, entradas e identidade (D4) |
| Divergência TS × SQL nas regras espelhadas (etapas, tarefas, tipos de aviso, validação de regra) | Mesma tabela neste documento; vitest de um lado e cenário SQL que percorre todos os casos do outro |
| Funções de array lentas com muitos negócios | MVP com centenas; plano B: tabela materializada `deal_access(user_id, deal_id)` mantida por gatilho, sem mudar as políticas (só o corpo da função) |
| S14 mudar sem querer (default privileges dão `execute` a anon) | `revoke ... from public, anon` explícito em toda função nova; S80 compara a lista |
| PGRST201 | PK só `id`; FKs nomeadas; S65 + S80 |
| Seed de marca em migração quebrar 0063/S72 | D6: demo só por botão |
| Carteira de clientes exposta pela API anônima | D7: marca da agência nasce `inactive` |
| Migração ainda não aplicada no remoto por alguns minutos | Apêndice B em toda consulta (com `PGRST200` para embed novo a partir de tabela antiga); layouts com "Módulo em atualização"; telas antigas tocadas (`/admin/invitations`, preferências de notificação) com leitura/gravação de reserva; cron com `not_migrated` |
| Valor novo de enum usado na mesma transação | Checks, políticas e funções `language sql` por `::text`; valores só em corpo `plpgsql`; teste local com `psql -1` (0.2 item 2); S80 |
| Talento sem página pública × heróis | D2: não cria `creator_profiles` pendente |
| Uma pessoa em duas agências / dois talentos | D10 (índices); multiagência real vira tarefa futura (trocar índice e `my_talent_id`) |
| Push para portal bloqueado no app | D8: push só com link do escritório |
| Integrações externas parecerem reais | Telas com "em breve" para Google Agenda, métricas automáticas, assinatura eletrônica, pagamento; `source = 'integration'` não gravável; aceite "registrado no app", nunca "assinado" |
| LGPD | Consentimento com versão e revogação (tira do catálogo e revoga o link); dados contratuais ficam pela execução do contrato; conta excluída: `user_id` vira nulo (FK `set null`), membros saem em cascata; documentos com `retention_until` (5 anos após o encerramento, regra configurável depois) |
| Admin geral agindo como marca/creator | RPCs da marca e do creator exigem ser membro/o próprio; AG só lê nesses portais |
| Talento sem página cair nas telas do herói | D2 e 6.4: `/creator` leva ao escritório, Novo post escondido, selo "Talento" |
| Dois desenvolvedores na master | Merge antes de cada push, numeração conferida (0.2 item 11), suíte inteira antes do push |
| Proposta com creator que desiste depois | `agency_contract_confirm` exige aceite de todos os `proposed`; com proposta viva, cachês, elenco e entregáveis travam (`proposal_locked`); proposta `sent` → retirar e reenviar; proposta `accepted` → `agency_proposal_reopen` (volta a `negotiation`) e nova versão; repasses saem do snapshot aceito |
| Agência e marca sem aviso fora do portal | 🔌 adiado: e-mail transacional e Web Push para agência e marca (D8). Até lá, o sino em tempo real e o aviso na tela de convite e no Início |
| Permuta, impostos, nota fiscal | Fora do MVP (D17); total da proposta > 0 |

---

## Apêndice A · Arquivos por etapa

| Etapa | Criar | Alterar |
|---|---|---|
| A | `supabase/migrations/0064_gestao_fundacao.sql`; `src/app/agencia/{layout,page,error}.tsx` (**sem** `loading.tsx` na raiz, 6.1), `equipe/` (com `layout.tsx` de papel), `marcas/`, `configuracoes/` (com `layout.tsx` de papel), `notificacoes/`; `src/app/marca/{layout,page,error}.tsx`, `equipe/`, `notificacoes/`; `src/app/admin/agencia/`; `src/lib/agency/{roles,server,queries,schemas,vocab}.ts`; `src/lib/brand-portal/{server,queries,schemas}.ts`; `src/lib/inbox/{kinds,queries,actions}.ts`; `src/lib/documents/{actions,queries}.ts`; `src/components/inbox/{NotificationBell,InboxList}.tsx`; `src/components/admin-ops/FilterAnchor.tsx`; `messages/*/{agency,brandPortal,inbox,commercial}.json`; `tests/unit/{agency-roles,inbox-kinds,missing-schema}.test.ts`; `tests/e2e/gestao-portals.spec.ts` | `src/lib/supabase/helpers.ts` (`isMissingSchema` com `PGRST200`, apêndice B) e `src/lib/brands/index.ts` (`isMissingBrandsSchema` reexporta); `src/lib/auth/session.ts` (`AppRole`, `scope_type`, `isTalentOnly`), `src/components/layout/{portal-nav.ts,PortalShell.tsx,PortalSidebar.tsx}`, `src/lib/native-app/surface.ts`, `src/middleware.ts`, `src/app/robots.ts`, `src/lib/settings/sections.ts`, `src/lib/demo/{accounts,server}.ts`, `src/components/demo/DemoAccess.tsx`, `src/components/admin-ops/InviteAcceptCard.tsx`, `src/app/admin/ops-actions.ts` (`acceptInvitation` com `scope_type`), **`src/app/admin/invitations/page.tsx`** (papéis novos, links, leitura tolerante), `src/app/admin/users/[id]/page.tsx`, `src/lib/push/{message,consent,dispatch}.ts`, **`src/components/me/notifications/{constants,schema}.ts`** e **`src/app/(app)/profile/actions.ts`** (fallback `PGRST204` genérico), `src/app/(app)/profile/notifications`, `messages/*/{nav,demo,me,push,adminOps}.json`, `tests/unit/{native-messages,native-app,settings-sections,professionals,notifications,push-message}.test.ts`, **`tests/e2e/demo-access.spec.ts`**, `tests/e2e/helpers/login.ts`, `supabase/tests/rls_scenarios.sql` (S74, S80), `src/lib/supabase/database.types.ts` (à mão) |
| B | `0065_gestao_casting.sql`; `src/app/agencia/casting/`; `src/app/creator/escritorio/{layout,page,consentimento,media-kit,notificacoes}` (sem `loading.tsx` na raiz do escritório); `src/app/(focus)/kit/[token]/page.tsx`; `src/lib/talent/{server,queries,schemas,media-kit}.ts`; `src/components/talent/*` (com os gráficos de audiência); `messages/*/{talent,mediaKit}.json`; `tests/unit/{media-kit,talent-schemas}.test.ts` | Perfil (card Escritório, selo "Talento"), `src/app/creator/page.tsx` e `PORTAL_LINKS.creator` (talento sem página), `/creator/post/new` (aviso), `adminOps.json` (convite de talento), `src/lib/demo/accounts.ts` (`talent`), S75 |
| C | `0066_gestao_pipeline.sql`; `src/app/agencia/{pipeline,negocios}/` (com `negocios/[id]/proposta/layout.tsx` de papel); `src/app/marca/{campanhas,creators}/`; `src/app/creator/escritorio/oportunidades/`; `src/lib/agency/{commission,stages,match,money}.ts`; `src/components/agency/{pipeline,deal,values}/*`; `tests/unit/{agency-commission,agency-stages,agency-match,money-input,request-deliverables}.test.ts` | `src/app/agencia/configuracoes` (regras), S76 |
| D | `0067_gestao_oportunidades.sql`; `src/app/creator/escritorio/tarefas`; `src/app/agencia/tarefas/`; contrato e entregas no negócio e na campanha (embeds com hint); `src/lib/agency/task-template.ts`; `tests/unit/{agency-task-template,agency-embeds}.test.ts` | S77 |
| E | `0068_gestao_agenda.sql`; agendas dos três portais + rotas `ics/route.ts`; `src/app/agencia/calendario-comercial/`; `src/app/marca/calendario/`; `src/lib/agency/ics.ts` | `src/app/marca/campanhas/nova` (`?data=`), S78 |
| F | `0069_gestao_financeiro.sql`; `src/app/agencia/{financeiro,historico}/` (com `layout.tsx` de papel); `src/app/api/cron/agency/route.ts` (passos com `not_migrated`); documentos nos três portais; `tests/unit/{agency-dashboard,agency-finance}.test.ts` | `vercel.json`, os três inícios, S79 |

## Apêndice B · Tolerância a migração ainda não aplicada

Sem helper duplicado: o projeto já tem `isMissingBrandsSchema` (`src/lib/brands/index.ts`, com `PGRST200`) e
variações (`isMissingFollowSchema`, `list-items.ts`). A versão geral vai para `src/lib/supabase/helpers.ts` (que
já guarda `rpcErrorCode`) e `isMissingBrandsSchema` passa a reexportá-la (mesmo comportamento):

```ts
/** Erro de banco que significa "a migração ainda não chegou aqui": tabela/coluna/função inexistente
 *  (42P01/42703/42883) ou fora do cache da API (PGRST205 tabela, PGRST204 coluna, PGRST202 função,
 *  PGRST200 relação de embed). */
export function isMissingSchema(error: { code?: string | null } | null | undefined): boolean {
  return Boolean(error?.code && ["42P01", "42703", "42883", "PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(error.code));
}
```

- `PGRST200` é o erro que aparece quando uma **tabela antiga** faz embed de uma **relação nova** antes da migração
  (`invitations → agencies/brands/talent_profiles`, `brands → agency_brands`, `creator_profiles → talent_profiles`).
  Toda consulta assim tem leitura de reserva **sem o embed** (padrão `withPro` de `/admin/invitations`) em vez de
  `throw`.
- Toda função de `src/lib/{agency,brand-portal,talent,inbox,documents}/queries.ts` devolve
  `{ available: false }` (e lista vazia) quando `isMissingSchema(error)`, e `{ available: true, ... }` no resto.
- Layouts de `/agencia`, `/marca` e `/creator/escritorio`: `available = false` → `EmptyState` "Módulo em
  atualização" (`data-testid="module-unavailable"`), sem `throw`.
- `NotificationBell`: sem a tabela, não renderiza.
- `isAgencyDemoReady()`: erro → `false`.
- `/configuracoes` e o Perfil leem só `role_assignments` (sem filtro pelo enum novo), então nada quebra antes da 0064.
- Nunca filtrar `role_assignments` por `.eq('role', 'agency')` antes da 0064 estar no remoto (erro `22P02` de
  enum); filtrar no TS depois de ler.
- Gravações em tabelas antigas com coluna nova (preferências de notificação com `office_updates`) tratam
  `PGRST204` tirando a coluna citada e tentando de novo (6.6).
- Cron: cada passo com RPC nova trata `PGRST202`/`42883`/`PGRST205`/`42P01` como `not_migrated` (7.4).
- Os E2E de cada etapa se pulam enquanto a tela mostra `module-unavailable`.

---

## Registro de revisão

Três revisões independentes (lentes **segurança**, **convenções** e **produto**) apontaram 55 achados. Cada um
foi conferido no código e no plano aprovado antes da decisão. Nenhum foi recusado: todos procedem. Em alguns a
correção seguiu uma variante da sugerida, e o motivo está na linha. "Dup." indica achado repetido entre lentes,
resolvido pela mesma correção.

| # | Lente | Sev. | Resumo | Decisão | Motivo curto |
|---|---|---|---|---|---|
| 1 | segurança | blocker | `admin@demo` (papel admin, painel público) lê e age na agência real via `_select_admin`/`agency_can` | aplicado | Confirmado em `src/lib/demo/accounts.ts` e `docs/decisions/hoje-relogio.md`. `is_demo_account()` + `is_platform_admin()` em todo `_select_admin`, `agency_can` e RPCs do AG; restritivas em `invitations`/`admin_audit`; S74 (D6). Tirar o papel admin da conta continua como pendência do dono (seção 11) |
| 2 | segurança | blocker | `heroi@` é o Érick Jacquin real; `my_talent_id` a tornaria o talento real | aplicado (variante) | Confirmado na 0044. `talent_user_id()` ignora conta demo em agência real (fonte única para `my_talent_id`, avisos e tarefas); agência demo não liga herói; aceite de convite real recusa conta demo; S75. Não desvinculamos a `heroi@` do Érick (quebraria o E2E do Perfil) |
| 3 | segurança | blocker | Visitante opera a agência demo e atinge heróis, marcas e slugs reais | aplicado | Agência demo travada (`demo_locked`): sem herói nem marca existentes, sem consentimento registrado, sem link público (`media_kit_resolve` → `null`), equipe fixa, slug `exemplo-*` (até 10); D18 impede mexer em marca de outra agência |
| 4 | segurança | major | Marca lê o orçamento interno de pedido de origem agência | aplicado | Política da marca em `campaign_request_budgets` exige `origin = 'brand'`; S76 |
| 5 | segurança | major | GES envia e relê contrato; contrato do creator pode ir à marca | aplicado | Contrato só ADM/AG (reserva, compartilhamento, arquivo); `documents_select_uploader` só `pending` e não `restricted`; checks `documents_contract_share` e escopo `talent` sem `brand_id`; S74 |
| 6 | segurança | major | Creator lê `internal_notes`, `commercial_status`, `reasons` | aplicado (variante) | Sem política do creator em `talent_profiles` e `deal_talents`; leitura por `talent_my_context()`/`talent_opportunities()` com lista fechada (em vez de tabela `talent_internal`, que mexeria em índices e no cron) |
| 7 | segurança | major | Duas agências sobre a mesma marca; sem isolamento | aplicado | D18: índice único de vínculo ativo; transferência só pelo AG; `my_agency_brand_ids(true)` nas políticas de equipe da marca |
| 8 | segurança | major | Removido volta por convite antigo; aceite rebaixa último ADM/dono | aplicado | Remoção e convite novo revogam `pending` do mesmo e-mail/escopo; aceite nunca muda papel de membro ativo (0058 confirmada: aceite só confere `status`/validade) |
| 9 | segurança | major | IDOR em RPCs com `p_id` + escopo separado | aplicado | D19 e regra comum da seção 4 (escopo derivado da linha, `update ... and agency_id`); colunas "Valida" atualizadas; um negativo por RPC no S74–S79 |
| 10 | segurança | minor | `deliverables` ↔ `documents` com várias FKs (PGRST201) | aplicado | `documents.deliverable_id` removida; hint obrigatório (0.2 item 3); `agency-embeds.test.ts`, E2E de entregas e checagem no S80 |
| 11 | segurança | minor | `campaign_requests.deliverables` aceita chaves de valor | aplicado | Check `campaign_deliverables_valid` (só `kind`, `quantity`, `network`) + zod `.strict()`; S76 |
| 12 | segurança | minor | Marca vê creators em análise e documentos fora de `brand_visible`; kit sem consentimento | aplicado | `my_brand_deal_talent_ids()` (só `proposed`/`contracted` a partir de `proposal_sent`); `documents_select_brand` exige negócio visível; `brand_campaign_detail` só com consentimento |
| 13 | convenções | major | Suíte reaplica 0054/0058/0061/0062 e desfaz 0064–0069 | aplicado | Confirmado em `rls_scenarios.sql` (`\ir` nas linhas 6042, 6730, 7049, 7276…). Cada S74–S79 começa com `\ir` da própria migração; cascata e assinatura estável documentadas (0.2 itens 12 e 13) |
| 14 | convenções | major | `isMissingSchema` sem `PGRST200` e duplicado | aplicado | O helper existente é `isMissingBrandsSchema` em `src/lib/brands/index.ts` (não em `helpers.ts`, como dizia a evidência); geral vai para `helpers.ts` com `PGRST200`, o antigo reexporta; embed novo com leitura de reserva |
| 15 | convenções | major | `admin_brand_delete` apaga em cascata vínculos e equipe; `set null` em `documents` viola check | aplicado | Recriada na 0064 com `brand_linked_to_agency`/`brand_has_members`/`brand_has_documents`; `documents_brand_fk` e `agency_brands_brand_fk` `restrict`; `agency_brand_link` recusa `brands.is_demo` |
| 16 | convenções | major | E2E e unitário contam botões demo exatos | aplicado | `demo-access.spec.ts` e `professionals.test.ts` no apêndice A; `readyDemoAccounts` com flags novas opcionais e falsas por padrão (8.3) |
| 17 | convenções | major | Preferências de notificação quebram antes da 0064 (`PGRST204`) | aplicado | Fallback genérico em `profile/actions.ts`; `constants.ts`/`schema.ts` no apêndice A; `notifications.test.ts` |
| 18 | convenções | major | `/admin/invitations` e `InviteAcceptCard` tratam agência/marca/talento como fornecedor/herói | aplicado | Página no apêndice A (rótulos, links, leitura tolerante); `accept_invitation` devolve `scope_type` |
| 19 | convenções | major | GES envia e relê contrato com preço | aplicado | Dup. do #5 |
| 20 | convenções | major | `FilterLink` usa `next/link` (bug de navegação por parâmetro) | aplicado | Confirmado no componente; `FilterAnchor` com `<a>` comum (6.1) |
| 21 | convenções | major | E2E de "Quero uma campanha nesta data" grava rascunho no remoto | aplicado | Botão vira `<a>` para `/marca/campanhas/nova?data=<id>`; rascunho só no primeiro salvamento após digitar; `brand_request_from_date` removida; S78 cobre o vínculo da data |
| 22 | convenções | minor | `db:types` usa banco fixo e Supabase CLI ausente | aplicado | Passo trocado por atualização manual de `database.types.ts` (como já é feito); parametrizar fica opcional |
| 23 | convenções | minor | Testes "existentes" que não existem | aplicado | Apontados para `native-app.test.ts` e `professionals.test.ts` (conferido em `tests/unit`) |
| 24 | convenções | minor | `loginAs` não pula tipo ausente; `DEMO_HOME` sem chaves novas | aplicado | Skip por `[data-demo-kind]` ausente e chaves novas em `DEMO_HOME`/`DEMO_PATH` (8.3) |
| 25 | convenções | minor | `listUsers` não é usado; profissional não reaproveita conta | aplicado | Id resolvido dentro de `agency_demo_seed` (service role lê `auth.users`, recusa conta não demo); erro "já cadastrado" ignorado no TS |
| 26 | convenções | minor | `/` redireciona para `/personalities` | aplicado | Critério 4 da A e E2E esperam `/personalities` (`LOGIN_LANDING`) |
| 27 | convenções | minor | `loading.tsx` na raiz torna redirect refresh no cliente | aplicado | Sem `loading.tsx` na raiz dos portais; checagem de papel em `layout.tsx` do segmento; E2E com `timeout` (6.1) |
| 28 | convenções | minor | Talento sem página com papel `creator` vê selo/painel de herói | aplicado | `isTalentOnly`: `/creator` → escritório, Novo post escondido, selo "Talento", atalho de `/configuracoes` (6.4) |
| 29 | convenções | minor | Seed liga `heroi@` (que já tem página) a talento sem página | aplicado (variante) | Conta nova `talento@demo.ultrahero.app` para o talento sem página; ligar a página da `heroi@` à agência demo seria herói real em negócio inventado |
| 30 | convenções | minor | "(simulado)" em `commercial.taskSteps.12` reprova o teste do app | aplicado | Título "Encerramento e repasse"; o selo vem de `agency.values` |
| 31 | convenções | minor | Literal de enum novo em política/função SQL quebra só no remoto | aplicado | Regra estendida a políticas e `language sql`; teste local com `psql -1` (confirmado: `local-reset.sh` sem `-1`, `remote-apply.mjs` com `begin/commit`); S80 confere |
| 32 | convenções | minor | Cron devolve 500 sem a 0069 | aplicado | Cada passo com `not_migrated`, padrão `recipe-orphans.ts` (7.4) |
| 33 | produto | major | Etapa C não consegue enviar proposta (consulta só na D) | aplicado | D20: consulta, respostas e oportunidades do creator vão para a 0066; C = briefing até a proposta, D = contratação até o encerramento (plano §7) |
| 34 | produto | major | Cachês e elenco editáveis com proposta enviada/aceita; repasse pela tabela viva | aplicado | `proposal_locked` em `agency_fee_set` e remoção de `proposed`; `agency_proposal_reopen`; repasses de `snapshot.inputs.talentFees` |
| 35 | produto | major | Contagem por entregável com duas definições | aplicado | Definição única (interested/proposed) no SQL e no TS; gatilho cancela entregáveis em `declined`/`removed`; S76 |
| 36 | produto | major | GES envia contrato; contrato do creator compartilhável com a marca | aplicado | Dup. do #5 |
| 37 | produto | major | GES responde oportunidade em nome de creator com login | aplicado | `agency_record_talent_response` só para talento sem login (`talent_has_login`), nota ≥ 5 e evidência opcional; o mesmo para aceite registrado |
| 38 | produto | major | Passo 5 (marca aprova roteiro) impossível de cumprir | aplicado (variante) | Mantidas as 12 tarefas aprovadas: passo 4 com anexo copiado ao 5; `brand_task_decide` (aprova ou reabre o 4 com `feedback`) |
| 39 | produto | major | Algoritmo de recomendação não especificado | aplicado | Seção 5.7: entradas, critérios, pesos, nota 0–100, mínimo de 2, "desatualizado", vetores M1–M6; busca da marca mostra filtros atendidos (D22) |
| 40 | produto | major | Creator não sugere campanha (plano, Portal 1) | aplicado | `talent_suggest_campaign` na D, aviso `talent_suggestion` (25º tipo) |
| 41 | produto | minor | Início da marca sem "creators sugeridos" | aplicado | `brand_dashboard` com os propostos nas campanhas abertas (campos autorizados) |
| 42 | produto | minor | Patrocínio → `creator_brands` e gráficos do kit ausentes | aplicado | `agency_publish_sponsorship` (F, ação humana); `MiniBarChart` de gênero e idade no editor e no `/kit` (B) |
| 43 | produto | minor | Agência e marca sem aviso fora do portal | aplicado | Registrado como 🔌 adiado (D8, seção 11) e aviso na tela de convite e no Início |
| 44 | produto | minor | `suggestContractValue` não chega a A = 0 no modo faixa | aplicado | Conferido (F = R$ 40.000,50 → A = R$ 2.499,51); devolve `{valueCents, adjustmentCents}` e a tela avisa; vetor E12 |
| 45 | produto | minor | Linhas do progressivo não somam C | aplicado | Conferido (500.002 × 500.001); linha `rounding` e invariante Σ linhas = C no vitest; vetor E13 |
| 46 | produto | minor | Ajuste A misturado à comissão, sem justificativa | aplicado | D21: lançamento `adjustment`, `adjustment_note` ≥ 5 no snapshot, identidade com ajuste |
| 47 | produto | minor | Regra por entregável sem preço passa no zod | aplicado | `.refine` `unit_price_required` + `commission_rule_valid`; vetor E14 |
| 48 | produto | minor | Creator interessado sem cachê | aplicado | Consulta exige cachê (`fee_missing`); issue `fee_missing` no motor (E15); `deal_talents.terms_ready` (sinal sem valor para o GES) |
| 49 | produto | minor | Regra do negócio travada na negociação | aplicado | Editável em `negotiation` sem proposta `sent`/`accepted` |
| 50 | produto | minor | "Declarado em" usa `as_of` e omite quem declarou | aplicado | "dados de {as_of} · declarado por {creator ou agência} em {data}" no kit, na busca e nas telas |
| 51 | produto | minor | Status `expired` nunca gravado | aplicado | Derivado na leitura e `proposal_expired` na C; cron da F grava `expired` e avisa |
| 52 | produto | minor | GES/COL não leem o motivo do pedido de ajuste | aplicado | Códigos sem valor em `activities.reason_codes`; texto livre segue em `decision_note` |
| 53 | produto | minor | Talento sem página cai no `/creator` de herói | aplicado | Dup. do #28 |
| 54 | produto | minor | "(simulado)" no passo 12 aparece no app | aplicado | Dup. do #30 |
| 55 | produto | minor | "Até 1 segundo" virou "próximo carregamento" sem decisão | aplicado | Pipeline aberto faz `router.refresh()` ao receber `briefing_received` pelo sino (Realtime); critério 1 da C refeito |
