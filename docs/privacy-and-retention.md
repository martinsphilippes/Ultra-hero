# Privacidade, retenção e LGPD — POC Ultra Hero

> Documento operacional da POC. **Não é parecer jurídico** nem certificação de conformidade. Antes da abertura pública, revisar com responsável jurídico/DPO.

## O que é coletado

| Dado | Onde | Finalidade | Base (a confirmar juridicamente) |
|---|---|---|---|
| E-mail, nome exibido, avatar (ilustração ou foto enviada), idioma, tema, fuso | `auth.users`, `profiles` | conta, personalização | execução do serviço |
| Foto de perfil (opcional; 512×512 gerada no aparelho, sem EXIF/GPS) | bucket **público** `avatars` no Supabase Storage (`<user_id>/<uuid>.webp\|jpg`, não listável); URL em `profiles.avatar_url` e, se herói, `creator_profiles.avatar_url`; data/tamanho/tipo de cada envio em `avatar_uploads` (0031) | personalização; identificação pública do herói; cota de 20 envios/24 h | consentimento (a pessoa escolhe enviar; a confirmar) |
| Interesses, favoritos, listas, progresso, conclusões, streak | tabelas de biblioteca/progresso | experiência do produto | execução do serviço |
| Assinatura simulada (módulos, períodos) | `simulated_subscriptions*` | demonstração de planos | execução do serviço |
| Pedidos de teste (itens, destino **fictício**, remessas) | `test_orders*` | demonstração de comércio | execução do serviço |
| Eventos de uso (sem PII), feedback opcional | `analytics_events`, `feedback` | métricas do experimento | legítimo interesse (a confirmar) |
| Ações administrativas | `admin_audit` | segurança e responsabilização | legítimo interesse / obrigação |
| Etapa de receitas (aceite, restrições e alergias de lista fixa) | `recipe_onboarding` | lembrar a pessoa na página de cada receita; desde a 0027 também libera a receita no banco (`can_access_content`) | consentimento (dado sensível de saúde; a confirmar) |
| Vídeos gravados ou enviados por heróis | arquivo no **Cloudflare Stream**; no banco só o uid, o conteúdo, as datas de envio/descarte (`stream_uploads`) | publicar vídeos curtos dos heróis (posts e, desde a fase 2 de receitas, o vídeo opcional da receita); limitar envios e limpar vídeos abandonados | execução do serviço (herói) |
| Fotos de receitas enviadas por heróis (fase 2) | bucket privado `recipe-media` no **Supabase Storage** (`<herói>/<receita>/<uuid>.<webp, jpg ou png>`), reduzidas no aparelho a 2048 px sem EXIF/localização; no banco tipo e tamanho lidos do Storage, texto alternativo, legenda, quem enviou e a data da confirmação de direito de uso (`recipe_media`) | galeria, capa e fotos de etapa das receitas; servidas só pelo proxy `/media/recipe/[id]`, que decide a cada pedido pela RLS: galeria de receita no ar para todos, foto de etapa só com acesso à receita, rascunho só para o herói dono e o admin | execução do serviço (herói) |
| Histórico de receitas vistas (fase 4, **opcional, desligado por padrão**) | `user_recipe_prefs` (`history_enabled` e a data do consentimento `history_enabled_at`, gravada pelo banco) e `recipe_view_history` (só `content_id` e `viewed_at` do **último** acesso por receita; nada de tempo na página, rolagem ou etapa) | mostrar "Vistas recentemente" em `/profile/receitas`; a página da receita grava pelo servidor só quando a pessoa ligou; só a própria pessoa lê (RLS), o admin não | consentimento (ligar o interruptor, com o texto do que é guardado); retirar = desligar, que apaga tudo na mesma transação |
| Progresso do Modo Cozinha (fase 4) | só no aparelho: `localStorage` `uh-cook:<conta>:<receita>` (etapas marcadas, etapa atual e horários de término dos cronômetros; separado por conta para quem divide o aparelho; apagado depois de 24 h na próxima abertura do Modo Cozinha, de qualquer receita, junto com as chaves antigas sem a conta) e `uh-cook-sound` (som do alarme) | continuar de onde parou e manter o cronômetro certo com a tela bloqueada | não chega ao servidor |
| Avaliações de receitas (fase 3; 1 a 5 estrelas) | `recipe_ratings` (nota, receita, datas e `is_demo` lido do JWT); o público vê só o agregado `recipe_details.rating_count`/`rating_sum`, mostrado com 3 ou mais avaliações fora das contas demo | média da receita; só quem concluiu a receita avalia, nunca o chef da própria (política da 0027) | execução do serviço |
| Marcações do checklist de ingredientes e porções ajustadas (fase 3) | só no aparelho (`localStorage` `uh-recipe-check:<receita>`, 24 h) e na URL (`?porcoes=`); nada vai ao banco | conveniência ao cozinhar | — |
| Lista de compras (fase 5, **opcional**: só existe se a pessoa usar "Adicionar à lista de compras") | `shopping_list_items` (nome, quantidade, unidade ou texto, receita e ingrediente de origem, `checked`, posição e datas; `product_id` preenchido só pelo gatilho a partir do vínculo validado, fora do grant do cliente) | montar a lista em `/profile/lista-de-compras`, agrupada por receita, com o kit da receita (`content_product_links` validados) e o produto avulso validado do ingrediente; as quantidades vêm das tabelas da receita com as porções escolhidas, **sem conversão para embalagem**; comprar usa o carrinho de teste (`addToCart` com `source = 'content_link'`) | execução do serviço; só a própria pessoa lê e altera (RLS da 0027; **nem o admin lê**) |

