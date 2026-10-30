-- =============================================================================
-- Ultra Hero · 0053 · Operação dos fornecedores pelo admin
--   Decisão do responsável: o cadastro/login de fornecedor não existe por enquanto; tudo o que o
--   fornecedor fazia (produtos, remessas, perfil da organização) passa a ser feito pelo admin, em
--   /admin/sellers/[id] e /admin/shipments. Nada é retirado do admin.
--
-- Desenho: as políticas e RPCs do fornecedor já aceitam o admin (0007/0016: products insert/update,
--   seller_organizations update, leitura de remessas/itens/eventos com is_admin(); fulfillment_transition
--   com ator 'admin'). Não é preciso um contexto "agindo como fornecedor" (como o x-acting-hero da 0045):
--   as telas do admin filtram pela organização da URL e a RLS de admin cobre a escrita.
--   O que faltava era a trilha: só preço/disponibilidade de produto (0004) e o cadastro da organização
--   (0012) iam para admin_audit. Esta migração audita TODA escrita do admin em produtos e cada
--   transição de remessa feita pelo admin.
--
--   * products (insert/update pelo admin): 'products.insert' / 'products.update', resource_type
--     'product', resource_id = id do produto; no update só os campos que mudaram (antes/depois).
--     Mudança só de moderação fica de fora (admin_moderate_product já audita 'product.moderate').
--   * fulfillment_events com actor_type 'admin' (fulfillment_transition e cancel_test_order pelo
--     admin): 'fulfillment.transition', resource_type 'fulfillment', resource_id = id da remessa,
--     before {status}, after {status, seller_org_id, order_id}, justification = observação.
--
-- Regras: nada de drop de dados; search_path fixo; função de gatilho security definer sem execute
-- para anon/authenticated (a lista pública do S14 continua com 17); nenhuma tabela nova; reaplicável.
-- =============================================================================

create or replace function public.admin_seller_ops_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb; v_new jsonb; v_before jsonb := '{}'; v_after jsonb := '{}'; k text;
  v_skip text[] := array['search', 'updated_at', 'version', 'moderation_status', 'moderation_reason'];
begin
  -- só escrita do admin logado (seed, sistema e fornecedor não entram)
  if auth.uid() is null or not public.is_admin() then return new; end if;

  if tg_table_name = 'fulfillment_events' then
    if new.actor_type <> 'admin' then return new; end if;
    insert into public.admin_audit (actor_id, actor_type, action, resource_type, resource_id, before_data, after_data, justification)
    select auth.uid(), 'admin', 'fulfillment.transition', 'fulfillment', new.fulfillment_id::text,
           jsonb_build_object('status', new.from_status),
           jsonb_build_object('status', new.to_status, 'seller_org_id', f.seller_org_id, 'order_id', f.order_id),
           new.note
    from public.test_fulfillments f where f.id = new.fulfillment_id;
    return new;
  end if;

  -- products
  if tg_op = 'INSERT' then
    insert into public.admin_audit (actor_id, actor_type, action, resource_type, resource_id, after_data)
    values (auth.uid(), 'admin', 'products.insert', 'product', new.id::text, to_jsonb(new) - 'search');
    return new;
  end if;

  v_old := to_jsonb(old) - v_skip;
  v_new := to_jsonb(new) - v_skip;
  for k in select jsonb_object_keys(v_new) loop
    if v_old -> k is distinct from v_new -> k then
      v_before := v_before || jsonb_build_object(k, v_old -> k);
      v_after := v_after || jsonb_build_object(k, v_new -> k);
    end if;
  end loop;
  if v_after = '{}'::jsonb then return new; end if;
  insert into public.admin_audit (actor_id, actor_type, action, resource_type, resource_id, before_data, after_data)
  values (auth.uid(), 'admin', 'products.update', 'product', new.id::text,
          v_before || jsonb_build_object('seller_org_id', old.seller_org_id),
          v_after || jsonb_build_object('seller_org_id', new.seller_org_id));
  return new;
end $$;
revoke execute on function public.admin_seller_ops_audit() from public, anon, authenticated;
grant execute on function public.admin_seller_ops_audit() to service_role;

drop trigger if exists trg_z_audit_products_admin on public.products;
create trigger trg_z_audit_products_admin after insert or update on public.products
  for each row execute function public.admin_seller_ops_audit();
drop trigger if exists trg_audit_fulfillment_events_admin on public.fulfillment_events;
create trigger trg_audit_fulfillment_events_admin after insert on public.fulfillment_events
  for each row execute function public.admin_seller_ops_audit();
