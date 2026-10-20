-- =============================================================================
-- Ultra Hero · 0009 · Grants para rotinas de sistema e renovação em lote
-- O service role (usado só no servidor: cron, recomendações) precisa executar
-- funções que foram revogadas de public. Transporte simulado pode ser avançado
-- por qualquer usuário autenticado (operação idempotente, baseada em tempo).
-- =============================================================================

grant execute on function public.advance_simulated_transport(int) to service_role, authenticated;
grant execute on function public.run_retention() to service_role;
grant execute on function public.anonymize_user_data(uuid) to service_role;
grant execute on function public.recompute_order_status(uuid) to service_role;
grant execute on function public.audit_log(text, text, text, jsonb, jsonb, text, public.actor_type) to service_role;
grant execute on function public.sync_subscription(uuid) to service_role;

-- Renovação simulada em lote (cron diário). Idempotente.
create or replace function public.sync_all_subscriptions()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select user_id from public.simulated_subscriptions
           where current_period_end <= now() and status in ('active', 'cancelled') loop
    perform public.sync_subscription(r.user_id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.sync_all_subscriptions() from public, anon, authenticated;
grant execute on function public.sync_all_subscriptions() to service_role;

-- Recalcular recomendações exige ler o catálogo e gravar em user_recommendations
-- (service role, bypass de RLS). Nenhum grant extra necessário.
