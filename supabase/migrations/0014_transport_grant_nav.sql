-- =============================================================================
-- Ultra Hero · 0014 · Garante grant do transporte simulado para usuários autenticados
-- (idempotente; operação baseada em tempo, sem efeito além de avançar a simulação)
-- =============================================================================
grant execute on function public.advance_simulated_transport(int) to authenticated, service_role;
