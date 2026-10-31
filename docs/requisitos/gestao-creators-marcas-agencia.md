# Groscove Ultra: Gestão de Creators, Marcas e Agência

Proposta técnica e funcional. **Status: aprovada** com as recomendações da seção 13 e as decisões da seção 14.

Legenda usada no documento:

| Selo | Significado |
|---|---|
| ✅ EXISTE | verificado no código e no banco (migrações 0001–0063) |
| 🟡 PARCIAL | existe uma base reaproveitável, mas não cobre o pedido |
| 🆕 NOVO | a construir neste módulo |
| 🔌 EXTERNO | depende de integração externa (API, contrato, chaves) |
| 🔮 FUTURO | fora do MVP |

---

## 1. Diagnóstico da arquitetura existente

**Stack (verificado):**
- Next.js 15.5 (App Router, Server Components e Server Actions) e React 19.
- Supabase: Postgres com RLS em todas as tabelas, Auth e Storage.
- Vercel para hospedagem e crons.
- zod para validações; i18n com next-intl em pt-BR, en e es.
- PWA com service worker e push.
- App das lojas (WebView) com bloqueio de rotas comerciais (`isBlockedInNativeApp`).

**Banco:**
- 63 migrações e cerca de 150 tabelas.
- Suíte RLS com cerca de 1.700 asserções, mais vitest (1.941 testes) e cerca de 50 specs E2E com Playwright.

**Autenticação e papéis:**
- Enum `app_role` com `consumer`, `creator`, `seller`, `admin` e `professional`.
- Papéis atribuídos em `role_assignments`, com escopo (`global`, `seller_org` ou `creator`), revogação e autor da concessão. É o ponto natural para os papéis novos.
- Convites por e-mail com token (`invitations`) para creator e seller.
- Padrão de organização com membros (`seller_organizations` e `seller_memberships`, com owner e staff). É o modelo a copiar para marcas.

**Portais existentes:**
- `/creator`: portal do herói. Tem conteúdos com revisão editorial, post pelo celular, receitas, links e perfil.
- `/admin`: cerca de 30 telas, incluindo creators, marcas, produtos, pedidos, remessas, profissionais, colecionáveis, indicadores, auditoria, usuários e convites.
- `/seller`: portal do fornecedor. Hoje as funções dele foram centralizadas no admin.
- `/profissional`: portal de serviços.

**Riscos de regressão identificados:**
1. **Embeds ambíguos no PostgREST (PGRST201).** Já derrubou produção uma vez (0051). As tabelas novas usarão PK `id` substituta e FKs nomeadas, com o guarda S65 na suíte.
2. **Navegação por parâmetro de URL na mesma página.** Há um bug conhecido; usar `<a>` simples nas abas.
3. **Contagem de funções SECURITY DEFINER acessíveis ao anônimo (S14 = 17).** O link público do media kit vai mexer nisso, e o teste precisa ser atualizado de propósito.
4. **App das lojas.** Portais comerciais (marca e agência) ficam só na web.
5. **Dois colaboradores enviando código para a master.** Toda etapa faz merge antes do push.

---

## 2. Mapa do que já existe e serve ao módulo

