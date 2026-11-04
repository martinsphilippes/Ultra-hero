-- 0120: colunas novas de deals (0107 cliente/serviço/início do roteiro; 0111 negócio de origem) sem permissão de leitura.
-- deals usa grant por coluna (0072: a taxa interna service_rate_bp fica de fora). Sem estas, a ficha do negócio
-- (/agencia/negocios/[id]) recebia 403 do PostgREST e mostrava "Página não encontrada". A RLS continua valendo.
grant select (client_talent_id, service_id, roadmap_started_on, origin_deal_id) on public.deals to authenticated;
