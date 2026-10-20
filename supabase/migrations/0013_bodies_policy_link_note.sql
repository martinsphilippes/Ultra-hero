-- =============================================================================
-- Ultra Hero · 0013 · Ajustes apontados pelos portais
-- 1) personalidade não altera o corpo enquanto o conteúdo está em revisão;
-- 2) nota do admin no vínculo fica separada da nota da personalidade.
-- =============================================================================

drop policy if exists content_bodies_write on public.content_bodies;
create policy content_bodies_write on public.content_bodies for all to authenticated
  using (public.is_admin() or exists (select 1 from public.content c where c.id = content_id and c.creator_id = public.my_creator_id()
                                      and c.status = 'draft' and c.review_status <> 'in_review'))
  with check (public.is_admin() or exists (select 1 from public.content c where c.id = content_id and c.creator_id = public.my_creator_id()
                                           and c.status = 'draft' and c.review_status <> 'in_review'));

alter table public.content_product_links add column if not exists admin_note text;

create or replace function public.admin_set_link_status(p_link uuid, p_status public.link_status, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_version int;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select to_jsonb(l) into v_before from public.content_product_links l where id = p_link;
  if v_before is null then raise exception 'link_not_found'; end if;
  select version into v_version from public.products where id = (v_before ->> 'product_id')::uuid;
  update public.content_product_links
  set status = p_status, admin_note = coalesce(p_note, admin_note),
      validated_by = case when p_status = 'validated' then auth.uid() else validated_by end,
      validated_at = case when p_status = 'validated' then now() else validated_at end,
      product_version_at_validation = case when p_status = 'validated' then v_version else product_version_at_validation end,
      suspended_reason = case when p_status = 'suspended' then coalesce(p_note, 'admin') else null end
  where id = p_link;
  perform public.audit_log('link.set_status', 'content_product_link', p_link::text, v_before, jsonb_build_object('status', p_status), p_note);
end $$;
