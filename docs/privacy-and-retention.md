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

**Não coletamos**: endereço real, geolocalização, dados de pagamento, dados de saúde individuais. Conteúdo é educativo, sem prescrição.

## Retenção aprovada

| Conjunto | Prazo | Mecanismo |
|---|---|---|
| Analytics individuais | 90 dias | `analytics_events.expires_at` + `run_retention()` |
| Pedidos de teste vinculados ao usuário | 90 dias | `test_orders.retention_expires_at` → anonimização (`user_id` nulo, nome do destino removido) |
| Logs técnicos / execuções de recomendação | 30 dias | `recommendation_runs` + política dos provedores (Vercel/Supabase) |
| Auditoria administrativa | 365 dias | `admin_audit` |
| Backups | conforme plano Supabase (verificar e documentar antes da abertura) | provedor |

Exceções (evidência legal/incidente): `retention_exceptions` com escopo, justificativa, responsável, data de revisão e encerramento. Enquanto aberta, o registro não é anonimizado nem excluído. Nunca retenção indefinida genérica.

## Direitos do titular na POC

- **Exclusão self-service** (`/profile/account` → `delete_my_account`): anonimiza perfil, remove interesses/listas/progresso/carrinho, desvincula analytics/feedback/pedidos e apaga a conta. Bloqueada se houver exceção de retenção ativa (informado ao usuário).
- **Transparência**: página de conta resume dados, prazos e natureza demonstrativa.
- Portabilidade/correção: edição de perfil; exportação formal fora do escopo da POC.

## Compartilhamento com terceiros

- Supabase (banco/auth) e Vercel (hospedagem): operadores. 
- IA (OpenAI/Gemini) **só se ativada**: recebe ids opacos, tags e pilares — nunca e-mail/nome. Desligável por kill switch.
- Nenhum repasse comercial, parceiro de logística ou pagamento.

## Pendências antes da abertura pública

1. Política de privacidade e termos visíveis no cadastro (texto jurídico).
2. Confirmar bases legais e DPO/encarregado.
3. Documentar política de backup e restauração efetiva do plano contratado.
4. Revisão de alegações em conteúdos de nutrição/treino por profissionais habilitados (CRN/CREF).
