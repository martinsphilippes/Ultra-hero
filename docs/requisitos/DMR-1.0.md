<!-- Convertido do arquivo Ultra_Hero_Documento_Mestre_Requisitos_v1.docx recebido em 20/10/2026. Fonte de verdade: o .docx original. -->

# ULTRA HERO
DOCUMENTO MESTRE DE REQUISITOS | DMR 1.0
Base: reunião transcrita de aproximadamente 41 minutos e decisões previamente aprovadas no projeto.
Data de referência: 20 de outubro de 2026 | Natureza: especificação funcional e de produto, sujeita à validação dos pontos pendentes.
# Controle de interpretação
Marcador
Significado
APROVADO
Decisão confirmada previamente no projeto.
REUNIÃO
Necessidade ou proposta mencionada; não implica aprovação.
RECOMENDADO
Especificação técnica/funcional proposta para viabilizar a POC.
PENDENTE
Exige decisão antes de assumir compromisso comercial ou técnico.
Regra de precedência: decisões aprovadas anteriormente prevalecem sobre hipóteses da reunião; qualquer mudança exige aprovação explícita. A POC não deve representar operações, personalidades ou contratos fictícios como reais.
# 1. Visão e resultados esperados
Ultra Hero é uma plataforma de experiências digitais, conteúdos exclusivos e comércio wellness em torno de múltiplas personalidades, especialistas e marcas. O diferencial é o acesso contextualizado ao universo dos heróis; não se pretende começar como um aplicativo convencional de registro de hábitos.
Resultados da POC: demonstrar publicação e gestão de conteúdo; navegação entre heróis, treinos e receitas; acesso por perfis; fluxo comercial completo com catálogo e pedidos demonstrativos; validação integrada e capacidade de evolução sem retrabalho estrutural.
# 2. Limites e premissas
Tema
Regra
Escopo da POC
Jornadas integradas: conteúdo/administração → portais/comércio → testes integrados (APROVADO).
Catálogo
24 produtos, 4 operações fornecedoras: 1 própria e 3 parceiros fictícios (APROVADO).
Endereços
Somente fictícios ou predefinidos; não exigir endereços reais (APROVADO).
Pedidos
Reter dados pessoais de pedidos demonstrativos por 90 dias; excluir ou anonimizar após, salvo exceções justificadas e documentadas (APROVADO).
Comércio e assinatura
Domínios separados: acesso a conteúdo não deve ser pressuposto como requisito para compra, salvo regra explicitamente aprovada.
Pessoas e marcas
Não usar endosso, nome, imagem ou rotina atribuída a celebridades sem autorização; conteúdo de demonstração claramente rotulado.
Operação real
Pagamentos, entrega, cobrança recorrente e produção real não são inferidos da POC.
# 3. Papéis e matriz de acesso
Perfil
Acessos e responsabilidades propostos
Visitante
Visualizar páginas públicas e chamadas para cadastro, sem dados privados.
Usuário
Acessar conteúdos autorizados; manter perfil; comprar no ambiente demonstrativo; consultar pedidos próprios.
Editor
Criar e atualizar conteúdos; enviar para publicação conforme aprovação.
Gestor de herói
Administrar apenas perfis e conteúdos atribuídos.
Fornecedor
Ver seus produtos, disponibilidade e pedidos associados; sem acesso a outros fornecedores.
Gestor de campanhas
Administrar vouchers e campanhas conforme permissão.
Administrador
Gerir cadastros, permissões, conteúdo, catálogo, pedidos e parâmetros.
Superadministrador
Administrar papéis e configurações críticas, com auditoria.
RECOMENDADO: implementar controle de acesso por função e por recurso (RBAC + escopo de fornecedor/herói). Papéis externos são propostas para validação, não concessões automáticas.
# 4. Requisitos funcionais detalhados
## RF-001 | Cadastro e autenticação
Status: RECOMENDADO  •  Prioridade: P0
Requisito: Permitir registro, login, saída e recuperação de acesso, com confirmação adequada e proteção contra abuso.
Aceite: Conta criada e autenticada; sessão expira; usuário não acessa dados de terceiros.
## RF-002 | Home orientada a conteúdo
Status: REUNIÃO  •  Prioridade: P0
Requisito: Exibir heróis, conteúdos recentes e caminhos claros para treinos, receitas e loja; evitar abrir em painel de hábitos zerado.
Aceite: Usuário alcança perfil e conteúdo em até poucos passos e visualiza estado vazio compreensível.
## RF-003 | Catálogo de heróis
Status: REUNIÃO  •  Prioridade: P0
Requisito: Listar personalidades com categorias, imagens autorizadas, descrição e status de publicação.
Aceite: Somente heróis publicados aparecem ao público; ausência de autorização impede alegações reais.
## RF-004 | Página de herói
Status: REUNIÃO  •  Prioridade: P0
Requisito: Reunir biografia, conteúdos, treinos, receitas e produtos relacionados com identificação da origem de cada associação.
Aceite: Links funcionam; materiais restritos respeitam permissões; atribuições têm origem registrada.
## RF-005 | Biblioteca de treinos
Status: REUNIÃO  •  Prioridade: P0
Requisito: Publicar treinos/exercícios com título, duração, nível, vídeo ou texto, autoria, advertências e vínculo opcional a herói.
Aceite: Conteúdo é filtrável, visualizável e pode ser retirado de publicação.
## RF-006 | Biblioteca de receitas
Status: REUNIÃO  •  Prioridade: P0
Requisito: Publicar receitas com ingredientes, preparo, rendimento, informações nutricionais quando validadas, autoria e vínculo a herói.
Aceite: Receita completa é exibida; alegações nutricionais sem validação não são apresentadas como certificadas.
## RF-007 | Calendário editorial
Status: RECOMENDADO  •  Prioridade: P0
Requisito: Agendar publicação de conteúdos, com rascunho, revisão, publicado e arquivado.
Aceite: Conteúdo programado entra no ar na data definida; histórico registra autor e mudança.
## RF-008 | Mídias e vídeos
Status: RECOMENDADO  •  Prioridade: P0
Requisito: Permitir upload/URL de mídia, miniaturas, legendas quando disponíveis e metadados de licença.
Aceite: Reprodução responsiva e mensagens de erro claras; arquivos não autorizados não ficam públicos.
## RF-009 | Catálogo de produtos
Status: APROVADO  •  Prioridade: P0
Requisito: Exibir 24 itens demonstrativos, ligados a quatro operações fornecedoras, com imagem, preço demonstrativo, descrição, categoria e disponibilidade.
Aceite: Há exatamente 24 produtos de demonstração e 4 operações cadastradas (1 própria, 3 fictícias).
## RF-010 | Carrinho
Status: RECOMENDADO  •  Prioridade: P0
Requisito: Adicionar, ajustar quantidade e remover produtos; calcular subtotal e total demonstrativo.
Aceite: Valores recalculados; produtos indisponíveis não podem finalizar pedido.
## RF-011 | Checkout demonstrativo
Status: APROVADO  •  Prioridade: P0
Requisito: Finalizar pedido sem cobrar dinheiro real, usando somente endereços fictícios/predefinidos.
Aceite: Pedido gerado e claramente marcado como demonstração; não solicita endereço real.
## RF-012 | Histórico de pedidos
Status: APROVADO  •  Prioridade: P0
Requisito: Exibir pedidos vinculados à conta e seus estados demonstrativos, aplicando retenção de 90 dias.
Aceite: Usuário só consulta seus pedidos; política de expurgo é executável e auditável.
## RF-013 | Gestão de fornecedores
Status: APROVADO  •  Prioridade: P0
Requisito: Representar operação própria e três parceiros fictícios, com isolamento de produtos e pedidos.
Aceite: Fornecedor não edita nem consulta dados de outro fornecedor.
## RF-014 | Administração de conteúdo
Status: APROVADO  •  Prioridade: P0
Requisito: CRUD de heróis, treinos, receitas, mídias, destaques e publicação, conforme papel.
Aceite: Administrador publica e retira conteúdo sem editar código.
## RF-015 | Administração comercial
Status: RECOMENDADO  •  Prioridade: P0
Requisito: CRUD de produtos, preços demonstrativos, estoque e status de pedidos.
Aceite: Alterações refletem no catálogo; pedido mantém fotografia dos itens e preços da compra.
## RF-016 | Assinaturas e planos
Status: PENDENTE  •  Prioridade: P1
Requisito: Modelar planos, direitos de acesso, período promocional e estado de assinatura, sem ativar cobrança recorrente antes da decisão.
Aceite: Acesso por direito é testável; nenhuma cobrança real ocorre na POC.
## RF-017 | Vouchers e campanhas
Status: REUNIÃO  •  Prioridade: P1
Requisito: Permitir códigos promocionais, cotas por campanha/marca, validade, resgate e trilha de uso.
Aceite: Código não ultrapassa cota nem pode ser resgatado indevidamente.
## RF-018 | Portal de creators
Status: REUNIÃO  •  Prioridade: P1
Requisito: Cadastrar influenciadores e vincular campanhas, benefícios e feedbacks.
Aceite: Influenciador visualiza apenas campanhas e dados atribuídos.
## RF-019 | Portal de marcas
Status: REUNIÃO  •  Prioridade: P2
Requisito: Exibir campanhas e indicadores de resgates autorizados, sem expor dados pessoais desnecessários.
Aceite: Métricas agregadas respeitam escopo e privacidade.
## RF-020 | Lives e eventos
Status: REUNIÃO  •  Prioridade: P2
Requisito: Prever extensão para transmissões, agenda e acesso restrito, sem exigir streaming na POC.
Aceite: Arquitetura admite associação de evento a herói e direito de acesso.
## RF-021 | Hábitos e gamificação
Status: REUNIÃO  •  Prioridade: P2
Requisito: Prever hidratação, desafios, score e recompensas para fase futura, com consentimento e critérios verificáveis.
Aceite: Nenhum dado de rotina de celebridade é inventado ou apresentado como registro real.
## RF-022 | Feedback da comunidade
Status: REUNIÃO  •  Prioridade: P1
Requisito: Coletar sugestões estruturadas de creators e usuários, com moderação e priorização.
Aceite: Feedback registrado sem publicação automática de conteúdo ofensivo ou sensível.
## RF-023 | Notificações
Status: RECOMENDADO  •  Prioridade: P1
Requisito: Preparar notificações transacionais e editoriais com preferências do usuário.
Aceite: Preferências são respeitadas; nenhuma campanha é disparada sem base apropriada.
## RF-024 | Auditoria
Status: RECOMENDADO  •  Prioridade: P0
Requisito: Registrar mudanças administrativas, acesso a recursos sensíveis e ações de expurgo.
Aceite: Eventos críticos têm data, ator, objeto e ação, sem registrar segredos.
# 5. Fluxos ponta a ponta
## J-01 Descoberta de conteúdo
Home → lista de heróis → perfil → treino/receita → conteúdo → retorno à descoberta.
## J-02 Administração editorial
Editor cria rascunho → anexa mídia e licença → revisão → publicação/agendamento → exibição → arquivamento.
## J-03 Compra demonstrativa
Loja → produto → carrinho → endereço predefinido → confirmação demonstrativa → histórico → alteração de status.
## J-04 Operação do fornecedor
Login com escopo → catálogo próprio → atualização de disponibilidade → consulta de pedidos próprios.
## J-05 Promoção futura
Campanha → geração de voucher → distribuição por creator → resgate → concessão de direito → relatório.
## J-06 Privacidade
Criação de pedido → prazo de retenção → exclusão/anonimização após 90 dias → registro de execução/exceção.
# 6. Telas mínimas e estados
Área
Telas / estados
Público
Landing, login, cadastro, recuperação, termos e privacidade.
Conteúdo
Home, listagem de heróis, perfil de herói, biblioteca, detalhe de treino, detalhe de receita, busca/filtragem.
Comércio
Catálogo, detalhe de produto, carrinho, checkout demonstrativo, confirmação, pedidos, detalhe do pedido.
Conta
Perfil, preferências e acesso/benefícios quando habilitados.
Administração
Dashboard, usuários/papéis, heróis, conteúdo, mídia, produtos, fornecedores, pedidos, auditoria.
Estados obrigatórios
Carregando, vazio, erro, acesso negado, não encontrado, indisponível e sucesso.
# 7. Modelo de dados conceitual
Entidades sugeridas: User, Role, Permission, UserRole, Hero, HeroTeam, Content, ContentMedia, ContentHeroLink, Recipe, Workout, Product, Supplier, Inventory, Cart, CartItem, Order, OrderItem, DemonstrationAddress, Campaign, Voucher, Redemption, Plan, Entitlement, Subscription, AuditLog, Consent, RetentionJob, Feedback.
Relações críticas: pedido pertence a usuário; itens de pedido preservam nome/preço/fornecedor no momento da criação; produto pertence a fornecedor; conteúdo pode se associar a múltiplos heróis com metadados de autorização; concessões de acesso são separadas de compra física.
# 8. Regras de negócio e integridade
RB-01: o comércio demonstrativo não movimenta recursos financeiros reais.
RB-02: pedidos demonstrativos exigem usuário autenticado e endereço predefinido/fictício.
RB-03: os dados pessoais de pedidos são excluídos ou anonimizados após 90 dias, salvo exceção justificada e documentada.
RB-04: fornecedores só administram seus próprios recursos.
RB-05: associação a celebridade não significa endosso sem documentação de autorização.
RB-06: conteúdo deve indicar autoria, origem, status e direitos de publicação.
RB-07: planos e acesso a conteúdos são independentes do carrinho e da operação fornecedora, salvo futura regra expressamente aprovada.
RB-08: conteúdo médico/nutricional deve trazer ressalvas adequadas e evitar alegações não verificadas.
RB-09: preço, estoque e totais são validados no servidor, não apenas na interface.
RB-10: a publicação pode ser revertida e ações críticas devem ser auditáveis.
# 9. Requisitos não funcionais
ID
Exigência / aceite sugerido
RNF-01
Responsividade em celular e desktop; navegação por teclado e rótulos acessíveis.
RNF-02
Senhas com hash forte, HTTPS, gestão segura de sessões, rate limiting e validação server-side.
RNF-03
Autorização server-side por papel e por objeto; testes contra acesso horizontal indevido.
RNF-04
Backups e restauração testados; ambientes separados de desenvolvimento, homologação e produção.
RNF-05
Mídia distribuída por serviço adequado; paginação e cache para crescimento de tráfego.
RNF-06
Logs estruturados, monitoramento de erros e alertas de indisponibilidade.
RNF-07
LGPD: minimização, base legal, informação ao titular e política de retenção; avaliar direitos de titulares.
RNF-08
Não incorporar segredos no front-end; variáveis de ambiente e rotação de credenciais.
RNF-09
Metas quantitativas de desempenho, disponibilidade e carga ficam pendentes de dimensionamento.
RNF-10
Testes automatizados para autenticação, permissões, conteúdo, carrinho, pedidos e expurgo.
# 10. Arquitetura e integrações
RECOMENDADO: aplicação web responsiva como canal inicial da POC, com backend modular, API documentada, banco relacional, armazenamento de mídia e painéis por papel. Android/iOS nativos e publicação em lojas dependem de cronograma, custo e regras comerciais.
Integrações reais de gateway, iFood, logística, notificações e analytics devem permanecer desacopladas e condicionadas à aprovação. O fluxo demonstrativo pode utilizar provedores simulados, explicitamente identificados.
# 11. Critérios globais de aceite da POC
☐ Usuário cadastra-se, autentica-se e navega entre heróis, treinos e receitas publicados.
☐ Administrador cria, revisa, publica, despublica e organiza conteúdos sem deploy.
☐ Catálogo contém 24 produtos vinculados a 4 operações, com isolamento de dados.
☐ Usuário adiciona produtos ao carrinho e conclui pedido demonstrativo com endereço fictício/predefinido.
☐ Pedido aparece no histórico apenas do usuário proprietário e na operação fornecedora autorizada.
☐ O sistema não cobra dinheiro, não simula endosso real e sinaliza elementos fictícios.
☐ Retenção de 90 dias possui rotina implementada, testada e com exceções documentáveis.
☐ Testes integrados passam para jornadas principais, segurança e responsividade.
# 12. Plano de execução e gates
Etapa
Entrega
Gate
0 — Alinhamento
Fluxograma, backlog, mapa de papéis e decisões bloqueadoras.
Aprovação dos fluxos e escopo.
1 — Conteúdo/admin
Autenticação, heróis, receitas, treinos, mídia, painel editorial.
Publicação ponta a ponta validada.
2 — Portais/comércio
Fornecedores, 24 produtos, carrinho, pedidos, endereços demonstrativos.
Compra demonstrativa e segregação aprovadas.
3 — Integração/qualidade
E2E, segurança, retenção, acessibilidade, desempenho e correções.
Checklist global concluído.
4 — Comercial (fora da POC até aprovação)
Pagamento real, contratos, produção, logística e lançamento em lojas.
Licenças, operação, políticas e viabilidade aprovadas.
P0 = essencial para POC; P1 = próximo incremento condicionado; P2 = evolução futura. Prazos absolutos não foram confirmados na reunião.
# 13. Riscos e dependências
Risco
Mitigação
Falta de conteúdo recorrente
Definir estoque editorial, responsáveis e cadência antes do lançamento.
Uso indevido de imagem/marca
Exigir autorização, revisão jurídica e rastreabilidade de ativos.
Pico de tráfego por celebridade
Teste de carga, CDN e observabilidade antes de campanha pública.
Complexidade de pagamentos/lojas
Separar POC de cobrança real; validar regras comerciais vigentes.
Operação física indisponível
Usar apenas catálogo demonstrativo até validação de produção e logística.
Escopo crescente
Controle de mudanças e critérios de aceite por jornada.
Informação de saúde incorreta
Revisão profissional e indicação clara de conteúdo adaptado.
# 14. Registro de decisões pendentes
ID
Decisão necessária
Impacto
DP-01
Gratuito, freemium ou assinatura e quando cobrar.
Acesso, pagamento, comunicação.
DP-02
Quais heróis e conteúdos possuem autorização e disponibilidade.
Catálogo editorial e lançamento.
DP-03
Quantidade inicial e frequência de treinos/receitas.
Operação de conteúdo.
DP-04
Escopo de vouchers e portais externos na POC.
Backlog e permissões.
DP-05
Web, Android e iOS: canais e ordem.
Arquitetura e prazo.
DP-06
Cidade, fábrica, capacidade e entrega real de marmitas.
Comércio real.
DP-07
Contratos, royalties, licenças e responsabilidades de marcas.
Jurídico e monetização.
DP-08
Metas de tráfego, desempenho e disponibilidade.
Infraestrutura e testes.
DP-09
Detalhamento da regra aprovada de comércio versus assinatura.
Permissões e checkout.
# 15. Governança e rastreabilidade
Toda mudança deve registrar: ID, origem (reunião/aprovação/recomendação), responsável pela decisão, data, impacto em telas/dados/APIs, prioridade e critérios de aceite. Recomenda-se manter backlog com referência a cada RF e RNF e exigir demonstração por jornada antes de considerar a entrega concluída.
Responsabilidades discutidas: Enrico (coordenação/estratégia), Átila e Enrico (tecnologia/fluxos), equipe de branding mencionada na reunião (comunicação), William e John (relacionamento com influenciadores), Fernando e parceiros (frente operacional). Atribuições finais precisam ser formalizadas.
# 16. Nota de encerramento
Este DMR é uma base implementável para a POC, não uma declaração de que celebridades, fornecedores reais, pagamentos ou entregas estão contratados ou operacionais. O desenvolvimento deve começar pelos itens P0, com demonstrações progressivas e validação explícita dos pontos pendentes antes da expansão comercial.