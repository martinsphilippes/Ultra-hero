-- =============================================================================
-- Groscove Ultra · 0095 · Oportunidade de patrocínio por HERO (busca na plataforma, ficha criada ao salvar,
-- Hero digitado, rascunho sem consentimento). Cenário RLS S102. Idempotente. S14 segue 18 (nada novo para o visitante).
-- Depende da 0065 (casting), 0085/0088 (oportunidade e cotas), 0087/0091 (convite e login do creator), 0093 (sugerir Heros).
--
-- Pedido do responsável: "Essa parte do elenco não tem a ver com elenco, tem a ver com o Hero! Tem que definir o Hero
-- para gerar a oportunidade." O primeiro campo do formulário passa a ser o HERO (a página pública do creator para quem
-- o evento acontece), escolhido entre os Heros da plataforma (como no diálogo "Sugerir Heros"), sem a trava do elenco
-- com consentimento.
--
-- Decisões:
--  1) Hero guardado POR FICHA: a oportunidade continua guardando talent_id (a ficha do casting da agência) e o Hero é
--     lido por talent_profiles.creator_id. Não há coluna creator_id duplicada na oportunidade: ela ficaria velha se a
--     ficha de um digitado fosse ligada a um Hero depois (agency_talent_link_creator). Toda leitura devolve o objeto
--     "hero" (creator_id, slug, nome, foto, chamada, nichos) montado em sponsorship_hero_json. Hero digitado = ficha sem
--     Hero: só o nome.
--  2) Origem do Hero ao salvar (p_data.hero): {kind:'talent', talent_id} (ficha do casting), {kind:'hero', creator_id}
--     (Hero da plataforma fora do casting: a agência cria a ficha ligada a ele, commercial_status 'prospect', SEM
--     consentimento, como na 0093) ou {kind:'typed', name, profile?, email?} (ficha sem Hero). A lógica de criar a
--     ficha está em agency_hero_ficha (interna, a mesma regra da 0093: um Hero num casting só, regra D10 da pessoa,
--     agência de demonstração não usa Hero real, nome limpo, perfil @ ou https, e-mail válido). p_data.talent_id
--     (formato antigo) segue valendo. Hero suspenso ou pendente não existe para a agência (not_found).
--  3) CONSENTIMENTO: a regra de segurança não muda, só muda QUANDO vale. Consentimento vigente (consent_at sem revogação)
--     e Hero ativo são exigidos para a oportunidade ficar VISÍVEL às marcas (status 'open'). Rascunho ('draft') nasce
--     e se edita sem consentimento, mas é invisível a marcas e ao creator: a agenda dele não mostra, o sino não avisa,
--     as políticas de leitura da marca/creator excluem rascunho (brand_sponsorship_ids_for, sponsorship_brand_in_audience,
--     políticas do creator e dos alvos). Publicar sem consentimento: consent_required (e a ficha criada no mesmo salvamento
--     volta, é uma transação). O consentimento chega pelo termo assinado em Documentos ou pelo convite para o creator
--     aceitar no escritório; depois disso a agência publica com agency_sponsorship_publish ou salvando com publish=true.
--     Se o consentimento for revogado depois de publicada, a marca continua vendo a oportunidade, mas o Hero aparece só
--     com o nome (sem foto, nicho nem link), como o cartão do catálogo (talent_brand_card).
--  4) agency_sponsorship_save (MESMA assinatura, sem sobrecarga): p_data.publish (boolean). Criando: ausente = publica
--     (compatível com as chamadas antigas); false = rascunho. Editando rascunho: publish=true publica, senão segue
--     rascunho. Editando aberta: segue aberta (despublicar depois que as marcas viram não existe). Só 'draft' e 'open' se
--     editam (como antes só 'open'). Prazo no futuro vale ao criar, ao mudar e ao publicar.
--  5) agency_sponsorship_publish(p_id): publica um rascunho (gestor+): confere consentimento, Hero ativo e prazo; avisa o
--     público (o aviso tem dedupe por marca). agency_sponsorship_decide: rascunho só se cancela (descarta), sem avisos
--     (ninguém viu). Auditoria: sponsorship.save com o status, sponsorship.publish ao publicar.
--  6) agency_opportunity_hero_search(p_agency, p_q, p_limit, p_offset): a caixa "Hero" do formulário. Gestor+ da
--     agência; 20 por página (teto 50), busca no servidor por nome ou endereço sem acento. Devolve Heros ATIVOS da
--     plataforma com selo: 'casting' (já tem ficha na agência: traz talent_id e consentimento active|revoked|none),
--     'outside' (fora do casting, selecionável), 'other_agency' e 'person_in_casting' (indisponíveis, como na 0093), mais as
--     fichas do casting sem Hero (digitadas antes). Só campos públicos do Hero; nada de direitos, conta ou e-mail.
--     Suspenso/pendente não aparece. A agência de demonstração só vê o próprio casting (D6).
--  7) Leituras: agency_sponsorships e agency_sponsorship_detail devolvem "hero" (e o detalhe, o consentimento da ficha);
--     brand_sponsorships devolve "hero" só com consentimento vigente e Hero ativo; talent_sponsorships não lista rascunho.
--  8) Todas as funções novas: search_path vazio, security definer, execute revogado de public/anon; as internas só service_role.
-- =============================================================================

-- 1) situação 'draft' (rascunho) ----------------------------------------------------------------------------------------
alter table public.sponsorship_opportunities drop constraint if exists sponsorship_opportunities_status_check;
alter table public.sponsorship_opportunities add constraint sponsorship_opportunities_status_check check (status in ('draft', 'open', 'closed', 'sponsored', 'cancelled'));
alter table public.sponsorship_opportunities drop constraint if exists sponsorship_opportunities_closed_check;
alter table public.sponsorship_opportunities add constraint sponsorship_opportunities_closed_check check (((status in ('open', 'draft')) = (closed_reason is null))
  and (closed_reason is null or closed_reason in ('deadline', 'decision')));

