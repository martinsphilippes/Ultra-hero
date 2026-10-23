# Matriz de rastreabilidade — DMR 1.0 × implementação

Data: 20/10/2026 · Base: `docs/requisitos/DMR-1.0.md` (Documento Mestre de Requisitos, versão 1.0) × código na branch `master`.

Legenda de estado: **Feito** (existe e tem teste ou verificação registrada) · **Parcial** (existe em parte; o que falta está descrito) · **Não feito** · **Fora da POC** (o próprio DMR adia).

Onde o DMR diz "herói", o app diz "personalidade". É o mesmo conceito: tabela `creator_profiles`, portal `/creator`, páginas `/personalities`.

## Requisitos funcionais

| RF | Estado | Evidência | O que falta ou observação |
|---|---|---|---|
| RF-001 Cadastro e autenticação | Feito | Supabase Auth (senha com hash, sessão com expiração e renovação), e-mail e senha, Google, recuperação de senha, kill switch de cadastro no banco (0015), suspensão auditada. Acesso horizontal coberto pelos cenários RLS S1 a S14. | Limites de abuso: os do Supabase Auth, mais 20 feedbacks por dia e limite por hora na IA. |
| RF-002 Home orientada a conteúdo | Feito | Início abre com destaques, recomendações, personalidades e atalhos para explorar e loja. Hábitos ficam no Perfil ("Hoje" e Evolução), não na abertura. Estados vazios em todas as seções. | — |
| RF-003 Catálogo de heróis | Feito | `/personalities` lista só perfis ativos. Cada herói tem status de direitos (fictício, autorizado ou pendente), titular e validade (0017); documento e notas ficam em `creator_rights_private`, só do admin, por RPC auditada. O selo "personagem fictício" só sai com autorização válida e volta quando ela vence. Só o admin altera esses campos (gatilho). | Contrato e royalties seguem fora do código (DP-07). |
| RF-004 Página de herói | Feito | Hub com bibliotecas: cabeçalho (foto, nome, headline, pilares, selo, contagens, bio) e, abaixo, as bibliotecas do herói como botões em largura total (Rotina, Nutrição, Receitas, Treinos, Gastronomia, Programas, Produtos), só as que têm itens, com contagem. Cada biblioteca tem a sua página `/personalities/[slug]/<biblioteca>`: grade de quadrados para conteúdos, cards para programas e cards com "usado em" e carrinho de teste para produtos. Um conteúdo entra numa única biblioteca (receita > treino > pilar; `creator-libraries.ts`, unitário). As abas antigas (`?tab=`) redirecionam de forma permanente. A origem de cada vínculo conteúdo↔herói fica em `content.creator_link_origin` (envio do herói ou atribuição do admin), gravada por gatilho. Desde a 0021 a biblioteca Produtos une a alocação direta produto↔herói (`creator_products`, validada pelo admin em `/admin/creators/[id]`) com os vínculos por conteúdo, sem repetir; E2E `hero-hub.spec.ts` e `products-heroes.spec.ts`. | — |
| RF-005 Biblioteca de treinos | Feito | Tipo `workout` com exercícios, duração, nível, vídeo ou texto, autoria, aviso obrigatório de saúde. Filtros por pilar, tipo, nível, personalidade e acesso. Despublicar e arquivar pelo admin, com auditoria. | — |
| RF-006 Biblioteca de receitas | Feito | Tipo `recipe` com ingredientes, preparo, rendimento, alergênicos, autoria, vínculo e informação nutricional por porção (0017). A marcação "validado por profissional" exige nome e data, só o admin grava e a tabela só aparece quando marcada; o portal do herói zera a marcação. Verificador de alegações de saúde na edição. | A validação é declarativa (nome e data); não há registro profissional verificado. |
| RF-007 Calendário editorial | Feito | Fluxo rascunho → revisão → publicado → arquivado, rodadas de revisão e auditoria. Desde a 0025 o herói publica e despublica o próprio rascunho direto (`creator_publish_content`/`creator_unpublish_content`, auditadas, com rodada de autoaprovação no histórico); o admin continua definindo a regra de acesso e pode arquivar, e o fluxo de revisão segue disponível. Agendamento por `publish_at` (0017): o admin agenda ao aprovar ou ao publicar, a lista mostra "agendado" e a leitura pública, a busca e o acesso só liberam quando a data chega, sem depender de cron. | Sem visão de calendário por data; o agendamento é por item. |
| RF-008 Mídias e vídeos | Parcial | Vídeo por URL do YouTube e Vimeo (lista fechada de domínios), player de demonstração com transcrição, capas internas, reprodução responsiva, mensagens de erro. Licença por mídia (0017): tipo (demonstração, própria, licenciada, embed de terceiros), referência e crédito; o banco recusa combinação incompatível entre provedor e licença, e o crédito aparece na página. ADR-001 define a troca por Cloudflare Stream. Novo post do herói (`/creator/post/new`, 21/10/2026): grava ou escolhe vídeo no celular, valida tipo, 2 GB e 3 minutos no navegador, envia direto ao Cloudflare Stream por tus retomável (ticket criado no servidor, com o dono gravado no vídeo) e publica direto; licença `own` e miniatura servida pelo app. Unitário `creator-post.test.ts`, E2E `creator-post.spec.ts`. | O envio real depende das chaves do Stream na Vercel (ainda não enviadas): sem elas a tela abre com aviso e os botões de vídeo desabilitados. Conteúdo premium com URL assinada do Stream ainda não está implementado. |
| RF-009 Catálogo de produtos | Feito | 24 produtos fictícios e 4 operações (1 própria, 3 fictícias) com imagem, preço demonstrativo, descrição, categoria e disponibilidade. Contagem verificada no banco de produção em 20/10/2026. Mais 7 produtos reais da marca Ultra.e Life (0021, 21/10/2026) com imagem, preço da marca, ficha alimentar e link "Ver na loja oficial" (https validada, nova aba), nas categorias Suplementos e Hidratação; o fornecedor não é fictício. As compras seguem simuladas no carrinho de teste. | A loja oficial é só um link externo; nenhuma venda real passa pelo app. |
| RF-010 Carrinho | Feito | Adicionar, ajustar e remover, subtotal e total no servidor. Indisponível ou suspenso bloqueia o checkout (RLS S2, S6, S8). | — |
| RF-011 Checkout demonstrativo | Feito | Destinos predefinidos fictícios, frete fictício, sem pagamento, rótulos de demonstração em todas as telas. Nunca pede endereço real. | — |
| RF-012 Histórico de pedidos | Feito | `/orders` só do dono (RLS), status por remessa. Retenção de 90 dias por `run_retention` com exceções documentáveis em `retention_exceptions`. Rotina executada em produção em 20/10/2026 e registrada em `retention_jobs`. | — |
| RF-013 Gestão de fornecedores | Feito | Operação própria e 3 parceiras. Isolamento de produtos e pedidos por RLS (S6, S8). Portal do fornecedor. | — |
| RF-014 Administração de conteúdo | Feito | CRUD de personalidades, conteúdos de todos os tipos, programas, destaques, traduções, publicação e retirada sem deploy. | Mídia é parte do conteúdo; não há biblioteca de mídia separada. |
| RF-015 Administração comercial | Feito | CRUD de produtos com versões e moderação, preço e estoque demonstrativos, status de pedidos. Pedido guarda fotografia de itens, preços e fornecedor (RLS S8). | — |
| RF-016 Assinaturas e planos | Parcial | Planos, módulos, dependências configuráveis, direitos de acesso e estado de assinatura simulada. Nenhuma cobrança. Atende o "PENDENTE" sem assumir compromisso. | Período promocional não existe. Depende das DP-01 e DP-09. |
| RF-017 Vouchers e campanhas | Não feito | — | Depende da DP-04. Especificação proposta no final deste documento. |
| RF-018 Portal de creators | Parcial | Portal do herói: "+ Novo post" em vídeo pelo celular (primeiro item do menu e botão no topo do painel e da lista), conteúdos com publicação direta e despublicação, sugestão de produtos, perfil. | Campanhas, benefícios e feedbacks por creator dependem de RF-017. |
| RF-019 Portal de marcas | Fora da POC | — | P2 no DMR. |
| RF-020 Lives e eventos | Fora da POC | A arquitetura admite: tipos de conteúdo são um enum extensível, e o controle de acesso por módulo se aplica a qualquer tipo. | P2 no DMR. |
| RF-021 Hábitos e gamificação | Feito além do pedido | Sequência diária, conquistas e certificados a partir das ações do próprio usuário. Nenhuma rotina de celebridade é registrada. Desde 21/10/2026 (0022) o Perfil abre com "Hoje": o ritmo do dia vem dos programas em que a pessoa está inscrita (próximos itens obrigatórios) mais itens manuais (título, nota, horário, dias; até 20 ativos, só do dono por RLS), marcados por RPC que calcula a data local; a sequência conta dias com conteúdo concluído ou item marcado. Hidratação e descanso ficam só no aparelho (armazenamento local), sem metas prescritas. Desde 22/10/2026 (F1 + F2, `docs/decisions/hoje-relogio.md`) o Hoje mostra só o que o relógio mede (simulado nas contas demo; "Conectar relógio — em breve" nas reais), sem nada digitado: hidratação, descanso e itens manuais saíram da tela (itens mantidos no banco e na sequência até Q5/Q10) e as sugestões de programa viraram "Continue seus programas". Desde 23/10/2026 (Q5/Q10, 0037): os itens manuais viraram Lembretes em /profile/lembretes, fora do Hoje, e a sequência voltou a contar só streak_events (marcar lembrete não conta). | Não há consentimento específico para gamificação. Se a decisão for mantê-la, incluir opt-in no onboarding. |
| RF-022 Feedback da comunidade | Feito | Widget com nota, comentário e categoria (bug, sugestão, conteúdo, comércio, outro; "outro" pré-selecionado para manter um toque), limite por dia. Admin faz triagem com status, prioridade, responsável (só admins) e nota interna, tudo auditado (0018). Nada é publicado automaticamente. | Sem resposta ao autor. |
| RF-023 Notificações | Parcial | Preferências por usuário com opt-in por tipo (resumo editorial, lembretes de sequência, novidades de comércio) e canal (e-mail, push), tela Perfil › Notificações, RLS só do próprio usuário (0018). Política de Privacidade descreve o uso. | Nenhum envio na POC; serviço de e-mail e push ficam para depois. |
| RF-024 Auditoria | Parcial | `admin_audit` com data, ator, objeto, ação, antes e depois e justificativa. Retenção de 365 dias. Expurgo registrado em `retention_jobs`. Segredos nunca são gravados. | Acesso de leitura a recursos sensíveis não é auditado, só mudanças. |