Modelado na 0027 e **ainda sem tela** (cada fase do módulo de receitas atualiza esta tabela e `legal.json` quando passar a coletar): comentários (desligados) e indicadores agregados para o herói. A lista de compras ganhou tela na fase 5, o histórico opcional de receitas vistas na fase 4 e as avaliações por estrelas na fase 3 (linhas acima). O catálogo (fase 3) **não usa** as restrições e alergias da etapa: filtros de dieta e alérgeno só valem quando a pessoa os marca, e o evento `recipe.catalog_filter` leva só os nomes dos filtros; o cruzamento com as alergias marcadas acontece só na página da receita e só com os alérgenos declarados pelo chef.

**Não coletamos**: endereço real, geolocalização, dados de pagamento, dados de saúde individuais. Conteúdo é educativo, sem prescrição.

## Retenção aprovada

| Conjunto | Prazo | Mecanismo |
|---|---|---|
| Analytics individuais | 90 dias | `analytics_events.expires_at` + `run_retention()` |
| Pedidos de teste vinculados ao usuário | 90 dias | `test_orders.retention_expires_at` → anonimização (`user_id` nulo, nome do destino removido) |
| Logs técnicos / execuções de recomendação | 30 dias | `recommendation_runs` + política dos provedores (Vercel/Supabase) |
| Auditoria administrativa | 365 dias | `admin_audit` |
| Foto de perfil | até a pessoa trocar/remover ou excluir a conta | troca/remoção/exclusão apagam na hora pela server action (service role); cópias em cache (navegador, CDN, otimizador de imagens do Next) expiram em até 1 h (`cacheControl` 3600 no envio); o cron diário de retenção apaga o que sobrar: envio sem referência há mais de 1 h e foto de conta excluída, mesmo em uso no perfil público do herói (`avatar_orphan_uploads`, limpa a referência antes de apagar o objeto); o registro em `avatar_uploads` sai 2 dias depois de apagado |
| Vídeos de heróis (Cloudflare Stream) | enquanto o conteúdo existir; rascunho descartado, trocado ou abandonado (envio vencido sem ir ao ar) é apagado | cron diário (`stream_cleanup_candidates`/`stream_cleanup_discard`, API do Stream); receita nunca é apagada pela limpeza, só perde o vídeo |
| Fotos de receitas (Supabase Storage) | enquanto a foto fizer parte da receita; foto removida no editor ou de rascunho excluído sai na hora | `recipe_delete_media`/`creator_delete_recipe_draft` devolvem os caminhos e a action apaga pela API do Storage; o que sobrar (exclusão que falhou, envio nunca registrado) sai pelo cron diário depois de 24 h (`recipe_orphan_media` + API do Storage, nunca `delete` por SQL) |
| Histórico de receitas vistas (opcional; tela desde a fase 4) | 90 dias após o último acesso a cada receita | `recipe_view_history` + `run_retention()` (a tela também esconde o que passou de 90 dias, caso a rotina atrase); desligar (com confirmação) apaga tudo na hora pelo gatilho `user_recipe_prefs_after`; "Limpar histórico" e "Tirar do histórico" apagam pela RLS de dono; exclusão de conta apaga (`anonymize_user_data`); a data do acesso e a do consentimento (`history_enabled_at`) são sempre do relógio do banco, o cliente não as define |
| Avaliações de receitas | enquanto a conta existir | apagadas por `anonymize_user_data` na exclusão da conta (S32); o gatilho recalcula o agregado da receita |
| Lista de compras | até a pessoa remover (item, "Limpar comprados", "Limpar lista" com confirmação) ou excluir a conta; sem prazo automático | delete pela RLS de dono nas actions de `/profile/lista-de-compras`; exclusão de conta apaga (`anonymize_user_data`, 0027, e `on delete cascade` em `user_id`); limite de 300 itens por pessoa no gatilho `shopping_list_items_before` (`shopping_list_full`) |
| Backups | conforme plano Supabase (verificar e documentar antes da abertura) | provedor |