| Pedido do módulo | Situação | Onde está / o que falta |
|---|---|---|
| Autenticação e identidade | ✅ EXISTE | Supabase Auth, `profiles`, `role_assignments` |
| Página pública do herói | ✅ EXISTE | `creator_profiles` (status, redes em `socials`, bio, fotos), `/personalities/[slug]` |
| Perfil profissional privado do creator | 🟡 PARCIAL | `creator_rights_private` (documento e notas de direitos). Faltam disponibilidade, gestor responsável e dados comerciais |
| Marcas e patrocínios | ✅ EXISTE | `brands`, `creator_brands` (sponsor, mentioned, identified), `brand_products`, Smart Tags (0062/0063) |
| Marca como organização com login | 🆕 NOVO | Hoje a marca é só um cadastro do admin, sem usuários |
| Conteúdos e publicações do creator | ✅ EXISTE | `content` com revisão (`content_reviews`), agendamento (`publish_at`), post pelo celular |
| Métricas de redes (seguidores, engajamento) | 🆕 NOVO | `creator_reference_metrics` é de saúde (sono, passos), não de redes. `creator_follower_counts` conta só seguidores dentro do app |
| Métricas internas do app | ✅ EXISTE | Visitas à página do herói (0061), cliques em marcas (0062), seguidores (0056), indicadores (0060) |
| Notificações internas | 🟡 PARCIAL | `user_alerts` aceita só `auction_outbid`. `push_outbox` e `push_tokens` funcionam (0054). Falta uma caixa de notificações genérica |
| Notificação push | ✅ EXISTE | Web push com outbox, deduplicação e preferências |
| Auditoria | ✅ EXISTE | `admin_audit`. Será usado para aprovações e mudanças sensíveis |
| Convites | 🟡 PARCIAL | `invitations` aceita só `creator` e `seller`. Precisa aceitar marca e agência |
| Documentos privados | 🟡 PARCIAL | Buckets privados para mídia já existem. Falta bucket de documentos com URL assinada por escopo |
| Agenda e calendário | 🆕 NOVO | Só existem lembretes pessoais do consumidor (`/profile/lembretes`) |
| Tarefas e fluxo de produção | 🆕 NOVO | O fluxo de revisão de conteúdo é parecido, mas específico |
| Pipeline comercial (CRM) | 🆕 NOVO | Nada parecido existe |
| Comissões e repasses | 🆕 NOVO (simulado) | O comércio do app é simulado, e o módulo segue a mesma regra |
| IA | 🟡 PARCIAL | Recomendações com provedor OpenAI, guardrails e fallback por regra (`src/lib/recommendations`). Serve de base para o assistente |
| Integrações (Google Agenda, Instagram, TikTok, YouTube, Uber, assinatura eletrônica, pagamento) | 🔌 EXTERNO | Nenhuma existe. Não serão simuladas como reais |

---

## 3. Proposta de integração (como tudo se conecta)

```
                ┌──────────────── ÁREA PÚBLICA (já existe) ────────────────┐
                │  Página do herói · conteúdos · programas · marcas · Smart Tags │
                └───────────────▲───────────────────────────▲──────────────┘
                                │ mesmo creator_profiles    │ mesma tabela brands
   ┌────────────────────────────┴───┐   ┌───────────────────┴────────────────┐
   │ PORTAL CREATOR (/creator)      │   │ PORTAL MARCA (/marca) 🆕            │
   │ já tem: conteúdos, posts       │   │ briefing, campanhas, calendário     │
   │ 🆕 escritório: agenda, tarefas,│   │ comercial, busca de creators,       │
   │ oportunidades, media kit       │   │ aprovações, relatórios              │
   └───────────────▲────────────────┘   └───────────────────▲────────────────┘
                   │  consulta de interesse,          briefing, propostas,
                   │  tarefas, entregas               aprovações
                   └──────────────┐          ┌──────────────┘
                          ┌───────┴──────────┴───────┐
                          │ PORTAL AGÊNCIA (/agencia) 🆕│
                          │ casting · pipeline · tarefas│
                          │ financeiro · relacionamento │
                          └─────────────────────────────┘
```

**Princípios:**
1. **Uma identidade e vários papéis.** A mesma pessoa pode ser consumidora, creator e representante de marca. Os papéis vêm de `role_assignments`, com escopo.
2. **Um creator com duas faces.** A página pública continua lendo `creator_profiles`. O escritório privado lê tabelas novas ligadas a `creator_profiles.id`, com RLS própria. Nada privado aparece na página pública.
3. **Uma marca com duas faces.** A mesma linha em `brands` aparece nos conteúdos públicos (patrocínio, Smart Tags) e passa a ter membros que entram no portal da marca. Patrocínios fechados no pipeline podem virar `creator_brands` com um clique da agência. Isso é uma ação humana, nunca automática.
4. **A agência é o intermediário obrigatório.** A marca não fala direto com o creator sobre valores. Toda proposta passa pelo pipeline da agência.
5. **Uma caixa de notificações para os três portais.** Usa o push existente e não cria um segundo mecanismo.