-- 2) rascunho é invisível para marcas e para o creator -----------------------------------------------------------------
create or replace function public.brand_sponsorship_ids_for(p_user uuid, p_calendar boolean)
returns uuid[] language sql stable security definer set search_path = '' as $$
  with brands_m as (
    select distinct bm.brand_id from public.brand_members bm where bm.user_id = p_user and bm.revoked_at is null),
  served as (
    select ab.agency_id, ab.brand_id from public.agency_brands ab join public.agencies a on a.id = ab.agency_id and a.status = 'active'
    where ab.status = 'active' and ab.brand_id in (select brand_id from brands_m))
  select coalesce(array_agg(distinct o.id), '{}'::uuid[])
  from public.sponsorship_opportunities o join served s on s.agency_id = o.agency_id
  where o.status <> 'draft'
    and (o.audience = 'all' or exists (select 1 from public.sponsorship_targets g where g.opportunity_id = o.id and g.brand_id = s.brand_id))
    and (not coalesce(p_calendar, false) or o.status = 'open'
         or (o.status = 'sponsored' and exists (select 1 from public.sponsorship_responses r where r.opportunity_id = o.id and r.brand_id = s.brand_id and r.outcome = 'won')))
$$;
revoke execute on function public.brand_sponsorship_ids_for(uuid, boolean) from public, anon, authenticated;
grant execute on function public.brand_sponsorship_ids_for(uuid, boolean) to service_role;

create or replace function public.sponsorship_brand_in_audience(p_opportunity uuid, p_brand uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sponsorship_opportunities o
                 join public.agency_brands ab on ab.agency_id = o.agency_id and ab.brand_id = p_brand and ab.status = 'active'
                 join public.agencies a on a.id = o.agency_id and a.status = 'active'
                 where o.id = p_opportunity and o.status <> 'draft'
                   and (o.audience = 'all' or exists (select 1 from public.sponsorship_targets g where g.opportunity_id = o.id and g.brand_id = p_brand)))
$$;
revoke execute on function public.sponsorship_brand_in_audience(uuid, uuid) from public, anon, authenticated;
grant execute on function public.sponsorship_brand_in_audience(uuid, uuid) to service_role;

drop policy if exists sponsorship_opportunities_select_talent on public.sponsorship_opportunities;
create policy sponsorship_opportunities_select_talent on public.sponsorship_opportunities for select to authenticated
  using (status <> 'draft' and talent_id = (select public.my_talent_id()));

drop policy if exists sponsorship_targets_select_brand on public.sponsorship_targets;
create policy sponsorship_targets_select_brand on public.sponsorship_targets for select to authenticated
  using (brand_id = any ((select public.my_brand_ids(false))::uuid[])
         and opportunity_id = any ((select public.my_brand_sponsorship_ids(false))::uuid[]));

