-- 0070 · A agência publica pelos heróis que representa.
-- Idempotente (create or replace). Depende da 0045 (agir pelo herói), 0064 (agências) e 0065 (talentos).
--
-- Decisão do responsável (31/10/2026): o Groscove Ultra é plataforma intermediária, como uma rede social.
-- A agência se cadastra (convite), aceita os Termos do Parceiro e gerencia os perfis dos heróis com quem
-- tem contrato: cria o perfil, troca foto e capa e publica posts em nome deles. Os contratos ficam com a
-- agência (Termos do Parceiro, "Guarda dos contratos").
--
-- Desenho: o mesmo cabeçalho x-acting-hero da 0045. acting_hero_id() passa a honrá-lo também para gestor
-- ou administrador de agência ativa, SÓ para heróis ligados a ela (talent_profiles.agency_id + creator_id,
-- talento não arquivado). Tudo o que já confere "herói dono" via my_creator_id() (posts, rascunhos,
-- publicação, vídeos) vale para a agência sem variantes novas. Ficam só do admin: receitas (o Storage não
-- recebe o cabeçalho; 0045), módulo Conteúdos do admin, direitos, categorias e vínculos com produtos.
--
-- Novas RPCs: agency_create_hero (cria perfil + talento ligado), agency_update_hero (nome, chamada, bio,
-- pilares), agency_act_as_hero (escolha auditada), hero_avatar_set (foto do herói escolhido).
-- A capa usa as RPCs da 0042: hero_cover_active_creator passa a devolver primeiro o herói escolhido.

-- 1) heróis da agência de quem chama (gestor+) -------------------------------------------------------------
create or replace function public.agency_hero_ids()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(t.creator_id), '{}'::uuid[])
  from public.talent_profiles t
  where t.creator_id is not null and t.archived_at is null and not t.is_demo
    and t.agency_id = any (public.my_agency_ids('manager'))
$$;
revoke execute on function public.agency_hero_ids() from public, anon;
grant execute on function public.agency_hero_ids() to authenticated, service_role;

-- 2) herói em nome de quem se age: admin (qualquer herói ativo) ou agência (só os dela) -------------------
create or replace function public.acting_hero_id()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_headers text; v_raw text; v_id uuid;
begin
  v_headers := nullif(current_setting('request.headers', true), '');
  if v_headers is null or position('x-acting-hero' in v_headers) = 0 then return null; end if;
  begin
    v_raw := v_headers::json ->> 'x-acting-hero';
  exception when others then
    return null;
  end;
  -- regex completa antes do cast: valor estranho não vira erro 22P02
  if v_raw is null or v_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  if not (public.is_admin() or v_raw::uuid = any (public.agency_hero_ids())) then return null; end if;
  select c.id into v_id from public.creator_profiles c where c.id = v_raw::uuid and c.status = 'active';
  return v_id;
end $$;
revoke execute on function public.acting_hero_id() from public, anon;
grant execute on function public.acting_hero_id() to authenticated, service_role;

-- auditoria das escritas em nome do herói: o tipo de ator segue quem age (admin ou agência)
create or replace function public.acting_hero_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_acting uuid; v_row jsonb; v_old jsonb; v_actor public.actor_type;
begin
  v_acting := public.acting_hero_id();
  if v_acting is null then return null; end if;
  v_actor := case when public.is_admin() then 'admin' else 'creator' end;
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  if tg_table_name = 'content' then
    if tg_op = 'UPDATE' and old.status is not distinct from new.status and old.review_status is not distinct from new.review_status
       and old.publish_at is not distinct from new.publish_at and old.creator_id is not distinct from new.creator_id then
      return null;
    end if;
    perform public.audit_log('hero_act.content.' || lower(tg_op), 'content', v_row ->> 'id',
      case when v_old is null then null else jsonb_build_object('status', v_old -> 'status', 'review_status', v_old -> 'review_status', 'publish_at', v_old -> 'publish_at', 'creator_id', v_old -> 'creator_id') end,
      jsonb_build_object('acting_creator', v_acting, 'type', v_row -> 'type', 'title', v_row -> 'title', 'status', v_row -> 'status',
                         'review_status', v_row -> 'review_status', 'publish_at', v_row -> 'publish_at', 'creator_id', v_row -> 'creator_id'),
      null, v_actor);
  else
    perform public.audit_log('hero_act.' || tg_table_name || '.' || lower(tg_op), tg_table_name, v_row ->> 'id', null,
      jsonb_build_object('acting_creator', v_acting, 'content_id', v_row -> 'content_id', 'product_id', v_row -> 'product_id', 'status', v_row -> 'status'),
      null, v_actor);
  end if;
  return null;
end $$;
revoke execute on function public.acting_hero_audit() from public, anon;
grant execute on function public.acting_hero_audit() to authenticated, service_role;

