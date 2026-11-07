-- =============================================================================
-- 0126 — Reunião Groscove (06/11/2026), lote C: casting aberto com pedido de acesso, perfil reivindicado pelo
-- próprio Hero, marca única com aprovação da Groscove e nota de 0 a 10.
--
-- Decisões:
--   • A Groscove é a dona da plataforma: groscove_agency_id() = agência de slug 'groscove'. "Adm da Groscove"
--     (is_groscove_admin) = Adm dessa agência ou admin da plataforma. Ela aprova marcas novas.
--   • Casting aberto: toda agência vê o casting das OUTRAS agências só com o básico (nome, foto, cidade, segmentos,
--     nível, disponibilidade, agência). Contato e valores só depois que a dona do casting aprova o pedido
--     (casting_access_requests). A dona vê os pedidos e decide; quem pediu recebe o aviso.
--   • Perfil reivindicado: quem se cadastra como Hero e já existe no casting (ex.: o Neymar importado) vê "É você?"
--     e pede o perfil. O pedido mostra para a agência se o e-mail da conta é o mesmo do casting (sinal forte); a
--     agência aprova e a conta é ligada pelo mesmo caminho do acesso criado pela agência (access_provision, 0112).
--     O código por e-mail fica para quando o envio de e-mail estiver configurado.
--   • Marca única: antes de criar, procura marca com o mesmo nome (sem acento/maiúsculas) ou CNPJ. Existe e está
--     livre → liga a agência a ela; existe e é de outra agência → brand_exists. Marca nova criada por quem não é
--     Adm da Groscove nasce "pendente" (com o que a marca quer fazer e o link do print/página oficial) até a
--     Groscove aprovar.
--   • Nota do Hero (talent_ratings.quality): de 1–5 estrelas para score de 0 a 10; as notas antigas dobram uma vez.
-- =============================================================================

-- 0) quem é a Groscove ---------------------------------------------------------------------------------------------
create or replace function public.groscove_agency_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select a.id from public.agencies a where a.slug = 'groscove' limit 1
$$;
revoke execute on function public.groscove_agency_id() from public, anon;
grant execute on function public.groscove_agency_id() to authenticated, service_role;

create or replace function public.is_groscove_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (public.is_platform_admin()
    or (public.groscove_agency_id() is not null and public.agency_can(public.groscove_agency_id(), 'admin')))
$$;
revoke execute on function public.is_groscove_admin() from public, anon;
grant execute on function public.is_groscove_admin() to authenticated, service_role;

-- 1) nota de 0 a 10 ---------------------------------------------------------------------------------------------------
alter table public.talent_ratings drop constraint if exists talent_ratings_quality_check;
do $$
begin
  if not exists (select 1 from public.app_settings s where s.key = 'ratings.scale10') then
    update public.talent_ratings set quality = quality * 2 where quality between 1 and 5;
    insert into public.app_settings (key, value, description)
    values ('ratings.scale10', 'true'::jsonb, '0126: notas dos Heroes passaram de 1–5 para 0–10 (as antigas foram dobradas uma vez).');
  end if;
end $$;
alter table public.talent_ratings add constraint talent_ratings_quality_check check (quality between 0 and 10);

