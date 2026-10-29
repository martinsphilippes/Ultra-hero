-- =============================================================================
-- Ultra Hero · 0042 · Capa do herói com foto real (bucket público hero-covers)
--   As capas desenhadas (/placeholders/cover-*.svg) saem do editor do herói. A capa passa a ser
--   uma foto real enviada pelo próprio herói ativo, no mesmo desenho de segurança da foto de
--   perfil (0031): o navegador recorta e reduz (1600x900, 16:9, sem EXIF); o servidor confere tipo
--   e dimensões pelos bytes, reserva o envio aqui (kill switch, tipo, tamanho, cota de 20 por dia),
--   grava no bucket público `hero-covers` com o service role e aplica a URL em
--   creator_profiles.cover_url (só no perfil ativo do próprio herói). Nada é escrito no bucket pela
--   API com JWT de usuário (sem políticas de insert/update/delete).
--   Caminho: <user_id>/<uuid>.(webp|jpg). Objetos imutáveis: a troca gera objeto novo e o servidor
--   apaga o anterior; órfãos e capas de conta excluída saem na limpeza diária
--   (hero_cover_orphan_uploads, lida pelo cron de retenção com o service role).
--   Capas antigas (/placeholders/...) continuam no banco e a tela as mostra como "sem capa".
--   Bucket só quando o schema storage existe (Supabase real ou o shim local).
-- Regras: nada de drop/truncate; search_path fixo; grants explícitos; nenhuma função nova com
-- execute para anon (a lista pública do S14 continua com 17); políticas com (select ...).
-- anonymize_user_data NÃO é redefinida aqui (a 0027 é a dona): a capa sai pelo servidor na
-- exclusão e, se falhar, pelo cron (o envio fica com user_id nulo).
-- =============================================================================

-- ---------------------------------------------------------------- 1) kill switch
insert into public.app_settings (key, value, description) values
  ('hero_covers.uploads_enabled', 'true'::jsonb, 'Kill switch do envio de capa do perfil do herói.')
on conflict (key) do nothing;

-- Mesma lista da 0031 + a chave nova (função sql: redefinida inteira, mesma assinatura e grants).
create or replace function public.public_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.app_settings
  where key in ('commerce.enabled', 'ai.enabled', 'experiment.open', 'ai.provider', 'video.provider', 'ai.rate_limit_per_hour',
                'transport.minutes_per_step', 'recipes.ratings_enabled', 'recipes.comments_enabled', 'recipes.uploads_enabled',
                'avatars.uploads_enabled', 'hero_covers.uploads_enabled')
$$;

