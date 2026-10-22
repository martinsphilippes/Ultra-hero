-- =============================================================================
-- Ultra Hero · 0028 · Storage das fotos de receita (bucket privado recipe-media)
--   Bucket privado servido pelo proxy /media/recipe/[id] (fase 2): a visibilidade de cada foto é
--   decidida a cada requisição pela RLS de recipe_media (galeria de receita no ar; foto de etapa só
--   com acesso; rascunho só para o herói dono). Caminho: <creator_id>/<content_id>/<uuid>.<ext>.
--   Objetos são imutáveis (sem política de update). Cota diária por herói: menos de 50 objetos e de
--   100 MB nas últimas 24 h (P3: contas demo seguem só esta cota, sem regra própria).
--   Bucket e políticas só são criados quando o schema storage existe (Supabase real ou o shim
--   local); as funções em public são plpgsql e não exigem o schema na criação.
-- Regras: nada de drop/truncate; search_path fixo; funções sem execute para anon.
-- =============================================================================

-- Caminho válido para envio: regex completa ANTES de qualquer cast (pasta que não é uuid não pode
-- virar erro 22P02 dentro da política) e conteúdo do próprio herói, receita, rascunho fora de revisão.
-- Invoker: a leitura de content passa pela RLS de quem envia.
create or replace function public.recipe_media_path_ok(p_name text)
returns boolean language plpgsql stable set search_path = public as $$
declare v_parts text[];
begin
  if p_name is null or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$' then
    return false;
  end if;
  v_parts := string_to_array(p_name, '/');
  return exists (
    select 1 from public.content c
    where c.id = v_parts[2]::uuid and c.creator_id = v_parts[1]::uuid and c.creator_id = public.my_creator_id()
      and c.type = 'recipe' and c.status = 'draft' and c.review_status <> 'in_review');
end $$;
revoke execute on function public.recipe_media_path_ok(text) from public, anon;
grant execute on function public.recipe_media_path_ok(text) to authenticated, service_role;

-- Cota diária do usuário que envia (owner_id = auth.uid()), sem contar o objeto em envio.
-- Definer: conta os próprios objetos sem depender da política de leitura de storage.objects.
create or replace function public.recipe_media_quota_ok()
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_count bigint; v_bytes bigint;
begin
  if auth.uid() is null then return false; end if;
  select count(*), coalesce(sum(case when (o.metadata ->> 'size') ~ '^[0-9]{1,12}$' then (o.metadata ->> 'size')::bigint else 0 end), 0)
    into v_count, v_bytes
  from storage.objects o
  where o.bucket_id = 'recipe-media' and o.owner_id = auth.uid()::text and o.created_at > now() - interval '1 day';
  return v_count < 50 and v_bytes < 104857600;
end $$;
revoke execute on function public.recipe_media_quota_ok() from public, anon;
grant execute on function public.recipe_media_quota_ok() to authenticated, service_role;

-- Objeto já registrado em recipe_media? Definer de propósito: a política de exclusão não pode
-- depender da RLS de quem chama (herói suspenso não enxerga a linha e a foto pareceria "solta").
create or replace function public.recipe_media_registered(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.recipe_media where storage_path = p_name)
$$;
revoke execute on function public.recipe_media_registered(text) from public, anon;
grant execute on function public.recipe_media_registered(text) to authenticated, service_role;

-- Órfãos: objetos do bucket sem linha em recipe_media há mais de 24 h. Só o cron (service role)
-- lê, e apaga pela API do Storage; nunca se apaga storage.objects por SQL.
create or replace function public.recipe_orphan_media(p_limit int)
returns setof text language plpgsql stable set search_path = public as $$
begin
  return query
  select o.name from storage.objects o
  where o.bucket_id = 'recipe-media' and o.created_at < now() - interval '24 hours'
    and not exists (select 1 from public.recipe_media m where m.storage_path = o.name)
  order by o.created_at, o.name
  limit least(greatest(coalesce(p_limit, 100), 1), 1000);
end $$;
revoke execute on function public.recipe_orphan_media(int) from public, anon, authenticated;
grant execute on function public.recipe_orphan_media(int) to service_role;

do $$
begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise notice '0028: schema storage ausente; bucket e políticas de recipe-media não foram criados';
    return;
  end if;
  execute $sql$
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('recipe-media', 'recipe-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types
  $sql$;
  -- envio: pasta do próprio herói, rascunho de receita próprio, uploads ligados e dentro da cota
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'recipe_media_insert') then
    execute $sql$
      create policy recipe_media_insert on storage.objects for insert to authenticated
        with check (bucket_id = 'recipe-media'
                    and (storage.foldername(name))[1] = (select public.my_creator_id())::text
                    and public.recipe_media_path_ok(name)
                    and public.recipe_setting_on('recipes.uploads_enabled')
                    and public.recipe_media_quota_ok())
    $sql$;
  end if;
  -- leitura: a RLS de recipe_media decide (foto registrada e visível para quem pede) ou é do dono
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'recipe_media_select') then
    execute $sql$
      create policy recipe_media_select on storage.objects for select to anon, authenticated
        using (bucket_id = 'recipe-media'
               and (exists (select 1 from public.recipe_media m where m.storage_path = objects.name)
                    or owner_id = (select auth.uid())::text))
    $sql$;
  end if;
  -- exclusão: só o dono, e só de rascunho editável ou de objeto que nunca foi registrado
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'recipe_media_delete') then
    execute $sql$
      create policy recipe_media_delete on storage.objects for delete to authenticated
        using (bucket_id = 'recipe-media' and owner_id = (select auth.uid())::text
               and (public.recipe_media_path_ok(name)
                    or not public.recipe_media_registered(objects.name)))
    $sql$;
  end if;
end $$;