create or replace function public.brand_deliverable_rate(p_deliverable uuid, p_on_time boolean, p_quality int, p_comment text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare x public.deliverables%rowtype; v_id uuid; v_comment text := btrim(coalesce(p_comment, ''));
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into x from public.deliverables where id = p_deliverable for update;
  if x.id is null or public.brand_member_of(x.brand_id) is null or not public.brand_visible_deal_talent(x.brand_id, x.deal_talent_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if x.status not in ('published', 'proof_submitted', 'done') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if p_on_time is null or p_quality is null or p_quality not between 0 and 10 or char_length(v_comment) > 500 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if exists (select 1 from public.talent_ratings r where r.deliverable_id = x.id) then raise exception 'already_rated' using errcode = 'P0001'; end if;
  insert into public.talent_ratings (agency_id, brand_id, deal_id, deal_talent_id, talent_id, deliverable_id, on_time, quality, comment, rated_by, rated_label)
  values (x.agency_id, x.brand_id, x.deal_id, x.deal_talent_id, x.talent_id, x.id, p_on_time, p_quality, v_comment, auth.uid(),
          public.actor_label(x.agency_id, x.brand_id))
  returning id into v_id;
  perform public.audit_log('talent.rating', 'deliverable', x.id::text, null,
    jsonb_build_object('agency_id', x.agency_id, 'brand_id', x.brand_id, 'talent_id', x.talent_id, 'on_time', p_on_time, 'quality', p_quality),
    null, 'brand'::public.actor_type);
  return v_id;
end $$;
revoke execute on function public.brand_deliverable_rate(uuid, boolean, int, text) from public, anon;
grant execute on function public.brand_deliverable_rate(uuid, boolean, int, text) to authenticated, service_role;

-- 2) avisos novos ---------------------------------------------------------------------------------------------------
alter table public.inbox_notifications drop constraint if exists inbox_notifications_kind_check;
alter table public.inbox_notifications add constraint inbox_notifications_kind_check check (kind in (
  'member_joined', 'brand_member_joined',
  'talent_consent_given', 'talent_consent_revoked',
  'briefing_received', 'deal_assigned', 'campaign_status_changed', 'proposal_received', 'proposal_decided', 'message_received',
  'opportunity_received', 'opportunity_updated', 'opportunity_answered', 'contract_acceptance_requested', 'contract_confirmed',
  'task_assigned', 'deliverable_submitted', 'deliverable_decided', 'deliverable_published', 'talent_suggestion',
  'calendar_event_added', 'commercial_date_published',
  'relationship_alert', 'task_overdue', 'payout_updated',
  'internal_approval_requested', 'internal_approval_decided', 'shortlist_sent', 'shortlist_decided',
  'invoice_submitted', 'invoice_reviewed', 'payout_scheduled', 'budget_exceeded',
  'usage_rights_expiring', 'deliverable_comment',
  'task_due_soon',
  'sponsorship_published', 'sponsorship_interest', 'sponsorship_decided',
  'sponsorship_negotiation',
  'brand_call_published', 'brand_call_interest', 'brand_call_negotiation', 'brand_call_decided', 'brand_call_review',
  'budget_change', 'payment_reported', 'payment_reviewed', 'payment_due', 'payment_plan',
  'roadmap_due_soon', 'roadmap_overdue',
  'payout_due',
  'hero_account_linked', 'brand_access_granted',
  'agency_access_requested', 'agency_access_decided',
  -- 0126
  'casting_access_requested', 'casting_access_decided',
  'brand_approval_requested', 'brand_approval_decided',
  'profile_claim_requested', 'profile_claim_decided'));

alter table public.inbox_notifications drop constraint if exists inbox_notifications_entity_check;
alter table public.inbox_notifications add constraint inbox_notifications_entity_check check (entity_type is null or entity_type in
  ('agency', 'brand', 'talent', 'request', 'deal', 'deal_talent', 'deliverable', 'task', 'proposal', 'event', 'commercial_date', 'entry', 'shortlist', 'invoice',
   'sponsorship', 'brand_call', 'budget_change', 'payment',
   'access_request',
   -- 0126
   'casting_request', 'profile_claim'));

-- 3) marca única com aprovação ----------------------------------------------------------------------------------------
alter table public.brands add column if not exists approval_status text not null default 'approved';
alter table public.brands drop constraint if exists brands_approval_status_check;
alter table public.brands add constraint brands_approval_status_check check (approval_status in ('pending', 'approved', 'rejected'));
alter table public.brands add column if not exists approval_intent text;
alter table public.brands add column if not exists approval_evidence_url text;
alter table public.brands add column if not exists approval_note text;
alter table public.brands add column if not exists approval_requested_by uuid references auth.users (id) on delete set null;
alter table public.brands add column if not exists approval_decided_by uuid references auth.users (id) on delete set null;
alter table public.brands add column if not exists approval_decided_at timestamptz;
alter table public.brands drop constraint if exists brands_approval_texts_check;
alter table public.brands add constraint brands_approval_texts_check check (
  (approval_intent is null or char_length(approval_intent) <= 1000)
  and (approval_evidence_url is null or (char_length(approval_evidence_url) <= 500 and approval_evidence_url ~ '^https://'))
  and (approval_note is null or char_length(approval_note) <= 300));

