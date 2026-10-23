# Relatório final — POC Ultra Hero

Data: 20/10/2026 (atualizado em 23/10/2026: receitas fases 1–6, prateleiras de programas, Hoje com relógio simulado, Lembretes e relógio real oculto) · Repositório `martinsphilippes/Ultra-hero` (branch `master`) · Produção: https://ultra-hero.vercel.app

> Regra deste relatório: só aparece como **implementado** o que existe no código **e** foi exercitado por teste ou verificação registrada abaixo. O resto está marcado como parcial ou bloqueado, com o motivo.

## Resumo

| Item | Estado |
|---|---|
| Código do app, banco e testes | Completo e publicado na `master` |
| Site na Vercel | No ar (ponta da master `f91a079`), com deploy automático a cada push e sem erros de runtime nas últimas 12 horas (conferido em 23/10/2026) |
| Banco remoto no Supabase | 0001–0039 aplicadas (38 migrações; a 0034 não existe) e 39 registros em `supabase_migrations.schema_migrations` (o remoto sempre teve 1 registro a mais que os arquivos); 0027–0033 e 0035–0039 pelo método `http_get` + md5 a partir do arquivo do commit no GitHub (seção "Receitas, prateleiras e Hoje"). Na conferência registrada para esta fase: 184 funções, 85 tabelas (0 sem RLS) e 137 políticas em `public`, 12 tabelas no schema `health`, sem nenhum dado de saúde (o `metric_catalog` tem 87 linhas e `health.config` guarda a trava `connect_open='false'`, `consent_version='2026-10-draft-1'` e `min_age=18`), e 17 funções `security definer` executáveis pelo visitante (a lista fixa do S14), iguais ao banco local com as mesmas 38 migrações. **Nada pendente de aplicação** |
| Testes (23/10/2026, `master` em `f91a079`) | 991 asserções de banco (S0–S51), 1.377 unitários aprovados e 1 pulado em 55 arquivos e 284 E2E em 23 arquivos, com axe no Pixel 7 e no Desktop Chrome. E2E local (`next start`): 259 aprovados e 25 pulados (envios reais atrás de `E2E_*_REAL=1`, testes de um projeto só e pulos que dependem do remoto ou da hora, como `recipes-catalog.spec.ts:279` e `today-watch.spec.ts:166`). Contra produção: 258 aprovados, 24 pulados e 2 falhas que eram erros do teste, não do app, corrigidas em `f91a079` (os dois arquivos de novo contra produção: 22 aprovados e 4 pulados por desenho). A publicação efêmera da P4 rodou e passou contra produção |
| Relógio real (Garmin, Oura, WHOOP e Polar) | Desenvolvido e oculto no projeto único, pronto para ligar: chave `WEARABLES_REAL_ENABLED` desligada na Vercel e trava no banco (`health.config` com `connect_open='false'`); 0038 e 0039 aplicadas vazias. Roteiro em `docs/decisions/hoje-relogio.md`, seção "Roteiro de ligar" |


## Fase 1 — Conteúdo, consumo e administração

