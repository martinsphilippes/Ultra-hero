# Relatório final — POC Ultra Hero

Data: 20/10/2026 · Repositório `martinsphilippes/Ultra-hero` (branch `master`) · Produção: https://ultra-hero.vercel.app

> Regra deste relatório: só aparece como **implementado** o que existe no código **e** foi exercitado por teste ou verificação registrada abaixo. O resto está marcado como parcial ou bloqueado, com o motivo.

## Resumo

| Item | Estado |
|---|---|
| Código do app, banco e testes | Completo e publicado na `master` |
| Site na Vercel | No ar, com deploy automático a cada push e sem erros de runtime nas últimas 24 horas |
| Banco remoto no Supabase | Completo: 19 migrações aplicadas e conferidas contra a referência local (grants, políticas, RLS, gatilhos e funções idênticos; os dados só diferem pelo uso real em produção) |
| Testes | 287 cenários de banco, 636 unitários e 40 E2E com axe. Todos passam |


## Fase 1 — Conteúdo, consumo e administração

### Implementado
- **Banco e segurança**: esquema em 19 migrations, RLS em todas as 61 tabelas, 99 políticas e 92 funções. As RPCs `security definer` têm `search_path` fixo. Colunas protegidas são travadas por gatilho, e uma flag transacional separa ações do sistema. Ações administrativas ficam auditadas.
- **Autenticação e papéis**: e-mail e senha, login com Google (configurado e publicado em 20/10/2026: qualquer conta Google entra, sem lista de testadores), convites com token em hash SHA-256 e expiração, e admin inicial definido por e-mail. Papéis: consumidor, personalidade, fornecedor e admin, com escopo.
- **Kill switch de cadastro**: com "cadastro aberto" desligado, o próprio banco recusa contas novas. As exceções são convidados com convite válido, e-mails da lista de admin inicial e contas demo criadas pelo admin.
- **Suspensão de contas**: o admin suspende e reativa consumidores com justificativa obrigatória e registro na auditoria. Não é possível suspender a si mesmo nem outro admin.
- **Jornadas do consumidor**:
  - Início com recomendações.
  - Explorar com abas e busca por pilar, tipo, herói, acesso e dificuldade. A aba Conteúdos é uma grade estilo Instagram: 3 colunas de quadros quadrados só com a capa, ícone do tipo e cadeado quando restrito, 15 por carga com rolagem infinita e variedade de heróis (no máximo um post por herói em cada rodada, ordem rotacionada por dia).
  - Personalidades e página de conteúdo com player de demonstração e transcrição.
  - Programas com inscrição, versões, substituições e certificado verificável.
  - Evolução com sequência e conquistas.
  - Perfil com planos simulados, interesses, favoritos, listas e exclusão de conta.
  - Onboarding e feedback contextual.
- **Planos simulados**: módulos base, treino, nutrição e chef independentes. FULL não pressupõe Base, e as dependências entre módulos são configuráveis pelo admin.
- **Administração**: usuários, convites, personalidades, fornecedores, revisão editorial, programas e versões, planos, destaques, traduções, moderação de produtos, vínculos conteúdo↔produto, pedidos, feedback, métricas com CSV, auditoria e configurações com kill switches.
- **Recomendações**: motor determinístico rotulado na interface e adaptadores OpenAI e Gemini restritos ao catálogo. A IA falha fechada: sem configuração clara ou diante de qualquer erro, fica desligada. Há limite por hora e bloqueio de termos de prescrição em pt, en e es.
- **Incrementos do DMR 1.0** (20/10/2026, migrações 0017 e 0018, validados em 20 cenários de banco novos):
  - Agendamento de publicação: o admin aprova ou publica com data futura, e a leitura pública, a busca e o acesso só liberam quando a data chega.
  - Direitos por herói: status fictício, autorizado ou pendente, titular e validade, com documento e notas numa tabela só do admin. O selo de fictício só sai com autorização válida.
  - Licença por mídia: tipo de licença, referência e crédito por conteúdo. O banco recusa combinação incompatível com o provedor de vídeo, e o crédito aparece na página.
  - Nutrição validada: informação por porção nas receitas, exibida só quando marcada como validada por profissional, com nome e data. Só o admin marca.
  - Preferências de notificação: opt-in por tipo e canal em Perfil, sem envio na POC. A Política de Privacidade descreve o uso.
  - Feedback com categoria, prioridade, responsável e nota interna, com triagem auditada no admin.
- **Termos de Uso e Política de Privacidade** em pt-BR, en e es. O texto foi conferido contra o código: cookies reais, dados enviados à IA, retenção e o que a exclusão de conta remove. Os links estão no cadastro, com declaração de 18 anos ou mais, e nos rodapés.
- **Plataforma**: PWA instalável com página offline, três idiomas com detecção pelo navegador e tema claro e escuro.