## Fluxos ponta a ponta

| Jornada | Estado | Onde |
|---|---|---|
| J-01 Descoberta | Feito | Início → personalidades → perfil → conteúdo → volta ao explorar. No Explorar, a aba Conteúdos é uma grade estilo Instagram (3 colunas, 15 quadros por carga, rolagem infinita) com variedade de heróis garantida pela RPC `explore_feed` (0020): cada rodada traz no máximo um post por herói, em ordem rotacionada por dia; com texto digitado vale a relevância de `search_content`. E2E de visitante e `explore-grid.spec.ts`. |
| J-02 Administração editorial | Parcial | Rascunho → publicação direta pelo herói (ou revisão pelo admin) → arquivamento pelo admin. Agendamento e licença de mídia desde a 0017. |
| J-03 Compra demonstrativa | Feito | Loja → produto → carrinho → destino predefinido → confirmação → histórico → status. RLS S8. |
| J-04 Operação do fornecedor | Feito | Login com escopo → catálogo próprio → disponibilidade → pedidos próprios. RLS S6, S8. |
| J-05 Promoção futura | Não feito | Depende de RF-017. |
| J-06 Privacidade | Feito | Pedido → prazo → anonimização → registro de execução e exceção. RLS S11. |

## Telas e estados obrigatórios (seção 6)

