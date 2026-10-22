-- =============================================================================
-- Ultra Hero · 0031 · Foto de perfil (bucket público avatars)
--   A pessoa envia a própria foto (usuário comum e herói). O navegador recorta e redimensiona
--   (512x512, sem EXIF); o servidor confere tipo e dimensões pelos bytes, reserva o envio aqui
--   (cota de 20 por dia, kill switch), grava no bucket público `avatars` com o service role e
--   aplica a URL em profiles.avatar_url e, se a pessoa é herói, em creator_profiles.avatar_url.
--   Nada é escrito no bucket pela API com JWT de usuário (sem políticas de insert/update/delete).
--   Caminho: <user_id>/<uuid>.(webp|jpg). Objetos imutáveis: a troca gera objeto novo e o
--   servidor apaga o anterior; órfãos e fotos de conta excluída saem na limpeza diária
--   (avatar_orphan_uploads, lida pelo cron de retenção com o service role).
--   Bucket só quando o schema storage existe (Supabase real ou o shim local).
-- Regras: nada de drop/truncate; search_path fixo; grants explícitos; funções sem execute para
-- anon (a lista pública do S14 não cresce); políticas com (select ...). anonymize_user_data NÃO é
-- redefinida aqui (a 0027 é a dona): a foto sai pelo servidor na exclusão e, se falhar, pelo cron.
-- =============================================================================

-- ---------------------------------------------------------------- 1) kill switch
insert into public.app_settings (key, value, description) values
  ('avatars.uploads_enabled', 'true'::jsonb, 'Kill switch do envio de foto de perfil (usuários e heróis).')
on conflict (key) do nothing;

-- Mesma lista da 0027 + a chave nova (função sql: redefinida inteira, mesma assinatura e grants).
create or replace function public.public_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.app_settings
  where key in ('commerce.enabled', 'ai.enabled', 'experiment.open', 'ai.provider', 'video.provider', 'ai.rate_limit_per_hour',
                'transport.minutes_per_step', 'recipes.ratings_enabled', 'recipes.comments_enabled', 'recipes.uploads_enabled',
                'avatars.uploads_enabled')
$$;