-- 3) escolher o herói (agência; o admin segue com admin_act_as_hero) -----------------------------------------
create or replace function public.agency_act_as_hero(p_creator uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.creator_profiles%rowtype;
begin
  if auth.uid() is null or not (p_creator = any (public.agency_hero_ids())) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.creator_profiles where id = p_creator and status = 'active';
  if not found then raise exception 'not_found'; end if;
  perform public.audit_log('hero_act.select', 'creator_profile', c.id::text, null,
    jsonb_build_object('acting_creator', c.id, 'slug', c.slug, 'name', c.name, 'by', 'agency'), null, 'creator');
  return jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'avatar_url', c.avatar_url);
end $$;
revoke execute on function public.agency_act_as_hero(uuid) from public, anon;
grant execute on function public.agency_act_as_hero(uuid) to authenticated, service_role;

-- 4) criar e editar o perfil do herói (gestor+ da agência, fora da agência de demonstração) ------------------
create or replace function public.agency_create_hero(p_agency uuid, p_name text, p_slug text, p_pillars public.pillar[], p_headline text, p_bio text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_agency public.agencies%rowtype; v_id uuid;
begin
  if auth.uid() is null or not (p_agency = any (public.my_agency_ids('manager'))) then raise exception 'forbidden' using errcode = '42501'; end if;
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
revoke execute on function public.agency_create_hero(uuid, text, text, public.pillar[], text, text) from public, anon;
grant execute on function public.agency_create_hero(uuid, text, text, public.pillar[], text, text) to authenticated, service_role;

create or replace function public.agency_update_hero(p_creator uuid, p_name text, p_pillars public.pillar[], p_headline text, p_bio text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not (p_creator = any (public.agency_hero_ids())) then raise exception 'forbidden' using errcode = '42501'; end if;
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
revoke execute on function public.agency_update_hero(uuid, text, public.pillar[], text, text) from public, anon;
grant execute on function public.agency_update_hero(uuid, text, public.pillar[], text, text) to authenticated, service_role;

-- 5) capa: o herói escolhido vale primeiro (as RPCs da 0042 chamam esta função por dentro) ------------------
create or replace function public.hero_cover_active_creator(p_uid uuid)
returns uuid language sql stable set search_path = public as $$
  select coalesce(
    public.acting_hero_id(),
    (select c.id from public.creator_profiles c
      where c.user_id = p_uid and c.status = 'active'
        and exists (select 1 from public.role_assignments r where r.user_id = p_uid and r.role in ('creator', 'admin') and r.revoked_at is null)
      limit 1))
$$;
revoke execute on function public.hero_cover_active_creator(uuid) from public, anon, authenticated;
grant execute on function public.hero_cover_active_creator(uuid) to service_role;

-- 6) foto do herói escolhido: envio do próprio usuário no bucket avatars (0031), aplicado só no herói ---------
create or replace function public.hero_avatar_set(p_url text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_creator uuid; v_path text; v_prev text; v_stored boolean := true;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.acting_hero_id();
  if v_creator is null then raise exception 'not_a_hero' using errcode = '42501'; end if;
  if p_url is null or length(p_url) > 300
     or p_url !~ '^https?://[^/\s?#]+/storage/v1/object/public/avatars/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$' then
    raise exception 'invalid_path';
  end if;
  v_path := substring(p_url from '/avatars/(.*)$');
  if not exists (select 1 from public.avatar_uploads u where u.path = v_path and u.user_id = v_uid and u.deleted_at is null) then
    raise exception 'invalid_path';
  end if;
  if to_regclass('storage.objects') is not null then
    execute 'select exists (select 1 from storage.objects where bucket_id = ''avatars'' and name = $1)' into v_stored using v_path;
    if not v_stored then raise exception 'invalid_path'; end if;
  end if;
  select avatar_url into v_prev from public.creator_profiles where id = v_creator;
  perform set_config('app.trusted', 'on', true);
  update public.creator_profiles set avatar_url = p_url where id = v_creator and avatar_url is distinct from p_url;
  perform set_config('app.trusted', 'off', true);
  return case when v_prev is distinct from p_url then v_prev end;
end $$;
revoke execute on function public.hero_avatar_set(text) from public, anon;
grant execute on function public.hero_avatar_set(text) to authenticated, service_role;

-- tirar a foto do herói escolhido (o objeto sem referência sai na limpeza diária da 0031)
create or replace function public.hero_avatar_clear()
returns text language plpgsql security definer set search_path = public as $$
declare v_creator uuid; v_prev text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.acting_hero_id();
  if v_creator is null then raise exception 'not_a_hero' using errcode = '42501'; end if;
  select avatar_url into v_prev from public.creator_profiles where id = v_creator;
  perform set_config('app.trusted', 'on', true);
  update public.creator_profiles set avatar_url = null where id = v_creator and avatar_url is not null;
  perform set_config('app.trusted', 'off', true);
  return v_prev;
end $$;
revoke execute on function public.hero_avatar_clear() from public, anon;
grant execute on function public.hero_avatar_clear() to authenticated, service_role;