Exceções (evidência legal/incidente): `retention_exceptions` com escopo, justificativa, responsável, data de revisão e encerramento. Enquanto aberta, o registro não é anonimizado nem excluído. Nunca retenção indefinida genérica.

## Direitos do titular na POC

- **Exclusão self-service** (`/profile/account` → `delete_my_account`): anonimiza perfil, remove interesses/listas/progresso/carrinho, desvincula analytics/feedback/pedidos e apaga a conta. Bloqueada se houver exceção de retenção ativa (informado ao usuário). Desde a 0027 também apaga avaliações, comentários, lista de compras, histórico e preferência de receitas, zera as autorias que ficam (versões, fotos, moderação, validação de nutrição e de vínculo, `created_by` de conteúdo e de produto) e desvincula o perfil de herói (o conteúdo assinado fica). O herói que criou conteúdo pelo app ou duplicou receita também consegue excluir a conta (cenário S32). A exclusão direta pelo painel do Auth também funciona (cenário S32). A foto de perfil sai antes da exclusão (action `deleteAccount`, inclusive do perfil público do herói); se falhar, o envio fica sem dono e o cron diário apaga a foto e a referência (cenário S33).
- **Transparência**: página de conta resume dados, prazos e natureza demonstrativa.
- Portabilidade/correção: edição de perfil; exportação formal fora do escopo da POC.

## Compartilhamento com terceiros

- Supabase (banco/auth e Storage das fotos de perfil e, desde a fase 2 de receitas, das fotos de receita) e Vercel (hospedagem): operadores. A foto de perfil passa pela função da Vercel (validação de tipo e tamanho) antes de ir ao Storage. Citado em `legal.json` (3 idiomas) desde 22/10/2026.
- Cloudflare (Stream): operador dos vídeos gravados ou enviados pelos heróis (upload direto do aparelho, processamento, armazenamento e entrega; o player é carregado do Cloudflare). Não recebe nome nem e-mail: o vídeo fica ligado ao conteúdo. Citado em `legal.json` (3 idiomas) desde 22/10/2026.
- IA (OpenAI/Gemini) **só se ativada**: recebe ids opacos, tags e pilares — nunca e-mail/nome. Desligável por kill switch.
- Nenhum repasse comercial, parceiro de logística ou pagamento.

## Pendências antes da abertura pública

1. Política de privacidade e termos visíveis no cadastro (texto jurídico).
2. Confirmar bases legais e DPO/encarregado.
3. Documentar política de backup e restauração efetiva do plano contratado.
4. Revisão de alegações em conteúdos de nutrição/treino por profissionais habilitados (CRN/CREF).