---

## 4. Arquitetura dos três portais

### Portal 1: Creator (o `/creator` atual ganha o escritório)
- **Início:** agenda de hoje, próximas entregas, tarefas pendentes, oportunidades novas, campanhas em andamento, conteúdos aguardando publicação (isso já existe e é só reaproveitado), avisos da agência e métricas declaradas ou integradas, com a fonte indicada.
- **Agenda:** visões de dia, semana e lista. Eventos próprios mais os da campanha. Cada evento pode ser público para a equipe ou privado.
- **Tarefas:** lista por campanha, com prazo, status e responsável. A etapa "Enviar para aprovação" anexa o arquivo ou o link.
- **Oportunidades:** propostas enviadas pela agência, com briefing, entregáveis, período e o valor do repasse ao creator. O creator pode aceitar, recusar com motivo ou pedir conversa. Também pode marcar interesse em marcas e sugerir uma campanha.
- **Media kit:** editor e prévia, com gráficos. Gera um link público com escolha campo a campo do que aparece, validade e opção de revogar.
- **Contratos e entregas:** somente leitura dos documentos que a agência compartilhou com ele.
- **Gratuito:** nenhuma cobrança ao creator.

### Portal 2: Marca (`/marca`, novo, só na web)
- **Início:** campanhas ativas e concluídas, solicitações, propostas recebidas, creators sugeridos pela agência, calendário de oportunidades e avisos.
- **Nova campanha:** briefing em etapas curtas, com rascunho salvo automaticamente e anexos.
- **Busca de creators:** catálogo com filtros. Mostra apenas o que o creator autorizou e o que a agência liberou. Cada recomendação diz o critério ("mesmo segmento", "região", "audiência 18–34 declarada"). Sem dados suficientes, a tela diz "dados insuficientes" e não mostra nota.
- **Campanha:** linha do tempo (status, creators propostos, proposta, contrato, cronograma, aprovações de conteúdo, publicações e relatório), mais uma conversa registrada com a agência.
- **Calendário comercial:** datas cadastradas pela agência, com botão "Quero uma campanha nesta data", que abre o briefing já preenchido.
- **Isolamento:** a marca A nunca vê nada da marca B.

### Portal 3: Agência (`/agencia`, novo, só na web)
- **Início executivo:** creators ativos, marcas, negócios por etapa, contratos ativos, receita de comissões (simulada), valores a receber, entregas atrasadas e creators sem contato.
- **Casting:** lista e ficha do creator, com segmentos, disponibilidade, métricas, documentos, histórico de contatos e campanhas.
- **Pipeline:** quadro com as 13 etapas (no celular, lista agrupada por etapa). Cada negócio tem responsável, atividades, shortlist de creators, consulta de interesse em massa, proposta, contrato e entregáveis.
- **Tarefas e agenda da equipe.**
- **Calendário comercial:** cadastrar, editar e divulgar datas.
- **Financeiro (simulado):** comissão por negócio, repasses e situação. Tudo marcado como "registro interno, sem cobrança real".
- **Relacionamento:** alerta para creator sem contato há mais de N dias (configurável) e para tarefa vencida.
- **Admin geral:** continua em `/admin` e enxerga a agência inteira, mas a equipe da agência não acessa o admin da plataforma (usuários, planos, configurações).

---

## 5. Estrutura de banco (MVP)

Convenções obrigatórias:
- PK `id uuid` em todas as tabelas, inclusive as de ligação, por causa do PGRST201.
- RLS em tudo, com `revoke all from anon`.
- Escrita sensível feita por RPC `security definer` que registra em `admin_audit`.
- Coluna `agency_id` desde já, para permitir mais de uma agência no futuro sem refazer as tabelas.

