# Decisão: módulo de receitas estruturadas

Status: **aprovado** (22/10/2026). Fase 1 implementada em `0027_recipes_structured.sql`, `0028_recipe_media_storage.sql` e `0029_recipes_backfill.sql`, cenários S25–S32 em `supabase/tests/rls_scenarios.sql`, códigos e quantidades em `src/lib/recipes/`. Fase 2 (Portal do Chef e `RecipeView`) implementada sem migração nova; ver a seção "Fase 2" abaixo.

Este arquivo é a cópia do documento de desenho (revisão 2) com as respostas do responsável às perguntas da seção 5.4 e o registro de onde a implementação da fase 1 se afastou do texto. Onde o desenho e este cabeçalho divergem, vale o cabeçalho.

## Decisões do responsável (seção 5.4)

| Pergunta | Decisão |
|---|---|
| **P1 — Revisão de receitas** | **Desligada por padrão** (`content_type_settings.review_required = false` para `recipe`). O admin liga e desliga só pela RPC `admin_set_review_required`, auditada em `admin_audit`; o gatilho `content_type_settings_review_guard` recusa a mudança direta (`review_required_protected`). Alérgenos e nutrição aparecem como **"informado pelo chef"** até o admin validar (`admin_validate_recipe_nutrition`); qualquer edição dos números pelo herói zera a validação. |
| **P2 — Cards de receita antes da etapa** | **Em aberto.** A fase 1 implementa só o bloqueio no banco: `can_access_content` devolve falso para receita sem `recipe_onboarding` (admin e dono do conteúdo passam). Nenhuma tela do consumidor muda de comportamento; a biblioteca do herói segue como está até a decisão. |
| **P3 — Contas demo × upload** | Contas demo **continuam com um toque**, **sem `DEMO_ACCESS_CODE`**. O limite é só a cota diária por herói: **50 objetos ou 100 MB por dia** no bucket `recipe-media` (`recipe_media_quota_ok`, aplicada pela política de insert do Storage). |
| **P4 — Prova de "revisada e publicada" no E2E** | Fica para a fase 6 (sem decisão nesta entrega). |
| **P5 — Dados do backfill** | **Aprovadas** as 10 categorias e a classificação proposta. Os tempos são **copiados sem correção** (g2 e g4 incoerentes, g5/g6/g8 de template); a correção vem depois pelo editor. |
| **P6 — Indexação** | **Desligada** (`RECIPES_SEO_INDEX`) enquanto os chefs forem fictícios. Nada de sitemap/JSON-LD de receita na fase 1. |
| **P7 — Credenciais do chef** | O herói informa num pedido fora da linha pública (`creator_credentials_requests`, só dono e admin); o texto só chega a `creator_profiles.credentials` (legível pelo visitante) quando o admin aprova (`admin_set_creator_credentials` copia o texto e grava `credentials_approved_at`; reprovar, ou o herói editar ou retirar o pedido, limpa os dois campos), com o rótulo **"Credenciais informadas pelo herói"** (`recipes.structured.credentialsLabel`). |

## Desvios da fase 1 em relação ao desenho

Dados do backfill (o seed manda; o desenho foi corrigido aqui):

- **g5**: a nota do ingrediente segue o seed, "médias", e não "média" como no desenho.
- **g9**: a nota de alérgeno fica literal, "glúten (aveia pode conter)".
- `allergens_declared` só fica verdadeiro quando a lista v1 tem itens; a lista vazia do template não conta como declaração. Resultado local do checklist depois do backfill: g1, g3, g6 e g8 pendentes de `allergens`; g2 pendente de `times`; g4 pendente de `times` e `allergens`; g5 e g9 completas.
- As 6 receitas com pendência continuam no ar como estão, mas não podem ser republicadas até o checklist fechar (a correção vem pelo editor da fase 2).

Banco:

- A unicidade da lista de compras é uma `unique (user_id, ingredient_id)` e não índice parcial (o `on conflict` do PostgREST precisa de uma restrição).
- `shopping_list_items.product_id` fica fora do grant de insert/update: o cliente que manda o campo recebe `permission denied`; o gatilho preenche a partir do vínculo aprovado.
- `recipe_catalog` é plpgsql (invoker) e não sql: anon não tem grant em `recipe_extras` e a função precisa montar a consulta com cursor (`invalid_cursor` para cursor malformado).
- `recipe_save` recusa chaves de validação de nutrição vindas do herói (`nutrition_validation_forbidden`); edição de números pelo admin também zera a validação.
- Restaurar uma versão `restore_point` (a cópia do corpo antigo) é recusado com `version_not_restorable`: ela é só registro.
- `creator_delete_recipe_draft` também recusa rascunho `in_review` e devolve o uid do Stream para a limpeza.
- `anonymize_user_data` passou a desvincular `creator_profiles` (com `app.trusted`): sem isso a exclusão de conta de um herói falhava com `protected_column: user_id` — defeito anterior à 0027, coberto em S32.
- A 0027 ficou em um arquivo só, com seções numeradas, em vez de partes.
- O cenário do desenho "anon lê a galeria" está em S27 (mídia), não em S26.
- S3 ganhou uma verificação: sem `recipe_onboarding`, consumidor com plano não abre receita pelo banco.
- S14 ganhou uma verificação: entre as funções `recipe_*`, `creator_*` e `admin_*`, anon só executa `recipe_catalog`.

Aplicação:

- O editor antigo (herói e admin) mostra receita **só para leitura**, com aviso; criar receita pelo formulário antigo devolve `recipe_editor_pending`; as ações de publicar e despublicar do formulário antigo também recusam receita.
- `/admin/translations` deixou de usar upsert em `content_localizations` (o `on conflict … do update` com `excluded.body` exige SELECT em `body`, que saiu do grant de leitura); agora é select seguido de update ou insert.
- A leitura do corpo traduzido usa `content_localized_body` e cai para a leitura antiga quando a função não existe (PGRST202), para o app funcionar antes da migração no remoto.

Adiado para a fase 2: ligação do `recipe_orphan_media` ao cron, interface em `/admin` para o interruptor de revisão e a fila de aprovação de credenciais.

## Fase 2 (Portal do Chef e renderizador) — implementada, sem migração nova

Tudo roda sobre as RPCs e políticas já aplicadas (0027–0029): **não houve 0032** nem cenários S34+. Banco local conferido com a suíte inteira (800 cenários).

Entregue:

- `/creator/recipes` (Minhas Receitas): busca por título, filtros por categoria, situação (rascunho, em revisão, devolvida, agendada, publicada, arquivada), dificuldade e data de atualização, por GET com Zod `.catch`; indicadores de `creator_recipe_stats(30)` só com dado real (visitantes a partir de 5, favoritos acima de zero, nota com 3 avaliações; a coluna some quando nenhuma receita tem dado); ações editar/abrir, visualizar, ver no app, versões, duplicar, despublicar, retirar da revisão, arquivar, restaurar e excluir rascunho nunca publicado.
- `/creator/recipes/new` e `/creator/recipes/[id]/edit?step=…`: `RecipeWizard` em 6 etapas (regras puras em `src/lib/recipes/draft.ts`, `payload.ts`, `checklist.ts`, `draft-recovery.ts`, `editor-steps.ts`), gravação por `recipe_save` ao trocar de etapa, em "Salvar rascunho" e a cada 30 s (uma gravação por vez), cópia local `uh-recipe-draft:<id>` com "Recuperar | Descartar", diálogo de conflito para `stale_draft`, resumo de erros com links que focam o campo. Situações sem edição (em revisão, no ar, agendada, arquivada) mostram o estado e as ações.
- Fotos: redução no navegador (2048 px, WebP 0,82 ou JPEG, sem EXIF), envio direto ao bucket `recipe-media` com a sessão do herói, conferência dos bytes mágicos na action (apaga e recusa com `invalid_image`) e `recipe_register_media`; proxy `/media/recipe/[id]` com a RLS de quem pede, bytes conferidos contra o tipo do banco, `nosniff`, CSP `default-src 'none'` e cache público só para galeria de receita no ar.
- Vídeo: link do YouTube/Vimeo (mesmos parsers da reprodução) ou envio pelo fluxo do composer (ticket tus com `stream_uploads.content_id` = a receita; o uid entra no rascunho e é gravado na hora). A licença acompanha o provedor.
- `/creator/recipes/[id]/preview` e `/creator/recipes/[id]/versions` (data, motivo, autor, seções alteradas e "Restaurar no rascunho").
- `RecipeView` (componente de servidor) em `/content/[slug]` para toda receita com `recipe_details` (inclusive as convertidas pela 0029); sem detalhes, a página antiga continua (o ramo v1 sai na fase 3).
- Pendências da fase 1: cron diário de órfãos (`/api/cron/retention` chama `recipe_orphan_media` e apaga pela API do Storage, em lotes de 100; banco sem a função pula), "Revisão antes de publicar" por tipo em `/admin/content/settings` (`admin_set_review_required` com justificativa) e a fila de credenciais (P7) em `/admin/creators`, com aprovar/reprovar auditados; o herói informa especialidades e pede credenciais em `/creator/profile`.
- Privacidade: `legal.json` (3 idiomas) e `docs/privacy-and-retention.md` citam as fotos de receita, quem vê e o prazo.

Desvios da fase 2 em relação à seção 4.1:

- O editor antigo **não redireciona**: segue só para leitura, e o aviso traz "Editar no editor de receitas" (pedido da tarefa). Para o admin o aviso continua só de leitura.
- Fica para depois: edição pelo admin com o `RecipeWizard`, resumo estruturado e "Validar nutrição" em `/admin/content/[id]`, tela de "Categorias de receita". As 3 chaves de `/admin/settings` já existiam (fase 1).
- A fila de credenciais mora em `/admin/creators` (o "/admin/heroes" do texto). A situação "reprovada" vem da última decisão em `admin_audit` depois da última edição do pedido.
- O envio de foto **não depende da service role** (usa a sessão do herói e as políticas da 0028); dependem dela só a limpeza diária de órfãos e o vídeo pelo Stream. O E2E de envio real continua atrás de `E2E_RECIPE_MEDIA_REAL=1` e foi rodado contra produção (mobile e desktop), com o rascunho e as fotos apagados no fim.
- Progresso do envio de foto em etapas (preparar, enviar, conferir): o `upload` do supabase-js não informa bytes. Recusa da política do Storage (cota, interruptor, rascunho que deixou de ser editável) aparece numa mensagem só, porque o Storage não diz o motivo; `demo_upload_forbidden` não existe (P3).
- O filtro "Devolvida" inclui a rejeitada.
- O dono e o admin continuam vendo a tela da etapa demonstrativa na página pública quando não a fizeram (P2 segue em aberto); a prévia do chef não passa por ela.
- O E2E de g1 no `RecipeView` público pula quando a conta `premium` de demonstração não fez a etapa (o caso hoje em produção); a renderização de g1 a partir das tabelas é coberta no Vitest (`recipe-view.test.ts`).

---

# Módulo de Receitas — documento de desenho (revisão 2)

Base: `master` em `c42c7b3` (21/10/2026). Fontes: `recipes-spec.md`, `recipes-analysis.md` (7 decisões aprovadas), os três levantamentos e uma conferência direta no código: 0002, 0003, 0006, 0007, 0010, 0012, 0017, 0024, 0025, 0026, `rls_scenarios.sql` S3/S11/S14, `supabase/local/shim_supabase.sql`, `src/middleware.ts`, `src/app/media/stream/[uid]/thumbnail/route.ts`, `src/app/(app)/shop/actions.ts`, `src/components/content/RelatedProducts.tsx`, `messages/pt-BR/recipes.json` e `legal.json`. Supabase remoto: projeto `ultra-hero`, organização no **plano Pro**, Postgres 17 (local: 16).

Convenções deste texto: "herói" é o nome de interface do papel `creator`, e "chef" é um herói que assina receitas. Código e banco continuam com `creator`. O comércio é simulado.

---

## 0. O que mudou nesta revisão

Os críticos de segurança/dados e de produto/escopo foram acatados quase todos; o que não foi está na seção 6. As mudanças principais:

1. **Revisão de receitas desligada por padrão**, que é o comportamento aprovado na 0025. A regra continua configurável pelo admin, agora numa coluna de `content_type_settings`, auditada. A P1 virou escolha do responsável.
2. **Dados de saúde fora do catálogo.** O catálogo não tem filtro pré-marcado nem selo "Combina com você". O cruzamento com as alergias fica só na página da receita, que é o uso consentido. `allergens_declared` separa "nenhum" de "não informado".
3. **O corpo v1 não é mais gerado.** O corpo antigo das 8 receitas fica intacto até o editor novo gravar a receita pela primeira vez, e a cópia dele vai para a versão `restore_point` antes de qualquer escrita. Parser e formatador ficam só em TypeScript, e o backfill usa dados literais.
4. **Exclusão de conta (LGPD) garantida:** os gatilhos aceitam o `set null` da cascata, `anonymize_user_data` é redefinida e há um cenário novo (S32).
5. **O vídeo do Stream fica protegido:** a guarda da 0026 continua valendo na receita, a publicação confere o uid, e a limpeza diária nunca apaga receita.
6. **Ingredientes e nota do chef saem do que é público:** vão para `recipe_extras`, com acesso A(c). O catálogo filtra `content_is_live` explicitamente.
7. **Escritas entre receitas fechadas:** FKs compostas, `content_id` em toda escrita, tipo travado, duplicar recusa origem travada, arquivar fecha a revisão e há lock de linha.
8. **Mudanças nas fases:**
   - a fase 1 leva o mínimo de interface (o editor antigo não publica nem cria receita);
   - a fase 2 leva o renderizador do corpo estruturado;
   - o vínculo ingrediente↔produto vai para a fase 5, e a lista de compras usa o kit da receita;
   - a privacidade é atualizada em cada fase.
9. **Primeiro corte mais enxuto:** saem `section`, `linked_recipe_id`, `heat_level`, a ordenação por nota e a comparação lado a lado de versões.
10. **Perguntas novas:** contas demo × upload (P3), publicação no E2E (P4), dados do backfill (P5), SEO de heróis fictícios (P6) e credenciais (P7).

---

## 1. Problema, objetivo e escopo

**Problema.** Hoje a receita é um `content` do tipo `recipe` com um JSON livre (`content_bodies.body`). Por isso:
- a quantidade é texto, e o ajuste de porções não é possível;
- as etapas são strings, sem tempo, temperatura nem foto;
- não há fotos próprias, galeria, categorias, versões, avaliações, lista de compras nem ligação entre ingrediente e produto;
- a busca não encontra ingredientes;
- o bloqueio de receitas da etapa demonstrativa só existe na interface.

**Objetivo.** Dar à receita uma estrutura de dados própria, que continue sendo `content`, e montar sobre ela:
- o Portal do Chef (editor em 6 etapas, versões, publicação e agendamento);
- o catálogo com filtros na aba Receitas do Explorar;
- a página da receita, o Modo Cozinha e a Coleção;
- a lista de compras ligada ao carrinho de teste.

