# Privacidade, retenção e LGPD — POC Ultra Hero

> Documento operacional da POC. **Não é parecer jurídico** nem certificação de conformidade. Antes da abertura pública, revisar com responsável jurídico/DPO.

## O que é coletado

| Dado | Onde | Finalidade | Base (a confirmar juridicamente) |
|---|---|---|---|
| E-mail, nome exibido, avatar (placeholder), idioma, tema, fuso | `auth.users`, `profiles` | conta, personalização | execução do serviço |
| Interesses, favoritos, listas, progresso, conclusões, streak | tabelas de biblioteca/progresso | experiência do produto | execução do serviço |
| Assinatura simulada (módulos, períodos) | `simulated_subscriptions*` | demonstração de planos | execução do serviço |
| Pedidos de teste (itens, destino **fictício**, remessas) | `test_orders*` | demonstração de comércio | execução do serviço |
| Eventos de uso (sem PII), feedback opcional | `analytics_events`, `feedback` | métricas do experimento | legítimo interesse (a confirmar) |
| Ações administrativas | `admin_audit` | segurança e responsabilização | legítimo interesse / obrigação |
| Etapa de receitas (aceite, restrições e alergias de lista fixa) | `recipe_onboarding` | lembrar a pessoa na página de cada receita; desde a 0027 também libera a receita no banco (`can_access_content`) | consentimento (dado sensível de saúde; a confirmar) |
| Vídeos gravados ou enviados por heróis | arquivo no **Cloudflare Stream**; no banco só o uid, o conteúdo, as datas de envio/descarte (`stream_uploads`) | publicar vídeos curtos dos heróis (posts e, desde a fase 2 de receitas, o vídeo opcional da receita); limitar envios e limpar vídeos abandonados | execução do serviço (herói) |
| Fotos de receitas enviadas por heróis (fase 2) | bucket privado `recipe-media` no **Supabase Storage** (`<herói>/<receita>/<uuid>.<webp, jpg ou png>`), reduzidas no aparelho a 2048 px sem EXIF/localização; no banco tipo e tamanho lidos do Storage, texto alternativo, legenda, quem enviou e a data da confirmação de direito de uso (`recipe_media`) | galeria, capa e fotos de etapa das receitas; servidas só pelo proxy `/media/recipe/[id]`, que decide a cada pedido pela RLS: galeria de receita no ar para todos, foto de etapa só com acesso à receita, rascunho só para o herói dono e o admin | execução do serviço (herói) |

Modelado na 0027 e **ainda sem tela** (cada fase do módulo de receitas atualiza esta tabela e `legal.json` quando passar a coletar): avaliações por estrelas, comentários (desligados), lista de compras, histórico opcional de receitas vistas (90 dias) e indicadores agregados para o herói.

**Não coletamos**: endereço real, geolocalização, dados de pagamento, dados de saúde individuais. Conteúdo é educativo, sem prescrição.

## Retenção aprovada

| Conjunto | Prazo | Mecanismo |
|---|---|---|
| Analytics individuais | 90 dias | `analytics_events.expires_at` + `run_retention()` |
| Pedidos de teste vinculados ao usuário | 90 dias | `test_orders.retention_expires_at` → anonimização (`user_id` nulo, nome do destino removido) |
| Logs técnicos / execuções de recomendação | 30 dias | `recommendation_runs` + política dos provedores (Vercel/Supabase) |
| Auditoria administrativa | 365 dias | `admin_audit` |
| Vídeos de heróis (Cloudflare Stream) | enquanto o conteúdo existir; rascunho descartado, trocado ou abandonado (envio vencido sem ir ao ar) é apagado | cron diário (`stream_cleanup_candidates`/`stream_cleanup_discard`, API do Stream); receita nunca é apagada pela limpeza, só perde o vídeo |
| Fotos de receitas (Supabase Storage) | enquanto a foto fizer parte da receita; foto removida no editor ou de rascunho excluído sai na hora | `recipe_delete_media`/`creator_delete_recipe_draft` devolvem os caminhos e a action apaga pela API do Storage; o que sobrar (exclusão que falhou, envio nunca registrado) sai pelo cron diário depois de 24 h (`recipe_orphan_media` + API do Storage, nunca `delete` por SQL) |
| Histórico de receitas vistas (opcional, quando a tela existir) | 90 dias | `recipe_view_history` + `run_retention()`; desligar apaga tudo na hora; a data do acesso e a do consentimento (`history_enabled_at`) são sempre do relógio do banco, o cliente não as define |
| Backups | conforme plano Supabase (verificar e documentar antes da abertura) | provedor |

Exceções (evidência legal/incidente): `retention_exceptions` com escopo, justificativa, responsável, data de revisão e encerramento. Enquanto aberta, o registro não é anonimizado nem excluído. Nunca retenção indefinida genérica.

## Direitos do titular na POC

- **Exclusão self-service** (`/profile/account` → `delete_my_account`): anonimiza perfil, remove interesses/listas/progresso/carrinho, desvincula analytics/feedback/pedidos e apaga a conta. Bloqueada se houver exceção de retenção ativa (informado ao usuário). Desde a 0027 também apaga avaliações, comentários, lista de compras, histórico e preferência de receitas, zera as autorias que ficam (versões, fotos, moderação, validação de nutrição e de vínculo, `created_by` de conteúdo e de produto) e desvincula o perfil de herói (o conteúdo assinado fica). O herói que criou conteúdo pelo app ou duplicou receita também consegue excluir a conta (cenário S32). A exclusão direta pelo painel do Auth também funciona (cenário S32).
- **Transparência**: página de conta resume dados, prazos e natureza demonstrativa.
- Portabilidade/correção: edição de perfil; exportação formal fora do escopo da POC.

## Compartilhamento com terceiros

- Supabase (banco/auth e, desde a fase 2 de receitas, o Storage das fotos de receita) e Vercel (hospedagem): operadores. 
- Cloudflare (Stream): operador dos vídeos gravados ou enviados pelos heróis (upload direto do aparelho, processamento, armazenamento e entrega; o player é carregado do Cloudflare). Não recebe nome nem e-mail: o vídeo fica ligado ao conteúdo. Citado em `legal.json` (3 idiomas) desde 22/10/2026.
- IA (OpenAI/Gemini) **só se ativada**: recebe ids opacos, tags e pilares — nunca e-mail/nome. Desligável por kill switch.
- Nenhum repasse comercial, parceiro de logística ou pagamento.

## Pendências antes da abertura pública

1. Política de privacidade e termos visíveis no cadastro (texto jurídico).
2. Confirmar bases legais e DPO/encarregado.
3. Documentar política de backup e restauração efetiva do plano contratado.
4. Revisão de alegações em conteúdos de nutrição/treino por profissionais habilitados (CRN/CREF).