### Parcial
- **Vídeo**: embeds YouTube e Vimeo e player de demonstração funcionam. Cloudflare Stream e Mux existem só como interface (ADR-001).
- **IA real**: os adaptadores foram testados com respostas simuladas, mas não com OpenAI e Gemini de verdade, porque não há chaves. A comparação roda com `npm run eval:recommendations`.

### Decisões
- Regras de negócio no banco, com Server Actions validadas por Zod. A interface nunca é a única barreira.
- Idioma por cookie e cabeçalho, sem prefixo na URL.
- Vocabulário da interface alinhado ao DMR em 20/10/2026: o papel `creator` aparece como "herói" nos três idiomas, sem flexão de gênero, e o selo "Personagem fictício" segue o mesmo critério nas bios do seed (migração 0019). Código, banco e rotas não mudaram. Neste relatório, "personalidade" segue como nome técnico do papel.
- Recomendação determinística como padrão. O LLM só reordena e explica itens que já existem no catálogo.
- Contas demo criadas pelo admin passam pelo cadastro fechado graças a um marcador que só o servidor grava. O mesmo marcador vindo de um cadastro público é recusado.

## Fase 2 — Portais de parceiros e comércio 100% simulado

### Implementado
- **Portal da personalidade** (só por convite): rascunhos, envio para revisão, histórico de rodadas, sugestão de produtos e perfil público.
- **Portal do fornecedor**:
  - Produtos com versões e publicação direta, com moderação posterior do admin.
  - O fornecedor não pode reativar um produto suspenso.
  - Uma mudança significativa suspende automaticamente os vínculos já validados.
  - Remessas vão até "pronto para despacho".
- **Comércio simulado**:
  - 24 produtos fictícios de 4 operações: 1 própria e 3 parceiras.
  - Carrinho com vários fornecedores e checkout com snapshot congelado.
  - Remessas independentes, transporte simulado pelo sistema e cancelamento de pedido de teste.
  - Destinos e frete fictícios, com rótulos de demonstração em todas as telas.

### Decisões
- O fornecedor nunca marca entrega. Os estados seguintes são avançados só pelo sistema, por cron diário e ao abrir a página de pedidos.
- Não há endereço real, pagamento nem integração logística. Isso é garantido por construção: não existem adaptadores externos.

## Fase 3 — Testes, segurança, acessibilidade e documentação

### Evidência de testes (20/10/2026, commit `4fdb0f2`)

| Camada | Resultado | Comando |
|---|---|---|
| Banco: RLS e regras de negócio | 287 de 287 | `npm run test:rls` |
| Unitários, verificados por mutação | 636 de 636 em 12 arquivos | `npm run test` |
| E2E com axe, em Pixel 7 e Desktop Chrome | 40 de 40 local, 40 de 40 contra o banco remoto já migrado e 40 de 40 em produção | `npm run test:e2e` |
| Tipos, lint e mensagens | Limpos. 16 namespaces e 3.085 chaves por idioma | `npm run check` |
| Build de produção | OK | `npm run build` |

"Verificado por mutação" significa que agentes independentes injetaram defeitos no código-fonte e confirmaram que os testes falham. Os defeitos que passaram despercebidos ganharam testes novos.

### Defeitos encontrados pela própria verificação e corrigidos
- **Loja quebrando em produção**: uma constante exportada de um componente cliente quebrava a página.
- **Acessibilidade**: o contraste do texto secundário estava abaixo de 4,5:1 nos dois temas, e o nome acessível do logotipo não continha o texto visível.
- **Kill switch de cadastro sem efeito**: o botão existia no admin e não fazia nada.
- **IA falhando aberta**: um erro ao ler a configuração ou ao contar o uso liberava a IA em vez de bloqueá-la.
- **IDs do seed**: eles não seguiam o RFC 4122, e 49 validações do app recusariam editar os dados de demonstração.
- **Preço "1.500"**: era lido como R$ 1,50.
- **Salvamento de conteúdo pelo admin**: o servidor aceitava capa externa, provedor de vídeo desabilitado e legenda insegura.
- **Vimeo**: links de álbum e showcase salvavam o vídeo errado.
- **Bloqueio de prescrição**: não cobria "medicação" e "remédio".