Todas as áreas listadas existem. Estados: 53 telas de carregamento, 31 de erro, 14 de não encontrado, estados vazios nas listagens, acesso negado por redirecionamento para login ou mensagem de permissão, e rótulos de demonstração. Faltam: landing pública separada do Início (hoje o Início é a landing).

## Requisitos não funcionais

| RNF | Estado | Evidência ou pendência |
|---|---|---|
| RNF-01 Responsivo e acessível | Feito | E2E com axe em celular e desktop, navegação por teclado, 32 de 32. |
| RNF-02 Senhas, HTTPS, sessões, rate limit, validação no servidor | Feito | Supabase Auth, Vercel com HTTPS, Zod nas ações e regras no banco. |
| RNF-03 Autorização por papel e objeto | Feito | RLS em 59 tabelas, 176 cenários, inclusive acesso horizontal. |
| RNF-04 Backups e ambientes separados | Parcial | Backups diários pelo plano Pro do Supabase. Restauração não testada. Um único projeto serve de desenvolvimento e produção. |
| RNF-05 Mídia, paginação e cache | Parcial | Listagens com limite e paginação no admin. Mídia por embed, sem CDN própria. |
| RNF-06 Logs e alertas | Parcial | Logs da Vercel e do Supabase. Sem captura de erros nem alerta de indisponibilidade. |
| RNF-07 LGPD | Parcial | Minimização, política publicada, retenção automatizada, exclusão self-service. Bases legais "a confirmar" e sem exportação de dados. |
| RNF-08 Segredos | Feito | Nada no front-end; service role só no servidor; busca no bundle sem ocorrências. |
| RNF-09 Metas quantitativas | Pendente | DP-08. |
| RNF-10 Testes automatizados | Feito | 176 cenários de banco, 558 unitários, 32 E2E. Falta E2E com login real. |

## Critérios globais de aceite (seção 11)