### Implementado
- **Banco e segurança**: em 21/10/2026, com 26 migrações: RLS em todas as 67 tabelas, 108 políticas e 104 funções (hoje, com 0001–0039 no banco local e no remoto: 38 migrações, 85 tabelas em `public`, todas com RLS, 137 políticas e 184 funções, mais 12 tabelas no schema `health`). As RPCs `security definer` têm `search_path` fixo. Colunas protegidas são travadas por gatilho, e uma flag transacional separa ações do sistema. Ações administrativas ficam auditadas.
- **Autenticação e papéis**: e-mail e senha, login com Google (configurado e publicado em 20/10/2026: qualquer conta Google entra, sem lista de testadores), convites com token em hash SHA-256 e expiração, e admin inicial definido por e-mail. Papéis: consumidor, personalidade, fornecedor e admin, com escopo.
- **Kill switch de cadastro**: com "cadastro aberto" desligado, o próprio banco recusa contas novas. As exceções são convidados com convite válido, e-mails da lista de admin inicial e contas demo criadas pelo admin.
- **Suspensão de contas**: o admin suspende e reativa consumidores com justificativa obrigatória e registro na auditoria. Não é possível suspender a si mesmo nem outro admin.
- **Jornadas do consumidor**:
  - Início com recomendações.
  - Explorar com abas e busca por pilar, tipo, herói, acesso e dificuldade. A aba Conteúdos é uma grade estilo Instagram: 3 colunas de quadros quadrados só com a capa, ícone do tipo e cadeado quando restrito, 15 por carga com rolagem infinita e variedade de heróis (no máximo um post por herói em cada rodada, ordem rotacionada por dia).
  - Heróis: a página do herói é um hub. Depois do cabeçalho (foto, nome, headline, pilares, selo, contagens e bio) vêm as bibliotecas do herói como botões em largura total, por tipo e pilar (Rotina, Nutrição, Receitas, Treinos, Gastronomia, Programas e Produtos), só as que têm itens, com contagem. Cada biblioteca abre a sua página: grade de quadrados para conteúdos (como o Explorar), cards para programas e cards com carrinho de teste para produtos. Cada conteúdo entra numa única biblioteca (receita, depois treino, depois pilar). As abas antigas redirecionam para a biblioteca correspondente.
  - Página de conteúdo com player de demonstração e transcrição.
  - Programas com inscrição, versões, substituições e certificado verificável.
  - Início é um feed infinito estilo Instagram: posts um abaixo do outro (10 por carga, mesma variedade de heróis do Explorar, igual para todos), com o herói no topo levando ao perfil dele, capa 4:5 de borda a borda no celular e coluna central de 470px no computador. O Explorar tem só a caixa de busca e as abas, sem chips de pilar nem filtros. Na parte do consumidor as etiquetas de pilar são neutras; os portais seguem coloridos.
  - Receitas existem em todo herói (migração 0024): as próprias e as que ele indica, cada uma assinada pelo chef que a fez e marcada "Indicada por {herói}" quando o chef é outro. Receitas abrem só depois da etapa demonstrativa em 4 passos (aceitar o aviso de que não há revisão profissional, restrições e alergias de lista fixa, interesses, confirmar), que vale para todos e para o app inteiro; a página da receita lembra as alergias informadas. Restrições e alergias são dados sensíveis de saúde, ficam só do dono (RLS) e somem com a conta.
  - Navegação com 4 abas (Início, Explorar, Heróis e Perfil). A Evolução virou seção do Perfil em `/profile/evolution`, com cartão-resumo no Perfil, e a rota antiga `/evolution` responde 308 preservando a query.
  - Evolução com sequência e conquistas. A faixa de 14 dias e a melhor sequência contam só conteúdos concluídos e entradas em programas (migração 0037, decisão Q10); até ela, os itens de rotina marcados (`routine_checks`) também contavam, e hoje, como Lembretes, não contam.
  - Perfil com planos simulados, interesses, favoritos, listas e exclusão de conta. Desde 21/10/2026 abre com **"Hoje"** (migração 0022): data local no fuso do perfil, "Seu dia, em foco." e o **Ritmo de hoje** com contador feito/total, que une os próximos itens obrigatórios dos programas em que a pessoa está inscrita (até 2 por programa e 3 no total, marcados com a mesma RPC de conclusão de conteúdo) e os itens manuais (título, nota, horário e dias da semana; até 20 ativos, só do dono por RLS; marcação diária pela RPC `routine_check`, que calcula a data local e devolve a sequência). **Hidratação** (passos de 250 ml, meta ajustável) e **Registrar descanso** (descansei hoje e horas opcionais, sem metas prescritas) ficam só no aparelho, no armazenamento local do navegador, lidos depois de montar e com aviso quando o navegador bloqueia o storage; nada disso vai ao banco. A Política de Privacidade descreve os itens de rotina entre os dados guardados e o registro local entre os não coletados (versão de 21/10/2026). A exclusão de conta cobre as tabelas novas: `routine_items` e `routine_checks` têm chave estrangeira para `auth.users` com `on delete cascade`, e `delete_my_account` apaga o usuário de auth. **Atualização de 22/10/2026 (F1 + F2 de `docs/decisions/hoje-relogio.md`):** o Hoje passou a mostrar só o que o relógio mede sozinho — Hidratação, Descanso e itens manuais saíram da tela (os itens continuam no banco e na sequência até as decisões Q5/Q10), as chaves locais `uh:today:*` são apagadas do aparelho uma vez, as sugestões de programa viraram "Continue seus programas" (depois da Evolução) e as contas demo veem um relógio simulado determinístico (blocos "Sua noite" e "Seu dia até agora", detalhe por categoria com tendência de 7/30 dias, "Sobre seus dados"), gerado na hora e nunca gravado. Depois, os itens manuais viraram Lembretes em Perfil › Lembretes, fora do Hoje (Q5), e saíram da sequência (Q10, 0037).
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
- **Identidade visual** (21/10/2026): logomarca do material oficial (losango laranja #FF5A1F e wordmark ULTRA HERO), tipografia Manrope para texto e títulos e DM Mono para etiquetas, servidas pelo próprio app, com contraste AA conferido pelo axe. As artes dos heróis fictícios e das capas continuam geradas.

### Parcial
- **Vídeo**: embeds YouTube e Vimeo e player de demonstração funcionam. O herói posta vídeo gravado no celular pelo Cloudflare Stream (veja Fase 2); o Stream está ligado na Vercel (`CLOUDFLARE_*`, `VIDEO_PROVIDER`; `docs/launch-checklist.md`), e o E2E do envio real fica atrás de `E2E_STREAM_REAL=1` para rodar contra produção. Faltam a URL assinada para conteúdo premium e as legendas. Mux existe só como interface (ADR-001).
- **IA real**: os adaptadores foram testados com respostas simuladas, mas não com OpenAI e Gemini de verdade, porque não há chaves. A comparação roda com `npm run eval:recommendations`.

### Decisões
- Regras de negócio no banco, com Server Actions validadas por Zod. A interface nunca é a única barreira.
- Idioma por cookie e cabeçalho, sem prefixo na URL.
- Vocabulário da interface alinhado ao DMR em 20/10/2026: o papel `creator` aparece como "herói" nos três idiomas, sem flexão de gênero, e o selo "Personagem fictício" segue o mesmo critério nas bios do seed (migração 0019). Código, banco e rotas não mudaram. Neste relatório, "personalidade" segue como nome técnico do papel.
- Recomendação determinística como padrão. O LLM só reordena e explica itens que já existem no catálogo.
- Contas demo criadas pelo admin passam pelo cadastro fechado graças a um marcador que só o servidor grava. O mesmo marcador vindo de um cadastro público é recusado.

## Fase 2 — Portais de parceiros e comércio 100% simulado

### Implementado
- **Portal da personalidade** (só por convite): rascunhos, publicação direta, histórico de rodadas, sugestão de produtos e perfil público.
  - **Novo post com vídeo do celular** (21/10/2026), em `/creator/post/new`: botão "+ Novo post" no topo do painel e da lista de conteúdos e primeiro item do menu do portal. Tela de uma coluna com botões grandes: "Gravar vídeo" abre a câmera do celular e "Escolher da galeria" abre os vídeos do aparelho. O navegador confere tipo, até 2 GB e até 3 minutos antes de enviar. O vídeo sobe direto para o Cloudflare Stream por tus (retoma se a conexão cair, aviso antes de sair da página) enquanto o herói escreve título, legenda e pilar. "Publicar" libera quando o envio termina e espera o Cloudflare processar ("Processando vídeo…"). O ticket e o rascunho nascem juntos no servidor, então o uid do vídeo fica preso ao rascunho do dono e o cliente nunca o informa; antes de publicar, o servidor confere estado, duração e dono do vídeo no Cloudflare. Em produção o Stream está ligado (`CLOUDFLARE_*` e `VIDEO_PROVIDER` na Vercel); num ambiente sem as chaves (como o `.env.local`), a tela abre com "Vídeo ainda não configurado" e os botões de vídeo desabilitados. Descartar apaga o rascunho e o vídeo (RPC `creator_discard_video_draft`, só rascunho de vídeo próprio que nunca foi ao ar); sair pela navegação interna ou pelo voltar no meio do envio pede confirmação, a conexão que volta retoma o envio sozinha e o slug do post sai do título final (`creator_set_draft_slug`).
  - **Publicação direta** (migração 0025): o herói publica e despublica o próprio conteúdo sem fila; o editor troca "Enviar para revisão" por "Publicar" (com o checklist como ajuda) e "Despublicar". A administração continua definindo regra de acesso, módulo e destaque e pode arquivar.
  - **Dono do vídeo amarrado no banco** (migração 0026): o uid do Cloudflare é público (vai na capa), então a checagem não pode viver só na action. Cada ticket de upload grava `stream_uploads` (uid → herói, validade, descarte), só pelo service role; o herói lê os próprios envios e não escreve. Um gatilho em `content_bodies` recusa `cloudflare_stream` sem vínculo do próprio herói (`stream_media_forbidden`) e `creator_publish_content` recusa publicar sem ele; o servidor também exige que o campo `creator` do vídeo no Cloudflare seja o herói. Limite de 10 envios por herói por hora (action e gatilho). Limpeza diária no cron de retenção (até 50 por execução): apaga no Cloudflare o vídeo de envio descartado e remove rascunho nunca publicado cujo envio venceu com vídeo incompleto, com erro ou inexistente; nunca toca publicado nem envio na validade. Sem `SUPABASE_SERVICE_ROLE_KEY` no servidor (caso do `.env.local`), a tela de novo post mostra "não configurado".
- **Portal do fornecedor**:
  - Produtos com versões e publicação direta, com moderação posterior do admin.
  - O fornecedor não pode reativar um produto suspenso.
  - Uma mudança significativa suspende automaticamente os vínculos já validados.
  - Remessas vão até "pronto para despacho".
- **Comércio simulado**:
  - 24 produtos fictícios de 4 operações: 1 própria e 3 parceiras.
  - **Produtos reais da marca Ultra.e Life** (21/10/2026, migração 0021): 7 produtos (e.water Citrus e Tangerina, e.creatina Gummy e Pó, e.focus, e.daily e e.melatonina) com imagem real, preço da marca e link "Ver na loja oficial" (nova aba, só https validada), nas categorias Suplementos e Hidratação. O fornecedor "Ultra.e Life" não é fictício e não leva o selo. As compras seguem simuladas: o carrinho de teste continua igual e a loja oficial é só um link externo.
  - **Alocação produto↔herói validada pelo admin** (tabela `creator_products`, RPC `admin_set_creator_product` auditada): a biblioteca Produtos do herói une as alocações diretas validadas (primeiro, na ordem da vitrine) com os produtos vinculados por conteúdo (depois, com "usado em"), sem repetir. Em `/admin/creators/[id]`, a seção "Produtos do herói" lista todos os produtos publicados com o status da alocação e as ações validar, suspender e rejeitar. No seed, todos os 8 heróis receberam os 7 produtos validados.
  - Carrinho com vários fornecedores e checkout com snapshot congelado.
  - Remessas independentes, transporte simulado pelo sistema e cancelamento de pedido de teste.
  - Destinos e frete fictícios, com rótulos de demonstração em todas as telas.

### Decisões
- O fornecedor nunca marca entrega. Os estados seguintes são avançados só pelo sistema, por cron diário e ao abrir a página de pedidos.
- Não há endereço real, pagamento nem integração logística. Isso é garantido por construção: não existem adaptadores externos.

## Fase 3 — Testes, segurança, acessibilidade e documentação

### Evidência de testes (21/10/2026, após a 0026: dono do vídeo do Stream no banco)

| Camada | Resultado | Comando |
|---|---|---|
| Banco: RLS e regras de negócio | 543 de 543 (banco local com as 26 migrações) | `npm run test:rls` |
| Unitários (os anteriores verificados por mutação; os desta rodada ainda não) | 849 de 849 em 22 arquivos | `npm run test` |
| E2E com axe, em Pixel 7 e Desktop Chrome | 134 de 134 local contra o banco remoto (2 pulados: envio real ao Cloudflare, só com `E2E_STREAM_REAL=1`) | `npm run test:e2e` |
| Tipos, lint e mensagens | Limpos. 18 namespaces e 3.417 chaves por idioma | `npm run check` |
| Build de produção | OK | `npm run build` |

"Verificado por mutação" significa que agentes independentes injetaram defeitos no código-fonte e confirmaram que os testes falham. Os defeitos que passaram despercebidos ganharam testes novos.

Rodada atual (23/10/2026, `master` em `f91a079`): 991 asserções de banco (S0–S51) com as 38 migrações, 1.377 unitários aprovados e 1 pulado em 55 arquivos, 284 E2E em 23 arquivos e 22 namespaces com 4.875 chaves por idioma; detalhes em "Evidência de testes" da seção "Receitas, prateleiras e Hoje".

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
- **Fluxos autenticados no navegador**: os E2E entram com as contas demo (`loginAs`), mas o fornecedor (`/seller`) e o checkout completo ainda não têm jornada E2E.
- **WCAG 2.2 AA**: o axe cobre parte. O restante do `docs/launch-checklist.md` precisa de verificação manual.
- **Lighthouse**: ainda não foi medido.

## Receitas, prateleiras e Hoje (21–23/10/2026)

### Implementado
- **Módulo de receitas, fases 1 a 6** (`docs/decisions/recipes-module.md`): modelo estruturado com backfill das 8 receitas (0027–0029), mídia no Storage (0028), Portal do Chef com editor em 6 etapas, versões e credenciais decididas sobre o texto visto pelo admin (0032), catálogo em Explorar › Receitas, página da receita, perfil do chef, Modo Cozinha, Minha coleção e histórico opcional, lista de compras ligada ao comércio de teste com o vínculo ingrediente↔produto (0033) e, na fase 6, as jornadas E2E que já rodaram contra produção (chef cria, salva e recarrega; persistência; permissões; comércio) e a exclusão da receita arquivada pelo herói (0036, `creator_delete_recipe`, aplicada no remoto). Regra de revisão por tipo desligada nos 5 tipos (P1), auditada quando o admin muda.
- **Prateleiras de programas** (`docs/decisions/program-shelves.md`, 0035): 3 programas por herói, 24 no total, cada um como prateleira de quadrados com rolagem lateral.
- **Hoje com relógio** (`docs/decisions/hoje-relogio.md`): F1 (sem nada digitado) e F2 (relógio simulado nas contas demo, gerado na hora e nunca gravado). F3 e F4 (relógio real) estão desenvolvidas e ocultas (veja "Parcial").
- **Lembretes** em Perfil › Lembretes, fora do Hoje (Q5), e sequência só com conteúdos concluídos e entradas em programas (Q10, 0037).
- **Publicação efêmera da P4** (publicar → catálogo pela conta free → assinatura → perfil do chef → Modo Cozinha → arquivar e excluir), exercitada e aprovada contra produção (`recipes-journeys.spec.ts`): a receita "[E2E] Jornada …" foi ao ar, a conta free a achou, o Modo Cozinha abriu e no fim ela saiu do remoto (arquivar + excluir pela 0036). Depois do E2E o remoto ficou limpo: 0 conteúdo com título `'[E2E]%'`, 0 itens em `shopping_list_items` e em `recipe_ingredient_products`, e os favoritos da conta free no estado inicial (g1 e g3).

### Parcial
- **Relógio real (F3 + F4: Garmin, Oura, WHOOP e Polar)**: desenvolvido e **oculto** no projeto único (decisão do dono: sem ambiente novo; tudo pronto e escondido para ligar rápido). A chave `WEARABLES_REAL_ENABLED` está desligada na Vercel e a trava no banco (`health.config` com `connect_open='false'`) segura a conexão; `consent_version='2026-10-draft-1'` e `min_age=18` (autodeclaração 18+). As 0038 e 0039 foram aplicadas vazias. Falta o que depende do dono (veja "O que depende de você"); roteiro em `docs/decisions/hoje-relogio.md`, seção "Roteiro de ligar".

### Como o remoto foi aplicado (0027–0033 e 0035–0039)
- O banco baixa o arquivo da migração direto do commit no GitHub pela extensão `http` (`http_get`, schema `extensions`, que a API não expõe) e só executa se o md5 bater com o do arquivo no repositório. A 0029 (backfill) foi em duas partes, com o dry-run no meio (41 ingredientes e 28 etapas literais, 8 receitas) e o md5 dos corpos das receitas igual antes e depois.
- Antes de cada migração o app que funciona com o banco antigo já estava no ar (fallback para função ausente, PGRST202); depois, grants, políticas, RLS e contagens foram conferidos contra o banco local com as mesmas migrações. Conferência registrada para esta fase (23/10/2026, depois da 0039): 39 registros em `schema_migrations` (o remoto sempre teve 1 registro a mais que os arquivos; antes eram 35 registros para 0001–0033 e 0035), 184 funções, 85 tabelas (0 sem RLS) e 137 políticas em `public`, 12 tabelas no schema `health` e 17 `security definer` executáveis por anon (lista do S14, que nunca cresce), iguais ao banco local com as 38 migrações.
- As 0036 a 0039 foram pelo mesmo método e conferidas depois: 0036 (`creator_delete_recipe`: o herói exclui de vez a receita que ele arquivou), 0037 (a sequência conta só conteúdos concluídos e entradas em programas; Lembretes não contam), 0038 (`health_foundation`, md5 `7cbbb179c05afc1367f21ce9de3b819d`) e 0039 (`health_ingest`, md5 `ac8d52ad46a3a00cce0ddceaf5f101f6`), as duas últimas vazias (sem dados). Nada está pendente de aplicação no remoto.
- Conferido no remoto depois da 0038 e da 0039: o schema `health` fica fora da API (sem usage para anon, authenticated e service_role); o papel `health_ingest` é NOLOGIN e sem bypassrls; nenhum dado de pessoas no `health` (só configuração: `config` com 5 linhas, `consent_texts` com 3 e o `metric_catalog` com 87), e `health_run_retention` devolve tudo zero. Com a chave desligada, `health_consent_grant` devolve `health_disabled` para conta não demo e `demo_account_cannot_connect` para conta demo; 0 consentimentos gravados.

### Evidência de testes (23/10/2026, `master` em `f91a079`, banco local com as 38 migrações, 0001–0039)

| Camada | Resultado | Comando |
|---|---|---|
| Banco: RLS e regras de negócio | 991 de 991 (S0–S51) | `LOCAL_DB_NAME=… npm run test:rls` |
| Unitários | 1.377 aprovados e 1 pulado em 55 arquivos (54 arquivos aprovados e 1 pulado: `health-store.integration.test.ts`, que só roda com o banco local em `HEALTH_DB_TEST_URL`) | `npx vitest run` |
| E2E com axe, Pixel 7 e Desktop Chrome | 284 testes em 23 arquivos. Local (`next start`): 259 aprovados e 25 pulados. Contra produção (rodada completa): 258 aprovados, 24 pulados e 2 falhas que eram erros do teste, não do app, corrigidas em `f91a079` (veja "Defeitos encontrados"); os dois arquivos de novo contra produção: 22 aprovados e 4 pulados por desenho. A P4 rodou e passou contra produção | `npx playwright test` |
| Tipos, lint e mensagens | Limpos; 22 namespaces e 4.875 chaves por idioma (pt-BR, en e es) | `npm run typecheck`, `npm run lint`, `npm run messages:check` |
| Build de produção | OK | `npm run build` |

### Defeitos encontrados pela fase 6 e corrigidos
- **Teclado nas prateleiras** (instável no celular contra produção, 5 falhas em 12): o teste focava o quadrado ainda dentro do contêiner escondido do streaming; agora espera a prateleira visível (40/40 depois).
- **Aviso da foto de perfil que sumia**: o `<dialog>` avisava o fechamento de novo numa tarefa posterior e a tela limpava o erro do arquivo escolhido logo depois de "Cancelar" (`useDialog` corrigido; 10/10).
- **"Excluir minha conta" reaberto já armado** (efeito colateral da correção acima, achado pela revisão): o Cancelar fechava só pelo estado e a limpeza estava no `onOpenChange`; ao reabrir, "EXCLUIR" seguia no campo e "Excluir definitivamente" vinha habilitado. O diálogo limpa ao abrir e ao fechar por qualquer caminho (E2E `account-delete-dialog.spec.ts`, que falha com o componente anterior); o mesmo ajuste no Cancelar da remoção da foto e no das ações de Minhas Receitas.
- **Limpeza do E2E que não rodava no estouro de tempo**: a receita "[E2E]" era tirada do remoto num `finally`, que o Playwright só executa depois de fechar a página; a limpeza foi para o `afterEach` (provado com o tempo do teste reduzido a 14 s: estourou no meio da criação e o rascunho saiu).
- **Tema que voltava ao anterior**: o cookie só era gravado pela action, interrompida por uma recarga ou sobrescrita pela resposta atrasada de um clique anterior; o botão grava o cookie no navegador e a action dele não manda mais Set-Cookie (90/90).
- **"Visualizar" parado no editor de receitas**: o `router.push` para a prévia logo depois da gravação (server action que ainda enviava a página revalidada) às vezes era descartado; a prévia abre por navegação de documento (no teste do editor do portal com `--repeat-each=10`, um projeto por vez, 10/10 no desktop e 10/10 no celular).
- **Imagens presas no `next start`**: o otimizador do Next 15.5.28 repassava o socket do navegador à requisição interna e prendia para sempre a chave cujo pedido o navegador abortava (70 de 96 chaves presas na reprodução; 96/96 depois do `postinstall`). Na Vercel a otimização roda no serviço dela.
- **Testes E2E errados contra produção** (as 2 falhas eram erros do teste, não do app; corrigidos em `f91a079`): o seletor "Publicada" também casava com a opção escondida no painel de filtros recolhido; a tela de 404 da rota de conteúdo tem o próprio aviso "Conteúdo não encontrado" e o teste esperava "Página não encontrada"; e no hero-hub a foto era medida antes de o streaming revelar a página. Os dois arquivos de novo contra produção: 22 aprovados e 4 pulados por desenho; os três testes corrigidos repetidos 3 vezes no celular: 9/9.

## Ambiente e deploy
- **Vercel**: projeto `ultra-hero`, região gru1 (São Paulo). O deploy é automático a cada push na `master`.
  - Já configuradas: URL e chave publicável do Supabase, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL` e o Cloudflare Stream (`CLOUDFLARE_*`, `VIDEO_PROVIDER`; `docs/launch-checklist.md`).
  - `SUPABASE_SERVICE_ROLE_KEY` cadastrada em 20/10/2026 (Sensitive, Production e Preview). Os três crons responderam ok em produção.
- **Crons**: o plano Hobby só permite execuções diárias, às 03:00, 03:30 e 04:00 UTC. O transporte simulado também avança ao abrir a página de pedidos.
- **Supabase**: projeto `ultra-hero` em sa-east-1, Postgres 17.
- **Como o banco remoto foi aplicado**: 0001 a 0005 pelo conector, 0006 a 0015 e o seed pelo SQL Editor (o conector exige confirmação humana para comandos destrutivos e ela não aparece neste ambiente), a 0016 pelo conector em 15 blocos as 0017 e 0018 pelo conector em 16 blocos, com E2E 40/40 contra o banco remoto antes de publicar o código, a 0019 (só dados do seed), a 0020 (função do Explorar em grade), a 0021 (produtos Ultra.e Life e alocação produto↔herói) a 0022 (itens de rotina e marcação diária do "Hoje") pelo conector, em blocos, a 0023 (desempate único na busca) e a 0024 (receitas por herói e etapa demonstrativa) pelo conector; a 0025 (publicação direta) e a 0026 (dono do vídeo do Stream) em 21/10/2026, conferidas objeto a objeto contra o banco local (commit `e303b5e`). Da 0027 em diante, o banco baixa o arquivo da migração direto do GitHub pela extensão `http` (schema `extensions`, que a API não expõe) e só executa se o md5 bater com o do repositório; a 0029 foi em duas partes, com o dry-run no meio. Depois de cada etapa, grants, políticas, RLS e dados foram conferidos contra a referência local.

## O que depende de você, em ordem
1. **SMTP próprio**: o envio padrão de e-mails do Supabase tem limite baixo e serve só para testes.
2. **Revisão jurídica** de Termos e Privacidade. Antes da abertura pública, é preciso definir controlador, encarregado e canal de contato.
3. **Chaves OpenAI e Gemini**, se quiser, para rodar a comparação entre provedores.
4. **Ligar o relógio real** (roteiro em `docs/decisions/hoje-relogio.md`, seção "Roteiro de ligar"): Vercel Pro; nome e e-mail do encarregado de dados; revisão jurídica do termo de consentimento (`docs/legal-drafts/health-consent.md`); apps de desenvolvedor na Garmin (com o CNPJ), Oura, WHOOP e Polar, com as variáveis de ambiente; tirar o papel de admin da conta demo compartilhada no dia de ligar; e trocar (rolar) o token da Cloudflare.

## Riscos e limitações conhecidos
- **Um único projeto Supabase** serve de desenvolvimento e produção.
- **Conta suspensa**: a sessão já aberta continua válida até o token expirar, em cerca de 1 hora.
- **Retenção sem prazo**: feedback e pedidos anonimizados não têm prazo de exclusão automática.
- **Contato**: o canal de contato não permite resposta, e não há exportação de dados pelo app.
- **Peso das mensagens**: todos os textos de interface vão para o navegador, cerca de 172 KB ou 46 KB comprimidos, no primeiro carregamento.

## Sugestões de melhoria, por prioridade

**Antes de convidar testadores**
1. **Separar staging e produção** em dois projetos Supabase: **não adotada**; o dono decidiu em 23/10/2026 manter um só projeto, sem ambiente novo (o risco fica em "Riscos e limitações conhecidos"). No projeto único, as migrações seguem pelo método conferido por md5 e os E2E desfazem o que gravam.
2. **SMTP com domínio próprio**, para que confirmação e recuperação de senha cheguem e não caiam em spam.
3. **Monitoramento**: captura de erros, como Sentry, alerta de disponibilidade e Vercel Analytics, para saber de um incidente antes do usuário.
4. **Direitos do titular**: exportação de dados self-service e canal de contato com resposta, que hoje a política promete só para depois.
5. **Prazos de retenção que faltam**: sugiro 365 dias para feedback e pedidos anonimizados.

**Durante o experimento**
6. **Painel de coortes** de retenção em D1, D7 e D14 por data de cadastro, a métrica que decide se o produto segura o usuário.
7. **Lembretes de sequência** por notificação do PWA. O opt-in já existe em Perfil › Notificações; falta o envio. É a alavanca mais barata de retorno para um produto de hábitos.
8. **E2E autenticado no projeto único** (não há staging, Q17), cobrindo admin, personalidade, fornecedor e checkout de ponta a ponta e desfazendo o que gravar.
9. **Mensagens por rota**, carregando só os textos de cada área para reduzir o primeiro carregamento no celular.

**Depois do experimento, se validar**
10. **Vídeo**: implementar a URL assinada para conteúdo premium e as legendas, conforme a ADR-001 (o envio pelo Cloudflare Stream já está ligado em produção).
11. **IA**: rodar a comparação OpenAI vs Gemini com chaves reais e decidir com dados de custo e qualidade.
12. **Pagamentos reais** só depois da validação: gateway com Pix, antifraude, nota fiscal e termos de venda, sem guardar dados de cartão.