-- evento da agenda: rascunho aparece só para a agência (marca e creator só depois de publicada)
create or replace function public.sponsorship_sync_event(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.sponsorship_opportunities%rowtype; v_name text; v_key text;
begin
  select * into o from public.sponsorship_opportunities where id = p_id;
  if o.id is null then return; end if;
  v_key := 'sponsorship:' || o.id::text;
  if o.status = 'cancelled' then
    delete from public.calendar_events e where e.agency_id = o.agency_id and e.source_key = v_key;
    return;
  end if;
  select t.display_name into v_name from public.talent_profiles t where t.id = o.talent_id;
  insert into public.calendar_events (agency_id, kind, title, subtitle, description, starts_at, ends_at, all_day, location, talent_id, sponsorship_id,
                                      source, source_key, visible_to_brand, visible_to_talent, created_by)
  values (o.agency_id, 'sponsorship', o.title, left(coalesce(v_name, ''), 160), left(o.description, 2000), o.starts_at, o.ends_at, o.all_day, o.location,
          o.talent_id, o.id, 'system', v_key, o.status <> 'draft', o.status <> 'draft', o.created_by)
  on conflict (agency_id, source_key) where source_key is not null do update set title = excluded.title, subtitle = excluded.subtitle,
    description = excluded.description, starts_at = excluded.starts_at, ends_at = excluded.ends_at, all_day = excluded.all_day,
    location = excluded.location, talent_id = excluded.talent_id,
    visible_to_brand = excluded.visible_to_brand, visible_to_talent = excluded.visible_to_talent;
end $$;
revoke execute on function public.sponsorship_sync_event(uuid) from public, anon, authenticated;
grant execute on function public.sponsorship_sync_event(uuid) to service_role;

-- 3) o Hero de uma ficha em json (interna) ------------------------------------------------------------------------------
-- p_brand = true (marca): a página do Hero (id, endereço, foto, chamada, nichos) só com consentimento vigente e Hero
-- ativo; sem isso, só o nome. p_brand = false (agência): sempre, mais o consentimento da ficha (active|revoked|none).
create or replace function public.sponsorship_hero_json(p_talent uuid, p_brand boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  with x as (
    select t.id as tid, t.display_name, c.id as cid, c.slug, c.avatar_url, c.headline, c.pillars, c.status as cstatus,
           (t.consent_at is not null and t.consent_revoked_at is null) as consent_ok,
           case when t.consent_at is not null and t.consent_revoked_at is null then 'active' when t.consent_revoked_at is not null then 'revoked' else 'none' end as consent
    from public.talent_profiles t left join public.creator_profiles c on c.id = t.creator_id where t.id = p_talent)
  select jsonb_strip_nulls(jsonb_build_object(
    'talent_id', tid, 'name', display_name,
    'has_hero', cid is not null,
    'hero_active', cid is not null and cstatus = 'active',
    'creator_id', case when cid is not null and cstatus = 'active' and (not p_brand or consent_ok) then cid end,
    'slug', case when cid is not null and cstatus = 'active' and (not p_brand or consent_ok) then slug end,
    'avatar_url', case when cid is not null and cstatus = 'active' and (not p_brand or consent_ok) then avatar_url end,
    'headline', case when cid is not null and cstatus = 'active' and (not p_brand or consent_ok) then headline end,
    'pillars', case when cid is not null and cstatus = 'active' and (not p_brand or consent_ok) then to_jsonb(coalesce(pillars, '{}'::public.pillar[])) else '[]'::jsonb end,
    'consent', case when not p_brand then consent end))
  from x
$$;
revoke execute on function public.sponsorship_hero_json(uuid, boolean) from public, anon, authenticated;
grant execute on function public.sponsorship_hero_json(uuid, boolean) to service_role;

-- 4) ficha do Hero escolhido (interna): reaproveita ou cria, com as regras da 0093 -------------------------------------
-- p_item: {kind:'talent', talent_id} | {kind:'hero', creator_id} | {kind:'typed', name, profile?, email?}. O chamador já
-- conferiu que o usuário é gestor+ da agência. Devolve a ficha e se foi criada agora.
create or replace function public.agency_hero_ficha(p_agency uuid, p_item jsonb, p_source text, p_ref text)
returns table (out_talent uuid, out_created boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text; v_talent uuid; v_creator uuid; v_created boolean := false; v_demo boolean; v_hero record; v_owner uuid;
  v_name text; v_profile text; v_email text;
begin
  if p_item is null or jsonb_typeof(p_item) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  v_demo := public.agency_is_demo(p_agency);
  v_kind := coalesce(p_item ->> 'kind', 'talent');

  if v_kind = 'talent' then
    begin v_talent := (p_item ->> 'talent_id')::uuid; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
    if not exists (select 1 from public.talent_profiles t where t.id = v_talent and t.agency_id = p_agency and t.archived_at is null) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;

  elsif v_kind = 'hero' then
    begin v_creator := (p_item ->> 'creator_id')::uuid; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
    -- só Hero ativo (suspenso e pendente não existem para a agência)
    select c.id, c.name, c.user_id into v_hero from public.creator_profiles c where c.id = v_creator and c.status = 'active';
    if v_hero.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    perform pg_advisory_xact_lock(hashtext('hero_casting:' || v_creator::text));
    v_owner := v_hero.user_id;
    if v_owner is not null then perform pg_advisory_xact_lock(hashtext('talent_person:' || v_owner::text)); end if;
    select t.id into v_talent from public.talent_profiles t where t.creator_id = v_creator and t.agency_id = p_agency and t.archived_at is null;
    if v_talent is null then
      -- D6: nenhum Hero real em agência inventada
      if v_demo then raise exception 'demo_locked' using errcode = 'P0001'; end if;
      if exists (select 1 from public.talent_profiles t where t.creator_id = v_creator) then raise exception 'creator_already_in_casting' using errcode = 'P0001'; end if;
      -- D10: a pessoa dona do Hero já tem ficha (login próprio sem página ou outro Hero dela num casting)
      if v_owner is not null and exists (
           select 1 from public.talent_profiles t left join public.creator_profiles c2 on c2.id = t.creator_id
           where t.user_id = v_owner or c2.user_id = v_owner) then
        raise exception 'user_has_talent' using errcode = 'P0001';
      end if;
      begin
        insert into public.talent_profiles (agency_id, creator_id, display_name, commercial_status, created_by)
        values (p_agency, v_creator, left(btrim(v_hero.name), 80), 'prospect', auth.uid())
        returning id into v_talent;
      exception when unique_violation then raise exception 'creator_already_in_casting' using errcode = 'P0001';
                when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
      end;
      v_created := true;
      perform public.audit_log('talent.create', 'talent', v_talent::text, null,
        jsonb_build_object('agency_id', p_agency, 'creator_id', v_creator, 'source', p_source, 'ref', p_ref), null,
        public.talent_audit_actor('agency', p_agency));
    end if;

  elsif v_kind = 'typed' then
    -- nome limpo: sem controle nem < >, espaços únicos, 2 a 80
    v_name := btrim(regexp_replace(regexp_replace(coalesce(p_item ->> 'name', ''), '[[:cntrl:]<>]', '', 'g'), '\s+', ' ', 'g'));
    if char_length(v_name) not between 2 and 80 then raise exception 'invalid_hero_name' using errcode = '22023'; end if;
    v_profile := nullif(btrim(coalesce(p_item ->> 'profile', '')), '');
    if v_profile is not null and not (v_profile ~ '^@[A-Za-z0-9._]{1,40}$' or (v_profile ~ '^https?://[^\s<>"'']{4,190}$' and char_length(v_profile) <= 200)) then
      raise exception 'invalid_profile_ref' using errcode = '22023';
    end if;
    v_email := nullif(lower(btrim(coalesce(p_item ->> 'email', ''))), '');
    if v_email is not null and not public.agency_email_ok(v_email) then raise exception 'invalid_email' using errcode = '22023'; end if;
    perform pg_advisory_xact_lock(hashtext('typed_talent:' || p_agency::text || ':' || lower(v_name)));
    select t.id into v_talent from public.talent_profiles t
    where t.agency_id = p_agency and t.archived_at is null and t.creator_id is null and lower(btrim(t.display_name)) = lower(v_name)
    order by t.created_at limit 1;
    if v_talent is null then
      if v_demo and (select count(*) from public.talent_profiles t where t.agency_id = p_agency) >= 20 then raise exception 'demo_limit' using errcode = 'P0001'; end if;
      begin
        insert into public.talent_profiles (agency_id, display_name, commercial_status, contact_email, internal_notes, is_demo, created_by)
        values (p_agency, v_name, 'prospect', v_email, coalesce('Perfil informado: ' || v_profile, ''), v_demo, auth.uid())
        returning id into v_talent;
      exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
      end;
      v_created := true;
      perform public.audit_log('talent.create', 'talent', v_talent::text, null,
        jsonb_build_object('agency_id', p_agency, 'source', p_source || '_typed', 'ref', p_ref), null,
        public.talent_audit_actor('agency', p_agency));
    end if;

  else
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  return query select v_talent, v_created;
end $$;
revoke execute on function public.agency_hero_ficha(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.agency_hero_ficha(uuid, jsonb, text, text) to service_role;

-- 5) busca de Heros para a oportunidade ---------------------------------------------------------------------------------
create or replace function public.agency_opportunity_hero_search(p_agency uuid, p_q text default '', p_limit int default 20, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_q text; v_like text; v_limit int; v_off int; v_rows jsonb; v_more boolean; v_demo boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_demo := public.agency_is_demo(p_agency);
  v_limit := greatest(1, least(coalesce(p_limit, 20), 50));
  v_off := greatest(0, least(coalesce(p_offset, 0), 5000));
  v_q := left(btrim(regexp_replace(coalesce(p_q, ''), '[[:cntrl:]]', '', 'g')), 60);
  v_like := '%' || replace(replace(replace(lower(public.f_unaccent(v_q)), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with casting as (
    -- fichas do casting (com Hero ativo ou sem Hero); Hero suspenso/pendente some
    select 'talent'::text as kind, t.id as talent_id, c.id as creator_id, c.slug, coalesce(c.name, t.display_name) as name, c.avatar_url, c.headline,
           coalesce(c.pillars, '{}'::public.pillar[]) as pillars, coalesce(c.socials, '{}'::jsonb) as socials,
           (select f.followers from public.creator_follower_counts f where f.creator_id = c.id) as followers,
           'casting'::text as scope,
           case when t.consent_at is not null and t.consent_revoked_at is null then 'active' when t.consent_revoked_at is not null then 'revoked' else 'none' end as consent,
           lower(public.f_unaccent(t.display_name)) as n1, lower(public.f_unaccent(coalesce(c.name, ''))) as n2, lower(coalesce(c.slug, '')) as n3
    from public.talent_profiles t left join public.creator_profiles c on c.id = t.creator_id
    where t.agency_id = p_agency and t.archived_at is null and (c.id is null or c.status = 'active')
  ), platform as (
    -- D6: a agência de demonstração não enxerga Heros reais
    select 'hero'::text as kind, null::uuid as talent_id, c.id as creator_id, c.slug, c.name, c.avatar_url, c.headline,
           coalesce(c.pillars, '{}'::public.pillar[]) as pillars, coalesce(c.socials, '{}'::jsonb) as socials,
           (select f.followers from public.creator_follower_counts f where f.creator_id = c.id) as followers,
           case
             when exists (select 1 from public.talent_profiles t where t.creator_id = c.id and t.archived_at is null) then 'other_agency'
             when c.user_id is not null and exists (
                    select 1 from public.talent_profiles t left join public.creator_profiles c2 on c2.id = t.creator_id
                    where t.archived_at is null and t.agency_id <> p_agency and (t.user_id = c.user_id or c2.user_id = c.user_id)) then 'other_agency'
             when c.user_id is not null and exists (
                    select 1 from public.talent_profiles t left join public.creator_profiles c2 on c2.id = t.creator_id
                    where t.archived_at is null and t.agency_id = p_agency and (t.user_id = c.user_id or c2.user_id = c.user_id)) then 'person_in_casting'
             else 'outside'
           end as scope,
           null::text as consent,
           lower(public.f_unaccent(c.name)) as n1, ''::text as n2, lower(c.slug) as n3
    from public.creator_profiles c
    where not v_demo and c.status = 'active'
      and not exists (select 1 from public.talent_profiles t where t.creator_id = c.id and t.agency_id = p_agency and t.archived_at is null)
  ), base as (
    select * from casting union all select * from platform
  ), filtered as (
    select b.* from base b
    where v_q = '' or b.n1 like v_like escape '\' or b.n2 like v_like escape '\' or b.n3 like v_like escape '\'
  ), ranked as (
    -- no casting primeiro, depois fora do casting, depois os indisponíveis; nome e id desempatam (paginação estável)
    select f.*, row_number() over (order by (case f.scope when 'casting' then 0 when 'outside' then 1 else 2 end), lower(coalesce(f.name, '')),
                                            coalesce(f.talent_id, f.creator_id)) as rn
    from filtered f
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', r.kind, 'talent_id', r.talent_id, 'creator_id', r.creator_id, 'slug', r.slug, 'name', r.name, 'avatar_url', r.avatar_url,
           'headline', r.headline, 'pillars', to_jsonb(r.pillars), 'followers', r.followers, 'scope', r.scope, 'consent', r.consent,
           'socials', jsonb_build_object('instagram', r.socials ->> 'instagram', 'youtube', r.socials ->> 'youtube', 'site', r.socials ->> 'site'))
         order by r.rn) filter (where r.rn > v_off and r.rn <= v_off + v_limit), '[]'::jsonb),
         coalesce(bool_or(r.rn > v_off + v_limit), false)
    into v_rows, v_more
  from ranked r where r.rn <= v_off + v_limit + 1;
  return jsonb_build_object('items', v_rows, 'has_more', v_more);
end $$;
revoke execute on function public.agency_opportunity_hero_search(uuid, text, int, int) from public, anon;
grant execute on function public.agency_opportunity_hero_search(uuid, text, int, int) to authenticated, service_role;

-- 6) criar/editar com Hero (MESMA assinatura da 0085/0088). p_data além das anteriores: hero {kind, ...} e publish (boolean).
create or replace function public.agency_sponsorship_save(p_agency uuid, p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_before public.sponsorship_opportunities%rowtype; v_id uuid := p_id; v_talent uuid; v_start timestamptz; v_end timestamptz; v_respond timestamptz;
        v_all_day boolean; v_title text; v_audience text; v_perks text[]; v_networks text[]; v_brands uuid[]; v_has_responses boolean := false;
        v_admin boolean; v_tiers jsonb; e jsonb; v_pos int := 0; v_tier_id uuid; v_keep uuid[] := '{}'::uuid[]; v_tname text; v_tperks text[];
        v_tslots int; v_tprice bigint; v_old public.sponsorship_tiers%rowtype; v_public jsonb;
        v_hero jsonb; v_publish boolean; v_status text; v_t record;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  v_admin := public.agency_can(p_agency, 'admin');
  if v_id is not null then
    select * into v_before from public.sponsorship_opportunities o where o.id = v_id and o.agency_id = p_agency for update;
    if v_before.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v_before.status not in ('draft', 'open') then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    v_has_responses := exists (select 1 from public.sponsorship_responses r where r.opportunity_id = v_id);
  end if;
  v_tiers := case when jsonb_typeof(p_data -> 'tiers') = 'array' then p_data -> 'tiers' end;
  if p_data ? 'tiers' and (v_tiers is null or jsonb_array_length(v_tiers) not between 1 and 3) then raise exception 'invalid_input' using errcode = '22023'; end if;
  begin
    v_talent := case when p_data ? 'talent_id' then nullif(btrim(coalesce(p_data ->> 'talent_id', '')), '')::uuid else v_before.talent_id end;
    v_start := coalesce(nullif(btrim(coalesce(p_data ->> 'starts_at', '')), '')::timestamptz, v_before.starts_at);
    v_end := coalesce(nullif(btrim(coalesce(p_data ->> 'ends_at', '')), '')::timestamptz, v_before.ends_at, v_start);
    v_respond := coalesce(nullif(btrim(coalesce(p_data ->> 'respond_by', '')), '')::timestamptz, v_before.respond_by);
    v_all_day := coalesce((p_data ->> 'all_day')::boolean, v_before.all_day, false);
    v_publish := case when p_data ? 'publish' and jsonb_typeof(p_data -> 'publish') <> 'null' then (p_data ->> 'publish')::boolean end;
    if v_tiers is not null then
      -- contrapartidas gerais = união das cotas (na ordem, sem repetir, até 10)
      select coalesce((array_agg(x order by f))[1:10], '{}'::text[]) into v_perks
      from (select distinct on (lower(btrim(x))) btrim(x) as x, (t.n * 100 + e2.m) as f
            from jsonb_array_elements(v_tiers) with ordinality t(v, n)
            cross join lateral jsonb_array_elements_text(coalesce(t.v -> 'perks', '[]'::jsonb)) with ordinality e2(x, m)
            where btrim(x) <> '' order by lower(btrim(x)), (t.n * 100 + e2.m)) s;
    elsif p_data ? 'perks' then
      select coalesce(array_agg(btrim(x) order by n), '{}'::text[]) into v_perks
      from jsonb_array_elements_text(p_data -> 'perks') with ordinality as e(x, n) where btrim(x) <> '';
    else v_perks := coalesce(v_before.perks, '{}'::text[]); end if;
    if p_data ? 'networks' then
      select coalesce(array_agg(distinct lower(btrim(x))), '{}'::text[]) into v_networks from jsonb_array_elements_text(p_data -> 'networks') x;
    else v_networks := coalesce(v_before.networks, '{}'::text[]); end if;
    if p_data ? 'brand_ids' then
      select coalesce(array_agg(distinct x::uuid), '{}'::uuid[]) into v_brands from jsonb_array_elements_text(p_data -> 'brand_ids') x where btrim(x) <> '';
    end if;
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  v_title := btrim(coalesce(p_data ->> 'title', v_before.title, ''));
  v_audience := coalesce(nullif(p_data ->> 'audience', ''), v_before.audience, 'all');
  -- público do evento (mesmos campos da campanha); ausente = mantém
  v_public := case when p_data ?| array['target_audience', 'target_age_bands', 'target_states', 'region_note'] then
    coalesce(public.sponsorship_audience_clean(jsonb_strip_nulls(jsonb_build_object('target_audience', p_data -> 'target_audience',
      'target_age_bands', p_data -> 'target_age_bands', 'target_states', p_data -> 'target_states', 'region_note', p_data -> 'region_note'))),
      '{}'::jsonb) end;
  -- Hero (0095): ficha do casting, Hero da plataforma fora do casting (a ficha nasce aqui) ou Hero digitado
  if p_data ? 'hero' and jsonb_typeof(p_data -> 'hero') <> 'null' then
    if jsonb_typeof(p_data -> 'hero') <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
    v_hero := p_data -> 'hero';
    select f.out_talent into v_talent from public.agency_hero_ficha(p_agency, v_hero, 'sponsorship', coalesce(v_id::text, 'new')) f;
  end if;
  -- situação final: criando, ausente = publica (formato antigo) e false = rascunho; rascunho publica com publish=true; aberta segue aberta
  v_status := case when v_before.id is null then (case when coalesce(v_publish, true) then 'open' else 'draft' end)
                   when v_before.status = 'open' then 'open'
                   when v_publish is true then 'open' else 'draft' end;
  if v_talent is null or v_start is null or v_respond is null or v_audience not in ('all', 'selected') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_has_responses and v_talent <> v_before.talent_id then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.talent_profiles t where t.id = v_talent and t.agency_id = p_agency and t.archived_at is null) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- CONSENTIMENTO: exigido para a oportunidade ficar visível às marcas (aberta); rascunho não precisa
  if v_status = 'open' then
    select (t.consent_at is not null and t.consent_revoked_at is null) as consent_ok, c.id as cid, c.status as cstatus into v_t
    from public.talent_profiles t left join public.creator_profiles c on c.id = t.creator_id where t.id = v_talent;
    if not v_t.consent_ok then raise exception 'consent_required' using errcode = 'P0001'; end if;
    if v_t.cid is not null and v_t.cstatus <> 'active' then raise exception 'hero_inactive' using errcode = 'P0001'; end if;
  end if;
  -- prazo para responder: no futuro (ao criar, ao mudar e ao publicar um rascunho)
  if (v_before.id is null or v_respond is distinct from v_before.respond_by or (v_before.status = 'draft' and v_status = 'open')) and v_respond <= now() then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  if v_respond > v_end then raise exception 'invalid_date' using errcode = '22023'; end if;
  if v_audience = 'selected' then
    if v_brands is null then
      select coalesce(array_agg(g.brand_id), '{}'::uuid[]) into v_brands from public.sponsorship_targets g where g.opportunity_id = v_id;
    end if;
    select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_brands
    from (select unnest(v_brands) as x union select r.brand_id from public.sponsorship_responses r where r.opportunity_id = v_id
          union select q.brand_id from public.sponsorship_proposals q where q.opportunity_id = v_id) s;
    if cardinality(v_brands) = 0 then raise exception 'invalid_input' using errcode = '22023'; end if;
    if exists (select 1 from unnest(v_brands) b where not exists (select 1 from public.agency_brands ab where ab.agency_id = p_agency and ab.brand_id = b and ab.status = 'active')) then
      raise exception 'brand_not_linked' using errcode = 'P0001';
    end if;
  end if;
  begin
    if v_id is null then
      insert into public.sponsorship_opportunities (agency_id, talent_id, title, description, location, starts_at, ends_at, all_day, expected_reach, perks, networks,
                                                    respond_by, audience, status, created_by)
      values (p_agency, v_talent, v_title, left(btrim(coalesce(p_data ->> 'description', '')), 2000), left(btrim(coalesce(p_data ->> 'location', '')), 200),
              v_start, v_end, v_all_day, btrim(coalesce(p_data ->> 'expected_reach', '')), v_perks, v_networks, v_respond, v_audience, v_status, auth.uid())
      returning id into v_id;
    else
      update public.sponsorship_opportunities set talent_id = v_talent, title = v_title,
        description = case when p_data ? 'description' then left(btrim(coalesce(p_data ->> 'description', '')), 2000) else description end,
        location = case when p_data ? 'location' then left(btrim(coalesce(p_data ->> 'location', '')), 200) else location end,
        starts_at = v_start, ends_at = v_end, all_day = v_all_day,
        expected_reach = case when p_data ? 'expected_reach' then btrim(coalesce(p_data ->> 'expected_reach', '')) else expected_reach end,
        perks = v_perks, networks = v_networks, respond_by = v_respond, audience = v_audience, status = v_status
      where id = v_id;
    end if;
    if v_public is not null then
      update public.sponsorship_opportunities set target_audience = coalesce(v_public ->> 'target_audience', ''),
        target_age_bands = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_public -> 'target_age_bands', '[]')) x), '{}'::text[]),
        target_states = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(v_public -> 'target_states', '[]')) x), '{}'::text[]),
        region_note = coalesce(v_public ->> 'region_note', '')
      where id = v_id;
    end if;
    -- cotas
    if v_tiers is not null then
      for e in select value from jsonb_array_elements(v_tiers) loop
        v_pos := v_pos + 1;
        if jsonb_typeof(e) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
        begin
          v_tier_id := nullif(btrim(coalesce(e ->> 'id', '')), '')::uuid;
          v_tname := regexp_replace(btrim(coalesce(e ->> 'name', '')), '\s+', ' ', 'g');
          select coalesce(array_agg(regexp_replace(btrim(x), '\s+', ' ', 'g') order by n), '{}'::text[]) into v_tperks
          from jsonb_array_elements_text(coalesce(e -> 'perks', '[]'::jsonb)) with ordinality q(x, n) where btrim(x) <> '';
          v_tslots := coalesce(nullif(btrim(coalesce(e ->> 'slots', '')), '')::int, 1);
          v_tprice := nullif(btrim(coalesce(e ->> 'price_cents', '')), '')::bigint;
        exception when others then raise exception 'invalid_input' using errcode = '22023';
        end;
        v_old := null;
        if v_tier_id is not null then
          select * into v_old from public.sponsorship_tiers t where t.id = v_tier_id and t.opportunity_id = v_id for update;
          if v_old.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
          -- vagas não descem abaixo dos acordos já fechados
          if v_tslots < public.sponsorship_tier_agreed(v_old.id) then raise exception 'invalid_state' using errcode = 'P0001'; end if;
          update public.sponsorship_tiers set position = v_pos, name = v_tname, perks = v_tperks, slots = v_tslots,
            price_cents = case when v_admin then v_tprice else price_cents end,
            price_updated_by = case when v_admin and v_tprice is distinct from price_cents then auth.uid() else price_updated_by end,
            price_updated_at = case when v_admin and v_tprice is distinct from price_cents then now() else price_updated_at end
          where id = v_old.id;
        else
          insert into public.sponsorship_tiers (opportunity_id, agency_id, position, name, price_cents, perks, slots, price_updated_by, price_updated_at)
          values (v_id, p_agency, v_pos, v_tname, case when v_admin then v_tprice end, v_tperks, v_tslots,
                  case when v_admin and v_tprice is not null then auth.uid() end, case when v_admin and v_tprice is not null then now() end)
          returning id into v_tier_id;
        end if;
        v_keep := v_keep || v_tier_id;
      end loop;
      -- cota com proposta (de qualquer situação) não sai
      if exists (select 1 from public.sponsorship_tiers t where t.opportunity_id = v_id and not (t.id = any (v_keep))
                 and exists (select 1 from public.sponsorship_proposals q where q.tier_id = t.id)) then
        raise exception 'invalid_state' using errcode = 'P0001';
      end if;
      delete from public.sponsorship_tiers t where t.opportunity_id = v_id and not (t.id = any (v_keep));
    elsif not exists (select 1 from public.sponsorship_tiers t where t.opportunity_id = v_id) then
      insert into public.sponsorship_tiers (opportunity_id, agency_id, position, name, perks, slots) values (v_id, p_agency, 1, 'Cota única', v_perks, 1);
    end if;
  exception when check_violation or not_null_violation or unique_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  if v_audience = 'selected' then
    delete from public.sponsorship_targets g where g.opportunity_id = v_id and not (g.brand_id = any (v_brands));
    insert into public.sponsorship_targets (opportunity_id, brand_id, agency_id) select v_id, b, p_agency from unnest(v_brands) b
    on conflict (opportunity_id, brand_id) do nothing;
  else
    delete from public.sponsorship_targets g where g.opportunity_id = v_id;
  end if;
  perform public.sponsorship_sync_event(v_id);
  perform public.audit_log('sponsorship.save', 'sponsorship', v_id::text,
    case when v_before.id is null then null else jsonb_build_object('agency_id', p_agency, 'talent_id', v_before.talent_id, 'starts_at', v_before.starts_at,
      'respond_by', v_before.respond_by, 'audience', v_before.audience) end,
    jsonb_build_object('agency_id', p_agency, 'talent_id', v_talent, 'starts_at', v_start, 'respond_by', v_respond, 'audience', v_audience,
      'brands', case when v_audience = 'selected' then to_jsonb(v_brands) else null end,
      'tiers', (select count(*) from public.sponsorship_tiers t where t.opportunity_id = v_id), 'status', v_status), null,
    public.talent_audit_actor('agency', p_agency));
  if v_status = 'open' and (v_before.id is null or v_before.status = 'draft') then
    perform public.audit_log('sponsorship.publish', 'sponsorship', v_id::text, null, jsonb_build_object('agency_id', p_agency, 'talent_id', v_talent), null,
      public.talent_audit_actor('agency', p_agency));
  end if;
  perform public.sponsorship_notify_audience(v_id);
  return v_id;
