# Matriz de rastreabilidade — DMR 1.0 × implementação

Data: 20/10/2026 · Base: `docs/requisitos/DMR-1.0.md` (Documento Mestre de Requisitos, versão 1.0) × código na branch `master`.

Legenda de estado: **Feito** (existe e tem teste ou verificação registrada) · **Parcial** (existe em parte; o que falta está descrito) · **Não feito** · **Fora da POC** (o próprio DMR adia).

Onde o DMR diz "herói", o app diz "personalidade". É o mesmo conceito: tabela `creator_profiles`, portal `/creator`, páginas `/personalities`.

## Requisitos funcionais

| RF | Estado | Evidência | O que falta ou observação |
|---|---|---|---|
| RF-001 Cadastro e autenticação | Feito | Supabase Auth (senha com hash, sessão com expiração e renovação), e-mail e senha, Google, recuperação de senha, kill switch de cadastro no banco (0015), suspensão auditada. Acesso horizontal coberto pelos cenários RLS S1 a S14. | Limites de abuso: os do Supabase Auth, mais 20 feedbacks por dia e limite por hora na IA. |
| RF-002 Home orientada a conteúdo | Feito | Início abre com destaques, recomendações, personalidades e atalhos para explorar e loja. Hábitos ficam na aba Evolução, não na abertura. Estados vazios em todas as seções. | — |
| RF-003 Catálogo de heróis | Parcial | `/personalities` lista só perfis ativos, com selo "personagem fictício", pilares e aviso "sem contrato, imagem ou endosso real". | Não há campo estruturado de autorização por herói (quem autorizou, documento, validade). Hoje é só o texto de aviso. Depende da DP-02. |
| RF-004 Página de herói | Parcial | Biografia, conteúdos filtráveis por tipo, programas. Aba Produtos com origem da associação ("usado em" aponta o conteúdo de origem) em implementação em 20/10/2026. | Origem registrada de cada associação conteúdo↔herói: o vínculo é `content.creator_id`, sem metadado de autorização. Ver RF-003. |
| RF-005 Biblioteca de treinos | Feito | Tipo `workout` com exercícios, duração, nível, vídeo ou texto, autoria, aviso obrigatório de saúde. Filtros por pilar, tipo, nível, personalidade e acesso. Despublicar e arquivar pelo admin, com auditoria. | — |
| RF-006 Biblioteca de receitas | Parcial | Tipo `recipe` com ingredientes, preparo, rendimento, alergênicos, autoria e vínculo. Verificador de alegações de saúde bloqueia termos proibidos na edição. | Informação nutricional não tem campo estruturado nem marcação "validada por profissional". Hoje nada é apresentado como certificado, o que atende o aceite por omissão. |
| RF-007 Calendário editorial | Parcial | Fluxo rascunho → revisão → publicado → arquivado, com rodadas de revisão e auditoria de autor e mudança. | Não há agendamento por data. Proposta: campo `publish_at`, filtro nas políticas de leitura e verificação diária pelo cron. |
| RF-008 Mídias e vídeos | Parcial | Vídeo por URL do YouTube e Vimeo (lista fechada de domínios), player de demonstração com transcrição, capas internas, reprodução responsiva, mensagens de erro. ADR-001 define a troca por Cloudflare Stream. | Sem upload de arquivo e sem metadados de licença por mídia. Arquivos não autorizados não ficam públicos porque só URLs da lista fechada são aceitas. |
| RF-009 Catálogo de produtos | Feito | 24 produtos e 4 operações (1 própria, 3 fictícias) com imagem, preço demonstrativo, descrição, categoria e disponibilidade. Contagem verificada no banco de produção em 20/10/2026. | — |
| RF-010 Carrinho | Feito | Adicionar, ajustar e remover, subtotal e total no servidor. Indisponível ou suspenso bloqueia o checkout (RLS S2, S6, S8). | — |
| RF-011 Checkout demonstrativo | Feito | Destinos predefinidos fictícios, frete fictício, sem pagamento, rótulos de demonstração em todas as telas. Nunca pede endereço real. | — |
| RF-012 Histórico de pedidos | Feito | `/orders` só do dono (RLS), status por remessa. Retenção de 90 dias por `run_retention` com exceções documentáveis em `retention_exceptions`. Rotina executada em produção em 20/10/2026 e registrada em `retention_jobs`. | — |
| RF-013 Gestão de fornecedores | Feito | Operação própria e 3 parceiras. Isolamento de produtos e pedidos por RLS (S6, S8). Portal do fornecedor. | — |
| RF-014 Administração de conteúdo | Feito | CRUD de personalidades, conteúdos de todos os tipos, programas, destaques, traduções, publicação e retirada sem deploy. | Mídia é parte do conteúdo; não há biblioteca de mídia separada. |
| RF-015 Administração comercial | Feito | CRUD de produtos com versões e moderação, preço e estoque demonstrativos, status de pedidos. Pedido guarda fotografia de itens, preços e fornecedor (RLS S8). | — |
| RF-016 Assinaturas e planos | Parcial | Planos, módulos, dependências configuráveis, direitos de acesso e estado de assinatura simulada. Nenhuma cobrança. Atende o "PENDENTE" sem assumir compromisso. | Período promocional não existe. Depende das DP-01 e DP-09. |
| RF-017 Vouchers e campanhas | Não feito | — | Depende da DP-04. Especificação proposta no final deste documento. |
| RF-018 Portal de creators | Parcial | Portal da personalidade: conteúdos, envio para revisão, sugestão de produtos, perfil. | Campanhas, benefícios e feedbacks por creator dependem de RF-017. |
| RF-019 Portal de marcas | Fora da POC | — | P2 no DMR. |
| RF-020 Lives e eventos | Fora da POC | A arquitetura admite: tipos de conteúdo são um enum extensível, e o controle de acesso por módulo se aplica a qualquer tipo. | P2 no DMR. |
| RF-021 Hábitos e gamificação | Feito além do pedido | Sequência diária, conquistas e certificados a partir das ações do próprio usuário. Nenhuma rotina de celebridade é registrada. | Não há consentimento específico para gamificação. Se a decisão for mantê-la, incluir opt-in no onboarding. |
| RF-022 Feedback da comunidade | Parcial | Widget com nota e comentário em toda tela, limite por dia, admin lista e muda status (novo, revisado, arquivado). Nada é publicado automaticamente. | Sem categorias, priorização ou fluxo de moderação. |
| RF-023 Notificações | Não feito | Só os e-mails de autenticação do Supabase. | Proposta: tabela de preferências por usuário com opt-in por tipo, sem envio na POC. |
| RF-024 Auditoria | Parcial | `admin_audit` com data, ator, objeto, ação, antes e depois e justificativa. Retenção de 365 dias. Expurgo registrado em `retention_jobs`. Segredos nunca são gravados. | Acesso de leitura a recursos sensíveis não é auditado, só mudanças. |

