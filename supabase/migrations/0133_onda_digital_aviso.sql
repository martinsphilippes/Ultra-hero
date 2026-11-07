-- =============================================================================
-- 0133 — Onda Digital: aviso único no sino de quem é de marca (07/11/2026).
-- Aplicada depois que a página /marca/onda-digital está no ar (o aviso leva para ela). Um aviso por pessoa (dedupe).
-- =============================================================================

-- aviso único no sino de quem é de marca hoje ------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select distinct on (m.user_id) m.user_id, m.brand_id from public.brand_members m join public.brands b on b.id = m.brand_id
           where m.revoked_at is null and not b.is_demo order by m.user_id, m.created_at loop
    perform public.inbox_notify(r.user_id, 'onda_digital_news', '/marca/onda-digital', '{}'::jsonb, null, 'brand', r.brand_id,
      'onda_news:' || r.user_id::text);
  end loop;
end $$;