end $$;

-- 7) publicar um rascunho ----------------------------------------------------------------------------------------------
create or replace function public.agency_sponsorship_publish(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.sponsorship_opportunities%rowtype; v_t record;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into o from public.sponsorship_opportunities where id = p_id for update;
  if o.id is null or not public.agency_can(o.agency_id, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(o.agency_id, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if o.status <> 'draft' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  select (t.consent_at is not null and t.consent_revoked_at is null) as consent_ok, c.id as cid, c.status as cstatus, t.archived_at into v_t
  from public.talent_profiles t left join public.creator_profiles c on c.id = t.creator_id where t.id = o.talent_id;
  if v_t.archived_at is not null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not v_t.consent_ok then raise exception 'consent_required' using errcode = 'P0001'; end if;
  if v_t.cid is not null and v_t.cstatus <> 'active' then raise exception 'hero_inactive' using errcode = 'P0001'; end if;
  if o.respond_by <= now() then raise exception 'invalid_date' using errcode = '22023'; end if;
  update public.sponsorship_opportunities set status = 'open' where id = p_id;
  perform public.sponsorship_sync_event(p_id);
  perform public.audit_log('sponsorship.publish', 'sponsorship', p_id::text, null,
    jsonb_build_object('agency_id', o.agency_id, 'talent_id', o.talent_id), null, public.talent_audit_actor('agency', o.agency_id));
  perform public.sponsorship_notify_audience(p_id);
end $$;
revoke execute on function public.agency_sponsorship_publish(uuid) from public, anon;
grant execute on function public.agency_sponsorship_publish(uuid) to authenticated, service_role;

-- 8) decidir (MESMA assinatura): rascunho só se descarta
create or replace function public.agency_sponsorship_decide(p_id uuid, p_action text, p_brands uuid[], p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.sponsorship_opportunities%rowtype; v_note text := btrim(coalesce(p_note, '')); v_winners uuid[]; v_agreed uuid[]; v_action text := p_action;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into o from public.sponsorship_opportunities where id = p_id for update;
  if o.id is null or not public.agency_can(o.agency_id, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(o.agency_id, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('sponsor', 'close', 'cancel') or char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  -- rascunho (0095): ninguém viu, então só se descarta (cancela), sem avisos
  if o.status = 'draft' then
    if p_action <> 'cancel' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    update public.sponsorship_opportunities set status = 'cancelled', closed_reason = 'decision', decided_at = now(), decided_by = auth.uid(),
      decision_note = left(v_note, 500) where id = p_id;
    perform public.sponsorship_sync_event(p_id);
    perform public.audit_log('sponsorship.decide', 'sponsorship', p_id::text, jsonb_build_object('agency_id', o.agency_id, 'status', 'draft'),
      jsonb_build_object('agency_id', o.agency_id, 'status', 'cancelled'), nullif(v_note, ''), public.talent_audit_actor('agency', o.agency_id));
    return;
  end if;
  if o.status not in ('open', 'closed') or o.decided_at is not null then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  select coalesce(array_agg(distinct q.brand_id), '{}'::uuid[]) into v_agreed from public.sponsorship_proposals q where q.opportunity_id = p_id and q.status = 'agreed';
  if p_action = 'cancel' and cardinality(v_agreed) > 0 then raise exception 'has_agreement' using errcode = 'P0001'; end if;
  select coalesce(array_agg(distinct b), '{}'::uuid[]) into v_winners from unnest(coalesce(p_brands, '{}'::uuid[]) || v_agreed) b;
  if p_action = 'close' and cardinality(v_agreed) > 0 then v_action := 'sponsor'; v_winners := v_agreed; end if;
  if v_action = 'sponsor' then
    if cardinality(v_winners) = 0 then raise exception 'invalid_input' using errcode = '22023'; end if;
    if exists (select 1 from unnest(v_winners) b where not exists (select 1 from public.sponsorship_responses x where x.opportunity_id = p_id and x.brand_id = b and x.response = 'interested')) then
      raise exception 'not_interested' using errcode = 'P0001';
    end if;
  else
    v_winners := '{}'::uuid[];
  end if;
  perform public.sponsorship_close_out(p_id, v_action, v_winners, v_note, public.talent_audit_actor('agency', o.agency_id));
end $$;

-- 9) leituras com o Hero (MESMAS assinaturas)
create or replace function public.agency_sponsorships(p_agency uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.agency_can(p_agency, 'manager') then raise exception 'not_found' using errcode = 'P0002'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'talent_id', o.talent_id, 'talent_name', t.display_name, 'hero', public.sponsorship_hero_json(o.talent_id, false),
      'starts_at', o.starts_at, 'ends_at', o.ends_at, 'all_day', o.all_day, 'location', o.location, 'respond_by', o.respond_by,
      'status', o.status, 'closed_reason', o.closed_reason, 'audience', o.audience, 'decided_at', o.decided_at,
      'audience_count', (select count(*) from public.sponsorship_audience_brands(o.id)),
      'interested', (select count(*) from public.sponsorship_responses r where r.opportunity_id = o.id and r.response = 'interested'),
      'declined', (select count(*) from public.sponsorship_responses r where r.opportunity_id = o.id and r.response = 'declined'),
      'negotiating', (select count(*) from public.sponsorship_proposals q where q.opportunity_id = o.id and q.status = 'open'),
      'awaiting_agency', (select count(*) from public.sponsorship_proposals q where q.opportunity_id = o.id and q.status = 'open' and q.awaiting = 'agency'),
      'agreed', (select count(*) from public.sponsorship_proposals q where q.opportunity_id = o.id and q.status = 'agreed'),
      'tiers', (select count(*) from public.sponsorship_tiers z where z.opportunity_id = o.id),
      'missing_price', (select count(*) from public.sponsorship_tiers z where z.opportunity_id = o.id and z.price_cents is null),
      'winners', (select coalesce(jsonb_agg(b.name order by b.name), '[]'::jsonb) from public.sponsorship_responses r join public.brands b on b.id = r.brand_id
                  where r.opportunity_id = o.id and r.outcome = 'won'))
    order by (o.status = 'open') desc, (o.status = 'draft') desc, o.starts_at desc), '[]'::jsonb)
    from public.sponsorship_opportunities o join public.talent_profiles t on t.id = o.talent_id
    where o.agency_id = p_agency);
end $$;

create or replace function public.agency_sponsorship_detail(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o public.sponsorship_opportunities%rowtype; v_admin boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into o from public.sponsorship_opportunities where id = p_id;
  if o.id is null or not public.agency_can(o.agency_id, 'manager') then raise exception 'not_found' using errcode = 'P0002'; end if;
  v_admin := public.agency_can(o.agency_id, 'admin');
  return jsonb_build_object(
    'can_values', v_admin,
    'opportunity', jsonb_build_object('id', o.id, 'agency_id', o.agency_id, 'talent_id', o.talent_id,
      'talent_name', (select t.display_name from public.talent_profiles t where t.id = o.talent_id),
      'hero', public.sponsorship_hero_json(o.talent_id, false),
      'title', o.title, 'description', o.description, 'location', o.location, 'starts_at', o.starts_at, 'ends_at', o.ends_at, 'all_day', o.all_day,
      'expected_reach', o.expected_reach, 'perks', to_jsonb(o.perks), 'networks', to_jsonb(o.networks), 'respond_by', o.respond_by,
      'audience', o.audience, 'status', o.status, 'closed_reason', o.closed_reason, 'decision_note', o.decision_note, 'decided_at', o.decided_at,
      'decided_label', (select m.display_name from public.agency_members m where m.agency_id = o.agency_id and m.user_id = o.decided_by),
      'created_at', o.created_at, 'public', public.sponsorship_public_json(o.id),
      'target_ids', (select coalesce(jsonb_agg(g.brand_id), '[]'::jsonb) from public.sponsorship_targets g where g.opportunity_id = o.id)),
    'tiers', (select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'position', z.position, 'name', z.name, 'perks', to_jsonb(z.perks), 'slots', z.slots,
        'price_cents', case when v_admin then z.price_cents end, 'has_price', z.price_cents is not null,
        'agreed', public.sponsorship_tier_agreed(z.id),
        'has_proposals', exists (select 1 from public.sponsorship_proposals q where q.tier_id = z.id)) order by z.position), '[]'::jsonb)
      from public.sponsorship_tiers z where z.opportunity_id = o.id),
    'proposals', (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'brand_id', q.brand_id, 'brand_name', b.name, 'tier_id', q.tier_id,
        'tier_name', z.name, 'status', q.status, 'awaiting', q.awaiting, 'perks', to_jsonb(q.perks), 'rounds', q.rounds,
        'asked_cents', case when v_admin then q.asked_cents end, 'amount_cents', case when v_admin then q.amount_cents end,
        'agreed_cents', case when v_admin then q.agreed_cents end, 'agreed_perks', to_jsonb(q.agreed_perks), 'agreed_side', q.agreed_side,
        'agreed_at', q.agreed_at, 'ended_at', q.ended_at, 'end_reason', q.end_reason, 'sent_at', q.sent_at, 'request_id', q.request_id,
        'history', public.sponsorship_rounds_json(q.id, v_admin, true))
      order by (q.status = 'open' and q.awaiting = 'agency') desc, (q.status = 'open') desc, q.sent_at desc), '[]'::jsonb)
      from public.sponsorship_proposals q join public.brands b on b.id = q.brand_id join public.sponsorship_tiers z on z.id = q.tier_id
      where q.opportunity_id = o.id and q.sent_at is not null),
    'brands', (select coalesce(jsonb_agg(jsonb_build_object('brand_id', b.id, 'name', b.name, 'response', r.response, 'message', coalesce(r.message, ''),
        'responded_label', coalesce(r.responded_label, ''), 'responded_at', r.responded_at, 'outcome', r.outcome, 'request_id', r.request_id,
        'request_status', c.status, 'deal_id', d.id)
      order by case r.response when 'interested' then 0 when 'declined' then 2 else 1 end, r.responded_at, b.name), '[]'::jsonb)
      from (select distinct x as brand_id from public.sponsorship_audience_brands(o.id) x) s
      join public.brands b on b.id = s.brand_id
      left join public.sponsorship_responses r on r.opportunity_id = o.id and r.brand_id = b.id
      left join public.campaign_requests c on c.id = r.request_id
      left join public.deals d on d.request_id = c.id));