-- nome comparável: sem acento, sem pontuação, minúsculas ("Coca-Cola" = "coca cola" = "COCA COLA")
create or replace function public.brand_name_key(p text)
returns text language sql immutable set search_path = '' as $$
  select regexp_replace(lower(translate(coalesce(p, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '[^a-z0-9]', '', 'g')
$$;
create index if not exists brands_name_key_idx on public.brands (public.brand_name_key(name));

create or replace function public.agency_brand_create(p_agency uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_slug text; v_demo boolean; v_manager uuid; v_name text; v_cnpj text; v_existing public.brands%rowtype;
        v_intent text; v_evidence text; v_status text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.agencies a where a.id = p_agency) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.brand_https_url_ok(btrim(coalesce(p_data ->> 'site_url', ''))) then raise exception 'invalid_url' using errcode = '22023'; end if;
  if not public.brand_image_url_ok(nullif(btrim(coalesce(p_data ->> 'logo_url', '')), '')) then raise exception 'invalid_image' using errcode = '22023'; end if;
  v_name := btrim(coalesce(p_data ->> 'name', ''));
  v_cnpj := nullif(regexp_replace(coalesce(p_data ->> 'cnpj', ''), '\D', '', 'g'), '');
  v_intent := nullif(left(btrim(coalesce(p_data ->> 'intent', '')), 1000), '');
  v_evidence := nullif(btrim(coalesce(p_data ->> 'evidence_url', '')), '');
  if v_evidence is not null and v_evidence !~ '^https://' then raise exception 'invalid_url' using errcode = '22023'; end if;
  v_demo := public.agency_is_demo(p_agency);
  v_manager := nullif(p_data ->> 'account_manager_id', '')::uuid;
  if v_manager is not null and not exists (select 1 from public.agency_members m
      where m.agency_id = p_agency and m.user_id = v_manager and m.revoked_at is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- 0126: marca única na plataforma (mesmo nome comparável ou mesmo CNPJ)
  if not v_demo then
    select b.* into v_existing from public.brands b
    where b.approval_status <> 'rejected' and not b.is_demo
      and (public.brand_name_key(b.name) = public.brand_name_key(v_name) or (v_cnpj is not null and b.cnpj = v_cnpj))
    order by b.created_at limit 1;
    if v_existing.id is not null then
      if exists (select 1 from public.agency_brands ab where ab.brand_id = v_existing.id and ab.status = 'active' and ab.agency_id <> p_agency) then
        raise exception 'brand_exists' using errcode = 'P0001';
      end if;
      insert into public.agency_brands (agency_id, brand_id, status, account_manager_id, is_demo, created_by)
      values (p_agency, v_existing.id, 'active', v_manager, false, auth.uid())
      on conflict (agency_id, brand_id) do update set status = 'active', account_manager_id = coalesce(excluded.account_manager_id, public.agency_brands.account_manager_id);
      perform public.audit_log('agency.brand_link_existing', 'brand', v_existing.id::text, null,
        jsonb_build_object('agency_id', p_agency, 'name', v_name), null, 'agency');
      return v_existing.id;
    end if;
  end if;

  v_slug := lower(btrim(coalesce(p_data ->> 'slug', '')));
  if v_demo then
    if v_slug !~ '^exemplo-' then v_slug := left('exemplo-' || v_slug, 60); end if;
    if (select count(*) from public.agency_brands ab where ab.agency_id = p_agency) >= 10 then
      raise exception 'demo_limit' using errcode = 'P0001';
    end if;
  end if;
  v_status := case when v_demo or public.is_groscove_admin() then 'approved' else 'pending' end;
  begin
    -- D7: marca criada pela agência nasce "inactive" (marca ativa é legível por anon)
    insert into public.brands (slug, name, logo_url, site_url, status, default_relationship, is_demo, created_by, cnpj,
                               approval_status, approval_intent, approval_evidence_url, approval_requested_by)
    values (v_slug, v_name, nullif(btrim(coalesce(p_data ->> 'logo_url', '')), ''),
            btrim(p_data ->> 'site_url'), 'inactive', 'sponsor', false, auth.uid(), v_cnpj,
            v_status, v_intent, v_evidence, auth.uid())
    returning id into v_id;
  exception
    when unique_violation then raise exception 'duplicate_slug' using errcode = '23505';
    when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  insert into public.agency_brands (agency_id, brand_id, status, account_manager_id, is_demo, created_by)
  values (p_agency, v_id, 'active', v_manager, v_demo, auth.uid());
  if v_status = 'pending' and public.groscove_agency_id() is not null then
    perform public.inbox_notify_agency(public.groscove_agency_id(), 'admin', 'brand_approval_requested', '/agencia/marcas#aprovacao',
      jsonb_build_object('brand', left(v_name, 80), 'agency', (select left(a.name, 80) from public.agencies a where a.id = p_agency)),
      'brand', v_id, 'brand_approval:' || v_id::text);
  end if;
  perform public.audit_log('agency.brand_create', 'brand', v_id::text, null,
    jsonb_build_object('agency_id', p_agency, 'slug', v_slug, 'name', v_name, 'approval', v_status), null,
    case when public.agency_role_of(p_agency) is null then 'admin' else 'agency' end::public.actor_type);
  return v_id;
end $$;
revoke execute on function public.agency_brand_create(uuid, jsonb) from public, anon;
grant execute on function public.agency_brand_create(uuid, jsonb) to authenticated, service_role;

-- marcas aguardando a Groscove
create or replace function public.brand_approval_pending()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_groscove_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'site_url', b.site_url, 'logo_url', b.logo_url,
      'cnpj', b.cnpj, 'intent', b.approval_intent, 'evidence_url', b.approval_evidence_url, 'created_at', b.created_at,
      'agency', (select a.name from public.agency_brands ab join public.agencies a on a.id = ab.agency_id where ab.brand_id = b.id order by ab.created_at limit 1),
      'requested_by', (select coalesce(nullif(btrim(p.display_name), ''), split_part(u.email, '@', 1)) from auth.users u left join public.profiles p on p.id = u.id where u.id = b.approval_requested_by))
    order by b.created_at) from public.brands b where b.approval_status = 'pending'), '[]'::jsonb);