| Tabela | Para quê | Chaves e campos principais |
|---|---|---|
| `agencies` | a agência administradora (1 no MVP) | name, commission_default_pct |
| `agency_members` | equipe da agência | agency_id, user_id, role (`manager`, `staff`) |
| `brand_members` | usuários da marca | brand_id → `brands`, user_id, role (`owner`, `staff`) |
| `talent_segments` | os 10 segmentos configuráveis | agency_id, name, sort, active |
| `talent_profiles` | lado privado do creator | creator_id → `creator_profiles` (1:1), agency_id, manager_id, availability, commercial_status, last_contact_at, consent_at |
| `talent_segment_links` | creator ↔ segmento | id, talent_id, segment_id |
| `talent_social_accounts` | redes e métricas | talent_id, network, handle, url, followers, avg_reach, engagement_pct, audience (jsonb), **source** (`declared` ou `integration`), **as_of** |
| `media_kits` | media kit e link público | talent_id, visible_fields (jsonb), share_token_hash, expires_at, revoked_at |
| `campaign_requests` | briefing da marca | brand_id, created_by, objective, product, audience, budget_cents, period, region, deliverables (jsonb), networks, notes, status |
| `deals` | negócio no pipeline | agency_id, brand_id, request_id, stage (13 etapas), owner_id, contract_value_cents, commission_pct, title |
| `deal_talents` | shortlist e consulta | deal_id, talent_id, status (`suggested`, `consulted`, `interested`, `declined`, `proposed`, `contracted`), talent_fee_cents, decided_at |
| `deliverables` | entregáveis | deal_id, talent_id, kind, due_at, status, proof_url |
| `tasks` | tarefas (12 etapas da campanha) | scope (`deal`, `talent`, `agency`), scope_id, template_step, assignee_id, due_at, status |
| `calendar_events` | agenda | owner_type (`talent`, `brand`, `agency`), owner_id, starts_at, ends_at, kind, visibility, deal_id |
| `commercial_dates` | calendário comercial | agency_id, date range, title, category, published |
| `activities` | linha do tempo e "último contato" | subject (`deal` ou `talent`), subject_id, kind (call, meeting, message, note), body, author_id |
| `deal_messages` | conversa registrada | deal_id, channel (`brand_agency` ou `talent_agency`), author_id, body |
| `documents` | contratos e anexos | scope, scope_id, storage_path (bucket privado), visibility (`agency`, `brand`, `talent`) |
| `financial_entries` | comissão e repasse (simulado) | deal_id, kind (`brand_invoice`, `commission`, `talent_payout`), amount_cents, status, `simulated=true` |
| `inbox_notifications` | caixa de notificações dos três portais | user_id, kind, title, link, read_at. O push continua no `push_outbox` |

Ajustes em tabelas existentes, todos aditivos e sem apagar nada:
- Os valores novos de `app_role` serão `agency` e `brand`, sempre com escopo em `role_assignments`.
- `invitations` passa a aceitar esses papéis.
- `user_alerts` fica como está, e o leilão migra depois para a caixa nova.

---

## 6. Modelo de permissões

| Ação | Admin geral | Gestor agência | Colab. agência | Creator | Rep. marca | Usuário comum |
|---|---|---|---|---|---|---|
| Ver página pública do herói | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ver ficha privada de um creator | ✅ | ✅ | ✅ (os que acompanha ou todos, configurável) | só a própria | ❌ | ❌ |
| Ver métricas no catálogo da busca | ✅ | ✅ | ✅ | só as próprias | só campos autorizados de creators liberados | ❌ |
| Criar briefing | ✅ | ✅ (em nome da marca) | ✅ | ❌ | da própria marca | ❌ |
| Ver negócio | ✅ | ✅ | ✅ | só os em que foi consultado | só os da própria marca | ❌ |
| Ver valor do contrato e comissão | ✅ | ✅ | configurável | ❌ (vê só o próprio repasse) | vê o valor total, não o repasse | ❌ |
| Mover etapa do pipeline | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Aceitar ou recusar oportunidade | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Aprovar conteúdo da campanha | ✅ | ✅ | ✅ | ❌ | ✅ (da própria marca) | ❌ |
| Documentos | todos | todos | todos | os compartilhados com ele | os da própria marca | ❌ |
| Configurar comissão e segmentos | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