-- ---------------------------------------------------------------- 2) envios (só o servidor e as RPCs escrevem)
create table if not exists public.hero_cover_uploads (
  id uuid primary key default gen_random_uuid(),
  -- set null: a conta some e a linha fica até o cron apagar o objeto (e a referência no herói)
  user_id uuid references auth.users (id) on delete set null,
  path text not null unique
    check (path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'),
  bytes integer not null check (bytes > 0 and bytes <= 3145728),
  mime text not null check (mime in ('image/webp', 'image/jpeg')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists hero_cover_uploads_user_created_idx on public.hero_cover_uploads (user_id, created_at desc) where user_id is not null;
-- a limpeza diária percorre só o que ainda não foi apagado
create index if not exists hero_cover_uploads_pending_idx on public.hero_cover_uploads (created_at) where deleted_at is null;
alter table public.hero_cover_uploads enable row level security;

-- Leitura: o próprio (histórico) e o admin. Escrita: ninguém pela API (RPCs definer e service role).
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hero_cover_uploads' and policyname = 'hero_cover_uploads_select') then
    create policy hero_cover_uploads_select on public.hero_cover_uploads for select to authenticated
      using (user_id = (select auth.uid()) or (select public.is_admin()));
  end if;
end $$;
revoke all on table public.hero_cover_uploads from public, anon;
revoke insert, update, delete, truncate, references, trigger on table public.hero_cover_uploads from authenticated;
grant select on table public.hero_cover_uploads to authenticated;
grant all on table public.hero_cover_uploads to service_role;

-- ---------------------------------------------------------------- 3) herói ativo (uso interno das RPCs)
-- Mesma regra da tela (heroProfileFor + my_creator_id): papel de herói (ou admin) e perfil vinculado
-- ativo. Devolve o id do perfil ou null. Sem execute para ninguém além do service role: as RPCs
-- abaixo são security definer e chamam por dentro.
create or replace function public.hero_cover_active_creator(p_uid uuid)
returns uuid language sql stable set search_path = public as $$
  select c.id from public.creator_profiles c
  where c.user_id = p_uid and c.status = 'active'
    and exists (select 1 from public.role_assignments r where r.user_id = p_uid and r.role in ('creator', 'admin') and r.revoked_at is null)
  limit 1
$$;
revoke execute on function public.hero_cover_active_creator(uuid) from public, anon, authenticated;
grant execute on function public.hero_cover_active_creator(uuid) to service_role;

-- ---------------------------------------------------------------- 4) reservar o envio: kill switch, herói ativo, cota e nome do objeto
create or replace function public.hero_cover_upload_claim(p_bytes int, p_mime text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_ext text; v_path text;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not coalesce(public.public_settings() -> 'hero_covers.uploads_enabled' = 'true'::jsonb, false) then
    raise exception 'uploads_disabled';
  end if;
  if public.hero_cover_active_creator(v_uid) is null then raise exception 'not_a_hero' using errcode = '42501'; end if;
  if p_mime = 'image/webp' then v_ext := 'webp';
  elsif p_mime = 'image/jpeg' then v_ext := 'jpg';
  else raise exception 'not_image'; end if;
  if p_bytes is null or p_bytes <= 0 then raise exception 'empty_file'; end if;
  if p_bytes > 3145728 then raise exception 'file_too_large'; end if;
  -- duas abas ao mesmo tempo não passam da cota
  perform pg_advisory_xact_lock(hashtext('hero_cover_upload:' || v_uid::text));
  if (select count(*) from public.hero_cover_uploads where user_id = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many_uploads';
  end if;
  v_id := gen_random_uuid();
  v_path := v_uid::text || '/' || v_id::text || '.' || v_ext;
  insert into public.hero_cover_uploads (id, user_id, path, bytes, mime) values (v_id, v_uid, v_path, p_bytes, p_mime);
  return v_path;
end $$;
revoke execute on function public.hero_cover_upload_claim(int, text) from public, anon;
grant execute on function public.hero_cover_upload_claim(int, text) to authenticated, service_role;

-- ---------------------------------------------------------------- 5) aplicar a capa no perfil do próprio herói ativo
-- p_url: URL pública montada pelo servidor; precisa terminar em /hero-covers/<path> de um envio do
-- próprio usuário, não apagado e (com o schema storage presente) já gravado no bucket. Devolve o
-- cover_url anterior (ou null): o servidor apaga o objeto se era capa própria.
create or replace function public.hero_cover_set(p_url text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_creator uuid; v_path text; v_prev text; v_stored boolean := true;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.hero_cover_active_creator(v_uid);
  if v_creator is null then raise exception 'not_a_hero' using errcode = '42501'; end if;
  if p_url is null or length(p_url) > 300
     or p_url !~ '^https?://[^/\s?#]+/storage/v1/object/public/hero-covers/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$' then
    raise exception 'invalid_path';
  end if;
  v_path := substring(p_url from '/hero-covers/(.*)$');
  if not exists (select 1 from public.hero_cover_uploads u where u.path = v_path and u.user_id = v_uid and u.deleted_at is null) then
    raise exception 'invalid_path';
  end if;
  -- chamada direta pela API sem o envio pelo servidor deixaria a referência quebrada
  if to_regclass('storage.objects') is not null then
    execute 'select exists (select 1 from storage.objects where bucket_id = ''hero-covers'' and name = $1)' into v_stored using v_path;
    if not v_stored then raise exception 'invalid_path'; end if;
  end if;
  select cover_url into v_prev from public.creator_profiles where id = v_creator;
  update public.creator_profiles set cover_url = p_url where id = v_creator and cover_url is distinct from p_url;
  return case when v_prev is distinct from p_url then v_prev end;
end $$;
revoke execute on function public.hero_cover_set(text) from public, anon;
grant execute on function public.hero_cover_set(text) to authenticated, service_role;

-- ---------------------------------------------------------------- 6) remover a capa (qualquer uma: foto, oficial ou desenho antigo)
-- Só o próprio herói ativo. Devolve o cover_url anterior: o servidor apaga o objeto se era capa própria.
create or replace function public.hero_cover_clear()
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_creator uuid; v_prev text;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.hero_cover_active_creator(v_uid);
  if v_creator is null then raise exception 'not_a_hero' using errcode = '42501'; end if;
  select cover_url into v_prev from public.creator_profiles where id = v_creator;
  update public.creator_profiles set cover_url = null where id = v_creator and cover_url is not null;
  return v_prev;
end $$;
revoke execute on function public.hero_cover_clear() from public, anon;
grant execute on function public.hero_cover_clear() to authenticated, service_role;

-- ---------------------------------------------------------------- 7) limpeza diária (só o cron, service role)
-- (a) envio com mais de 1 h que nenhum herói referencia (troca que falhou no meio, aba fechada);
-- (b) envio de conta excluída (user_id nulo), mesmo referenciado: o perfil do herói fica no ar sem
--     usuário e a foto da pessoa não pode ficar nele. O cron apaga o objeto pela API, limpa a
--     referência e marca deleted_at; nunca se apaga storage.objects por SQL.
create or replace function public.hero_cover_orphan_uploads(p_limit int)
returns setof text language plpgsql stable set search_path = public as $$
begin
  return query
  select u.path from public.hero_cover_uploads u
  where u.deleted_at is null
    and (u.user_id is null
         or (u.created_at < now() - interval '1 hour'
             and not exists (select 1 from public.creator_profiles c where c.cover_url like ('%/hero-covers/' || u.path))))
  order by u.created_at, u.path
  limit least(greatest(coalesce(p_limit, 100), 1), 1000);
end $$;
revoke execute on function public.hero_cover_orphan_uploads(int) from public, anon, authenticated;
grant execute on function public.hero_cover_orphan_uploads(int) to service_role;

-- ---------------------------------------------------------------- 8) bucket público; nenhuma escrita pela API
do $$
begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise notice '0042: schema storage ausente; bucket hero-covers não foi criado';
    return;
  end if;
  execute $sql$
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('hero-covers', 'hero-covers', true, 3145728, array['image/webp', 'image/jpeg'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types
  $sql$;
  -- Sem políticas em storage.objects para este bucket: só o service role (bypassrls) grava e apaga.
  -- A URL pública é servida sem política; listar pela API fica fechado de propósito.
end $$;