-- ---------------------------------------------------------------- 2) envios (só o servidor e as RPCs escrevem)
create table if not exists public.avatar_uploads (
  id uuid primary key default gen_random_uuid(),
  -- set null: a conta some e a linha fica até o cron apagar o objeto (e a referência no herói)
  user_id uuid references auth.users (id) on delete set null,
  path text not null unique
    check (path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'),
  bytes integer not null check (bytes > 0 and bytes <= 2097152),
  mime text not null check (mime in ('image/webp', 'image/jpeg')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists avatar_uploads_user_created_idx on public.avatar_uploads (user_id, created_at desc) where user_id is not null;
-- a limpeza diária percorre só o que ainda não foi apagado
create index if not exists avatar_uploads_pending_idx on public.avatar_uploads (created_at) where deleted_at is null;
alter table public.avatar_uploads enable row level security;

-- Leitura: o próprio (histórico) e o admin. Escrita: ninguém pela API (RPCs definer e service role).
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'avatar_uploads' and policyname = 'avatar_uploads_select') then
    create policy avatar_uploads_select on public.avatar_uploads for select to authenticated
      using (user_id = (select auth.uid()) or (select public.is_admin()));
  end if;
end $$;
revoke all on table public.avatar_uploads from public, anon;
revoke insert, update, delete, truncate, references, trigger on table public.avatar_uploads from authenticated;
grant select on table public.avatar_uploads to authenticated;
grant all on table public.avatar_uploads to service_role;

-- ---------------------------------------------------------------- 3) reservar o envio: kill switch, cota e nome do objeto
-- O nome nasce aqui (como o uid de stream_uploads na 0026): o servidor só grava no caminho reservado.
create or replace function public.avatar_upload_claim(p_bytes int, p_mime text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_ext text; v_path text;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not coalesce(public.public_settings() -> 'avatars.uploads_enabled' = 'true'::jsonb, false) then
    raise exception 'uploads_disabled';
  end if;
  if p_mime = 'image/webp' then v_ext := 'webp';
  elsif p_mime = 'image/jpeg' then v_ext := 'jpg';
  else raise exception 'not_image'; end if;
  if p_bytes is null or p_bytes <= 0 then raise exception 'empty_file'; end if;
  if p_bytes > 2097152 then raise exception 'file_too_large'; end if;
  -- duas abas ao mesmo tempo não passam da cota
  perform pg_advisory_xact_lock(hashtext('avatar_upload:' || v_uid::text));
  if (select count(*) from public.avatar_uploads where user_id = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many_uploads';
  end if;
  v_id := gen_random_uuid();
  v_path := v_uid::text || '/' || v_id::text || '.' || v_ext;
  insert into public.avatar_uploads (id, user_id, path, bytes, mime) values (v_id, v_uid, v_path, p_bytes, p_mime);
  return v_path;
end $$;
revoke execute on function public.avatar_upload_claim(int, text) from public, anon;
grant execute on function public.avatar_upload_claim(int, text) to authenticated, service_role;

-- ---------------------------------------------------------------- 4) aplicar a foto nos dois lados (uma transação)
-- p_url: URL pública montada pelo servidor; precisa terminar em /avatars/<path> de um envio do
-- próprio usuário, não apagado e (com o schema storage presente) já gravado no bucket. Devolve os
-- avatar_url anteriores (perfil e herói, sem repetição): o servidor apaga os que eram foto própria.
create or replace function public.avatar_set_photo(p_url text)
returns text[] language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_path text; v_prev text[]; v_stored boolean := true;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_url is null or length(p_url) > 300
     or p_url !~ '^https?://[^/\s?#]+/storage/v1/object/public/avatars/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$' then
    raise exception 'invalid_path';
  end if;
  v_path := substring(p_url from '/avatars/(.*)$');
  if not exists (select 1 from public.avatar_uploads u where u.path = v_path and u.user_id = v_uid and u.deleted_at is null) then
    raise exception 'invalid_path';
  end if;
  -- chamada direta pela API sem o envio pelo servidor deixaria a referência quebrada
  if to_regclass('storage.objects') is not null then
    execute 'select exists (select 1 from storage.objects where bucket_id = ''avatars'' and name = $1)' into v_stored using v_path;
    if not v_stored then raise exception 'invalid_path'; end if;
  end if;
  select coalesce(array_agg(distinct x.url) filter (where x.url is not null and x.url <> p_url), '{}') into v_prev
  from (select avatar_url as url from public.profiles where id = v_uid
        union all select avatar_url from public.creator_profiles where user_id = v_uid) x;
  update public.profiles set avatar_url = p_url where id = v_uid;
  update public.creator_profiles set avatar_url = p_url where user_id = v_uid and avatar_url is distinct from p_url;
  return v_prev;
end $$;
revoke execute on function public.avatar_set_photo(text) from public, anon;
grant execute on function public.avatar_set_photo(text) to authenticated, service_role;

-- ---------------------------------------------------------------- 5) limpeza diária (só o cron, service role)
-- (a) envio com mais de 1 h que nenhum perfil referencia (troca que falhou no meio, aba fechada);
-- (b) envio de conta excluída (user_id nulo), mesmo referenciado: o perfil do herói fica no ar sem
--     usuário e a foto da pessoa não pode ficar nele. O cron apaga o objeto pela API, limpa as
--     referências e marca deleted_at; nunca se apaga storage.objects por SQL.
create or replace function public.avatar_orphan_uploads(p_limit int)
returns setof text language plpgsql stable set search_path = public as $$
begin
  return query
  select u.path from public.avatar_uploads u
  where u.deleted_at is null
    and (u.user_id is null
         or (u.created_at < now() - interval '1 hour'
             and not exists (select 1 from public.profiles p where p.avatar_url like ('%/avatars/' || u.path))
             and not exists (select 1 from public.creator_profiles c where c.avatar_url like ('%/avatars/' || u.path))))
  order by u.created_at, u.path
  limit least(greatest(coalesce(p_limit, 100), 1), 1000);
end $$;
revoke execute on function public.avatar_orphan_uploads(int) from public, anon, authenticated;
grant execute on function public.avatar_orphan_uploads(int) to service_role;

-- ---------------------------------------------------------------- 6) bucket público; nenhuma escrita pela API
do $$
begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise notice '0031: schema storage ausente; bucket avatars não foi criado';
    return;
  end if;
  execute $sql$
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/jpeg'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types
  $sql$;
  -- Sem políticas em storage.objects para este bucket: só o service role (bypassrls) grava e apaga.
  -- A URL pública é servida sem política; listar pela API fica fechado de propósito.
end $$;