Tudo reaproveita a autenticação, a RLS, o design system e o comércio que já existem.

### 1.1 O que se reaproveita e o que se constrói

| Área | Reaproveita (já existe) | Constrói |
|---|---|---|
| Identidade | `content` (`type='recipe'`): slug, `creator_id`, `status`/`review_status`, `access_level`/módulo, `tags`, `search`, `cover_url`, licença (0017), feed, Explorar, favoritos, listas, `creator_recipe_links` | Tabelas filhas com `content_id` (seção 3) |
| Corpo | `content_bodies`: só o **vídeo** (`media_provider`/`media_ref`, guarda da 0026) e uma linha mínima `{kind:'recipe',schema:2}`, que satisfaz `missing_body` e a aprovação | Fonte de verdade estruturada: detalhes, ingredientes, etapas, nutrição e mídia |
| Acesso | `can_access_content` (plano/módulo; o visitante nunca lê o corpo) | A etapa demonstrativa (0024) passa a valer **no banco** para `type='recipe'` |
| Publicação | `creator_publish_content`/`creator_unpublish_content` (0025/0026), `submit_content_for_review`, `admin_review_content` com agendamento, `content_reviews`, `admin_audit` | Regra de revisão por tipo (desligada), agendamento pelo chef, arquivar e restaurar, excluir rascunho nunca publicado, duplicar, versões imutáveis, checagem de publicável em todos os caminhos |
| Nutrição | Regra da 0017 (só o admin valida) e `nutritionDisplayState` | `recipe_nutrition` com a origem dos dados; a validação cai só quando **os números mudam** |
| Mídia | `next/image`, o proxy `/media/*`, `src/lib/video` e `stream_uploads` | Bucket privado `recipe-media`, proxy `/media/recipe/[id]` com conferência de bytes, cota por herói, limpeza de órfãos |
| Chef | `creator_profiles`, `/personalities/[slug]`, biblioteca `receitas` | `specialties`; `credentials` exibidas só depois da aprovação do admin (P7) |
| Catálogo | `EXPLORE_TABS`, `UrlTabs`, `TileGrid`/`loadMoreTiles`, `EmptyState`/`ErrorState`/`Skeleton` | Aba `receitas` com filtros, `recipe_catalog` (invoker), `RecipeCard` |
| Usuário | `favorites`, `custom_lists`, `recipe_onboarding`, `AllergyReminder`, `completions` | Coleção em `/profile/receitas`, histórico opcional (90 dias), estrelas, cruzamento de alergia **só na página da receita** |
| Comércio | `products`, `product_is_purchasable`, `cart_set_item`, `QuickAddToCart`, `commerce.enabled`, `content_product_links` validados | Lista de compras pessoal com o kit da receita; `recipe_ingredient_products` modelado para produto avulso futuro |
| Configuração | `content_type_settings` (lida por anon), `app_settings`, `admin_set_setting`, `public_settings()` | Coluna `review_required`; 3 chaves em `app_settings` |
| Testes | `tests.*`, S11, S14, mocks do Vitest, Playwright mobile e desktop, contas demo | S25–S32, unitários e E2E por fase |

---

## 2. Conflitos com decisões existentes e recomendação

### 2.1 Aprovação do admin (decisão 2) × publicação direta do herói (0025)

**Fato.** A decisão 2 manteve a aprovação do admin para receitas. Depois disso, a 0025 deu ao herói publicação direta para **todos os tipos**. O cabeçalho dela diz: "os demais tipos seguem a regra do admin (basta existir o corpo)". O editor também trocou "Enviar para revisão" por "Publicar". A especificação trata a revisão como condicional ("Fluxo de revisão quando exigido pelas permissões").

**Desenho: regra configurável por tipo, desligada para todos.** Isso preserva o que está em produção.
- Coluna `content_type_settings.review_required boolean not null default false`. A tabela já tem uma linha por tipo, é lida por anon e é editada em `/admin/content/settings`.
- O admin muda pela RPC `admin_set_review_required(p_type, p_on, p_reason)`, com justificativa de pelo menos 5 caracteres e auditoria `content_type.review_required`. Um gatilho só deixa a coluna mudar dentro dessa RPC (`app.trusted`), porque o `update` direto que existe hoje não é auditado.
- `content_review_required(p_type)` = `coalesce((select review_required from content_type_settings where type = p_type), true)`. Se a linha faltar, a regra falha fechada.
- Aplicação no banco: `creator_publish_content` recusa com `review_required` quando a regra está ligada. A interface lê a coluna e mostra "Publicar"/"Agendar" ou "Enviar para revisão".
- Os dois modos são testados no S28 e no E2E do portal.

A escolha entre ligar e desligar é do responsável (P1).

### 2.2 Bloqueio de receitas (0024) no catálogo, no detalhe e no Modo Cozinha

**Fato.** Hoje o bloqueio é só da interface (`getRecipeGate`). Um usuário sem a etapa lê o corpo das receitas gratuitas pela API. O feed e o Explorar mostram os quadros de receita a todos, e a biblioteca `receitas` do herói troca a lista inteira pela tela de bloqueio.

**Recomendação:**
1. **No banco:** `can_access_content` passa a devolver `false` para `type='recipe'` quando a pessoa não tem linha em `recipe_onboarding`.
   - Admin e chef dono são checados antes e não são afetados.
   - Isso vale automaticamente para o corpo, ingredientes, etapas, `recipe_extras`, nutrição, mídia de etapa, lista de compras, avaliações e progresso.
   - A função mantém a mesma assinatura e continua no S14.
2. **Os cards ficam visíveis para todos**, inclusive o visitante: foto, título, chef, tempo, porções, dificuldade e os alérgenos e dietas **declarados**. Uma faixa convida a fazer a etapa.
3. **Abrir a receita exige a etapa:** ingredientes, etapas, Modo Cozinha e "adicionar à lista" mostram o `RecipeGate` no lugar do corpo.
4. A biblioteca do herói passa a seguir o item 2. **Isso muda um comportamento aprovado (P2).**

### 2.3 Editar uma receita publicada a tira do ar

**Fato.** `content_creator_edit_guard` só deixa editar rascunho, então corrigir exige Despublicar. Se a revisão for ligada, a receita só volta ao ar depois da aprovação: cada correção de digitação a tira do catálogo, dos favoritos e da Coleção. Isso entra nos contras da P1.

**Desenho:** manter o comportamento atual, que vale para todos os tipos. A versão publicada vira snapshot imutável. A "edição paralela", com a versão no ar continuando enquanto um rascunho é revisado, fica fora desta entrega.

### 2.4 Arquivar, excluir e duplicar

A especificação pede "Ações: … duplicar e arquivar" e "Exclusão controlada conforme regras do projeto".
- **Arquivar:** o chef arquiva o próprio conteúdo, com `archived_by='creator'`. Uma receita `in_review` arquivada fecha a rodada como `returned` ("Arquivada pelo herói").
- **Restaurar:** o chef restaura **só o que ele arquivou**, e a receita volta a rascunho. O que o admin arquivou continua sendo trava do admin.
- **Excluir:** só rascunho **nunca publicado** (`published_at is null`), no modelo de `creator_discard_video_draft`.
- **Duplicar:** recusa origem arquivada pelo admin ou rejeitada (`source_locked`). Sem isso, a duplicação contornaria a trava.
- Tudo é auditado.

### 2.5 Agendamento

- **Revisão desligada:** o chef agenda direto com `creator_publish_content(id, publish_at)`, numa data entre agora + 1 min e agora + 365 dias.
- **Revisão ligada:** o chef sugere a data (`content_reviews.requested_publish_at`), e o admin confirma ao aprovar (`admin_review_content(..., p_publish_at)`).
- "Agendada" é derivado: `published` com `publish_at > now()`.

### 2.6 Dados de saúde: alergias e restrições da etapa

**Fato.** O consentimento coletado diz "usamos só para lembrar você na página de cada receita" (`recipes.json` `onboarding.diet.privacy` e `legal.json` `recipeStep`, que os chama de dados sensíveis de saúde). O app avisa que não há revisão de nutricionista. Os alérgenos são declarados pelo chef e ninguém os valida.

**Desenho:**
- O catálogo **não usa** os dados da etapa. Não há filtro pré-marcado nem selo de adequação.
- Os filtros de dieta e de alérgeno só valem quando a pessoa os marca, com o rótulo "declarado pelo chef". O filtro "sem {alérgeno}" só deixa passar receitas com `allergens_declared = true`.
- O cruzamento fica **só na página da receita** e só para alérgenos declarados: "Esta receita declara ovo, que você marcou". Não há aviso de dieta não marcada.
- "Não informado" é diferente de "nenhum". Com `allergens_declared = false`, o card e a página mostram "Alérgenos não informados pelo chef". Publicar exige declarar, mesmo que seja "nenhum" confirmado.
- `recipe.catalog_filter` registra só o nome dos filtros usados, nunca os valores de alergia ou de dieta.
- Personalizar o catálogo com dado de saúde fica fora. Para entrar, exige decisão do responsável e um novo texto de consentimento.

### 2.7 Contas demo públicas × upload

**Fato** (conferido em produção): `/login` mostra os botões `data-demo-kind` de admin, creator, seller, premium e free. Qualquer visitante entra como admin ou como a Helena com um toque. `DEMO_ACCESS_CODE` existe no env, mas não é usado em `src`. Com o módulo, qualquer pessoa sobe fotos de até 5 MB e, como admin, aprova e publica: é hospedagem arbitrária em `ultra-hero.vercel.app/media/recipe/<id>`.

**Desenho, em qualquer caso:** cota por herói de 50 objetos ou 100 MB por dia, contada em `storage.objects` por `owner_id`, na política de insert e na `recipe_register_media` (esta com advisory lock). O tratamento das contas demo é a P3, que precisa de resposta antes da fase 2.

### 2.8 Outros conflitos e lacunas

| Item | Desenho |
|---|---|
| Explorar "só com busca" × filtros | Decisão 1: filtros só na aba Receitas. A aba Conteúdos não muda. |
| "Coleções" já é o nome dos programas | A tela se chama **"Minha coleção de receitas"** (`/profile/receitas`). As listas continuam "Listas". |
| `/recipes/*` é rota protegida | Nenhuma página pública nova fica sob `/recipes`. A receita fica em `/content/[slug]` e o Modo Cozinha em `/content/[slug]/cozinha`. |
| Tradução publicada expõe `body` ao visitante (`content_loc_select`) | A 0027 dá permissão por coluna, sem `body`, a anon e authenticated, e cria a RPC `content_localized_body` (authenticated, checa `can_access_content`). Telas que mudam: `content/[slug]/page.tsx:118` e `admin/translations/page.tsx:74`. |
| Busca por ingrediente × visitante | Os nomes de ingredientes ficam protegidos (A(c)), como o corpo hoje. A busca por ingrediente encontra só o que a pessoa pode abrir; o visitante busca por título, resumo, etiquetas e chef. Tornar os ingredientes metadado público mudaria a regra vigente e exige decisão. |
| A validação de nutrição se perde a cada gravação | `recipe_nutrition` com gatilho: só limpa a validação quando um número ou a origem muda. |
| Alérgenos em texto pt-BR × códigos da etapa | A receita usa os **mesmos códigos** da 0024, mais `allergen_notes` em texto livre. |
| Tempos inconsistentes (g2 e g4: preparo + cozimento > total) | O backfill **não corrige** nada: copia os valores. A correção é proposta na P5, e publicar de novo exige coerência (`times`). |
| Mudar o `type` de um rascunho (0017 libera) | Gatilho `type_locked` quando o tipo antigo ou o novo é `recipe`; para mudar, o herói duplica. Os outros tipos não mudam. |
| Origem do interesse comercial | `addToCart` passa a receber `source`. A lista de compras usa `content_link`, porque o kit vem de `content_product_links`; não muda o `check`. |
| O herói não vê favoritos nem visualizações | `creator_recipe_stats`: só agregados e aproximados, sem as visitas do próprio chef nem as do E2E. |
| O comércio desligado não trava o carrinho no banco (o S8 prova) | Não muda (decisão vigente). A interface esconde o botão de carrinho quando `commerce.enabled=false`. |
| Privacidade não cita o Cloudflare | Corrigido já na fase 1. Cada fase seguinte atualiza `legal.json` (3 idiomas), `docs/privacy-and-retention.md` e `LAST_UPDATED` junto com a coleta nova. |

---

## 3. Fase 1 — modelo de dados, permissões, RPCs, testes de banco e o mínimo de interface

### 3.0 Migrações e princípios

| Arquivo | Conteúdo |
|---|---|
| `0027_recipes_structured.sql` | Tabelas, índices, RLS, grants, gatilhos, RPCs, settings e redefinições (`can_access_content`, `public_settings`, `creator_publish_content`, `submit_content_for_review`, `run_retention`, `admin_set_content_status`, `anonymize_user_data`, `stream_cleanup_*`, tradução) |
| `0028_recipe_media_storage.sql` | Bucket e políticas em `storage.objects`, dentro de `if to_regclass('storage.objects') is not null` com `execute` |
| `0029_recipes_backfill.sql` | `recipe_backfill_legacy(p_content)` com os dados literais da seção 3.8, chamada para cada receita sem `recipe_details`. Reaplicável |

**Regras de todas as migrações:**
- nada de `drop`/`truncate`; mudança de política com `alter policy`; gatilhos com `create or replace trigger`;
- `create table if not exists`; RLS ligada; `revoke all … from public, anon, authenticated`, depois grant mínimo (por coluna onde indicado) e `grant all … to service_role`;
- toda função com `set search_path = public`;
- `security definer` só nas RPCs listadas, com `revoke execute … from public, anon`. **Nenhuma** entra na lista pública do S14;
- leitura pública só por SQL invoker, no modelo do `explore_feed`;
- políticas com `(select auth.uid())`, `(select public.is_admin())` e `(select public.my_creator_id())`;
- colunas protegidas só mudam dentro de RPC, com `set_config('app.trusted','on',true)` → `update` → `'off'`;
- exceções com código curto (`'codigo'` ou `'codigo: detalhe'`), traduzidas por `failFrom`/`rpcErrorCode`;
- toda FK com ação no delete tem índice. Depois de aplicar no remoto, conferir `get_advisors` (`unindexed_foreign_keys`).

**Shim local:** `supabase/local/shim_supabase.sql` ganha um `storage` mínimo, para a 0028 rodar e o S27 testar as políticas:
- `storage.buckets(id text pk, name, public bool, file_size_limit bigint, allowed_mime_types text[])`;
- `storage.objects(id uuid pk default gen_random_uuid(), bucket_id text references storage.buckets, name text, owner_id text, metadata jsonb, created_at timestamptz default now(), unique(bucket_id, name))`, com RLS ligada;
- `storage.foldername(name text) returns text[]`;
- grants de select/insert/delete a authenticated e de select a anon.

Os testes preenchem `metadata` (`mimetype`, `size`) como o Supabase faz.

