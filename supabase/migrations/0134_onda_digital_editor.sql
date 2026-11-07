-- =============================================================================
-- 0134 — Onda Digital: a Groscove edita a página (07/11/2026, autorizado pelo responsável).
--
-- Decisões:
--   • Quem edita: gestor ou acima da Groscove (e o admin geral). A equipe só consulta.
--   • Seguidores: atualizar o número, tirar ou devolver uma página à lista e adicionar uma página nova (Instagram ou
--     X), com a foto (enviada pelo servidor ao bucket público onda-assets). As páginas aparecem por número de
--     seguidores, do maior para o menor (como na apresentação), e a nota "*Número de seguidores…" mostra o mês da
--     última atualização de cada rede.
--   • Cases: marca, área, frase, números (alcance total, impressões totais, impactos, alcance feed), ordem e se aparece;
--     o logo vem da marca do universo com o mesmo nome. Dá para apagar.
--   • Ondas: nome, alcance ("5 páginas"…), frase, ordem e se aparece. Não se apagam (os pedidos guardam a onda
--     escolhida); tirar da página basta.
-- =============================================================================

alter table public.onda_profiles add column if not exists updated_at timestamptz not null default now();
alter table public.onda_profiles add column if not exists updated_by uuid references auth.users (id) on delete set null;
alter table public.onda_cases add column if not exists updated_at timestamptz not null default now();
alter table public.onda_cases add column if not exists updated_by uuid references auth.users (id) on delete set null;
alter table public.onda_packages add column if not exists updated_at timestamptz not null default now();
alter table public.onda_packages add column if not exists updated_by uuid references auth.users (id) on delete set null;

create or replace function public.onda_admin_can()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (public.is_platform_admin()
    or (public.groscove_agency_id() is not null and public.agency_can(public.groscove_agency_id(), 'manager')))
$$;
revoke execute on function public.onda_admin_can() from public, anon;
grant execute on function public.onda_admin_can() to authenticated, service_role;

