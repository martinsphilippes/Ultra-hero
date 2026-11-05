-- 0105 · "Groscove Ultra" como rede (primeira opção nas listas de redes: campanha, chamada da marca, patrocínio,
-- entregáveis, músicas e contas do Hero). Pedido do responsável (04/11).
-- A lista fechada de redes vive em vários checks e numa função de validação (0065/0066/0083/0085/0089). Em vez de
-- reescrever cada um à mão, esta migração acrescenta 'groscove_ultra' em todos os checks que já listam 'kwai' e
-- 'other' (e sobe o teto de cardinality de 11 para 12 onde existir), e faz o mesmo no corpo de
-- campaign_deliverables_valid. Idempotente: não mexe no que já tem 'groscove_ultra'.
do $m$
declare
  c record;
  def text;
  fdef text;
begin
  for c in
    select con.conrelid::regclass as tbl, con.conname, pg_get_constraintdef(con.oid) as d
    from pg_constraint con join pg_namespace n on n.oid = con.connamespace
    where n.nspname = 'public' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%''kwai''::text%'
      and pg_get_constraintdef(con.oid) not like '%groscove_ultra%'
  loop
    def := replace(c.d, '''other''::text]', '''other''::text, ''groscove_ultra''::text]');
    def := replace(def, 'cardinality(networks) <= 11', 'cardinality(networks) <= 12');
    if def = c.d then raise exception '0105: não consegui ajustar %', c.conname; end if;
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
    execute format('alter table %s add constraint %I %s', c.tbl, c.conname, def);
  end loop;

  select pg_get_functiondef('public.campaign_deliverables_valid(jsonb)'::regprocedure) into fdef;
  if fdef not like '%groscove_ultra%' then
    if position('''threads'',''other'')' in fdef) = 0 then raise exception '0105: lista de redes não encontrada em campaign_deliverables_valid'; end if;
    execute replace(fdef, '''threads'',''other'')', '''threads'',''other'',''groscove_ultra'')');
  end if;
end
$m$;