end $$;

create or replace function public.brand_sponsorships(p_brand uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if public.brand_member_of(p_brand) is null and not public.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'description', o.description, 'location', o.location,
      'starts_at', o.starts_at, 'ends_at', o.ends_at, 'all_day', o.all_day, 'expected_reach', o.expected_reach, 'perks', to_jsonb(o.perks),
      'networks', to_jsonb(o.networks), 'respond_by', o.respond_by, 'public', public.sponsorship_public_json(o.id),
      'status', case when o.status = 'cancelled' then 'cancelled'
                     when r.outcome = 'won' then 'won'
                     when o.status in ('sponsored', 'closed') then 'closed'
                     when o.respond_by < now() then 'expired' else 'open' end,
      'agency_name', (select a.name from public.agencies a where a.id = o.agency_id),
      'timezone', (select a.timezone from public.agencies a where a.id = o.agency_id),
      'talent', (select jsonb_build_object('id', t.id, 'name', t.display_name, 'in_catalog', public.talent_brand_card_ok(t.id, o.agency_id),
                   'photo_url', case when public.talent_brand_card_ok(t.id, o.agency_id) then public.talent_public_card(t.id) ->> 'photo_url' end)
                 from public.talent_profiles t where t.id = o.talent_id),
      'hero', public.sponsorship_hero_json(o.talent_id, true),
      'tiers', (select coalesce(jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'price_cents', z.price_cents, 'perks', to_jsonb(z.perks),
                  'slots', z.slots, 'full', public.sponsorship_tier_agreed(z.id) >= z.slots) order by z.position), '[]'::jsonb)
                from public.sponsorship_tiers z where z.opportunity_id = o.id),
      'negotiation', (select jsonb_build_object('id', q.id, 'status', q.status, 'awaiting', q.awaiting, 'tier_name', z.name,
                        'pending_owner', exists (select 1 from public.sponsorship_rounds x where x.proposal_id = q.id and x.state = 'pending_owner'))
                      from public.sponsorship_proposals q join public.sponsorship_tiers z on z.id = q.tier_id
                      where q.opportunity_id = o.id and q.brand_id = p_brand order by (q.status in ('draft', 'open', 'agreed')) desc, q.created_at desc limit 1),
      'my_response', case when r.id is null then null else jsonb_build_object('response', r.response, 'message', r.message, 'responded_label', r.responded_label,
        'responded_at', r.responded_at, 'request_id', r.request_id, 'outcome', r.outcome) end)
    order by (o.status = 'open' and o.respond_by >= now()) desc, o.starts_at), '[]'::jsonb)
    from public.sponsorship_opportunities o
    left join public.sponsorship_responses r on r.opportunity_id = o.id and r.brand_id = p_brand
    where public.sponsorship_brand_in_audience(o.id, p_brand) or r.id is not null);