-- 1) seguidores -------------------------------------------------------------------------------------------------------
create or replace function public.onda_admin_profile_save(p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id; v_network text := nullif(btrim(coalesce(p_data ->> 'network', '')), '');
        v_handle text := nullif(lower(ltrim(btrim(coalesce(p_data ->> 'handle', '')), '@')), '');
        v_followers bigint; v_avatar text := nullif(btrim(coalesce(p_data ->> 'avatar_url', '')), ''); v_active boolean;
begin
  if not public.onda_admin_can() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_network is not null and v_network not in ('instagram', 'x') then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_handle is not null and v_handle !~ '^[a-z0-9._]{1,40}$' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_data ? 'followers' then
    begin v_followers := (p_data ->> 'followers')::bigint; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
    if v_followers is null or v_followers < 0 or v_followers > 10000000000 then raise exception 'invalid_input' using errcode = '22023'; end if;
  end if;
  if p_data ? 'avatar_url' and v_avatar is not null and v_avatar !~ '^/onda-digital/[a-z0-9-]{1,60}\.webp$' and not public.brand_https_url_ok(v_avatar) then
    raise exception 'invalid_image' using errcode = '22023';
  end if;
  if p_data ? 'active' then v_active := coalesce((p_data ->> 'active')::boolean, true); end if;

  if v_id is null then
    if v_network is null or v_handle is null or v_followers is null then raise exception 'invalid_input' using errcode = '22023'; end if;
    if exists (select 1 from public.onda_profiles p where p.network = v_network and p.handle = v_handle) then
      raise exception 'onda_profile_exists' using errcode = 'P0001';
    end if;
    insert into public.onda_profiles (network, handle, followers, avatar_url, active, updated_by)
    values (v_network, v_handle, v_followers, v_avatar, coalesce(v_active, true), auth.uid())
    returning id into v_id;
  else
    if not exists (select 1 from public.onda_profiles p where p.id = v_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v_handle is not null and exists (select 1 from public.onda_profiles p
       where p.id <> v_id and p.handle = v_handle and p.network = coalesce(v_network, (select q.network from public.onda_profiles q where q.id = v_id))) then
      raise exception 'onda_profile_exists' using errcode = 'P0001';
    end if;
    update public.onda_profiles set
      network = coalesce(v_network, network),
      handle = coalesce(v_handle, handle),
      followers = coalesce(v_followers, followers),
      avatar_url = case when p_data ? 'avatar_url' then v_avatar else avatar_url end,
      active = coalesce(v_active, active),
      updated_at = now(), updated_by = auth.uid()
    where id = v_id;
  end if;
  perform public.audit_log('onda.profile_save', 'onda_profile', v_id::text, null, p_data, null, 'agency');
  return v_id;
end $$;
revoke execute on function public.onda_admin_profile_save(uuid, jsonb) from public, anon;
grant execute on function public.onda_admin_profile_save(uuid, jsonb) to authenticated, service_role;

-- 2) cases ------------------------------------------------------------------------------------------------------------
create or replace function public.onda_admin_case_save(p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id; v_name text := nullif(regexp_replace(btrim(coalesce(p_data ->> 'brand_name', '')), '\s+', ' ', 'g'), '');
        v_category text := nullif(btrim(coalesce(p_data ->> 'category', '')), ''); v_desc text := nullif(btrim(coalesce(p_data ->> 'description', '')), '');
        v_metrics jsonb; v_active boolean; v_brand uuid; m jsonb;
begin
  if not public.onda_admin_can() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_name is not null and char_length(v_name) > 60 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_desc is not null and char_length(v_desc) > 300 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if v_category is not null and not exists (select 1 from public.brand_categories c where c.slug = v_category) then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_data ? 'metrics' then
    v_metrics := p_data -> 'metrics';
    if jsonb_typeof(v_metrics) <> 'array' or jsonb_array_length(v_metrics) > 4 then raise exception 'invalid_input' using errcode = '22023'; end if;
    for m in select * from jsonb_array_elements(v_metrics) loop
      if jsonb_typeof(m) <> 'object' or coalesce(m ->> 'k', '') not in ('reach', 'impressions', 'impacts', 'feed_reach')
         or coalesce(jsonb_typeof(m -> 'v'), '') <> 'number' then
        raise exception 'invalid_input' using errcode = '22023';
      end if;
      if (m ->> 'v')::numeric < 0 or (m ->> 'v')::numeric > 100000000000 or (m ->> 'k' = 'feed_reach' and (m ->> 'v')::numeric > 100) then
        raise exception 'invalid_input' using errcode = '22023';
      end if;
    end loop;
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('k', x ->> 'k', 'v', (x ->> 'v')::numeric,
             'plus', case when (x ->> 'plus')::boolean then true end))), '[]'::jsonb)
      into v_metrics from jsonb_array_elements(p_data -> 'metrics') x;
  end if;
  if p_data ? 'active' then v_active := coalesce((p_data ->> 'active')::boolean, true); end if;
  -- o logo vem da marca do universo com o mesmo nome
  if v_name is not null then
    select b.id into v_brand from public.brands b where not b.is_demo and public.brand_name_key(b.name) = public.brand_name_key(v_name)
    order by (b.logo_url is not null) desc, b.created_at limit 1;
  end if;

  if v_id is null then
    if v_name is null or v_desc is null then raise exception 'invalid_input' using errcode = '22023'; end if;
    insert into public.onda_cases (brand_name, brand_id, category, description, metrics, sort_order, active, updated_by)
    values (v_name, v_brand, v_category, v_desc, coalesce(v_metrics, '[]'::jsonb),
            coalesce((select max(c.sort_order) from public.onda_cases c), 0) + 1, coalesce(v_active, true), auth.uid())
    returning id into v_id;
  else
    if not exists (select 1 from public.onda_cases c where c.id = v_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
    update public.onda_cases set
      brand_name = coalesce(v_name, brand_name),
      brand_id = case when v_name is not null then v_brand else brand_id end,
      category = case when p_data ? 'category' then v_category else category end,
      description = coalesce(v_desc, description),
      metrics = coalesce(v_metrics, metrics),
      active = coalesce(v_active, active),
      updated_at = now(), updated_by = auth.uid()
    where id = v_id;
  end if;
  perform public.audit_log('onda.case_save', 'onda_case', v_id::text, null, p_data, null, 'agency');
  return v_id;
end $$;
revoke execute on function public.onda_admin_case_save(uuid, jsonb) from public, anon;
grant execute on function public.onda_admin_case_save(uuid, jsonb) to authenticated, service_role;

create or replace function public.onda_admin_case_delete(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.onda_admin_can() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.onda_cases where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.audit_log('onda.case_delete', 'onda_case', p_id::text, null, null, null, 'agency');
  return true;
end $$;
revoke execute on function public.onda_admin_case_delete(uuid) from public, anon;
grant execute on function public.onda_admin_case_delete(uuid) to authenticated, service_role;

-- 3) ondas (pacotes) --------------------------------------------------------------------------------------------------
create or replace function public.onda_admin_package_save(p_slug text, p_data jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare v_slug text := nullif(btrim(coalesce(p_slug, '')), ''); v_name text := nullif(btrim(coalesce(p_data ->> 'name', '')), '');
        v_scope text := nullif(btrim(coalesce(p_data ->> 'scope', '')), ''); v_desc text := nullif(btrim(coalesce(p_data ->> 'description', '')), '');
        v_active boolean; v_base text; v_n int := 1;
begin
  if not public.onda_admin_can() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if (v_name is not null and char_length(v_name) not between 2 and 60) or (v_scope is not null and char_length(v_scope) not between 2 and 120)
     or (v_desc is not null and char_length(v_desc) not between 2 and 300) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_data ? 'active' then v_active := coalesce((p_data ->> 'active')::boolean, true); end if;
  if v_slug is null then
    if v_name is null or v_scope is null or v_desc is null then raise exception 'invalid_input' using errcode = '22023'; end if;
    v_base := left(coalesce(nullif(public.slugify(v_name), ''), 'onda'), 36);
    if char_length(v_base) < 2 then v_base := 'onda-' || v_base; end if;
    v_slug := v_base;
    while exists (select 1 from public.onda_packages k where k.slug = v_slug) loop
      v_n := v_n + 1; v_slug := v_base || '-' || v_n;
    end loop;
    insert into public.onda_packages (slug, name, scope, description, sort_order, active, updated_by)
    values (v_slug, v_name, v_scope, v_desc, coalesce((select max(k.sort_order) from public.onda_packages k), 0) + 1, coalesce(v_active, true), auth.uid());
  else
    update public.onda_packages set
      name = coalesce(v_name, name), scope = coalesce(v_scope, scope), description = coalesce(v_desc, description),
      active = coalesce(v_active, active), updated_at = now(), updated_by = auth.uid()
    where slug = v_slug;
    if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  end if;
  perform public.audit_log('onda.package_save', 'onda_package', v_slug, null, p_data, null, 'agency');
  return v_slug;
end $$;
revoke execute on function public.onda_admin_package_save(text, jsonb) from public, anon;
grant execute on function public.onda_admin_package_save(text, jsonb) to authenticated, service_role;

-- 4) ordem dos cases e das ondas ----------------------------------------------------------------------------------------
create or replace function public.onda_admin_reorder(p_kind text, p_keys text[])
returns boolean language plpgsql security definer set search_path = '' as $$
declare i int;
begin
  if not public.onda_admin_can() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind not in ('cases', 'packages') or p_keys is null or cardinality(p_keys) > 200 then raise exception 'invalid_input' using errcode = '22023'; end if;
  for i in 1 .. coalesce(cardinality(p_keys), 0) loop
    if p_kind = 'cases' then
      update public.onda_cases set sort_order = i where id::text = p_keys[i];
    else
      update public.onda_packages set sort_order = i where slug = p_keys[i];
    end if;
  end loop;
  perform public.audit_log('onda.reorder', 'onda_' || p_kind, p_kind, null, to_jsonb(p_keys), null, 'agency');
  return true;
end $$;
revoke execute on function public.onda_admin_reorder(text, text[]) from public, anon;
grant execute on function public.onda_admin_reorder(text, text[]) to authenticated, service_role;

-- 5) a página: páginas por seguidores (maior primeiro) e o mês da última atualização de cada rede ------------------------
create or replace function public.onda_content()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.onda_viewer() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'profiles', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'network', p.network, 'handle', p.handle, 'followers', p.followers,
        'avatar_url', p.avatar_url) order by p.network, p.followers desc, p.handle)
      from public.onda_profiles p where p.active), '[]'::jsonb),
    'updated', jsonb_build_object(
      'instagram', (select max(p.updated_at) from public.onda_profiles p where p.active and p.network = 'instagram'),
      'x', (select max(p.updated_at) from public.onda_profiles p where p.active and p.network = 'x')),
    'portals', coalesce((select jsonb_agg(jsonb_build_object('area', p.area, 'name', p.name) order by p.sort_order, p.name)
      from public.onda_portals p where p.active), '[]'::jsonb),
    'cases', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'brand', c.brand_name, 'logo_url', b.logo_url, 'category', c.category,
        'description', c.description, 'metrics', c.metrics) order by c.sort_order)
      from public.onda_cases c left join public.brands b on b.id = c.brand_id where c.active), '[]'::jsonb),
    'packages', coalesce((select jsonb_agg(jsonb_build_object('slug', k.slug, 'name', k.name, 'scope', k.scope, 'description', k.description) order by k.sort_order)
      from public.onda_packages k where k.active), '[]'::jsonb));