### Segurança e privacidade
- **Advisors do Supabase** (20/10/2026, após a migração 0018): nenhuma função sem `search_path`, nenhum EXECUTE implícito para PUBLIC, `anon` restrito às 17 RPCs públicas e políticas avaliadas uma vez por consulta. Restam só os avisos inerentes a RPCs de usuários logados e 17 tabelas com duas políticas permissivas de leitura, por desenho.
- A chave service role só existe no servidor. Uma busca no bundle do cliente não encontrou referências a ela.
- Os endpoints de cron exigem `CRON_SECRET`: com segredo ausente ou errado, devolvem 403. Isso está coberto por teste unitário.
- Retenção: analytics por 90 dias, pedidos de teste anonimizados após 90 dias, execuções de recomendação por 30 dias e auditoria por 365 dias. A exclusão de conta é self-service, e o analytics recusa chaves com cara de dado pessoal.

### Parcial
- **Fluxos autenticados no navegador**: não há E2E com login real, porque isso depende de contas de teste num ambiente de staging.
- **WCAG 2.2 AA**: o axe cobre parte. O restante do `docs/launch-checklist.md` precisa de verificação manual.
- **Lighthouse**: ainda não foi medido.

## Ambiente e deploy
- **Vercel**: projeto `ultra-hero`, região gru1 (São Paulo). O deploy é automático a cada push na `master`.
  - Já configuradas: URL e chave publicável do Supabase, `CRON_SECRET` e `NEXT_PUBLIC_SITE_URL`.
  - `SUPABASE_SERVICE_ROLE_KEY` cadastrada em 20/10/2026 (Sensitive, Production e Preview). Os três crons responderam ok em produção.
- **Crons**: o plano Hobby só permite execuções diárias, às 03:00, 03:30 e 04:00 UTC. O transporte simulado também avança ao abrir a página de pedidos.
- **Supabase**: projeto `ultra-hero` em sa-east-1, Postgres 17.
- **Como o banco remoto foi aplicado**: 0001 a 0005 pelo conector, 0006 a 0015 e o seed pelo SQL Editor (o conector exige confirmação humana para comandos destrutivos e ela não aparece neste ambiente), a 0016 pelo conector em 15 blocos as 0017 e 0018 pelo conector em 16 blocos, com E2E 40/40 contra o banco remoto antes de publicar o código, e a 0019 (só dados do seed) pelo conector. Depois de cada etapa, grants, políticas, RLS e dados foram conferidos contra a referência local.

## O que depende de você, em ordem
1. **SMTP próprio**: o envio padrão de e-mails do Supabase tem limite baixo e serve só para testes.
2. **Revisão jurídica** de Termos e Privacidade. Antes da abertura pública, é preciso definir controlador, encarregado e canal de contato.
3. **Chaves OpenAI e Gemini**, se quiser, para rodar a comparação entre provedores.

## Riscos e limitações conhecidos
- **Um único projeto Supabase** serve de desenvolvimento e produção.
- **Conta suspensa**: a sessão já aberta continua válida até o token expirar, em cerca de 1 hora.
- **Retenção sem prazo**: feedback e pedidos anonimizados não têm prazo de exclusão automática.
- **Contato**: o canal de contato não permite resposta, e não há exportação de dados pelo app.
- **Peso das mensagens**: todos os textos de interface vão para o navegador, cerca de 172 KB ou 46 KB comprimidos, no primeiro carregamento.

## Sugestões de melhoria, por prioridade

**Antes de convidar testadores**
1. **Separar staging e produção** em dois projetos Supabase, para que migrações e testes nunca toquem os dados do experimento.
2. **SMTP com domínio próprio**, para que confirmação e recuperação de senha cheguem e não caiam em spam.
3. **Monitoramento**: captura de erros, como Sentry, alerta de disponibilidade e Vercel Analytics, para saber de um incidente antes do usuário.
4. **Direitos do titular**: exportação de dados self-service e canal de contato com resposta, que hoje a política promete só para depois.
5. **Prazos de retenção que faltam**: sugiro 365 dias para feedback e pedidos anonimizados.

**Durante o experimento**
6. **Painel de coortes** de retenção em D1, D7 e D14 por data de cadastro, a métrica que decide se o produto segura o usuário.
7. **Lembretes de sequência** por notificação do PWA. O opt-in já existe em Perfil › Notificações; falta o envio. É a alavanca mais barata de retorno para um produto de hábitos.
8. **E2E autenticado em staging**, cobrindo admin, personalidade, fornecedor e checkout de ponta a ponta.
9. **Mensagens por rota**, carregando só os textos de cada área para reduzir o primeiro carregamento no celular.

**Depois do experimento, se validar**
10. **Vídeo** com Cloudflare Stream, conforme a ADR-001: legenda, proteção de conteúdo e custo previsível.
11. **IA**: rodar a comparação OpenAI vs Gemini com chaves reais e decidir com dados de custo e qualidade.
12. **Pagamentos reais** só depois da validação: gateway com Pix, antifraude, nota fiscal e termos de venda, sem guardar dados de cartão.