end $$;

create or replace function public.talent_sponsorships()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_talent uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_talent := public.my_talent_id();
  if v_talent is null then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'location', o.location, 'starts_at', o.starts_at, 'ends_at', o.ends_at,
      'all_day', o.all_day, 'respond_by', o.respond_by, 'status', o.status, 'expected_reach', o.expected_reach, 'perks', to_jsonb(o.perks),
      'public', public.sponsorship_public_json(o.id),
      'sponsors', (select coalesce(jsonb_agg(b.name order by b.name), '[]'::jsonb)
                   from public.sponsorship_responses r join public.brands b on b.id = r.brand_id where r.opportunity_id = o.id and r.outcome = 'won'),
      'agreements', (select coalesce(jsonb_agg(jsonb_build_object('brand', b.name, 'tier', z.name, 'perks', to_jsonb(q.agreed_perks)) order by q.agreed_at), '[]'::jsonb)
                     from public.sponsorship_proposals q join public.brands b on b.id = q.brand_id join public.sponsorship_tiers z on z.id = q.tier_id
                     where q.opportunity_id = o.id and q.status = 'agreed'))
    order by o.starts_at desc), '[]'::jsonb)
    from public.sponsorship_opportunities o where o.talent_id = v_talent and o.status not in ('cancelled', 'draft'));
end $$;

-- 10) execução ------------------------------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array['public.agency_sponsorship_save(uuid, uuid, jsonb)', 'public.agency_sponsorship_decide(uuid, text, uuid[], text)',
                           'public.agency_sponsorships(uuid)', 'public.agency_sponsorship_detail(uuid)', 'public.brand_sponsorships(uuid)',
                           'public.talent_sponsorships()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