**Garantias:**
- A RLS isola as marcas por `brand_members`.
- O creator nunca vê outro creator, nem o valor do contrato.
- Documentos ficam em bucket privado, com URL assinada de curta duração e checagem de escopo.
- Mudanças de etapa, valores e aprovações vão para `admin_audit`.
- Consentimento LGPD: o creator aceita o uso comercial dos dados (`consent_at`) antes de entrar no catálogo e pode revogar.

---

## 7. Fluxos principais

1. **Entrada da marca:** a agência convida, a marca aceita, cria a senha e entra em `/marca`. Cadastro aberto com aprovação da agência fica para depois.
2. **Entrada do creator no casting:** o herói existente é convidado e aceita o termo de uso comercial, ou a agência cria um talento ainda sem página pública. O creator completa o media kit e passa a aparecer na busca.
3. **Briefing até a proposta:**
   1. A marca envia o briefing, e o sistema cria o negócio na etapa "Briefing recebido" e notifica a agência.
   2. A agência analisa e monta a shortlist (com recomendação por regra explicada).
   3. A agência consulta o interesse dos creators, e cada um recebe a oportunidade e responde.
   4. A agência envia a proposta à marca, e a marca aprova ou pede ajuste.
4. **Contratação até o encerramento:** o contrato é anexado e as duas partes confirmam (o aceite fica registrado). O sistema gera as 12 tarefas da campanha com prazos. O creator produz e envia, a marca aprova ou pede ajuste, o creator publica e envia a comprovação, e a agência gera o relatório e encerra. A comissão e o repasse são registrados (simulados).
5. **Relacionamento:** um cron diário marca os creators sem contato há N dias e as tarefas vencidas. Isso gera notificação ao gestor responsável.

---

## 8. Lista de telas

| Portal | Telas do MVP |
|---|---|
| Creator | Início do escritório · Agenda · Tarefas · Oportunidades (lista e detalhe) · Media kit (editor, prévia e link) · Documentos |
| Público | `/kit/[token]`: media kit compartilhável, sem login e com só os campos autorizados |
| Marca | Início · Nova campanha (briefing) · Minhas campanhas (lista e detalhe com linha do tempo e conversa) · Buscar creators · Calendário comercial · Equipe da marca |
| Agência | Início executivo · Casting (lista, ficha e novo) · Marcas (lista e ficha) · Pipeline (quadro e detalhe do negócio) · Tarefas · Agenda da equipe · Calendário comercial · Financeiro · Configurações (segmentos, comissão padrão, dias para o alerta) |
| Comum | Caixa de notificações (ícone de sino nos três portais) |

---

## 9. Priorização do MVP

**Entra no MVP:**
- Papéis e convites para agência e marca.
- Casting com segmentos.
- Media kit com métricas declaradas e fonte.
- Link público do kit.
- Briefing da marca.
- Pipeline de 13 etapas com shortlist e consulta de interesse.
- Oportunidades do creator.
- Tarefas com o modelo de 12 etapas.
- Agenda (creator, marca e agência) e calendário comercial.
- Caixa de notificações com push.
- Documentos privados.
- Financeiro simulado.
- Alerta de relacionamento.
- Os três inícios (dashboards).