**Onde a receita mora:**
- `content`: identidade, `title`, `summary`, `tags`, dificuldade, acesso, situação, `cover_url` e `duration_minutes` = tempo total.
- Tabelas `recipe_*`: fonte de verdade do resto.
- `content_bodies`: vídeo (`media_provider`/`media_ref`) e `body`.
  - **Receitas antigas:** o `body` v1 fica **intacto** até a primeira `recipe_save`. Até a fase 2, a página continua lendo esse corpo, e nada visível muda na fase 1.
  - **A partir da primeira `recipe_save`:** o `body` vira o marcador mínimo `{kind:'recipe',schema:2}`. Antes disso, o corpo antigo já está guardado na versão `restore_point`.

**O mínimo de interface na fase 1.** Depois da 0027, publicar receita exige o checklist e gravar o corpo de receita v2 é recusado. Por isso:
- `/creator/content/new` deixa de oferecer o tipo receita;
- no editor antigo (`/creator/content/[id]/edit`) e no do admin, uma receita aparece só para leitura, sem Publicar nem Despublicar, com o aviso "A edição de receitas volta com o novo editor";
- E2E de fumaça: as páginas de g1 e g9 continuam iguais (o corpo não mudou), o seletor não oferece receita e o editor antigo mostra o aviso;
- `legal.json` (3 idiomas) e `docs/privacy-and-retention.md` passam a citar o Cloudflare Stream, que já processa vídeo hoje; atualizar `LAST_UPDATED`.

### 3.1 Códigos e unidades

Os códigos ficam em `check` e são espelhados em `src/lib/recipes/codes.ts`. Os rótulos ficam em `messages/<loc>/recipes.json`.
- **Dietas:** `vegetarian, vegan, pescatarian, lactose_free, gluten_free, low_sugar, low_sodium` (os mesmos de `recipe_onboarding.restrictions`).
- **Alérgenos:** `peanut, tree_nuts, milk, egg, wheat, soy, fish, shellfish, sesame` (os mesmos de `recipe_onboarding.allergies`).
- **Unidades:** `g, kg, mg, ml, l, tsp, tbsp, cup, unit, clove, bunch, sprig, fillet, slice, leaf, pinch, can, package`, ou `null` para contagem simples. Sem conversão para embalagem.

Rótulos pt-BR (singular/plural; plural a partir de 2):

| Código | Singular | Plural |
|---|---|---|
| tsp | colher de chá | colheres de chá |
| tbsp | colher de sopa | colheres de sopa |
| cup | xícara | xícaras |
| clove | dente | dentes |
| bunch | maço | maços |
| sprig | ramo | ramos |
| fillet | posta | postas |
| slice | fatia | fatias |
| leaf | folha | folhas |
| pinch | pitada | pitadas |
| can | lata | latas |
| package | pacote | pacotes |
| unit | unidade | unidades |

Os símbolos `g, kg, mg, ml` e `L` não variam.

### 3.2 DDL proposto (0027)

```sql
-- ------------------------------------------------ categorias (admin)
create table if not exists public.recipe_categories (
  code text primary key check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(code) <= 40),
  name jsonb not null check (jsonb_typeof(name) = 'object' and name ? 'pt-BR'),
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- seed (P5): cafe-da-manha, almoco, jantar, lanche, sobremesa, molhos-e-bases, marmitas, sopas, saladas, bebidas

-- ------------------------------------------------ mídia (antes, por causa das FKs compostas)
create table if not exists public.recipe_media (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content (id) on delete cascade,
  creator_id uuid not null references public.creator_profiles (id) on delete cascade,
  role text not null check (role in ('gallery','step')),
  position smallint not null default 1 check (position between 1 and 40),
  storage_path text not null unique check (storage_path ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'),
  mime text not null check (mime in ('image/jpeg','image/png','image/webp')),   -- lido de storage.objects.metadata
  bytes int not null check (bytes between 1 and 5242880),                       -- idem
  width smallint check (width between 1 and 8000),                              -- só dica de layout
  height smallint check (height between 1 and 8000),
  alt_text text check (length(alt_text) <= 200),
  caption text check (length(caption) <= 200),
  rights_confirmed_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_media_id_content_uq unique (id, content_id)
);
create index if not exists recipe_media_content_idx on public.recipe_media (content_id, role, position);
create index if not exists recipe_media_creator_idx on public.recipe_media (creator_id);
create index if not exists recipe_media_created_by_idx on public.recipe_media (created_by) where created_by is not null;
-- limite: 30 por receita (12 galeria), na recipe_register_media

-- ------------------------------------------------ detalhes 1:1 (metadados públicos do card e do filtro)
create table if not exists public.recipe_details (
  content_id uuid primary key references public.content (id) on delete cascade,
  servings smallint check (servings between 1 and 100),
  yield_text text check (length(yield_text) <= 60),
  prep_minutes smallint check (prep_minutes between 0 and 1440),
  cook_minutes smallint check (cook_minutes between 0 and 1440),
  rest_minutes smallint check (rest_minutes between 0 and 2880),
  total_minutes smallint check (total_minutes between 1 and 4320),
  -- coerência total ≥ prep+cook+rest: exigida para publicar (recipe_assert_publishable, código 'times'),
  -- não como check, para o backfill copiar os dados atuais sem corrigir (P5)
  story text check (length(story) <= 4000),                    -- pública, como summary
  diets text[] not null default '{}' check (diets <@ array['vegetarian','vegan','pescatarian','lactose_free','gluten_free','low_sugar','low_sodium']),
  allergens text[] not null default '{}' check (allergens <@ array['peanut','tree_nuts','milk','egg','wheat','soy','fish','shellfish','sesame']),
  allergens_declared boolean not null default false,           -- false = "não informado"; true + '{}' = "nenhum"
  allergen_notes text check (length(allergen_notes) <= 300),
  cover_media_id uuid,
  rating_count int not null default 0 check (rating_count >= 0),   -- sem contas demo
  rating_sum int not null default 0 check (rating_sum >= 0),
  schema_version smallint not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_details_allergens_ck check (allergens_declared or cardinality(allergens) = 0),
  constraint recipe_details_cover_fk foreign key (cover_media_id, content_id)
    references public.recipe_media (id, content_id) on delete set null (cover_media_id)
);
create index if not exists recipe_details_diets_idx on public.recipe_details using gin (diets);
create index if not exists recipe_details_allergens_idx on public.recipe_details using gin (allergens);
create index if not exists recipe_details_total_idx on public.recipe_details (total_minutes, content_id);
create index if not exists recipe_details_cover_content_idx on public.recipe_details (cover_media_id, content_id) where cover_media_id is not null;   -- prefixo da FK composta

-- ------------------------------------------------ protegido 1:1 (só com acesso): nota do chef e termos de busca
create table if not exists public.recipe_extras (
  content_id uuid primary key references public.content (id) on delete cascade,
  chef_note text check (length(chef_note) <= 600),
  ingredient_terms tsvector,                                   -- nomes de ingredientes e substituições
  updated_at timestamptz not null default now()
);
create index if not exists recipe_extras_terms_idx on public.recipe_extras using gin (ingredient_terms);

create table if not exists public.recipe_category_links (
  content_id uuid not null references public.content (id) on delete cascade,
  category_code text not null references public.recipe_categories (code) on update cascade,
  primary key (content_id, category_code)
);
create index if not exists recipe_category_links_cat_idx on public.recipe_category_links (category_code);
-- até 3 por receita (recipe_save)

-- ------------------------------------------------ ingredientes
create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),               -- vem do cliente (crypto.randomUUID)
  content_id uuid not null references public.content (id) on delete cascade,
  position smallint not null check (position between 1 and 60),
  name text not null check (length(btrim(name)) between 1 and 120),
  quantity numeric(10,3) check (quantity > 0 and quantity <= 100000),
  unit text check (unit in ('g','kg','mg','ml','l','tsp','tbsp','cup','unit','clove','bunch','sprig','fillet','slice','leaf','pinch','can','package')),
  quantity_text text check (length(quantity_text) <= 60),       -- não deu para separar: não recalcula
  to_taste boolean not null default false,
  optional boolean not null default false,
  note text check (length(note) <= 200),
  substitutions jsonb not null default '[]'
    check (jsonb_typeof(substitutions) = 'array' and jsonb_array_length(substitutions) <= 5),
  source_qty text,                                              -- texto original do backfill
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_ingredients_qty_ck check (
    (to_taste and quantity is null and unit is null and quantity_text is null)
    or (not to_taste and quantity is not null and quantity_text is null)
    or (not to_taste and quantity is null and unit is null)),
  constraint recipe_ingredients_pos_uq unique (content_id, position) deferrable initially deferred,
  constraint recipe_ingredients_id_content_uq unique (id, content_id)
);
-- substitutions: [{name≤120, quantity|null, unit|null, quantity_text≤60|null, note≤200|null}], validadas na recipe_save e no Zod

-- ------------------------------------------------ etapas
create table if not exists public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content (id) on delete cascade,
  position smallint not null check (position between 1 and 40),
  instruction text not null check (length(btrim(instruction)) between 1 and 1200),
  duration_seconds int check (duration_seconds between 1 and 86400),
  temperature_c smallint check (temperature_c between -30 and 320),
  tip text check (length(tip) <= 400),
  image_media_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_steps_pos_uq unique (content_id, position) deferrable initially deferred,
  constraint recipe_steps_id_content_uq unique (id, content_id),
  constraint recipe_steps_image_fk foreign key (image_media_id, content_id)
    references public.recipe_media (id, content_id) on delete set null (image_media_id)
);
create index if not exists recipe_steps_image_content_idx on public.recipe_steps (image_media_id, content_id) where image_media_id is not null;   -- prefixo da FK composta

create table if not exists public.recipe_step_ingredients (     -- Modo Cozinha
  content_id uuid not null,
  step_id uuid not null,
  ingredient_id uuid not null,
  primary key (step_id, ingredient_id),
  foreign key (step_id, content_id) references public.recipe_steps (id, content_id) on delete cascade,
  foreign key (ingredient_id, content_id) references public.recipe_ingredients (id, content_id) on delete cascade
);
create index if not exists recipe_step_ingredients_content_idx on public.recipe_step_ingredients (content_id);
create index if not exists recipe_step_ingredients_ingredient_idx on public.recipe_step_ingredients (ingredient_id);

-- ------------------------------------------------ nutrição
create table if not exists public.recipe_nutrition (
  content_id uuid primary key references public.content (id) on delete cascade,
  kcal numeric(8,1) check (kcal between 0 and 100000),
  protein_g numeric(8,1) check (protein_g between 0 and 100000),
  carbs_g numeric(8,1) check (carbs_g between 0 and 100000),
  fat_g numeric(8,1) check (fat_g between 0 and 100000),
  fiber_g numeric(8,1) check (fiber_g between 0 and 100000),
  sodium_mg numeric(8,1) check (sodium_mg between 0 and 100000),
  source text not null default 'chef' check (source in ('chef','nutritionist','food_table','lab')),
  source_note text check (length(source_note) <= 200),
  validated boolean not null default false,
  validated_by text check (length(validated_by) <= 120),
  validated_at date,
  validation_note text check (length(validation_note) <= 300),
  validated_by_user uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint recipe_nutrition_validated_ck check (not validated or (validated_by is not null and validated_at is not null))
);
create index if not exists recipe_nutrition_validator_idx on public.recipe_nutrition (validated_by_user) where validated_by_user is not null;
-- gatilho recipe_nutrition_guard (fora de admin/trusted/uid nulo):
--   * aceita a única mudança "validated_by_user → null" (cascata da exclusão de conta);
--   * outra mudança em validated/validated_* → 'nutrition_validation_forbidden';
--   * número ou origem mudou → validated=false e validated_* = null.

-- ------------------------------------------------ versões (snapshot imutável)
create table if not exists public.recipe_versions (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content (id) on delete cascade,
  version_no int not null check (version_no >= 1),
  reason text not null check (reason in ('submit','publish','schedule','admin_publish','admin_edit','restore_point')),
  snapshot jsonb not null,      -- {content, details, extras, categories, ingredients[], steps[], step_ingredients[], media[], nutrition, video, legacy_body?}
  snapshot_hash text not null,
  changed_sections text[] not null default '{}',   -- seções diferentes da versão anterior ("alterações")
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (content_id, version_no)
);
create index if not exists recipe_versions_created_by_idx on public.recipe_versions (created_by) where created_by is not null;
-- gatilho recipe_versions_immutable:
--   UPDATE → 'version_immutable', salvo quando a única mudança é created_by virando null
--     (to_jsonb(old)-'created_by' = to_jsonb(new)-'created_by' and new.created_by is null);
--   DELETE → 'version_immutable', salvo quando a content pai já não existe (cascata).

alter table public.content_reviews add column if not exists requested_publish_at timestamptz;
alter table public.content_reviews add column if not exists version_id uuid references public.recipe_versions (id) on delete set null;
create index if not exists content_reviews_version_idx on public.content_reviews (version_id) where version_id is not null;
alter table public.content add column if not exists archived_by text check (archived_by in ('admin','creator'));  -- protegida
create index if not exists content_recipe_live_idx on public.content (published_at desc, id)
  where type = 'recipe' and status = 'published';

-- ------------------------------------------------ regra de revisão por tipo
alter table public.content_type_settings add column if not exists review_required boolean not null default false;
-- gatilho content_type_settings_review_guard: review_required só muda com app.trusted (RPC admin_set_review_required)

-- ------------------------------------------------ avaliações (ligadas) e comentários (modelados, desligados)
create table if not exists public.recipe_ratings (
  content_id uuid not null references public.content (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  is_demo boolean not null default false,          -- preenchido pelo gatilho (app_metadata.ultra_hero_demo); fora do grant
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (content_id, user_id)
);
create index if not exists recipe_ratings_user_idx on public.recipe_ratings (user_id);
-- before insert/update: is_demo a partir do JWT; recusa mudança de content_id/user_id ('rating_immutable_keys')
-- after insert/update/delete (definer, sem execute para anon): ajusta rating_count/rating_sum sob app.trusted, ignorando is_demo

create table if not exists public.recipe_comments (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,  -- texto livre: sai com a conta
  body text not null check (length(btrim(body)) between 2 and 1000),
  status text not null default 'pending' check (status in ('pending','approved','rejected','hidden')),
  moderated_by uuid references auth.users (id) on delete set null,
  moderated_at timestamptz,
  moderation_reason text check (length(moderation_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recipe_comments_queue_idx on public.recipe_comments (status, created_at) where status = 'pending';
create index if not exists recipe_comments_content_idx on public.recipe_comments (content_id, created_at desc) where status = 'approved';
create index if not exists recipe_comments_user_idx on public.recipe_comments (user_id);
create index if not exists recipe_comments_moderator_idx on public.recipe_comments (moderated_by) where moderated_by is not null;
-- gatilho recipe_comments_guard (fora de admin/trusted/uid nulo): nenhuma mudança, salvo moderated_by → null

-- ------------------------------------------------ ingrediente ↔ produto (modelado; tela e fila na fase 5)
create table if not exists public.recipe_ingredient_products (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null,
  ingredient_id uuid not null,
  product_id uuid not null references public.products (id) on delete cascade,
  status public.link_status not null default 'suggested',
  note text check (length(note) <= 200),
  validated_by uuid references auth.users (id) on delete set null,
  validated_at timestamptz,
  product_version_at_validation int,
  suspended_reason text check (length(suspended_reason) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (ingredient_id, content_id) references public.recipe_ingredients (id, content_id) on delete cascade,
  unique (ingredient_id, product_id)
);
create unique index if not exists recipe_ingredient_products_one_validated
  on public.recipe_ingredient_products (ingredient_id) where status = 'validated';
create index if not exists recipe_ingredient_products_product_idx on public.recipe_ingredient_products (product_id);
create index if not exists recipe_ingredient_products_content_idx on public.recipe_ingredient_products (content_id);
create index if not exists recipe_ingredient_products_validator_idx on public.recipe_ingredient_products (validated_by) where validated_by is not null;
-- gatilho em products (after update): mudança em title/category_id/product_type/attributes/food_info → links 'validated' viram 'suspended'
-- nenhum vínculo é semeado por migração

-- ------------------------------------------------ lista de compras pessoal
create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content_id uuid references public.content (id) on delete set null,
  ingredient_id uuid references public.recipe_ingredients (id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 120),
  quantity numeric(10,3) check (quantity > 0),
  unit text check (unit in ('g','kg','mg','ml','l','tsp','tbsp','cup','unit','clove','bunch','sprig','fillet','slice','leaf','pinch','can','package')),
  quantity_text text check (length(quantity_text) <= 60),
  product_id uuid references public.products (id) on delete set null,  -- só pelo gatilho, a partir do vínculo validado
  checked boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shopping_list_items_user_idx on public.shopping_list_items (user_id, content_id, position);
create unique index if not exists shopping_list_items_ingredient_uq on public.shopping_list_items (user_id, ingredient_id) where ingredient_id is not null;
create index if not exists shopping_list_items_ingredient_idx on public.shopping_list_items (ingredient_id) where ingredient_id is not null;
create index if not exists shopping_list_items_content_idx on public.shopping_list_items (content_id) where content_id is not null;
create index if not exists shopping_list_items_product_idx on public.shopping_list_items (product_id) where product_id is not null;
-- before insert/update: product_id := vínculo validado do ingrediente (ignora o cliente);
--   insert com pg_advisory_xact_lock(hashtext('shopping:'||user_id)) e no máximo 300 itens ('shopping_list_full')

-- ------------------------------------------------ histórico (opt-in) e preferência
create table if not exists public.user_recipe_prefs (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  history_enabled boolean not null default false,
  history_enabled_at timestamptz,
  updated_at timestamptz not null default now()
);
-- after update: history_enabled true→false apaga recipe_view_history do usuário na mesma transação
create table if not exists public.recipe_view_history (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content_id uuid not null references public.content (id) on delete cascade,
  viewed_at timestamptz not null default now(),      -- último acesso; nada mais é guardado
  primary key (user_id, content_id)
);
create index if not exists recipe_view_history_recent_idx on public.recipe_view_history (user_id, viewed_at desc);
create index if not exists recipe_view_history_retention_idx on public.recipe_view_history (viewed_at);
create index if not exists recipe_view_history_content_idx on public.recipe_view_history (content_id);

-- ------------------------------------------------ chef: especialidades e credenciais
alter table public.creator_profiles add column if not exists specialties text[] not null default '{}'
  check (cardinality(specialties) <= 6);
alter table public.creator_profiles add column if not exists credentials text check (length(credentials) <= 300);
alter table public.creator_profiles add column if not exists credentials_approved_at timestamptz;   -- protegida (P7)
-- credentials só é escrita pelo admin (RPC); o herói pede em creator_credentials_requests (dono e admin)
alter table public.creator_profiles add constraint creator_profiles_media_prefix_ck
  check (coalesce(avatar_url,'') not like '/media/recipe/%' and coalesce(cover_url,'') not like '/media/recipe/%') not valid;
-- (validate constraint em seguida; dentro de do $$ if not exists)
create or replace trigger trg_a_creator_profiles_guard before update on public.creator_profiles
  for each row execute function public.guard_protected_columns('{headline,bio,avatar_url,cover_url,socials,specialties}');
```