## Fluxos ponta a ponta

| Jornada | Estado | Onde |
|---|---|---|
| J-01 Descoberta | Feito | Início → personalidades → perfil → conteúdo → volta ao explorar. E2E de visitante. |
| J-02 Administração editorial | Parcial | Rascunho → revisão → publicação → arquivamento. Sem agendamento e sem licença de mídia. |
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
| 24 produtos, 4 operações, isolamento | Feito e verificado em produção |
| Carrinho e pedido demonstrativo com endereço fictício | Feito |
| Pedido visível só ao dono e à operação autorizada | Feito |
| Sem cobrança, sem endosso real, fictício sinalizado | Feito |
| Retenção de 90 dias implementada, testada, com exceções | Feito |
| Testes integrados de jornadas, segurança e responsividade | Feito, exceto jornadas com login no navegador |

## Decisões pendentes do DMR e como o código as deixa abertas

| DP | Situação no código |
|---|---|
| DP-01 Gratuito, freemium ou assinatura | Planos e módulos são configuráveis pelo admin; nada cobra. Qualquer modelo cabe sem migração. |
| DP-02 Heróis com autorização | Falta o campo de autorização. Hoje todos são fictícios e marcados. |
| DP-03 Volume e cadência de conteúdo | Sem limite técnico. Seed tem 40 conteúdos e 8 programas. |
| DP-04 Vouchers e portais externos | Não implementado. Proposta abaixo. |
| DP-05 Web, Android, iOS | Web responsiva e PWA instalável. Nativo fora da POC. |
| DP-06 Produção e entrega real | Nada real. Transporte é simulado pelo sistema. |
| DP-07 Contratos e royalties | Fora do código. |
| DP-08 Metas de tráfego | Sem teste de carga. |
| DP-09 Comércio × assinatura | Independentes, como a RB-07 manda. A regra pode ser ligada depois por módulo. |

## Divergências entre o DMR e o que foi construído

- **Papéis.** O DMR propõe Editor, Gestor de herói, Gestor de campanhas, Administrador e Superadministrador. O app tem consumidor, personalidade, fornecedor e admin, com escopo por perfil ou operação. Gestor de herói equivale ao papel personalidade com escopo. Editor e Superadministrador não existem. O DMR marca esses papéis como propostas a validar.
- **Vocabulário.** "Herói" no DMR, "personalidade" no app. Trocar o rótulo na interface é uma mudança só de texto, nos três idiomas.
- **Hábitos.** O DMR coloca gamificação como fase futura. O app já tem sequência e conquistas, sem abrir neles. Decidir se mantém.

## Próximos incrementos propostos, por valor e custo

1. **Agendamento de publicação** (RF-007, P0): campo `publish_at`, leitura pública só quando a data chegou, verificação no cron diário. Pequeno.
2. **Autorização por herói e licença por mídia** (RF-003, RF-004, RF-008, RB-05, RB-06): campos de origem, documento e validade, exibidos na página como "origem registrada". Pequeno a médio.
3. **Informação nutricional estruturada com validação** (RF-006): campos por porção e marcação "validado por profissional", exibida só quando marcada. Pequeno.
4. **Preferências de notificação** (RF-023): tabela por usuário com opt-in por tipo e tela em Perfil. Envio fica para depois. Pequeno.
5. **Feedback com categoria e prioridade** (RF-022): categoria, prioridade e responsável no admin. Pequeno.
6. **Vouchers e campanhas** (RF-017, P1): tabelas `campaigns`, `vouchers`, `redemptions` com cota por campanha, validade, resgate único por usuário, concessão de módulo e trilha de uso. Médio. Só depois da DP-04.
7. **Exportação de dados do titular** (RNF-07): botão em Conta que gera um arquivo com os dados do usuário. Pequeno.
8. **Staging separado e monitoramento** (RNF-04, RNF-06): segundo projeto Supabase e captura de erros. Operacional, sem código novo relevante.