**Fica fora do MVP:**
- 🔮 Assistente de IA conversacional.
- 🔌 Métricas automáticas das redes (Instagram, TikTok, YouTube).
- 🔌 Google e Apple Agenda.
- 🔌 Uber.
- 🔌 Assinatura eletrônica.
- 🔌 Cobrança e repasse reais.
- 🔮 Cadastro aberto de marcas.
- 🔮 Várias agências.
- 🔮 Relatórios avançados.

**IA no MVP (pequena e segura):** sugestão de creators por regra explicável (segmento, região, disponibilidade e audiência declarada), com cada critério exibido. Ela nunca move etapa, nunca aceita e nunca aprova. O assistente com LLM entra na expansão, sobre o provedor e os guardrails que já existem, sempre como rascunho que um humano confirma.

---

## 10. Plano de implementação por etapas

Cada etapa é publicada sozinha, com migração, RLS, testes e deploy, e não quebra o que existe.

| Etapa | Entrega | Migração |
|---|---|---|
| A. Fundação | Papéis `agency` e `brand`, `agencies`, `agency_members`, `brand_members`, convites, caixa de notificações, bucket de documentos, shell dos portais `/agencia` e `/marca` (vazios, protegidos), bloqueio no app das lojas | 0064 |
| B. Casting e media kit | Segmentos (10 iniciais), `talent_profiles`, redes e métricas declaradas, editor do media kit no `/creator`, link público, ficha na agência | 0065 |
| C. Briefing e pipeline | Briefing da marca, negócio automático, quadro de 13 etapas, atividades, conversa registrada, busca de creators com recomendação explicada | 0066 |
| D. Oportunidades e tarefas | Consulta de interesse, aceitar ou recusar no creator, modelo de 12 tarefas, entregáveis com comprovação, aprovação pela marca | 0067 |
| E. Agenda e calendário comercial | Agenda dos três portais, datas comerciais, "quero campanha nesta data", exportação .ics | 0068 |
| F. Financeiro, relacionamento e dashboards | Comissão e repasse simulados, alertas de relacionamento (cron), inícios com indicadores, documentos por escopo | 0069 |

Por etapa: RLS com cenários novos (isolamento entre marcas e entre creators, documentos), vitest, E2E com as contas demo novas (`agencia@`, `marca@`), axe, 390 px e build. Depois o deploy e a verificação em produção.

---

## 11. Riscos e dependências

| Risco | Mitigação |
|---|---|
| Vazamento entre marcas ou creators | RLS por membership, cenários de teste negativos para cada tabela, nenhuma leitura com service role no cliente |
| Métricas inventadas | Campo `source` obrigatório. Declarado aparece como "declarado em DD/MM". Sem dado, aparece "não informado" e nunca zero |
| Escopo grande demais | Etapas A–F publicáveis uma a uma, com o MVP fechado acima |
| Conflito com o portal `/creator` atual | O escritório entra como seções novas; conteúdos e posts não mudam |
| App das lojas | `/agencia` e `/marca` bloqueados lá; o escritório do creator pode aparecer (sem valores) |
| LGPD | Consentimento explícito, revogação, retenção de documentos definida, exportação e exclusão pelos fluxos que já existem |
| Integrações externas | Só com chaves e contrato; até lá a interface diz "em breve" e não finge |
| Dois desenvolvedores na master | Merge e testes antes de cada push, numeração de migração conferida |

---

## 12. Critérios de aceite e plano de testes (resumo)

1. A marca A, logada, não consegue ler nenhum dado da marca B. Isso é testado por RLS em todas as tabelas novas.
2. O creator vê só as oportunidades em que foi consultado e nunca vê comissão nem o valor total.
3. O link do media kit mostra só os campos marcados, para de funcionar quando revogado ou vencido, e não exige login.
4. Um briefing enviado cria um negócio, notifica a agência e aparece no pipeline em até 1 segundo.
5. A contratação gera as 12 tarefas com prazos, e as tarefas vencidas aparecem no alerta.
6. Toda mudança de etapa e de valor fica em `admin_audit`, com autor e data.
7. Toda métrica exibida mostra a fonte e a data.
8. Os três portais funcionam a 390 px sem rolagem lateral e passam no axe sem violações sérias.
9. Nenhuma tela existente regride: a suíte inteira (RLS, vitest e E2E) passa antes de cada push.