end $$;
revoke execute on function public.onda_content() from public, anon;
grant execute on function public.onda_content() to authenticated, service_role;

-- 6) editor: tudo (inclusive o que está fora da página), com o logo do case ---------------------------------------------
create or replace function public.onda_admin_content()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_groscove_member() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'profiles', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'network', p.network, 'handle', p.handle, 'followers', p.followers,
        'avatar_url', p.avatar_url, 'active', p.active, 'updated_at', p.updated_at) order by p.network, p.active desc, p.followers desc, p.handle)
      from public.onda_profiles p), '[]'::jsonb),
    'cases', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'brand', c.brand_name, 'logo_url', b.logo_url, 'category', c.category,
        'description', c.description, 'metrics', c.metrics, 'active', c.active) order by c.sort_order)
      from public.onda_cases c left join public.brands b on b.id = c.brand_id), '[]'::jsonb),
    'packages', coalesce((select jsonb_agg(jsonb_build_object('slug', k.slug, 'name', k.name, 'scope', k.scope, 'description', k.description,
        'active', k.active) order by k.sort_order)
      from public.onda_packages k), '[]'::jsonb));
end $$;
revoke execute on function public.onda_admin_content() from public, anon;
grant execute on function public.onda_admin_content() to authenticated, service_role;

-- 7) fotos das páginas novas: bucket público; só o servidor grava ------------------------------------------------------
do $$
begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise notice '0134: schema storage ausente; bucket onda-assets não foi criado';
    return;
  end if;
  execute $sql$
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('onda-assets', 'onda-assets', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types
  $sql$;
end $$;