end $$;
revoke execute on function public.brand_approval_pending() from public, anon;
grant execute on function public.brand_approval_pending() to authenticated, service_role;

create or replace function public.brand_approval_decide(p_brand uuid, p_approve boolean, p_note text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare b public.brands%rowtype; v_note text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
begin
  if not public.is_groscove_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into b from public.brands where id = p_brand for update;
  if b.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if b.approval_status <> 'pending' then raise exception 'already_decided' using errcode = 'P0001'; end if;
  update public.brands set approval_status = case when p_approve then 'approved' else 'rejected' end, approval_note = v_note,
    approval_decided_by = auth.uid(), approval_decided_at = now() where id = b.id;
  perform public.inbox_notify(b.approval_requested_by, 'brand_approval_decided', '/agencia/marcas/' || b.id::text,
    jsonb_build_object('brand', left(b.name, 80), 'approved', p_approve), null, 'brand', b.id, 'brand_decided:' || b.id::text);
  perform public.audit_log(case when p_approve then 'brand.approved' else 'brand.rejected' end, 'brand', b.id::text, null,
    jsonb_build_object('note', v_note), null, 'admin');
  return true;
end $$;
revoke execute on function public.brand_approval_decide(uuid, boolean, text) from public, anon;
grant execute on function public.brand_approval_decide(uuid, boolean, text) to authenticated, service_role;

-- 4) casting aberto --------------------------------------------------------------------------------------------------
create table if not exists public.casting_access_requests (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_profiles (id) on delete cascade,
  owner_agency_id uuid not null references public.agencies (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint casting_access_requests_other_check check (owner_agency_id <> agency_id)
);
create unique index if not exists casting_access_requests_open_idx on public.casting_access_requests (talent_id, agency_id) where status in ('pending', 'approved');
create index if not exists casting_access_requests_owner_idx on public.casting_access_requests (owner_agency_id, status, created_at desc);
alter table public.casting_access_requests enable row level security;
revoke all on public.casting_access_requests from public, anon, authenticated;
grant select on public.casting_access_requests to authenticated;
grant all on public.casting_access_requests to service_role;
drop policy if exists casting_access_requests_select on public.casting_access_requests;
create policy casting_access_requests_select on public.casting_access_requests for select to authenticated
  using (owner_agency_id = any ((select public.my_agency_ids('admin'))::uuid[]) or agency_id = any ((select public.my_agency_ids('staff'))::uuid[])
         or (select public.is_platform_admin()));

-- o casting das OUTRAS agências, só com o básico; p_segment filtra por segmento; access = none|pending|approved
create or replace function public.casting_open_list(p_agency uuid, p_query text default null, p_segment text default null,
  p_limit int default 24, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(btrim(coalesce(p_query, '')), ''); v_limit int := least(greatest(coalesce(p_limit, 24), 1), 60);
begin
  if p_agency is null or not public.agency_can(p_agency, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.talent_profiles t join public.agencies a on a.id = t.agency_id and a.status = 'active' and not a.is_demo
              where t.agency_id <> p_agency and t.archived_at is null and not t.is_demo
                and (v_q is null or public.brand_name_key(t.display_name) like '%' || public.brand_name_key(v_q) || '%')
                and (p_segment is null or p_segment = any (t.segments))),
    'items', coalesce((select jsonb_agg(x order by x ->> 'name') from (
      select jsonb_build_object('id', t.id, 'name', t.display_name, 'city', t.city, 'state', t.state, 'segments', t.segments, 'level', t.level,
        'availability', t.availability, 'category', t.category_label, 'agency', a.name,
        'photo', coalesce((select c.avatar_url from public.creator_profiles c where c.id = t.creator_id and c.status = 'active'), t.photo_url),
        'access', coalesce((select r.status from public.casting_access_requests r where r.talent_id = t.id and r.agency_id = p_agency
                            and r.status in ('pending', 'approved') order by r.created_at desc limit 1), 'none')) as x
      from public.talent_profiles t join public.agencies a on a.id = t.agency_id and a.status = 'active' and not a.is_demo
      where t.agency_id <> p_agency and t.archived_at is null and not t.is_demo
        and (v_q is null or public.brand_name_key(t.display_name) like '%' || public.brand_name_key(v_q) || '%')
        and (p_segment is null or p_segment = any (t.segments))
      order by t.display_name limit v_limit offset greatest(coalesce(p_offset, 0), 0)) s), '[]'::jsonb));
end $$;
revoke execute on function public.casting_open_list(uuid, text, text, int, int) from public, anon;
grant execute on function public.casting_open_list(uuid, text, text, int, int) to authenticated, service_role;

create or replace function public.casting_access_request(p_agency uuid, p_talent uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_id uuid; v_name text;
begin
  if p_agency is null or not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  select t.agency_id, t.display_name into v_owner, v_name from public.talent_profiles t where t.id = p_talent and t.archived_at is null;
  if v_owner is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_owner = p_agency then raise exception 'invalid_input' using errcode = '22023'; end if;
  select r.id into v_id from public.casting_access_requests r where r.talent_id = p_talent and r.agency_id = p_agency and r.status in ('pending', 'approved');
  if v_id is not null then return v_id; end if;
  insert into public.casting_access_requests (talent_id, owner_agency_id, agency_id, requested_by, note)
  values (p_talent, v_owner, p_agency, auth.uid(), nullif(left(btrim(coalesce(p_note, '')), 500), '')) returning id into v_id;
  perform public.inbox_notify_agency(v_owner, 'admin', 'casting_access_requested', '/agencia/casting?aba=pedidos',
    jsonb_build_object('talent', left(v_name, 80), 'agency', (select left(a.name, 80) from public.agencies a where a.id = p_agency)),
    'casting_request', v_id, 'casting_req:' || v_id::text);
  perform public.audit_log('casting.access_requested', 'talent', p_talent::text, null, jsonb_build_object('agency_id', p_agency), null, 'agency');
  return v_id;
end $$;
revoke execute on function public.casting_access_request(uuid, uuid, text) from public, anon;
grant execute on function public.casting_access_request(uuid, uuid, text) to authenticated, service_role;

create or replace function public.casting_access_decide(p_request uuid, p_approve boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r public.casting_access_requests%rowtype;
begin
  select * into r from public.casting_access_requests where id = p_request for update;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(r.owner_agency_id, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.status <> 'pending' then raise exception 'already_decided' using errcode = 'P0001'; end if;
  update public.casting_access_requests set status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = auth.uid(), decided_at = now() where id = r.id;
  perform public.inbox_notify_agency(r.agency_id, 'manager', 'casting_access_decided', '/agencia/casting?aba=aberto',
    jsonb_build_object('talent', (select left(t.display_name, 80) from public.talent_profiles t where t.id = r.talent_id), 'approved', p_approve),
    'casting_request', r.id, 'casting_dec:' || r.id::text);
  perform public.audit_log(case when p_approve then 'casting.access_approved' else 'casting.access_rejected' end, 'talent', r.talent_id::text,
    null, jsonb_build_object('agency_id', r.agency_id), null, 'agency');
  return true;
end $$;
revoke execute on function public.casting_access_decide(uuid, boolean) from public, anon;
grant execute on function public.casting_access_decide(uuid, boolean) to authenticated, service_role;

-- pedidos ao casting da agência (para a dona decidir)
create or replace function public.casting_access_inbox(p_agency uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.agency_can(p_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'talent', t.display_name, 'talent_id', t.id, 'agency', a.name,
      'note', r.note, 'created_at', r.created_at) order by r.created_at)
    from public.casting_access_requests r join public.talent_profiles t on t.id = r.talent_id join public.agencies a on a.id = r.agency_id
    where r.owner_agency_id = p_agency and r.status = 'pending'), '[]'::jsonb);
end $$;
revoke execute on function public.casting_access_inbox(uuid) from public, anon;
grant execute on function public.casting_access_inbox(uuid) to authenticated, service_role;

-- contato e valores, só com o pedido aprovado (valores = últimos cachês registrados em negócios)
create or replace function public.casting_open_contact(p_agency uuid, p_talent uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t public.talent_profiles%rowtype;
begin
  if p_agency is null or not public.agency_can(p_agency, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.casting_access_requests r where r.talent_id = p_talent and r.agency_id = p_agency and r.status = 'approved') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into t from public.talent_profiles where id = p_talent;
  return jsonb_build_object('email', t.contact_email, 'phone', t.contact_phone,
    'socials', coalesce((select jsonb_agg(jsonb_build_object('network', s.network, 'handle', s.handle, 'url', s.url, 'followers', s.followers))
                         from public.talent_social_accounts s where s.talent_id = t.id), '[]'::jsonb),
    'fees', coalesce((select jsonb_agg(f.fee_cents order by f.set_at desc) from (select fee_cents, set_at from public.deal_talent_fees
                      where talent_id = t.id order by set_at desc limit 5) f), '[]'::jsonb));
end $$;
revoke execute on function public.casting_open_contact(uuid, uuid) from public, anon;
grant execute on function public.casting_open_contact(uuid, uuid) to authenticated, service_role;

-- 5) perfil reivindicado pelo próprio Hero ----------------------------------------------------------------------------
create table if not exists public.profile_claims (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references public.talent_profiles (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  email_matches boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists profile_claims_open_idx on public.profile_claims (user_id) where status = 'pending';
create index if not exists profile_claims_agency_idx on public.profile_claims (agency_id, status, created_at desc);
alter table public.profile_claims enable row level security;
revoke all on public.profile_claims from public, anon, authenticated;
grant select on public.profile_claims to authenticated;
grant all on public.profile_claims to service_role;
drop policy if exists profile_claims_select on public.profile_claims;
create policy profile_claims_select on public.profile_claims for select to authenticated
  using (user_id = (select auth.uid()) or agency_id = any ((select public.my_agency_ids('admin'))::uuid[]) or (select public.is_platform_admin()));

-- "É você?": perfis do casting ainda sem dono com nome parecido (mín. 4 letras; até 5)
create or replace function public.hero_claim_candidates(p_name text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_key text := public.brand_name_key(p_name); v_email text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if char_length(v_key) < 4 then return '[]'::jsonb; end if;
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();
  return coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('id', t.id, 'name', t.display_name, 'city', t.city, 'state', t.state, 'category', t.category_label,
      'agency', a.name, 'email_matches', lower(coalesce(t.contact_email, '')) = v_email,
      'photo', coalesce((select c.avatar_url from public.creator_profiles c where c.id = t.creator_id), t.photo_url)) as x
    from public.talent_profiles t join public.agencies a on a.id = t.agency_id and a.status = 'active'
    left join public.creator_profiles c on c.id = t.creator_id
    where t.archived_at is null and not t.is_demo and t.user_id is null and (t.creator_id is null or c.user_id is null)
      and (public.brand_name_key(t.display_name) like '%' || v_key || '%' or v_key like '%' || public.brand_name_key(t.display_name) || '%'
           or lower(coalesce(t.contact_email, '')) = v_email)
    order by (lower(coalesce(t.contact_email, '')) = v_email) desc, t.display_name limit 5) s), '[]'::jsonb);
end $$;
revoke execute on function public.hero_claim_candidates(text) from public, anon;
grant execute on function public.hero_claim_candidates(text) to authenticated, service_role;

create or replace function public.hero_claim_request(p_talent uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t record; v_email text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select tp.id, tp.agency_id, tp.display_name, tp.contact_email, tp.user_id, tp.creator_id, c.user_id as creator_user into t
  from public.talent_profiles tp left join public.creator_profiles c on c.id = tp.creator_id where tp.id = p_talent and tp.archived_at is null;
  if t.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if coalesce(t.user_id, t.creator_user) is not null then raise exception 'already_claimed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.creator_profiles c where c.user_id = auth.uid()) then raise exception 'has_hero' using errcode = 'P0001'; end if;
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();
  update public.profile_claims set status = 'cancelled' where user_id = auth.uid() and status = 'pending';
  insert into public.profile_claims (talent_id, agency_id, user_id, email, email_matches)
  values (t.id, t.agency_id, auth.uid(), v_email, lower(coalesce(t.contact_email, '')) = v_email) returning id into v_id;
  perform public.inbox_notify_agency(t.agency_id, 'admin', 'profile_claim_requested', '/agencia/casting?aba=pedidos',
    jsonb_build_object('talent', left(t.display_name, 80), 'name', left(v_email, 80)), 'profile_claim', v_id, 'claim:' || v_id::text);
  perform public.audit_log('hero.claim_requested', 'talent', t.id::text, null, jsonb_build_object('email_matches', lower(coalesce(t.contact_email, '')) = v_email), null, 'consumer');
  return v_id;
end $$;
revoke execute on function public.hero_claim_request(uuid) from public, anon;
grant execute on function public.hero_claim_request(uuid) to authenticated, service_role;

create or replace function public.my_hero_claim()
returns jsonb language sql stable security definer set search_path = '' as $$
  select (select jsonb_build_object('id', p.id, 'status', p.status, 'talent', t.display_name, 'agency', a.name, 'created_at', p.created_at)
          from public.profile_claims p join public.talent_profiles t on t.id = p.talent_id join public.agencies a on a.id = p.agency_id
          where p.user_id = auth.uid() and p.status in ('pending', 'rejected', 'approved') order by p.created_at desc limit 1)
$$;
revoke execute on function public.my_hero_claim() from public, anon;
grant execute on function public.my_hero_claim() to authenticated, service_role;

create or replace function public.profile_claim_inbox(p_agency uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.agency_can(p_agency, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'talent', t.display_name, 'talent_id', t.id, 'email', p.email,
      'email_matches', p.email_matches, 'created_at', p.created_at) order by p.created_at)
    from public.profile_claims p join public.talent_profiles t on t.id = p.talent_id
    where p.agency_id = p_agency and p.status = 'pending'), '[]'::jsonb);
end $$;
revoke execute on function public.profile_claim_inbox(uuid) from public, anon;
grant execute on function public.profile_claim_inbox(uuid) to authenticated, service_role;

create or replace function public.profile_claim_decide(p_claim uuid, p_approve boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare c public.profile_claims%rowtype; v_result jsonb;
begin
  select * into c from public.profile_claims where id = p_claim for update;
  if c.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(c.agency_id, 'admin') then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.status <> 'pending' then raise exception 'already_decided' using errcode = 'P0001'; end if;
  if p_approve then
    -- mesmo caminho do acesso criado pela agência: liga a conta (Hero da página ou ficha do casting) e avisa
    v_result := public.access_provision('talent', c.talent_id, c.agency_id, c.email);
    if coalesce(v_result ->> 'account', '') not in ('linked', 'active') then raise exception 'claim_link_failed' using errcode = 'P0001'; end if;
    update public.account_onboardings set completed_at = now(), result_id = c.talent_id
    where user_id = c.user_id and kind = 'hero' and completed_at is null;
  end if;
  update public.profile_claims set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now()
  where id = c.id;
  perform public.inbox_notify(c.user_id, 'profile_claim_decided', case when p_approve then '/heroi' else '/primeiro-acesso' end,
    jsonb_build_object('talent', (select left(t.display_name, 80) from public.talent_profiles t where t.id = c.talent_id), 'approved', p_approve),
    c.agency_id, 'profile_claim', c.id, 'claim_dec:' || c.id::text);
  perform public.audit_log(case when p_approve then 'hero.claim_approved' else 'hero.claim_rejected' end, 'talent', c.talent_id::text,
    null, jsonb_build_object('user_id', c.user_id, 'email_matches', c.email_matches), null, 'agency');
  return true;
end $$;
revoke execute on function public.profile_claim_decide(uuid, boolean) from public, anon;
grant execute on function public.profile_claim_decide(uuid, boolean) to authenticated, service_role;