---

## 13. Decisões que preciso de você

1. **Onde fica a agência:** portal próprio `/agencia` (recomendado) ou dentro do `/admin`, como foi feito com os fornecedores?
2. **Quantas agências:** só a sua no MVP (recomendado, com o banco já preparado para mais) ou uma plataforma para várias agências desde já?
3. **Quem pode estar no casting:** só heróis que já têm página pública, ou também talentos sem página pública (recomendado)?
4. **Entrada das marcas:** só por convite da agência (recomendado no MVP) ou cadastro aberto com aprovação?
5. **Comissão padrão** (%) e se o colaborador da agência vê valores.

---

## 14. Decisões aprovadas

**Aprovado: seguir as recomendações da seção 13.** Ou seja:
- portal próprio `/agencia`;
- uma agência no MVP, com o banco preparado para mais;
- casting aberto também a talentos sem página pública;
- marcas entram só por convite.

### 14.1 Hierarquia de acesso na agência

| Nível | Quem | Pode | Não pode |
|---|---|---|---|
| **Adm da agência** (`admin`) | dono ou diretor | tudo: valores, comissões, financeiro, propostas com preço, configurações, equipe (convidar, promover, remover) | — |
| **Gestor** (`manager`) | coordenação comercial | casting, marcas, pipeline inteiro, shortlist, consulta de interesse, contratos sem valores, tarefas da equipe | ver ou editar qualquer valor, comissão ou financeiro; mexer na equipe |
| **Colaborador** (`staff`) | operação | tarefas, agenda, atividades e contatos, casting (consulta), negócios em que é responsável ou participante | ver ou editar qualquer valor, comissão ou financeiro; mover etapa de negócio que não é dele; configurações |

- O **Admin geral da plataforma** (`/admin`) também vê tudo, porque é o dono do Groscove Ultra.
- **Os valores ficam fisicamente separados** das tabelas operacionais: contrato, cachê do creator, comissão, repasse e financeiro vivem em tabelas próprias, e só o Adm da agência tem política de leitura nelas.
- O gestor e o colaborador não recebem valores em nenhuma tela nem em nenhuma resposta do servidor. Não é só esconder no visual.
- Exceções controladas:
  - o creator vê **apenas o próprio cachê**;
  - a marca vê **apenas o valor total da proposta** que recebeu.

### 14.2 Formas de comissão

A comissão é cobrada da marca. Ela é configurável em três níveis: padrão da agência → por marca → por negócio. Vale a mais específica.

| Tipo | Como calcula | Exemplo |
|---|---|---|
| **Percentual** | % sobre o valor do contrato | 20% de R$ 50.000 = R$ 10.000 |
| **Valor fixo** | valor fechado por campanha | R$ 5.000 por campanha |
| **Híbrida** | fixo + percentual | R$ 2.000 + 10% |
| **Escalonada** | percentual muda por faixa de valor do contrato. Modo *faixa* (o percentual da faixa vale sobre o total) ou *progressivo* (cada parte na sua faixa) | até R$ 50 mil: 20%; até R$ 200 mil: 15%; acima: 10% |
| **Por entregável** | valor por entrega, opcionalmente por tipo | R$ 500 por post, R$ 800 por vídeo |
| **Markup sobre o cachê** | a marca paga o cachê do creator + X% | cachê R$ 30.000 + 25% = marca paga R$ 37.500 |

- Todas as formas aceitam **piso e teto** opcionais.
- O cálculo fica registrado com a regra usada (tipo e parâmetros) para auditoria. Mudar a regra depois não altera negócios já fechados.
- Tudo é **simulado**, sem cobrança real, até existir uma integração financeira aprovada.
