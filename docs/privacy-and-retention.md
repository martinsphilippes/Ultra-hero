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
| Vídeos gravados ou enviados por heróis | arquivo no **Cloudflare Stream**; no banco só o uid, o conteúdo, as datas de envio/descarte (`stream_uploads`) | publicar vídeos curtos dos heróis; limitar envios e limpar vídeos abandonados | execução do serviço (herói) |

Modelado na 0027 e **ainda sem tela** (cada fase do módulo de receitas atualiza esta tabela e `legal.json` quando passar a coletar): fotos de receita (bucket privado `recipe-media` no Supabase Storage), avaliações por estrelas, comentários (desligados), lista de compras, histórico opcional de receitas vistas (90 dias) e indicadores agregados para o herói.

**Não coletamos**: endereço real, geolocalização, dados de pagamento, dados de saúde individuais. Conteúdo é educativo, sem prescrição.

## Retenção aprovada

| Conjunto | Prazo | Mecanismo |
|---|---|---|
| Analytics individuais | 90 dias | `analytics_events.expires_at` + `run_retention()` |
| Pedidos de teste vinculados ao usuário | 90 dias | `test_orders.retention_expires_at` → anonimização (`user_id` nulo, nome do destino removido) |
| Logs técnicos / execuções de recomendação | 30 dias | `recommendation_runs` + política dos provedores (Vercel/Supabase) |
| Auditoria administrativa | 365 dias | `admin_audit` |
| Foto de perfil | até a pessoa trocar/remover ou excluir a conta | troca/remoção/exclusão apagam na hora pela server action (service role); o cron diário de retenção apaga o que sobrar: envio sem referência há mais de 1 h e foto de conta excluída, mesmo em uso no perfil público do herói (`avatar_orphan_uploads`, limpa a referência antes de apagar o objeto); o registro em `avatar_uploads` sai 2 dias depois de apagado |
| Vídeos de heróis (Cloudflare Stream) | enquanto o conteúdo existir; rascunho descartado, trocado ou abandonado (envio vencido sem ir ao ar) é apagado | cron diário (`stream_cleanup_candidates`/`stream_cleanup_discard`, API do Stream); receita nunca é apagada pela limpeza, só perde o vídeo |
| Histórico de receitas vistas (opcional, quando a tela existir) | 90 dias | `recipe_view_history` + `run_retention()`; desligar apaga tudo na hora; a data do acesso e a do consentimento (`history_enabled_at`) são sempre do relógio do banco, o cliente não as define |
| Backups | conforme plano Supabase (verificar e documentar antes da abertura) | provedor |

Exceções (evidência legal/incidente): `retention_exceptions` com escopo, justificativa, responsável, data de revisão e encerramento. Enquanto aberta, o registro não é anonimizado nem excluído. Nunca retenção indefinida genérica.

## Direitos do titular na POC

- **Exclusão self-service** (`/profile/account` → `delete_my_account`): anonimiza perfil, remove interesses/listas/progresso/carrinho, desvincula analytics/feedback/pedidos e apaga a conta. Bloqueada se houver exceção de retenção ativa (informado ao usuário). Desde a 0027 também apaga avaliações, comentários, lista de compras, histórico e preferência de receitas, zera as autorias que ficam (versões, fotos, moderação, validação de nutrição e de vínculo, `created_by` de conteúdo e de produto) e desvincula o perfil de herói (o conteúdo assinado fica). O herói que criou conteúdo pelo app ou duplicou receita também consegue excluir a conta (cenário S32). A exclusão direta pelo painel do Auth também funciona (cenário S32). A foto de perfil sai antes da exclusão (action `deleteAccount`, inclusive do perfil público do herói); se falhar, o envio fica sem dono e o cron diário apaga a foto e a referência (cenário S33).
- **Transparência**: página de conta resume dados, prazos e natureza demonstrativa.
- Portabilidade/correção: edição de perfil; exportação formal fora do escopo da POC.

## Compartilhamento com terceiros

- Supabase (banco/auth e Storage das fotos de perfil) e Vercel (hospedagem): operadores. A foto de perfil passa pela função da Vercel (validação de tipo e tamanho) antes de ir ao Storage. Citado em `legal.json` (3 idiomas) desde 22/10/2026.
- Cloudflare (Stream): operador dos vídeos gravados ou enviados pelos heróis (upload direto do aparelho, processamento, armazenamento e entrega; o player é carregado do Cloudflare). Não recebe nome nem e-mail: o vídeo fica ligado ao conteúdo. Citado em `legal.json` (3 idiomas) desde 22/10/2026.
- IA (OpenAI/Gemini) **só se ativada**: recebe ids opacos, tags e pilares — nunca e-mail/nome. Desligável por kill switch.
- Nenhum repasse comercial, parceiro de logística ou pagamento.

## Pendências antes da abertura pública

1. Política de privacidade e termos visíveis no cadastro (texto jurídico).
2. Confirmar bases legais e DPO/encarregado.
3. Documentar política de backup e restauração efetiva do plano contratado.
4. Revisão de alegações em conteúdos de nutrição/treino por profissionais habilitados (CRN/CREF).
