-- 0073 · Admin geral também gerencia os heróis no portal da agência (/agencia/herois).
-- Idempotente (create or replace). Corrige a 0070: escolher, criar e editar o herói pelo portal da agência
-- exigiam ser membro da agência; o admin geral (is_platform_admin, como em agency_can) recebia "forbidden".

create or replace function public.agency_act_as_hero(p_creator uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.creator_profiles%rowtype;
begin
  if auth.uid() is null or not (public.is_platform_admin() or p_creator = any (public.agency_hero_ids())) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.creator_profiles where id = p_creator and status = 'active';
  if not found then raise exception 'not_found'; end if;
  perform public.audit_log('hero_act.select', 'creator_profile', c.id::text, null,
    jsonb_build_object('acting_creator', c.id, 'slug', c.slug, 'name', c.name, 'by', 'agency'), null, 'creator');
  return jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'avatar_url', c.avatar_url);
end $$;

create or replace function public.agency_create_hero(p_agency uuid, p_name text, p_slug text, p_pillars public.pillar[], p_headline text, p_bio text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_agency public.agencies%rowtype; v_id uuid;
begin
  if auth.uid() is null or not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_agency from public.agencies where id = p_agency;
  if v_agency.is_demo then raise exception 'demo_locked'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 80 then raise exception 'invalid_input'; end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_slug) > 60 then raise exception 'invalid_input'; end if;
  if p_pillars is null or cardinality(p_pillars) not between 1 and 4 then raise exception 'invalid_input'; end if;
  if exists (select 1 from public.creator_profiles where slug = p_slug) then raise exception 'duplicate_slug'; end if;
  perform set_config('app.trusted', 'on', true);
  insert into public.creator_profiles (slug, name, headline, bio, pillars, is_fictional, rights_status, rights_holder, status)
  values (p_slug, btrim(p_name), nullif(btrim(coalesce(p_headline, '')), ''), nullif(btrim(coalesce(p_bio, '')), ''),
          p_pillars, false, 'authorized', v_agency.name, 'active')
  returning id into v_id;
  insert into public.talent_profiles (agency_id, creator_id, display_name, commercial_status, created_by)
  values (p_agency, v_id, btrim(p_name), 'active', auth.uid());
  perform set_config('app.trusted', 'off', true);
  perform public.audit_log('agency.hero.create', 'creator_profile', v_id::text, null,
    jsonb_build_object('agency', p_agency, 'slug', p_slug, 'name', btrim(p_name)), null, 'creator');
  return v_id;
end $$;

create or replace function public.agency_update_hero(p_creator uuid, p_name text, p_pillars public.pillar[], p_headline text, p_bio text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not (public.is_platform_admin() or p_creator = any (public.agency_hero_ids())) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 80 then raise exception 'invalid_input'; end if;
  if p_pillars is null or cardinality(p_pillars) not between 1 and 4 then raise exception 'invalid_input'; end if;
  if char_length(coalesce(p_headline, '')) > 160 or char_length(coalesce(p_bio, '')) > 2000 then raise exception 'invalid_input'; end if;
  perform set_config('app.trusted', 'on', true);
  update public.creator_profiles
     set name = btrim(p_name), pillars = p_pillars,
         headline = nullif(btrim(coalesce(p_headline, '')), ''), bio = nullif(btrim(coalesce(p_bio, '')), '')
   where id = p_creator;
  update public.talent_profiles set display_name = btrim(p_name) where creator_id = p_creator;
  perform set_config('app.trusted', 'off', true);
  perform public.audit_log('agency.hero.update', 'creator_profile', p_creator::text, null,
    jsonb_build_object('name', btrim(p_name)), null, 'creator');
end $$;