`set_updated_at` vale em todas as tabelas com `updated_at`. `on delete set null (coluna)` exige PG 15 ou mais novo (local 16, remoto 17).

`recipe_extras.ingredient_terms` = `to_tsvector('simple', f_unaccent(nomes dos ingredientes e das substituições))`. É gravado pela `recipe_save` e pelo backfill.

### 3.3 Configurações

| Onde | Chave | Valor inicial | Uso |
|---|---|---|---|
| `content_type_settings.review_required` | por tipo | `false` em todos | Seção 2.1; muda só por `admin_set_review_required` |
| `app_settings` | `recipes.ratings_enabled` | `true` | Política de insert em `recipe_ratings` e interface |
| `app_settings` | `recipes.comments_enabled` | `false` | Política de insert em `recipe_comments` |
| `app_settings` | `recipes.uploads_enabled` | `true` | Política do Storage e `recipe_register_media`; entra em `KILL_SWITCHES` |

Ajustes:
- `public_settings()` é redefinida com as 3 chaves acrescentadas à lista fixa (mesma assinatura e grants; continua no S14).
- `SETTING_SCHEMAS` ganha os 3 schemas.
- `/admin/content/settings` ganha "Exigir revisão" por tipo, com justificativa obrigatória.

Funções auxiliares (SQL, invoker, `search_path` fixo, sem grant para anon):
- `content_review_required(p_type)`;
- `recipe_setting_on(p_key)` = `coalesce((public.public_settings() ->> p_key)::boolean, false)`.

### 3.4 RLS e grants

**Legenda:**
- **L(c)**: `exists (select 1 from content c where c.id = content_id and public.content_is_live(c.status, c.publish_at))`, ou o chamador é o dono ou admin. É "visível", com o "no ar" explícito.
- **A(c)**: `public.can_access_content(content_id)` (plano, módulo e a etapa de receitas).

**Escrita nas tabelas da receita:** só por RPC. Não há insert, update nem delete para authenticated em `recipe_details`, `recipe_extras`, `recipe_category_links`, `recipe_ingredients`, `recipe_steps`, `recipe_step_ingredients`, `recipe_media`, `recipe_nutrition`, `recipe_versions` e `recipe_ingredient_products`.

| Tabela | Grants | Visitante | Consumidor | Herói dono | Admin |
|---|---|---|---|---|---|
| `recipe_categories` | select anon, auth | ativas | ativas | ativas | todas; escrita por `admin_upsert_recipe_category` |
| `recipe_details` | select anon, auth | L(c): tempos, porções, dietas, alérgenos declarados, história, nota média | L(c) | inclui rascunho | tudo |
| `recipe_extras` | select **auth** | — (`permission denied`) | A(c) | A(c) (dono passa) | tudo |
| `recipe_category_links` | select anon, auth | L(c) | L(c) | inclui rascunho | tudo |
| `recipe_media` | select anon, auth | `role='gallery'` e L(c) | galeria L(c); etapa A(c) | todas as próprias | tudo |
| `recipe_ingredients`, `recipe_steps`, `recipe_step_ingredients` | select auth | — | A(c) | A(c) | tudo |
| `recipe_nutrition` | select auth | — | A(c); a interface só mostra se validada | A(c) | tudo |
| `recipe_versions` | select auth | — | — | as da própria receita | tudo |
| `recipe_ratings` | select, delete auth; insert (`content_id, stars`); update (`stars`) | — (só o agregado) | próprias; insert/update exigem `ratings_enabled`, A(c), `type='recipe'`, não ser o chef e ter `completions` da receita | idem (não avalia a própria) | lê todas |
| `recipe_comments` | anon: select (`id, content_id, body, created_at`); auth: select (`+ status`), insert (`content_id, body`), delete | `status='approved'` e L(c) | aprovados + os próprios; insert com `comments_enabled`, A(c), `user_id=uid`; delete dos próprios | idem | modera por RPC |
| `recipe_ingredient_products` | select auth | — | `status='validated'` e A(c) | os da própria receita | tudo |
| `shopping_list_items` | select, delete auth; insert/update por coluna, **sem `product_id`** | — | próprios; check `user_id=uid` e (`content_id is null` ou A(c)) | próprios | **não lê** (dado pessoal) |
| `user_recipe_prefs` | select, insert, update, delete auth | — | própria | própria | — |
| `recipe_view_history` | select, insert, update, delete auth | — | própria; insert/update só com `history_enabled` e L(c) | própria | — |
| `content_localizations` (correção) | `grant select (content_id, locale, title, summary, status, updated_at)` a anon, auth | título e resumo publicados | idem; corpo pela RPC `content_localized_body` | idem | idem |

`recipe_ratings` e `recipe_comments` passam pelo gatilho `trg_recipe_social_type`, que devolve `not_recipe`. O autor de comentário não aparece ao público (sem `user_id` no grant). A exibição com nome entra quando os comentários forem ligados. A nota média aparece na interface com 3 ou mais avaliações que não sejam de demo.

