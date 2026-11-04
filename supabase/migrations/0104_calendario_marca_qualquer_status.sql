-- Groscove Ultra · 0104 · Calendário Groscove visível para toda marca com portal
-- Problema (04/11): a marca não via nada do Calendário Groscove. A leitura (0098) exigia brands.status = 'active', mas
-- status da marca é a vitrine da loja pública: toda marca nasce 'inactive' (criada pela agência — S74 — ou pelo cadastro
-- por perfil 0103) e continua usando o portal. O calendário da plataforma não depende da vitrine: basta ser membro ativo
-- da marca (brand_members.revoked_at is null). Mesma regra para "minhas marcas" e para manifestar interesse.
-- Recria as 3 funções com a MESMA assinatura (sem sobrecarga); nada novo para anon.

create or replace function public.platform_calendar_reader_for(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user is not null and (
       exists (select 1 from public.role_assignments r where r.user_id = p_user and r.role::text = 'admin' and r.scope_type = 'global' and r.revoked_at is null)
    or exists (select 1 from public.agency_members m join public.agencies a on a.id = m.agency_id and a.status = 'active'
               where m.user_id = p_user and m.revoked_at is null)
    or exists (select 1 from public.brand_members bm join public.brands b on b.id = bm.brand_id
               where bm.user_id = p_user and bm.revoked_at is null)
    or exists (select 1 from public.creator_team_members m join public.creator_profiles c on c.id = m.creator_profile_id and c.status::text in ('active', 'pending')
               where m.user_id = p_user and m.status = 'active')
    or exists (select 1 from public.talent_profiles t join public.agencies a on a.id = t.agency_id and a.status = 'active'
               where t.user_id = p_user and t.archived_at is null))
$$;
revoke execute on function public.platform_calendar_reader_for(uuid) from public, anon, authenticated;
grant execute on function public.platform_calendar_reader_for(uuid) to service_role;

create or replace function public.my_member_brand_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct bm.brand_id), '{}'::uuid[]) from public.brand_members bm
  join public.brands b on b.id = bm.brand_id
  where bm.user_id = auth.uid() and bm.revoked_at is null
$$;
revoke execute on function public.my_member_brand_ids() from public, anon;
grant execute on function public.my_member_brand_ids() to authenticated, service_role;

create or replace function public.platform_event_set_interest(p_event uuid, p_party text, p_owner uuid, p_interested boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare e public.calendar_events%rowtype; i public.calendar_event_interests%rowtype; v_state text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_party is null or p_party not in ('hero', 'brand') or p_owner is null or p_interested is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  select * into e from public.calendar_events where id = p_event and scope = 'platform';
  if e.id is null or e.status = 'draft' or e.published_at > now() or not public.platform_calendar_reader() then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_party = 'hero' then
    if not exists (select 1 from public.creator_profiles c where c.id = p_owner and c.user_id = auth.uid() and c.status::text = 'active') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    select * into i from public.calendar_event_interests where event_id = p_event and creator_profile_id = p_owner for update;
  else
    if not exists (select 1 from public.brand_members bm join public.brands b on b.id = bm.brand_id
                   where bm.brand_id = p_owner and bm.user_id = auth.uid() and bm.revoked_at is null) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    select * into i from public.calendar_event_interests where event_id = p_event and brand_id = p_owner for update;
  end if;
  v_state := case when p_interested then 'interested' else 'withdrawn' end;
  if p_interested and (e.status = 'cancelled' or e.ends_at < now()) then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if i.id is null then
    if not p_interested then return 'none'; end if;
    insert into public.calendar_event_interests (event_id, party, creator_profile_id, brand_id, state, created_by, updated_by)
    values (p_event, p_party, case when p_party = 'hero' then p_owner end, case when p_party = 'brand' then p_owner end, v_state, auth.uid(), auth.uid())
    returning * into i;
  elsif i.state = v_state then
    return v_state;
  else
    update public.calendar_event_interests set state = v_state, updated_by = auth.uid() where id = i.id;
  end if;
  insert into public.calendar_event_interest_log (interest_id, state, actor) values (i.id, v_state, auth.uid());
  return v_state;
end $$;
revoke execute on function public.platform_event_set_interest(uuid, text, uuid, boolean) from public, anon;
grant execute on function public.platform_event_set_interest(uuid, text, uuid, boolean) to authenticated, service_role;