| Critério | Estado |
|---|---|
| Cadastro, login e navegação entre heróis, treinos e receitas | Feito |
| Admin cria, revisa, publica, despublica e organiza sem deploy | Feito |
| 24 produtos, 4 operações, isolamento | Feito e verificado em produção (mais 7 produtos reais da Ultra.e Life desde a 0021, compras ainda simuladas) |
| Carrinho e pedido demonstrativo com endereço fictício | Feito |
| Pedido visível só ao dono e à operação autorizada | Feito |
| Sem cobrança, sem endosso real, fictício sinalizado | Feito |
| Retenção de 90 dias implementada, testada, com exceções | Feito |
| Testes integrados de jornadas, segurança e responsividade | Feito, exceto jornadas com login no navegador |

## Decisões pendentes do DMR e como o código as deixa abertas

| DP | Situação no código |
|---|---|
| DP-01 Gratuito, freemium ou assinatura | Planos e módulos são configuráveis pelo admin; nada cobra. Qualquer modelo cabe sem migração. |
| DP-02 Heróis com autorização | Campos de autorização existem desde a 0017 (status, titular, validade, documento). Todos os heróis do seed continuam fictícios e marcados. |
| DP-03 Volume e cadência de conteúdo | Sem limite técnico. Seed tem 40 conteúdos e 8 programas. |
| DP-04 Vouchers e portais externos | Não implementado. Proposta abaixo. |
| DP-05 Web, Android, iOS | Web responsiva e PWA instalável. Nativo fora da POC. |
| DP-06 Produção e entrega real | Nada real. Transporte é simulado pelo sistema. |
| DP-07 Contratos e royalties | Fora do código. |
| DP-08 Metas de tráfego | Sem teste de carga. |
| DP-09 Comércio × assinatura | Independentes, como a RB-07 manda. A regra pode ser ligada depois por módulo. |

## Divergências entre o DMR e o que foi construído

- **Papéis.** O DMR propõe Editor, Gestor de herói, Gestor de campanhas, Administrador e Superadministrador. O app tem consumidor, personalidade, fornecedor e admin, com escopo por perfil ou operação. Gestor de herói equivale ao papel personalidade com escopo. Editor e Superadministrador não existem. O DMR marca esses papéis como propostas a validar.
- **Vocabulário.** "Herói" no DMR, "personalidade" no app até 20/10/2026. A interface passou a dizer "herói" em pt-BR, en e es (termo de papel, sem flexão de gênero: uma mulher também é "herói"). Código, banco e rotas mantêm `creator` e `/personalities`.
- **Hábitos.** O DMR coloca gamificação como fase futura. O app já tem sequência e conquistas, sem abrir neles. Decisão de 20/10/2026: mantém visível. Decisão de 21/10/2026: o "Hoje" fica dentro da aba Perfil (não é aba própria); hidratação e descanso são registro local, só no aparelho, porque a Política de Privacidade promete não coletar dados de saúde; itens de rotina são agenda, não saúde, e por isso vão ao banco (só do dono). Decisão de 23/10/2026 (Q5/Q10 do Hoje com relógio): os itens de rotina viram "Lembretes" em Perfil › Lembretes, fora do Hoje, e a sequência volta a contar só conteúdos (migração 0037).

## Próximos incrementos propostos, por valor e custo

1. **Agendamento de publicação** (RF-007, P0): campo `publish_at`, leitura pública só quando a data chegou. Pequeno. **Feito na 0017** (sem cron: a regra é avaliada na leitura).
2. **Autorização por herói e licença por mídia** (RF-003, RF-004, RF-008, RB-05, RB-06): campos de origem, documento e validade, exibidos na página como "origem registrada". Pequeno a médio. **Feito na 0017.**
3. **Informação nutricional estruturada com validação** (RF-006): campos por porção e marcação "validado por profissional", exibida só quando marcada. Pequeno. **Feito na 0017.**
4. **Preferências de notificação** (RF-023): tabela por usuário com opt-in por tipo e tela em Perfil. Envio fica para depois. Pequeno. **Feito na 0018.**
5. **Feedback com categoria e prioridade** (RF-022): categoria, prioridade e responsável no admin. Pequeno. **Feito na 0018.**
6. **Vouchers e campanhas** (RF-017, P1): tabelas `campaigns`, `vouchers`, `redemptions` com cota por campanha, validade, resgate único por usuário, concessão de módulo e trilha de uso. Médio. Só depois da DP-04.
7. **Exportação de dados do titular** (RNF-07): botão em Conta que gera um arquivo com os dados do usuário. Pequeno.
8. **Staging separado e monitoramento** (RNF-04, RNF-06): segundo projeto Supabase e captura de erros. Operacional, sem código novo relevante.