**Storage (0028), bucket `recipe-media`:**

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-media', 'recipe-media', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
```

Caminho: `<creator_id>/<content_id>/<uuid>.<jpg|png|webp>`.

`public.recipe_media_path_ok(p_name text) returns boolean`: plpgsql invoker, com retorno antecipado. Faz o seguinte, nesta ordem:
1. Se o nome não casar com a regex de UUID 8-4-4-4-12 completa do caminho, `return false`, sem cast.
2. Só então converte os segmentos em uuid.
3. Confere que o conteúdo é do herói, é `type='recipe'`, está em `status='draft'` e tem `review_status<>'in_review'`.

| Política | Para | Regra |
|---|---|---|
| `recipe_media_insert` | authenticated | `(storage.foldername(name))[1] = (select my_creator_id())::text` e `recipe_media_path_ok(name)` e `recipe_setting_on('recipes.uploads_enabled')` e cota diária (menos de 50 objetos e menos de 100 MB do `owner_id` nas últimas 24 h) e a regra de demo da P3 |
| `recipe_media_select` | anon, authenticated | `exists (select 1 from public.recipe_media m where m.storage_path = name)` (a RLS de `recipe_media` decide), **ou** `owner_id = (select auth.uid())::text` |
| `recipe_media_delete` | authenticated | dono do objeto e (`recipe_media_path_ok(name)` ou sem linha em `recipe_media`) |
| — | — | Sem update: objetos imutáveis |

**Por que bucket privado com proxy:**
- **Bucket público:** serve sem RLS, então a foto de rascunho ou de receita despublicada ficaria aberta.
- **Dois buckets, copiando ao publicar:** quebra com o agendamento, porque não há evento em `publish_at`, e sai de sincronia com o banco.
- **URL assinada:** expira e estraga o cache e o `cover_url`.
- **Escolha: bucket privado e proxy `/media/recipe/[mediaId]`**, no mesmo padrão de `/media/stream/[uid]/thumbnail` (o `matcher` do middleware já ignora `media/`):
  - a visibilidade é avaliada a cada requisição pela RLS;
  - `cover_url = '/media/recipe/<id>'` passa no `SAME_ORIGIN_PATH`;
  - nenhum código depende da service role.

**Proxy:**
1. `z.uuid()` no id. Se inválido, 404 com `no-store`.
2. Lê `recipe_media` com o cliente da pessoa (a RLS decide). Sem linha, 404.
3. `download(path)` com o mesmo cliente.
4. **Confere os primeiros 12 bytes** (JPEG `FFD8FF`, PNG `89504E47…`, WEBP `RIFF….WEBP`) contra o `mime` da linha. Se não bater, 404.
5. Responde com `Content-Type` do banco, `nosniff`, `Content-Security-Policy: default-src 'none'` e `Content-Disposition: inline`.
6. Cache:
   - público no ar: `public, max-age=60, s-maxage=300, stale-while-revalidate=60`;
   - os demais: `private, no-store`, e o editor usa `<Image unoptimized>`.

**Órfãos:** `recipe_orphan_media(p_limit)` (só service_role) devolve os caminhos sem linha em `recipe_media` com mais de 24 h. O cron `/api/cron/retention` apaga esses caminhos pela API do Storage. Nunca se faz `delete` em `storage.objects` por SQL.

### 3.5 Redefinições e gatilhos (0027)

1. **`can_access_content`**: mesma assinatura e grants. Depois do `auth.uid() is null`, e com admin e dono já tratados antes:
   ```sql
   if c.type = 'recipe' and not exists (select 1 from public.recipe_onboarding o where o.user_id = auth.uid()) then return false; end if;
   ```
2. **`public_settings()`**: lista fixa mais as 3 chaves.
3. **`creator_publish_content(p_content, p_publish_at)`**: nova sobrecarga sem default; a de 1 parâmetro delega com `null`. Acréscimos às regras da 0026:
   - `review_required` quando a regra do tipo está ligada;
   - `p_publish_at` nulo publica agora; senão precisa estar em `[now()+1 min, now()+365 dias]` (`invalid_publish_at`);
   - auditoria `content.creator_publish` com `publish_at`.
   O checklist da receita vem do gatilho do item 9b.
4. **`submit_content_for_review(p_content, p_requested_publish_at)`**: nova sobrecarga sem default. Faz:
   - as regras da 0010;
   - para receita, `recipe_assert_publishable` e snapshot `submit`;
   - grava `requested_publish_at` e `version_id`;
   - auditoria `content.submit`.
   **A de 1 parâmetro passa a delegar com `null`**, para que nenhuma receita seja enviada sem checklist.
5. **`run_retention()`**: os 5 passos atuais mais `delete from recipe_view_history where viewed_at < now() - interval '90 days'`. A contagem vai em `details`.
6. **`admin_set_content_status`** (3 e 4 parâmetros): grava `archived_by='admin'` ao arquivar e `null` ao sair do arquivado.
7. **`anonymize_user_data(p_user)`**: cópia integral da versão da 0010, mais, sob `app.trusted`:
   - apaga `recipe_ratings`, `recipe_comments`, `shopping_list_items`, `recipe_view_history` e `user_recipe_prefs` do usuário;
   - zera `recipe_versions.created_by`, `recipe_media.created_by`, `recipe_comments.moderated_by`, `recipe_nutrition.validated_by_user` e `recipe_ingredient_products.validated_by`.

   Com isso, `delete_my_account` e a exclusão pelo painel do Auth não esbarram em gatilho: para o painel, os gatilhos aceitam o `set null` da cascata.
8. **Limpeza do Stream (`stream_cleanup_candidates` e `stream_cleanup_discard`)**: mesmas assinaturas e grants.
   - `draft_id` só é devolvido quando `c.type = 'video'`.
   - Para outro tipo (rascunho nunca publicado do mesmo herói), o descarte **não apaga o conteúdo**: zera `media_provider='none'` e `media_ref=null` no corpo (como sistema, sem tocar em `body`) e marca o envio como descartado.
   - O vídeo de receita segue os limites do composer: até 180 s e a mesma cota de 10 envios por hora.
9. **Gatilhos novos ou recriados em `content`:**
   - a. `trg_content_type_lock` (before update): `old.type <> new.type` com `'recipe'` em qualquer lado → `type_locked`.
   - b. `trg_content_recipe_publishable` (before update): quando `new.type='recipe'`, `new.status='published'` e `old.status <> 'published'`, executa `perform recipe_assert_publishable(new.id)`. Isso cobre a publicação pelo herói, `admin_review_content` e `admin_set_content_status`, inclusive a conferência do uid do Stream.
   - c. `trg_d_content_recipe_version` (after update, definer sem execute para anon): ao entrar no ar ou mudar `publish_at` publicado, chama `recipe_snapshot` com motivo `admin_publish`, `schedule` ou `publish`.
   - d. `trg_e_content_recipe_cover` (**before insert or update**, qualquer tipo): `cover_url like '/media/recipe/%'` exige que o id seja `recipe_media` do **mesmo** conteúdo (`cover_not_owned`).
10. **`trg_d_content_bodies_recipe_managed`** (before insert/update em `content_bodies`): quando o conteúdo é `type='recipe'` com `recipe_details` e a **coluna `body`** muda sem `is_trusted_call()`, recusa com `recipe_body_managed`. A mudança de vídeo passa e continua sujeita à guarda do Stream da 0026.
11. **Cenários existentes** que publicam receita por `update` direto (su) passam a encontrar o gatilho 9b. Isso será conferido e ajustado ao rodar a suíte; a contagem do S14 (40 no ar) não muda.

### 3.6 RPCs novas

Todas são `security definer`, com `search_path = public` e `revoke execute … from public, anon`, e têm grant para `authenticated` e `service_role`. As do herói começam como a 0025: `uid` nulo dá `unauthenticated`, e conteúdo alheio ou inexistente dá `forbidden`. **Toda escrita em tabela filha usa `where id = x and content_id = p_content` e confere `row_count`.** Se não bater, o erro é `forbidden` ou `media_not_owned`.

**Chef: escrita**

`recipe_save(p_content uuid, p_payload jsonb, p_expected_updated_at timestamptz) → jsonb {updated_at}`. Grava a receita inteira de forma atômica.
- **Lock:** `select … from content where id = p_content for update` **antes** de comparar `updated_at` (`stale_draft`). Submit e publish já fazem `for update`, então tudo fica serializado.
- **Quem:** dono com rascunho fora de revisão, ou admin. O admin pode editar receita publicada, o que gera snapshot `admin_edit`.
- **Checagens:** `not_recipe`, `content_not_editable` e `stale_draft`.
- **Escreve, nesta ordem:**
  - `content` (title, summary, tags, difficulty, pillar, disclaimer_kind, licença, `duration_minutes = total_minutes`) e `cover_url` a partir de `cover_media_id`;
  - upsert de `recipe_details` e `recipe_extras` (`chef_note` e termos);
  - categorias (até 3; `invalid_category` ou `too_many_categories`);
  - ingredientes: upsert por `id`, em que um id que já existe em outra receita dá `forbidden`; delete dos ausentes; `too_many_ingredients` acima de 60;
  - etapas (`too_many_steps` acima de 40), `step_ingredients` e `image_media_id` (as FKs compostas garantem a mesma receita);
  - metadados de mídia (`alt_text`, `caption`, `position`) com `content_id = p_content` (`media_not_owned`);
  - `recipe_nutrition` (o gatilho trata a validação);
  - **vídeo:** um `update content_bodies set media_provider, media_ref` **separado, sem trusted**. A guarda do Stream da 0026 roda com o `auth.uid()` do herói, e um uid alheio dá `stream_media_forbidden`;
  - **por último, sob trusted:** upsert de `body = {kind:'recipe',schema:2}`. Se o `body` atual não for o marcador (receita antiga), a versão `restore_point` com `legacy_body` precisa existir antes; o backfill a cria.
- **Validação:** `jsonb_to_recordset` com cast explícito. Erro vira `invalid_payload: <caminho>` (por exemplo `ingredients.3.unit`).

Formato do payload (espelhado em `src/lib/recipes/payload.ts`, Zod compartilhado):
```json
{
  "content": {"title":"…","summary":"…","tags":["…"],"difficulty":"beginner","pillar":"gastronomy",
              "disclaimer_kind":"nutrition","media_license_kind":"own","media_license_ref":null,"media_credit":null},
  "details": {"servings":2,"yield_text":null,"prep_minutes":10,"cook_minutes":25,"rest_minutes":null,"total_minutes":35,
              "story":"…","diets":["gluten_free"],"allergens":["egg"],"allergens_declared":true,"allergen_notes":null,
              "cover_media_id":"uuid"},
  "extras": {"chef_note":"…"},
  "categories": ["almoco"],
  "ingredients": [{"id":"uuid","name":"Peito de frango","quantity":300,"unit":"g","quantity_text":null,
                   "to_taste":false,"optional":false,"note":null,"substitutions":[]}],
  "steps": [{"id":"uuid","instruction":"…","duration_seconds":1500,"temperature_c":200,"tip":null,
             "image_media_id":null,"ingredient_ids":["uuid"]}],
  "media": [{"id":"uuid","position":1,"alt_text":"…","caption":null}],
  "nutrition": {"kcal":520,"protein_g":42,"carbs_g":38,"fat_g":21,"fiber_g":6,"sodium_mg":480,"source":"chef","source_note":null},
  "video": {"provider":"embed_youtube","ref":"dQw4w9WgXcQ"}
}
```
`video` ausente mantém o vídeo atual. `nutrition: null` remove a linha.

`recipe_register_media(p_content, p_path, p_role, p_alt, p_rights, p_width, p_height) → uuid`
- Dono, receita editável, com `for update` no conteúdo.
- **`mime` e `bytes` vêm de `storage.objects.metadata`** (`mimetype`, `size`) do objeto com `bucket_id`, `name` e `owner_id = uid`. Largura e altura são só dica.
- A cota diária usa `pg_advisory_xact_lock` por herói.
- Erros: `uploads_disabled`, `invalid_path`, `object_not_found`, `invalid_mime`, `too_large`, `rights_required`, `too_many_media` (30, das quais 12 de galeria), `upload_quota_exceeded` e, conforme a P3, `demo_upload_forbidden`.

`recipe_delete_media(p_media) → jsonb {path}`: dono com receita editável. Apaga a linha; capa e imagem de etapa viram `null`. O app apaga o objeto, e se falhar o cron limpa como órfão.

`creator_withdraw_review(p_content)`: fecha a rodada como `returned` ("Retirado pelo herói"). Erro: `not_in_review`.

`creator_archive_content(p_content, p_reason)`:
- vale para qualquer status menos `archived`;
- quando a receita está `in_review`, fecha a rodada como `returned` ("Arquivada pelo herói") e volta `review_status='none'`;
- grava `archived_by='creator'` e `publish_at=null`;
- erro `already_archived`; auditoria `content.creator_archive`.

`creator_restore_content(p_content)`: só o que tem `archived_by='creator'`, e volta a `draft`/`none`. Erros: `not_archived` e `archived_by_admin`.

`creator_delete_recipe_draft(p_content) → jsonb {paths}`: rascunho com `published_at is null`. Erros: `not_draft`, `already_published` e `content_in_use` (programa ou `completions`, que é `restrict`).

`creator_duplicate_recipe(p_content, p_title, p_slug) → uuid`:
- a origem é do próprio herói;
- recusa com `source_locked` quando a origem está `archived` com `archived_by <> 'creator'`, ou com `review_status='rejected'`;
- copia detalhes, extras, categorias, ingredientes e etapas com ids novos, e a nutrição sem validação;
- não copia mídia, vídeo, vínculos, avaliações nem versões;
- `slug_taken` faz a action tentar outro sufixo.

`creator_restore_recipe_version(p_version)`: dono, receita editável. Reconstrói as tabelas a partir do snapshot. A mídia volta só se a linha ainda existir, e a nutrição volta sem validação. Erro: `version_not_found`.

`creator_suggest_ingredient_product(p_ingredient, p_product, p_note)` e `creator_withdraw_ingredient_product(p_link)`: o withdraw confere `c.creator_id = my_creator_id()` e `status='suggested'`. A tela vem na fase 5.

`creator_recipe_stats(p_days int default 30) → table(content_id, visitors int, favorites int, rating_count int, rating_avg numeric)`:
- só do próprio herói;
- `visitors` = visitantes distintos por dia (`coalesce(user_id::text, anon_id)` e o dia) em `content.view`, descartando eventos sem nenhum dos dois e os do próprio chef, numa janela de até 90 dias;
- a interface rotula como "aproximado" e mostra "—" abaixo de 5;
- os eventos do E2E não chegam: o Playwright define o cookie `uh-e2e=1`, e com ele o `trackView` não registra;
- se o volume crescer, criar índice parcial em `analytics_events ((properties->>'content_id')) where event_name='content.view'`.

**Admin:**

| RPC | Regra |
|---|---|
| `admin_set_review_required(p_type, p_on, p_reason)` | Justificativa ≥ 5. Auditoria `content_type.review_required` |
| `admin_set_ingredient_product(p_link, p_status, p_note)` | `validated` grava `validated_*` e a versão do produto, e suspende o validado anterior. Auditoria |
| `admin_validate_recipe_nutrition(p_content, p_validated, p_by, p_at, p_note)` | `nutrition_validation_incomplete` se faltar responsável ou data. Auditoria |
| `admin_upsert_recipe_category(p_code, p_name, p_sort, p_active)` | Auditoria |
| `admin_moderate_recipe_comment(p_comment, p_decision, p_reason)` | Motivo obrigatório fora de `approved`. Auditoria |
| `admin_set_creator_credentials(p_creator, p_approved, p_reason)` | Aprovar copia o texto de `creator_credentials_requests` para `creator_profiles.credentials` e grava `credentials_approved_at`; reprovar limpa os dois. Auditoria (P7) |

**Internas** (sem execute para authenticated):
- `recipe_assert_publishable(p_content)` lança `recipe_incomplete: a,b,c` com os códigos:
  - `title`, `summary`;
  - `cover`: `cover_media_id` com `alt_text`, **ou** `cover_url` já preenchido. Assim o placeholder das receitas antigas continua valendo, e foto enviada só passa a ser obrigatória por decisão explícita;
  - `gallery_alt`, `servings`, `total_minutes`;
  - `times` (`total ≥ prep + cook + rest`);
  - `ingredients` (≥1), `steps` (≥1), `category` (≥1);
  - `allergens` (`allergens_declared`);
  - `license` (`content_assert_media_license`);
  - `stream`: um vídeo `cloudflare_stream` precisa ter `stream_uploads` do dono, não descartado e sem uso em outro conteúdo.
- `recipe_snapshot(p_content, p_reason) → uuid`: não repete hash e calcula `changed_sections`.
- `recipe_backfill_legacy(p_content)` (seção 3.8; só service_role).
- `recipe_orphan_media(p_limit)` (só service_role).

**Leitura pública (invoker, fora do S14)**

`recipe_catalog(p_query, p_categories, p_max_minutes, p_difficulty, p_diets, p_exclude_allergens, p_creator, p_sort, p_cursor, p_limit) → table(content_id, rank, cursor)`
- `language sql stable`, security invoker, grant para anon, authenticated e service_role.
- **`where public.content_is_live(c.status, c.publish_at)` explícito**: o dono e o admin nunca veem os próprios rascunhos no catálogo.
- **Candidatos por CTE**, com a `UNION` de buscas indexadas:
  - `content.search @@ q` (GIN existente);
  - `title % q` / `ilike` (trigram `content_title_trgm_idx`);
  - nome do chef em `creator_profiles`;
  - `recipe_extras.ingredient_terms @@ q`. Como a função é invoker, só entram as receitas que o chamador pode abrir.

  Sem `p_query`, os candidatos vêm do índice parcial `content_recipe_live_idx`. O join com detalhes e categorias vem depois.
- **Filtros:**
  - `diets @> p_diets`;
  - `p_exclude_allergens`: `allergens_declared and not (allergens && p_exclude_allergens)`.
- **Ordenação:**
  - `relevance` (`ts_rank`, `is_featured`, `published_at`): offset de até 480;
  - `recent` (`published_at desc, id`) e `quick` (`total_minutes, id`): cursor por chave.
- Limite: `least(greatest(p_limit,1),48)`.
- Antes da fase 3: `EXPLAIN ANALYZE` com cerca de 5 mil receitas sintéticas no banco local.

### 3.7 Eventos e auditoria

**`admin_audit`**, ações novas:
- `content.submit`, `content.creator_archive`, `content.creator_restore`, `content.creator_delete`, `content.creator_withdraw`;
- `content_type.review_required`;
- `recipe.version` e `recipe.backfill`;
- `recipe_ingredient_product.set_status`, `recipe_nutrition.validate`, `recipe_category.upsert`, `recipe_comment.moderate`, `creator.credentials`.

`content.creator_publish` passa a levar `publish_at`. A gravação de rascunho não é auditada; as versões cobrem o histórico.

**`analytics_events`** (sem PII):
- `recipe.cook_start`, `recipe.cook_complete`;
- `recipe.scale`;
- `recipe.share`, `recipe.print`;
- `recipe.shopping_add`;
- `recipe.rate`;
- `recipe.catalog_filter`: só os **nomes** dos filtros, nunca os valores de alergia ou dieta.

### 3.8 Backfill das receitas antigas (0029)

**Princípio:** os dados publicados não mudam; só a forma muda. Não há parser em SQL. `parseQuantity` e `formatQuantity` existem só em TypeScript (`src/lib/recipes/quantity.ts`). A tabela abaixo foi gerada por eles a partir do levantamento e entra na migração como **dados literais** por `content_id` e posição.

`recipe_backfill_legacy(p_content)` faz, para uma receita sem `recipe_details`, nesta ordem:
1. **Copia o corpo atual** para `recipe_versions` (v1, `restore_point`, `snapshot = {legacy_body: …}`), **antes de qualquer escrita**.
2. Para cada ingrediente do corpo, na posição *i*:
   - se há literal para (receita, *i*) e o `qty` e o `item` atuais são iguais ao texto do levantamento, usa o literal;
   - senão, `quantity_text` = original (ou `to_taste` para "a gosto"), e o item não recalcula (decisão 7);
   - em qualquer caso, `source_qty` = original. Nome com mais de 120 caracteres é cortado, e o original fica no `restore_point`.
3. Etapas: o texto fica igual. Duração e temperatura vêm só dos literais das 8 receitas; as demais ficam sem.
4. Tempos: `prep`, `cook` e `servings` do corpo são **copiados como estão**, com limites (fora da faixa vira nulo), e `total_minutes = content.duration_minutes`. **Nada é corrigido** (P5).
5. Alérgenos pelo mapa pt-BR→código; rótulo com qualificador vai para `allergen_notes`. `allergens_declared = true` só quando o corpo antigo tinha `allergens`. Dieta nunca é inferida.
6. Nota → `recipe_extras.chef_note`; termos de busca; nutrição (g1 e g5 validadas, mantendo `validated_by`/`at`/`note`; g9 com números e `validated=false`; `source='chef'`).
7. Categorias segundo a proposta da P5. Mídia: nenhuma (a capa continua o placeholder). Vínculos ingrediente↔produto: **nenhum**.
8. **Não toca** em `content.duration_minutes` nem em `content_bodies.body`.

Cada receita roda num bloco `begin … exception`. Em erro, registra `raise warning` com o id e segue; a receita fica só com o corpo antigo.

**Antes de aplicar no remoto:** dry-run. Um `select` compara o corpo atual de cada receita com os literais e lista o que cairia em texto e as receitas fora das 8. O resultado é conferido contra esta tabela, e a aplicação só segue com zero warnings esperados.

**Resultado esperado para as 41 linhas: 34 numéricas, 3 em texto e 4 "a gosto".**

| Receita | Ingrediente | Original | quantity | unit | outro |
|---|---|---|---|---|---|
| g4 | Arroz integral | 1 xícara | 1 | cup | |
| g4 | Água | 2 1/2 xícaras | 2.5 | cup | |
| g4 | Azeite | 1 colher de sopa | 1 | tbsp | |
| g4 | Alho | 1 dente | 1 | clove | |
| g4 | Sal | 1 colher de chá | 1 | tsp | |
| g1 | Peito de frango | 300 g | 300 | g | |
| g1 | Abobrinha / Cenoura | 1 / 1 | 1 / 1 | — | |
| g1 | Batata-doce | 1 média | 1 | — | note "média" |
| g1 | Azeite | 2 colheres de sopa | 2 | tbsp | |
| g1 | Molho de ervas (receita da plataforma) | 3 colheres | — | — | texto "3 colheres" |
| g8 | Carne moída / Abóbora cabotiá | 500 g / 400 g | 500 / 400 | g | |
| g8 | Cebola e alho | 1 e 2 dentes | — | — | texto |
| g8 | Arroz integral cozido / Brócolis | 2 xícaras / 1 xícara | 2 / 1 | cup | |
| g3 | Salsinha / Cebolinha | 1 maço / 1/2 maço | 1 / 0.5 | bunch | |
| g3 | Azeite | 1/2 xícara | 0.5 | cup | |
| g3 | Limão / Alho | 1 / 1 dente | 1 / 1 | — / clove | |
| g3 | Sal | a gosto | — | — | to_taste |
| g2 | Ovos | 10 | 10 | — | |
| g2 | Espinafre / Tomate-cereja | 2 xícaras / 1 xícara | 2 / 1 | cup | |
| g2 | Queijo branco | 100 g | 100 | g | |
| g2 | Sal e orégano | a gosto | — | — | to_taste |
| g9 | Banana madura / Ovo | 1 / 1 | 1 / 1 | — | |
| g9 | Aveia em flocos | 3 colheres de sopa | 3 | tbsp | |
| g9 | Canela | a gosto | — | — | to_taste |
| g5 | Filé de salmão | 2 postas | 2 | fillet | |
| g5 | Batata-doce | 2 médias | 2 | — | note "média" |
| g5 | Azeite | 2 colheres de sopa | 2 | tbsp | |
| g5 | Limão / Alecrim | 1 / 2 ramos | 1 / 2 | — / sprig | |
| g6 | Grão-de-bico cozido | 2 xícaras | 2 | cup | |
| g6 | Cenoura, abobrinha e chuchu | 1 de cada | — | — | texto |
| g6 | Cebola | 1 | 1 | — | |
| g6 | Caldo de legumes caseiro ou água | 1,5 L | 1.5 | l | |
| g6 | Azeite e sal | a gosto | — | — | to_taste |

**Demais dados:**
- **Etapas:** 28 linhas (g1 3, g2 4, g3 3, g4 4, g5 3, g6 4, g8 4, g9 3). Duração e temperatura literais só onde o texto tem uma única ocorrência inequívoca, por exemplo g1.1 = 200 °C e 25 min, e g4.3 = 35 min. "X minutos de cada lado" (g1.2, g9.3) não conta. A lista exata é fechada pelo `parseQuantity`/extrator em TS e conferida no dry-run.
- **Alérgenos declarados:**
  - g2 = `{egg, milk}`;
  - g5 = `{fish}`;
  - g9 = `{egg}`, com a nota "Aveia pode conter glúten";
  - as demais ficam "não informadas".
- **Tempos copiados, que precisam de decisão (P5):**
  - g4: 5 + 45 = 50 contra o total de 40;
  - g2: 15 + 20 = 35 contra 30 (valores de template);
  - g5, g6 e g8 têm 15/20 de template, mas são coerentes.

  Republicar g2 ou g4 sem correção dá `recipe_incomplete: times`.

---

### 3.9 Cenários de teste de banco (S25–S32)

Os cenários entram antes do S14. Cada um cria os próprios usuários (`…0025`–`…0032`) e termina com **nada novo no ar** (o S14 conta 40). Ajustes nos cenários existentes:
- **S3:** o consumer1 precisa de `recipe_onboarding` antes de ler o corpo de g8.
- **S14:** mesma lista pública, mais a verificação de que nenhuma função `recipe_*`, `creator_*` ou `admin_*` nova é executável por anon.
- Cenários que publicam receita por `update` direto passam pelo gatilho 9b.

**S25 · Estrutura e backfill**
- As 8 receitas têm detalhes; há 41 ingredientes (34/3/4) e 28 etapas.
- Cada uma tem a v1 `restore_point` com `legacy_body` igual ao corpo do seed.
- `content_bodies.body` e `duration_minutes` estão **inalterados**.
- `allergens_declared` só em g2, g5 e g9. Os tempos copiados batem com o seed.
- `recipe_backfill_legacy` numa receita v1 criada no teste, com um formato fora da tabela ("1 punhado"), deixa o item em `quantity_text` e não aborta.
- Reaplicar não duplica nada.
- (O teste cruzado "formatado + nota = original" das 34 linhas fica no Vitest, porque o formatador é TS.)

**S26 · Permissões da receita**
- Anon:
  - lê detalhes, categorias e galeria de receita no ar;
  - recebe `permission denied` em `recipe_extras`, `recipe_ingredients`, `recipe_steps` e `recipe_nutrition`;
  - não vê os detalhes de um rascunho.
- Consumidor sem a etapa: `can_access_content(g1)` falso, 0 ingredientes, 0 corpo e 0 `recipe_extras`. Com a etapa: 6 ingredientes de g1 e 0 de g5.
- Herói:
  - `recipe_save` alheia dá `forbidden`;
  - insert direto dá `permission denied`;
  - mudar `type` de receita dá `type_locked`;
  - `cover_url = '/media/recipe/<foto de outra receita>'` no insert de um artigo dá `cover_not_owned`;
  - `avatar_url` com o prefixo é recusado.
- `recipe_save` própria:
  - reordena e preserva os ids;
  - apaga os ausentes;
  - devolve `stale_draft` e `content_not_editable`;
  - recusa `invalid_payload: ingredients.0.unit`, `too_many_ingredients`, 4 categorias e `media[]` com id de outra receita (`media_not_owned`);
  - `cover_media_id` e `image_media_id` de outra receita violam a FK composta.
- Gravar `body` dá `recipe_body_managed`; mudar só o vídeo passa pela guarda do Stream.
- Nutrição: validar dá `nutrition_validation_forbidden`; `kcal` derruba a validação; mudar só a nota da receita a mantém; o admin valida (auditado).
- Tradução: anon não lê `body`, mas lê título e resumo.
- Herói grava `specialties` e pede credenciais em `creator_credentials_requests` (o visitante não lê o pedido); `credentials` e `credentials_approved_at` só o admin define, e editar o pedido tira o texto aprovado do perfil.

**S27 · Mídia e Storage** (shim)
- O bucket é privado, com 5 MB e 3 tipos.
- Insert de objeto:
  - passa na própria pasta, em rascunho próprio;
  - é recusado na pasta alheia, em receita publicada, com pasta que não é uuid (sem erro 22P02), com uploads desligados e acima da cota;
  - para conta demo, segue a P3.
- `recipe_register_media`:
  - devolve `object_not_found`, `rights_required` e `too_many_media`;
  - com `metadata.mimetype = 'text/html'` dá `invalid_mime`, mesmo que o cliente diga que é PNG;
  - `metadata.size` acima de 5 MB dá `too_large`.
- Visibilidade:
  - anon não vê o objeto de rascunho;
  - publicada, anon vê a galeria e não vê a etapa;
  - agendada, ninguém vê até a data;
  - despublicada, a foto some.
- `recipe_delete_media` zera a capa. `recipe_orphan_media` só pode ser executada pela service_role.

**S28 · Publicação, revisão configurável, agendamento, versões e vídeo**
- A configuração inicial é `review_required=false` em todos os tipos. Update direto na coluna, mesmo pelo admin, é recusado; `admin_set_review_required` audita.
- **Modo desligado:**
  - o herói publica a receita;
  - data futura agenda;
  - data no passado ou além de 365 dias dá `invalid_publish_at`;
  - receita incompleta dá `recipe_incomplete: cover,ingredients,category,allergens`.
- **Modo ligado** (o próprio cenário liga e depois desliga):
  - `creator_publish_content` dá `review_required`;
  - `submit_content_for_review(id, data)` grava `requested_publish_at` e `version_id`;
  - a versão de 1 parâmetro também roda o checklist;
  - withdraw funciona;
  - `admin_review_content(..., data)` agenda;
  - aprovar ou fazer `admin_set_content_status('published')` numa receita incompleta é recusado pelo gatilho.
- **Vídeo:**
  - `recipe_save` com o uid do Stream de outro herói dá `stream_media_forbidden`;
  - um uid alheio gravado como sistema faz a aprovação ser recusada (`recipe_incomplete: stream`);
  - o post de vídeo continua publicando direto (S23 verde).
- **Limpeza do Stream:** um rascunho de receita com envio vencido e vídeo `errored` continua existindo, fica sem vídeo e o envio sai como descartado. Um rascunho de vídeo continua sendo apagado (S24 verde).
- **Versões:**
  - cada publicação cria a versão seguinte; o hash igual não duplica;
  - update e delete dão `version_immutable`;
  - o dono lê as próprias versões; outros leem 0;
  - o restore volta as tabelas sem validação de nutrição.
- **Ciclo de vida:**
  - arquivar uma receita `in_review` fecha a rodada;
  - restaurar o que o admin arquivou dá `archived_by_admin`;
  - excluir algo já publicado dá `already_published`;
  - duplicar uma origem arquivada pelo admin ou rejeitada dá `source_locked`;
  - duplicar uma origem válida cria ids novos.
- A auditoria registra cada ação. No fim, nada novo fica no ar.

**S29 · Avaliações e comentários**
- **Estrelas:**
  - 0 e 6 são recusadas; a segunda avaliação é update;
  - sem `completions` é recusada; o chef não avalia a própria; com `ratings_enabled=false` é recusada;
  - update de `content_id` é recusado;
  - o agregado acompanha insert, update e delete e ignora `is_demo`.
- **Comentários:**
  - recusados enquanto desligados;
  - ligados (su), só entram como `pending`;
  - anon não seleciona `user_id` (`permission denied`);
  - o admin aprova;
  - o dono exclui e não edita.

**S30 · Ingrediente ↔ produto e lista de compras**
- **Vínculo:**
  - o herói sugere; outro herói recebe `forbidden` ao sugerir e ao retirar;
  - o admin valida (auditado), e só um vínculo fica validado por ingrediente;
  - o consumidor vê só os validados;
  - uma mudança relevante no produto suspende o vínculo; o preço não suspende.
- **Lista:**
  - `product_id` enviado pelo cliente é ignorado: fica o do vínculo validado, ou nulo;
  - adicionar o mesmo ingrediente de novo atualiza a linha;
  - o 301º item dá `shopping_list_full`;
  - o admin lê 0;
  - item de receita sem acesso é recusado.
- `cart_set_item` não mudou (S8 verde).

**S31 · Histórico, retenção, estatísticas e catálogo**
- **Histórico:**
  - sem preferência ligada, recusa;
  - ligado, o upsert só atualiza `viewed_at`;
  - desligar apaga tudo na mesma transação;
  - `run_retention()` apaga o que tem mais de 90 dias.
- **Estatísticas:**
  - contam visitantes distintos por dia e ignoram o próprio chef;
  - consumidor recebe `forbidden`; anon não executa.
- **Catálogo:**
  - **como anon, como herói dono de rascunho e agendada, e como admin**, nenhum item está fora do ar;
  - "cabotiá" como anon não encontra nada; como premium com a etapa, encontra g8;
  - o nome do chef encontra as receitas dele;
  - `p_max_minutes=15` traz g3 e g9;
  - `p_exclude_allergens={egg}` traz só as declaradas sem ovo (g5);
  - o cursor não repete itens entre páginas.

**S32 · Exclusão de conta com dados de receitas**
- Um herói com versões e mídia, um comentarista com avaliação, lista e histórico, e um admin que validou nutrição chamam `delete_my_account`.
- As três contas somem.
- `created_by`, `moderated_by` e `validated_by_user` ficam nulos, e as versões continuam existindo.
- Delete direto em `auth.users` (su) de um herói com versão também funciona (caminho do painel).

---

## 4. Fases 2 a 6

**Princípios de todas as fases:**
- regras puras em `src/lib/recipes/*.ts`, sem diretiva; nada exportado de arquivo `"use client"`;
- actions com `creatorActionContext()`, `failFrom()` e `revalidateContent()`, devolvendo o código (`recipes.errors.*`);
- mensagens em `messages/<loc>/recipes.json`, com `messages:check` verde nos 3 idiomas;
- toda página trata carregamento (`Skeleton`), vazio (`EmptyState`) e erro (`ErrorState`);
- alvo de toque de pelo menos 44 px (48 na cozinha), foco visível, axe passando e layout em 360 px;
- **privacidade:** cada fase que passa a coletar algo atualiza `legal.json` (3 idiomas), `docs/privacy-and-retention.md` e `LAST_UPDATED`, e o E2E de privacidade (`journeys.spec.ts`) procura o item novo.

### 4.1 Fase 2 — Portal do Chef e renderizador da receita

**Rotas** (sob `src/app/creator/recipes/`):
- `page.tsx`: **Minhas Receitas**.
- `new/page.tsx`: o passo 1. Cria o rascunho (`type='recipe'`, `pillar='gastronomy'`, `cover_url` com o placeholder do pilar) mais `recipe_save`.
- `[id]/edit/page.tsx?step=basicos|ingredientes|preparo|midia|complementos|revisao`.
- `[id]/preview/page.tsx`: usa o mesmo `RecipeView` da página pública, com acesso de dono e a faixa "Pré-visualização".
- `[id]/versions/page.tsx`: data, motivo, autor e "seções alteradas" de cada versão, mais "Restaurar no rascunho". Sem comparação lado a lado.

**Renderizador (entra nesta fase):**
- `RecipeView`, componente de servidor, lê as tabelas e mostra:
  - galeria (capa e miniaturas, carrossel com teclado), título, descrição e história;
  - assinatura e chips de tempo, rendimento, porções e dificuldade;
  - ingredientes com observação, "(opcional)" e substituições;
  - etapas com duração, temperatura, foto e dica;
  - alérgenos declarados ou "não informados", e nutrição com origem (só se validada);
  - vídeo (`VideoPlayer`, inclusive Stream para `type='recipe'`).
- É usado pela prévia e por `/content/[slug]`, para toda receita com `recipe_details`.
- `body-summary.ts`, os cards e o checklist do editor passam a ler as tabelas.
- O ramo que lê o corpo v1 continua só como reserva, e **a remoção dele é item obrigatório da fase 3**.
- O E2E confere g1 e g9 lado a lado com o texto do seed: "Batata-doce · 1 · média" e "(opcional)".

**Ajustes no portal existente:**
- `PORTAL_LINKS.creator` ganha `recipes` (`ChefHat`); `/creator/post/new` continua sendo o primeiro link.
- `/creator/content` lista as receitas com link para o editor novo, e o editor antigo de receita redireciona.
- `/creator/profile` ganha especialidades (`ChipInput`, até 6) e credenciais, com o aviso "aparecem no perfil depois da aprovação" (P7).

**Minhas Receitas:**
- Filtros em `<form method="get">` com Zod `.catch`:
  - `q`, `cat`, `diff`;
  - `status`: `draft | in_review | returned | scheduled | published | archived`;
  - `from`/`to`.
- `DataTable` no desktop e cards no celular, até 200.
- Indicadores de `creator_recipe_stats(30)`: visitantes (aproximado), favoritos e nota, com "—" quando não há dado suficiente.
- Ações: editar, visualizar, duplicar, arquivar ou restaurar, excluir (só rascunho nunca publicado, com `ConfirmActionDialog`) e versões.
- `StatusBadge` ganha `scheduled`.

**Editor em 6 etapas** (`RecipeWizard`, no modelo do `RecipeOnboardingWizard`: passos em `RECIPE_EDITOR_STEPS`, `h2` focado a cada troca, progresso em `aria-live`, navegação por `?step=`):

| Etapa | Campos |
|---|---|
| 1. Básicas | título, descrição, história, categoria (até 3), rendimento, porções, dificuldade, preparo, cozimento, descanso, total (calculado; editável para mais) |
| 2. Ingredientes | nome, quantidade ("1/2" e "1,5" pelo `parseQuantity`), unidade, "a gosto", opcional, observação, substituições (até 5) |
| 3. Preparo | instrução, duração (min:s), temperatura °C, dica, foto da etapa, "ingredientes desta etapa" |
| 4. Fotos e vídeos | galeria (até 12) com capa, alt obrigatório, legenda e reordenação; vídeo por link YouTube/Vimeo ou envio pelo Stream (até 180 s, reaproveitando `tus` e `stream_uploads`) |
| 5. Complementares | etiquetas, alérgenos (com "Nenhum alérgeno" explícito), notas de alérgeno, dietas, nutrição (números, origem e nota; a validação aparece como estado) e licença |
| 6. Revisão | prévia compacta, checklist (`recipeChecklist()`, com os mesmos códigos de `recipe_assert_publishable`), situação e botão conforme a regra do tipo |

**Botão da etapa 6:**
- revisão desligada (padrão): "Publicar agora" ou "Agendar";
- revisão ligada: "Enviar para revisão", com data sugerida opcional.

**Reordenação:** botões ↑/↓ com `aria-label` e anúncio em `aria-live`. Sem arrastar e soltar.

**Rascunho que não se perde:**
- cópia em `localStorage` (`uh-recipe-draft:<id>`, debounce de 1 s, com `try/catch`);
- gravação no servidor ao trocar de etapa, em "Salvar rascunho" e a cada 30 s quando há mudança;
- "Recuperar | Descartar" quando a cópia local é mais nova;
- `stale_draft` abre um diálogo para recarregar ou sobrescrever;
- o erro do Zod foca o primeiro campo e mostra um resumo com links; os dados nunca se perdem; o salvamento parcial aceita receita incompleta.

**Upload de fotos** (`RecipeImageUploader`):
1. `<input type=file accept="image/*">`.
2. `createImageBitmap`, até 2048 px, WebP ou JPEG com qualidade 0,82 (remove EXIF e localização).
3. Recusa acima de 5 MB.
4. Envia com `supabase.storage.from('recipe-media').upload(path, blob, {upsert:false, contentType})`.
5. A action `registerRecipeMedia` confere os bytes mágicos (se não baterem, apaga o objeto e devolve `invalid_image`) e chama a RPC, que lê tipo e tamanho do Storage.
- Progresso visível e a caixa obrigatória "Tenho direito de uso desta imagem".
- As mensagens de `upload_quota_exceeded` e `demo_upload_forbidden` aparecem traduzidas.

**Server actions** (`src/app/creator/recipes/actions.ts`):
- `saveRecipe`, `createRecipeDraft`, `registerRecipeMedia`, `deleteRecipeMedia`;
- `submitRecipe`, `withdrawRecipe`, `publishRecipe` (com data opcional), `unpublishRecipe`;
- `archiveRecipe`, `restoreRecipe`, `duplicateRecipe` (`uniqueSlug`, 3 tentativas), `deleteRecipeDraft` (remove os objetos);
- `restoreRecipeVersion`; `setDraftSlug` reaproveitado.

**Admin:**
- `/admin/content/[id]` de uma receita mostra o resumo estruturado, as versões, a data sugerida pré-preenchida e o botão "Validar nutrição".
- A edição pelo admin usa o `RecipeWizard` em modo admin.
- `/admin/content/settings` ganha "Exigir revisão" por tipo e "Categorias de receita".
- `/admin/settings` ganha as 3 chaves.
- A fila de credenciais do herói entra em `/admin/heroes` (P7).

**Privacidade (fase 2):** fotos e vídeos de receita enviados pelo chef (Supabase Storage e Cloudflare Stream), quem vê cada um e por quanto tempo.

**Testes da fase 2:**
- **Unitários:**
  - `quantity.test.ts`: as 41 linhas, ida e volta "formatado + nota = original", frações;
  - `recipe-payload`, `recipe-checklist` e `recipe-draft-recovery`;
  - `recipe-actions`: `stale_draft`, os dois modos de revisão, bytes mágicos e limpeza do Storage;
  - `recipe-view`: renderização de g1 a partir de fixture das tabelas.
- **RLS:** S25–S28 e S32.
- **E2E** (conta demo do herói conforme a P3, mobile e desktop):
  - Minhas Receitas com filtros e axe;
  - criar e preencher as 6 etapas (2 ingredientes, reordenar, 2 etapas, foto de fixture, alt, "Nenhum alérgeno");
  - recarregar e conferir; perder a rede e ver "Recuperar";
  - checklist verde e o botão certo para o modo atual;
  - prévia com o `RecipeView`;
  - **excluir o rascunho** no fim.
  - Publicar de verdade segue a P4.

### 4.2 Fase 3 — Catálogo, página da receita e perfil do chef

**Explorar, aba Receitas:**
- `EXPLORE_TABS` ganha `receitas`. Os parâmetros são lidos só nessa aba (`parseRecipeCatalogParams`):
  - `q`, `cat`, `tempo` (`15|30|60`), `dif`;
  - `dieta` (múltiplo) e `sem` (alérgenos), **só quando a pessoa marca**;
  - `ordem` (`relevance|recent|quick`).
- A aba Conteúdos continua só com a busca.
- **Filtros:** `Sheet` com `Chip` (`aria-pressed`) no celular e barra no desktop; chips removíveis e "Limpar tudo"; o `<form method="get">` funciona sem JS. Os filtros de dieta e alérgeno trazem o rótulo "declarado pelo chef".
- **Cards** (`RecipeCard`, servidor):
  - foto 4:5, título, avatar e nome do chef, tempo total, porções e cadeado premium;
  - **nenhum selo de adequação**;
  - grade de 2, 3 e 4 colunas.
- **Paginação:** `TileGrid` com o renderizador e `loadMoreRecipes` (24 por página, por cursor).
- **Estados:** `SkeletonCard` ×8; vazio com "Limpar filtros"; erro com `ErrorState`.
- Faixa da etapa para quem não a fez.

**Página da receita (`/content/[slug]`, sobre o `RecipeView` da fase 2):**
- Ações: Salvar, Listas, Compartilhar, Imprimir e Modo Cozinha (fase 4); "Adicionar à lista de compras" vem na fase 5.
- **Ajuste de porções** (`ServingsScaler`, de 1 a 50, `aria-live`):
  - recalcula só os itens com `quantity`;
  - arredonda massa e volume com 2 algarismos significativos acima de 10 (g e ml para múltiplos de 5), `cup`/`tbsp`/`tsp` para o quarto mais próximo e contagem para 0,5 com "≈";
  - texto e "a gosto" mostram "não ajustado automaticamente";
  - o fator vai na URL (`?porcoes=4`).
- **Checklist de ingredientes:** caixas nativas, estado em `localStorage` por 24 h e "Limpar marcações".
- **Alérgenos:** os rótulos declarados mais as notas, ou "Alérgenos não informados pelo chef". O `AllergyReminder` cruza só os declarados ("Esta receita declara ovo, que você marcou"), sem aviso de dieta.
- **Avaliação:** estrelas em radiogroup, oferecidas só a quem concluiu a receita; a média aparece com 3 ou mais avaliações.
- **Relacionadas:** "Mais de {chef}" e "Parecidas" (mesma categoria, via `recipe_catalog`).
- **Compartilhar:** `navigator.share` ou cópia do link. **Imprimir:** `@media print` com ingredientes escalados e `break-inside: avoid`.
- **SEO:**
  - `alternates.canonical`, `metadataBase`, `openGraph` com a capa e `twitter: summary_large_image`;
  - `robots.ts` com `disallow` para `/creator`, `/admin`, `/profile` e `/*/cozinha`;
  - **sitemap e JSON-LD `Recipe`** (`buildRecipeJsonLd`, com escape de `<` e sem ingredientes e instruções para quem não tem acesso) ficam atrás da variável `RECIPES_SEO_INDEX`, desligada até a P6. Quando o herói é `is_fictional`, `author` é a Organization "Ultra Hero".
- **Sanitização:** só texto puro pelo React; o Zod remove caracteres de controle; vídeo só por `extractYouTubeId`/Vimeo/Stream.
- **Remoção** do ramo do corpo v1 em `RecipeBody` e nos leitores (obrigatória).

**Perfil público do chef (`/personalities/[slug]`):**
- `HeroBio` mostra as especialidades e, se aprovadas, "Credenciais informadas pelo herói: …".
- A biblioteca `receitas` mostra as receitas assinadas e depois "Indicadas por {herói}".
- **Busca e filtros só aparecem quando o herói tem receitas próprias.**
- Bloqueio conforme a seção 2.2.

**Privacidade (fase 3):** avaliações por estrelas (guardadas enquanto a conta existir; apagadas na exclusão).

**Testes da fase 3:**
- **Unitários:** `recipe-catalog-params`, `scale`, `recipe-jsonld` (ISO 8601, dietas, escape, Organization para herói fictício, sem ingredientes) e `allergy-match` (só declarados).
- **RLS:** S26, S29 e S31.
- **E2E:**
  - visitante: aba Receitas, "até 15 min" (g3, g9), busca pelo nome da Helena, página com bloqueio no corpo, "Alérgenos não informados" em g1, sem selo nos cards, axe;
  - `premium` com a etapa: busca "cabotiá" (g8);
  - `free` com a etapa: porções de 2 para 4 ("300 g" vira "600 g"; "3 colheres" não ajusta), checklist persiste, imprimir (stub) e compartilhar (fallback);
  - perfil da Helena com especialidades e filtros; perfil de um herói sem receitas próprias sem barra de filtros.

### 4.3 Fase 4 — Modo Cozinha, Coleção e histórico

**Modo Cozinha** (`/content/[slug]/cozinha`, grupo `(focus)` sem a barra inferior; alternativa `/cozinha/[slug]`):
- Sem login vai para `/login?next=`; sem acesso, volta à receita; `noindex`.
- Uma etapa por vez: instrução de pelo menos 24 px, "Etapa 3 de 8" em `aria-live` e os ingredientes da etapa com o fator da URL.
- Anterior e Próxima com 56 px, setas do teclado, deslizar opcional e `prefers-reduced-motion`.
- **Cronômetro** quando a etapa tem duração: horário-alvo (`Date.now()+ms`), anúncio `assertive`, vibração e som que dá para desligar.
- **Wake Lock** renovado no `visibilitychange`; sem suporte, aviso.
- Etapas marcadas em `localStorage` por 24 h. "Concluir receita" usa a conclusão existente (que também libera a avaliação).

**Coleção (`/profile/receitas`):**
- Abas Salvas, Listas e Vistas recentemente, com remover.
- **Histórico:** `Switch` "Guardar o que vejo (90 dias)", desligado por padrão.
  - Desligar pede confirmação ("Isto apaga o histórico") e o gatilho apaga na mesma transação.
  - Há "Limpar histórico".
  - A página da receita grava só `viewed_at`, pelo servidor e só se estiver ligado.
- Atalho no Perfil.

**Privacidade (fase 4):** histórico opcional, último acesso por receita, 90 dias.

**Testes da fase 4:**
- **Unitários:** `cook-mode`, `wake-lock` e `history-actions`.
- **RLS:** S31.
- **E2E** (`premium`, mobile):
  - cozinha: avançar e voltar, cronômetro (relógio do Playwright), marcação persiste, "Ver receita completa";
  - Coleção: favoritar e remover;
  - histórico: ligar, ver, desligar com confirmação, vazio;
  - axe e 48 px.

### 4.4 Fase 5 — Lista de compras e comércio

**"Adicionar à lista de compras"** na página da receita:
- `Sheet` com os ingredientes; "a gosto" vem desmarcado; as quantidades já vêm com o fator de porções.
- `addRecipeToShoppingList` faz upsert por (`user_id`, `ingredient_id`): **adicionar a mesma receita de novo atualiza**, e itens de receitas diferentes **nunca se fundem**.

**`/profile/lista-de-compras`:**
- Itens **agrupados por receita**, com marcar comprado, editar quantidade, remover e "Limpar comprados". Quando o mesmo produto aparece em outra receita, o item mostra "também em {receita}".
- **Em cada grupo, "Kit ou produto desta receita"**, a partir de `content_product_links` validados (reúso direto; hoje g1→m1 … g9→k3):
  1. disponível, com `commerce.enabled`: "Adicionar ao carrinho de teste" (`QuickAddToCart`), com a nota "A embalagem pode não corresponder à quantidade da receita";
  2. indisponível: selo "Indisponível no momento" (não esconde);
  3. sem produto: "Sem produto correspondente";
  4. comércio desligado: faixa "Compras de teste desligadas", sem botões.
- Item com produto avulso validado (`recipe_ingredient_products`) segue os mesmos 4 estados. Hoje nenhum ingrediente tem produto, então todos aparecem "Sem produto correspondente".
- `addToCart` passa a receber `source`, e a lista usa `content_link`.
- Sem conversão de unidades e sem cobrança.

**Vínculo ingrediente↔produto (entra aqui):**
- na etapa 2 do editor, "Produto correspondente" (busca e sugestão, com o status ao lado);
- `/admin/links` ganha a aba "Ingredientes" (fila).

**`RelatedProducts` nas receitas** passa a mostrar o produto indisponível marcado, em vez de escondê-lo.

**Privacidade (fase 5):** lista de compras pessoal, guardada até a pessoa remover ou excluir a conta.

**Testes da fase 5:**
- **Unitários:** `shopping-upsert` (sem fusão entre receitas), `shopping-item-state` (4 estados) e `addRecipeToShoppingList` (`forbidden`).
- **RLS:** S30.
- **E2E** (`premium`):
  - adicionar g3: o grupo mostra o kit da receita com "Adicionar ao carrinho de teste"; adicionar e ver no `/cart`;
  - os ingredientes aparecem "Sem produto correspondente";
  - adicionar g3 de novo não duplica;
  - um produto indisponível aparece marcado (fixture de unitário, se não houver um em produção);
  - limpar lista e carrinho no fim.

### 4.5 Fase 6 — Jornadas completas e documentação

`tests/e2e/recipes-journeys.spec.ts`, com o helper `loginAs(kind)` compartilhado:

| Critério | Jornada |
|---|---|
| Chef cria e salva; ingredientes, etapas e mídia | Criar, salvar, recarregar e conferir |
| Revisada e publicada | Conforme a P4, **obrigatória**: (a) publicação efêmera em produção ou (b) branch do Supabase. Os dois modos de revisão são exercitados |
| Encontrada no catálogo | Pela conta `free` com a etapa, buscando o título da receita publicada no teste |
| Assinatura e perfil do chef | A assinatura leva ao perfil |
| Preparo no celular | Modo Cozinha no projeto mobile |
| Persistência | Favoritar, recarregar, sair e entrar |
| Permissões | Editar a receita de outro chef dá 404; consumidor em `/creator` vai para login ou fica proibido; visitante não vê ingredientes |
| Comércio | Kit marcado conforme o estado; comércio desligado por unitário |

**Documentação:**
- `docs/architecture.md`: regra de revisão por tipo e modelo de receitas;
- `docs/testing.md` e `README.md`: contagens;
- `docs/launch-checklist.md`: Storage, bucket, cron de órfãos e a variável `RECIPES_SEO_INDEX`;
- `docs/relatorio-final.md`: aplicação das 0027–0029 e conferência objeto a objeto.

A privacidade já foi atualizada fase a fase; aqui se faz só uma revisão final.

**Aplicação no remoto** (cada fase vai a produção testada). Roteiro da fase 1, nesta ordem; quem executa é o responsável:

0. **Somente leitura**, antes de tudo:
   - `select version();`
   - `select rolbypassrls from pg_roles where rolname = 'postgres';` deve dar `true` (senão `recipe_media_quota_ok` falha aberta e `recipe_register_media` dá `object_not_found`);
   - `select to_regclass('public.recipe_details');` deve ser nulo;
   - `select count(*) from public.content_type_settings;` deve dar 5;
   - inventário: `select c.id, c.slug, c.status, b.content_id is not null as tem_corpo from public.content c left join public.content_bodies b on b.content_id = c.id where c.type = 'recipe';`
   - `select count(*) from public.content_localizations where status = 'published';`
   - guardar `select md5(string_agg(b.body::text, '|' order by b.content_id)) from public.content_bodies b join public.content c on c.id = b.content_id where c.type = 'recipe';`
1. **Deploy do app ANTES de qualquer migração.** Merge e push na master; deploy na Vercel. O app novo funciona com o banco antigo (fallback `PGRST202`, editores de receita só leitura). O contrário não: a 0027 revoga o `select` de tabela em `content_localizations` (fica só `content_id, locale, title, summary, status, updated_at`), e o app antigo, que lê `body` na página de conteúdo e no `/admin/translations`, passaria a receber `permission denied`. Conferir uma receita e o `/admin/translations` em produção.
2. Confirmar o backup do dia (PITR ou diário).
3. **0027** numa transação: `node scripts/db/remote-apply.mjs --only 0027`. Conferir as 10 categorias, `review_required` falso em todos os tipos e `get_advisors` (inclusive `unindexed_foreign_keys`).
4. **0028** numa transação: `node scripts/db/remote-apply.mjs --only 0028`. Conferir o bucket `recipe-media` privado com 5 MB e as 3 políticas em `select policyname, cmd from pg_policies where schemaname = 'storage'`.
5. **0029 sem o remote-apply** (o arquivo tem `-- remote-apply: manual` e o script o recusa):
   1. tudo antes de `BLOCO FINAL (execução)` (as funções) numa transação;
   2. `select * from public.recipe_backfill_dry_run();` deve dar 41 ingredientes e 28 etapas `literal` e 8 linhas `recipe` com `seed`; qualquer `outside_seed`, `no_body`, `text` ou `text_only` para aqui e volta ao responsável;
   3. o bloco final numa transação; em seguida conferir: nenhuma receita sem `recipe_details`; 41 ingredientes, 28 etapas e 8 `restore_point`; nenhuma linha `recipe.backfill_failed` em `admin_audit` (o `WARNING` não volta pela Management API); md5 dos corpos igual ao do passo 0;
   4. registrar `0029_recipes_backfill` em `supabase_migrations.schema_migrations`.
6. Regenerar `database.types.ts` e rodar o E2E contra produção.

Reversão de emergência da 0027 (só o que quebra o app antigo): `grant select on public.content_localizations to anon, authenticated;` e recriar `can_access_content` como na 0017.

---

## 5. Riscos, custos, o que fica fora e perguntas

### 5.1 Riscos

| Risco | Mitigação |
|---|---|
| O bloqueio no banco afeta progresso, conclusão e o S3 | Ajuste do S3 previsto; as RPCs já respondem `content_forbidden` |
| `can_access_content` por linha nas tabelas filhas | Volumes pequenos; o catálogo não depende dela, salvo nos termos de ingrediente, que só são lidos com busca |
| Cache do proxy até cerca de 5 min depois de despublicar | Documentado; purga por etiqueta pode vir depois |
| Cota do otimizador de imagem do Vercel | `sizes` fixos e fotos já reduzidas; se estourar, `unoptimized` para `/media/recipe/*` |
| E2E contra produção compartilhada | Rascunhos e fotos excluídos no fim; publicação conforme a P4; cookie `uh-e2e` fora das estatísticas |
| Contas demo abertas × upload | Cota por herói, mais a P3 antes da fase 2 |
| Shim de `storage` diverge do real | S27 mais teste manual no remoto: envio, metadados, prévia, publicação, anon e despublicação |
| Gatilho de publicável quebra caminhos existentes de publicação de receita | Coberto no S28; cenários antigos ajustados; as 8 receitas no ar não são afetadas até serem republicadas |
| `public_settings`, `run_retention`, `anonymize_user_data` e `stream_cleanup_*` são redefinidas | Cópia integral do corpo atual mais o acréscimo; S11, S14, S23, S24 e S32 rodam |
| Backfill sobre dados reais | `restore_point` antes de escrever, bloco por receita, dry-run no remoto |

### 5.2 Custos (Storage)

O projeto está no **plano Pro** do Supabase. Referência a conferir na página de preços: cerca de 100 GB de armazenamento e 250 GB de tráfego incluídos; acima disso, cerca de US$ 0,021 por GB por mês e US$ 0,09 por GB de tráfego.

**Estimativa:**
- uma foto de 2048 px em WebP tem 300–500 KB, e uma receita cheia (30 imagens) fica em cerca de 12 MB;
- 500 receitas ocupam cerca de 6 GB;
- o tráfego sai do Supabase uma vez e fica no cache do Vercel;
- o transformador de imagens do Supabase não é usado.

O custo marginal é próximo de zero. A cota diária por herói, o limite de 30 mídias e `recipes.uploads_enabled` seguram abusos.

### 5.3 Fica fora desta entrega

- Edição paralela de receita publicada.
- "Chef confiável" com exceção à revisão.
- Comentários ligados: modelados e testados, sem tela até serem ligados.
- Tradução do corpo estruturado.
- Conversão de unidades e embalagens.
- Cobrança.
- Arrastar e soltar.
- Tela do admin para `creator_recipe_links`.
- Duplicar com fotos.
- Purga de cache.
- Seções de ingredientes e etapas; receita usada como ingrediente; nível de fogo.
- Ordenação por nota.
- Comparação lado a lado de versões.
- Catálogo personalizado com dados de saúde (exige novo consentimento).
- Busca por ingrediente para quem não tem acesso.

### 5.4 Perguntas que exigem decisão do responsável

1. **P1 — Revisão de receitas** (o padrão vai desligado, como hoje; responder antes da fase 2).
   - **Ligar:** o admin olha alérgenos, nutrição e as fotos enviadas antes de irem ao ar.
   - **Contra:** com a regra da seção 2.3, cada correção tira a receita do catálogo, dos favoritos e da Coleção até a aprovação; a conta demo do herói deixa de demonstrar "Publicar" sozinha; o vídeo do Stream já vai ao ar sem revisão.
   - **Recomendação:** manter **desligada** enquanto os chefs forem heróis da casa, e ligar pelo admin (auditado, sem deploy) quando entrar chef externo.
2. **P2 — Cards de receita visíveis antes da etapa.** Abrir a receita exige a etapa, e isso agora é garantido pelo banco. A biblioteca do herói deixa de esconder a lista e passa a bloquear só ao abrir, o que muda um comportamento aprovado. **Recomendação: sim** (já acontece no feed e no Explorar, e é o que permite o perfil público do chef).
3. **P3 — Contas demo × upload** (responder antes da fase 2).
   - (a) bloquear upload e registro de contas demo no banco (`app_metadata.ultra_hero_demo`); o E2E de upload passa a usar uma conta de teste não demo;
   - (b) demo envia só em rascunho, e o proxy nunca serve publicamente mídia de demo;
   - (c) exigir `DEMO_ACCESS_CODE` (já existe no env, sem uso) para as contas demo de admin e herói.

   **Recomendação: (c)**, com a cota diária. Também fecha o acesso de admin com um toque, que hoje vale para o app inteiro. O E2E lê o código do env. Se o responsável quiser o herói demo aberto, (a).
4. **P4 — Prova de "revisada e publicada" no E2E** (obrigatória na fase 6).
   - (a) publicação efêmera em produção: título "[E2E] …", acesso free, busca pela conta `free` e exclusão no `afterAll` e no início do teste (sobras) pela service role do `.env.local`;
   - (b) branch do Supabase (plano Pro) com as migrações e o seed.

   **Recomendação: (a)**, porque testa o ambiente real, custa zero e fica exposta por segundos. (b) se o responsável não aceitar conteúdo de teste no ar.
5. **P5 — Dados do backfill** (responder antes da fase 1). O backfill copia sem corrigir.
   - **Tempos incoerentes:** g4 (5 + 45 contra 40) e g2 (15 + 20 contra 30); g5, g6 e g8 têm 15/20 de template. **Recomendação:** corrigir depois pelo editor, com o responsável dizendo os valores certos; a migração não altera dado publicado.
   - **Categorias:** a lista de 10 e a classificação (g1, g4, g5 e g8 em almoço; g2 e g9 em café da manhã; g3 em molhos e bases; g6 em sopas; as 8 também em marmitas quando têm a etiqueta). **Recomendação:** aprovar como está; o admin ajusta depois em `/admin/content/settings`.
6. **P6 — Indexação de receitas de heróis fictícios.** Sitemap e JSON-LD `Recipe` promovem nos buscadores receitas com "quantidades ilustrativas" de heróis fictícios. **Recomendação:** manter desligado (`RECIPES_SEO_INDEX`) enquanto os chefs forem fictícios, com canonical, Open Graph e robots ligados, e ligar quando houver chef real, com `author` Organization para quem for fictício.
7. **P7 — Credenciais do chef** (a especificação pede "credenciais informadas"). **Recomendação:** o herói informa, mas o texto só aparece no perfil público depois da aprovação do admin (moderação, não verificação), com o rótulo "Credenciais informadas pelo herói". Alternativa: deixar credenciais só para o admin editar.

---

## 6. Críticas não acatadas (ou acatadas de outra forma)

| Crítica | Decisão e motivo |
|---|---|
| Seg., "tipo após criação": recriar `trg_a_content_guard` sem `type` | Adotada a **alternativa** que o próprio crítico deu: um gatilho que trava só quando receita está envolvida (`type_locked`). Recriar o guarda mudaria os outros tipos (artigo↔guia), fora do escopo. |
| Seg., "filtros pré-marcados na URL": aplicá-los no servidor com `?minhas=1` | **Superada.** Pela crítica bloqueante de produto, o catálogo não usa mais os dados da etapa, então não há o que pré-marcar. Só os filtros marcados à mão vão para a URL, e o evento registra nomes, não valores. |
| Seg., "revisão falha aberta": leitura defensiva do JSON com `jsonb_typeof` | **Superada.** A regra saiu de `app_settings` e virou `boolean not null` em `content_type_settings`, então não há valor malformado. A falha fechada continua para a linha ausente (`coalesce(…, true)`), e a sobrecarga de 1 parâmetro e o checklist na aprovação foram acatados. |
| Seg., "termos públicos": função definer `recipe_ingredient_match` | Não adotada. A tabela `recipe_extras` com RLS A(c) resolve sem uma função definer nova exposta a authenticated, e é a primeira opção do próprio crítico. |
| Produto, "extras": tirar a comparação de versões | **Parcial.** A comparação lado a lado saiu, mas cada versão guarda `changed_sections` (a lista de seções que mudaram), porque a especificação (1.3) pede "Histórico de versões **e alterações**". O custo é um cálculo no snapshot. |
| Seg., "estatísticas": índice parcial em `analytics_events` | Adiado, como o próprio crítico condiciona ("se o volume crescer"). Fica registrado na seção 3.6. |
| Produto, "corpo v1": manter a geração por segurança até a fase 3 | Indo além do pedido, o corpo v1 **nunca é gerado**: o antigo fica intacto até a primeira gravação estruturada, e depois vira um marcador. Isso também resolve o `restore_point` e a mudança de texto visível na fase 1. |
