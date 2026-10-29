-- =============================================================================
-- Ultra Hero · 0043 · Post com foto no composer do herói (bucket público post-photos)
--   Até aqui o "Novo post" só aceitava vídeo (Cloudflare Stream). Agora o herói também posta uma
--   FOTO, sem depender do Stream, no mesmo desenho de segurança da capa do herói (0042): o
--   navegador reduz a foto (até 2048 px no lado maior, WebP/JPEG, sem EXIF); o servidor confere tipo
--   e dimensões pelos bytes, reserva o envio aqui (kill switch, herói ativo, tipo, tamanho, cota de
--   30 por hora), grava no bucket público `post-photos` com o service role e cria o rascunho.
--   Caminho: <user_id>/<uuid>.(webp|jpg). Nada é escrito no bucket pela API com JWT de usuário.
--
-- Modelagem (decisão): post com foto = content.type 'article' + corpo kind 'article' (format
--   'photo', sem seções) + content_bodies.media_provider 'upload' com media_ref = caminho do objeto,
--   e content.cover_url = URL pública da mesma foto. Motivos: (1) o enum content_type é usado em
--   content_type_settings (conclusão, revisão), busca, catálogo, trilhas, seed e i18n; um valor novo
--   ('photo') exigiria tocar tudo isso e 'alter type ... add value' não roda dentro da transação da
--   migração junto com o uso do valor; (2) o provedor 'upload' já existe no enum e nunca foi usado
--   (o editor recusa), então passa a significar "foto enviada pelo composer"; (3) card, feed e
--   listas já mostram cover_url, então a foto aparece em todo lugar sem código novo; (4) a página
--   reconhece o post com foto (artigo cuja capa é deste bucket) e mostra a foto grande no topo.
--
-- Proteção (mesma ideia da 0026 para o uid do Stream): o herói só grava em content_bodies
--   (provedor 'upload') e em content.cover_url (URL do bucket post-photos) uma foto que ELE reservou,
--   ainda não apagada e já gravada no bucket; uma foto serve a um corpo só. A publicação confere de
--   novo. Admin, sistema e funções confiáveis passam (mesmo padrão dos guards de 0010/0017/0026).
--
-- Limpeza: descartar o rascunho (creator_discard_photo_draft) apaga o conteúdo e devolve o caminho
--   ao servidor, que apaga o objeto; o que sobrar (envio sem uso há mais de 1 h, ou de conta
--   excluída) sai no cron de retenção (post_photo_orphan_uploads, só service role).
-- Regras: nada de drop/truncate; search_path fixo; grants explícitos; nenhuma função nova com
-- execute para anon (a lista pública do S14 continua com 17); RLS ligada; políticas com (select ...).
-- public_settings ganha a 13ª chave (post_photos.uploads_enabled).
-- =============================================================================

-- ---------------------------------------------------------------- 1) kill switch
insert into public.app_settings (key, value, description) values
  ('post_photos.uploads_enabled', 'true'::jsonb, 'Kill switch do envio de foto no composer de post do herói.')
on conflict (key) do nothing;

-- Mesma lista da 0042 + a chave nova (função sql: redefinida inteira, mesma assinatura e grants).
create or replace function public.public_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from public.app_settings
  where key in ('commerce.enabled', 'ai.enabled', 'experiment.open', 'ai.provider', 'video.provider', 'ai.rate_limit_per_hour',
                'transport.minutes_per_step', 'recipes.ratings_enabled', 'recipes.comments_enabled', 'recipes.uploads_enabled',
                'avatars.uploads_enabled', 'hero_covers.uploads_enabled', 'post_photos.uploads_enabled')
$$;

-- ---------------------------------------------------------------- 2) envios (só o servidor e as RPCs escrevem)
create table if not exists public.post_photo_uploads (
  id uuid primary key default gen_random_uuid(),
  -- set null: a conta some e a linha fica até o cron apagar o objeto (e as referências)
  user_id uuid references auth.users (id) on delete set null,
  path text not null unique
    check (path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'),
  bytes integer not null check (bytes > 0 and bytes <= 3670016),
  mime text not null check (mime in ('image/webp', 'image/jpeg')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists post_photo_uploads_user_created_idx on public.post_photo_uploads (user_id, created_at desc) where user_id is not null;
create index if not exists post_photo_uploads_pending_idx on public.post_photo_uploads (created_at) where deleted_at is null;
alter table public.post_photo_uploads enable row level security;

-- Leitura: o próprio (histórico) e o admin. Escrita: ninguém pela API (RPCs definer e service role).
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_photo_uploads' and policyname = 'post_photo_uploads_select') then
    create policy post_photo_uploads_select on public.post_photo_uploads for select to authenticated
      using (user_id = (select auth.uid()) or (select public.is_admin()));
  end if;
end $$;
revoke all on table public.post_photo_uploads from public, anon;
revoke insert, update, delete, truncate, references, trigger on table public.post_photo_uploads from authenticated;
grant select on table public.post_photo_uploads to authenticated;
grant all on table public.post_photo_uploads to service_role;

-- ---------------------------------------------------------------- 3) caminho a partir da URL pública (uso interno)
-- '<qualquer host>/storage/v1/object/public/post-photos/<user>/<uuid>.(webp|jpg)' → caminho; senão null.
create or replace function public.post_photo_path(p_url text)
returns text language sql immutable set search_path = public as $$
  select case when p_url is not null and length(p_url) <= 300
    and p_url ~ '^https?://[^/\s?#]+/storage/v1/object/public/post-photos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'
    then substring(p_url from '/post-photos/(.*)$') end
$$;
revoke execute on function public.post_photo_path(text) from public, anon, authenticated;
grant execute on function public.post_photo_path(text) to service_role;

-- Foto utilizável pelo usuário: reservada por ele, não apagada e (com o schema storage presente) já
-- gravada no bucket. Uso interno dos guards e da publicação (definer chamam por dentro).
create or replace function public.post_photo_usable(p_path text, p_uid uuid)
returns boolean language plpgsql stable set search_path = public as $$
declare v_stored boolean := true;
begin
  if p_path is null or p_uid is null then return false; end if;
  if not exists (select 1 from public.post_photo_uploads u where u.path = p_path and u.user_id = p_uid and u.deleted_at is null) then
    return false;
  end if;
  if to_regclass('storage.objects') is not null then
    execute 'select exists (select 1 from storage.objects where bucket_id = ''post-photos'' and name = $1)' into v_stored using p_path;
  end if;
  return v_stored;
end $$;
revoke execute on function public.post_photo_usable(text, uuid) from public, anon, authenticated;
grant execute on function public.post_photo_usable(text, uuid) to service_role;

-- ---------------------------------------------------------------- 4) reservar o envio: kill switch, herói ativo, cota e nome do objeto
create or replace function public.post_photo_upload_claim(p_bytes int, p_mime text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_ext text; v_path text;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not coalesce(public.public_settings() -> 'post_photos.uploads_enabled' = 'true'::jsonb, false) then
    raise exception 'uploads_disabled';
  end if;
  -- mesma regra de herói ativo da capa (0042): papel de herói (ou admin) e perfil ativo vinculado
  if public.hero_cover_active_creator(v_uid) is null then raise exception 'not_a_hero' using errcode = '42501'; end if;
  if p_mime = 'image/webp' then v_ext := 'webp';
  elsif p_mime = 'image/jpeg' then v_ext := 'jpg';
  else raise exception 'not_image'; end if;
  if p_bytes is null or p_bytes <= 0 then raise exception 'empty_file'; end if;
  if p_bytes > 3670016 then raise exception 'file_too_large'; end if;
  -- duas abas ao mesmo tempo não passam da cota
  perform pg_advisory_xact_lock(hashtext('post_photo_upload:' || v_uid::text));
  if (select count(*) from public.post_photo_uploads where user_id = v_uid and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too_many_uploads';
  end if;
  v_id := gen_random_uuid();
  v_path := v_uid::text || '/' || v_id::text || '.' || v_ext;
  insert into public.post_photo_uploads (id, user_id, path, bytes, mime) values (v_id, v_uid, v_path, p_bytes, p_mime);
  return v_path;
end $$;
revoke execute on function public.post_photo_upload_claim(int, text) from public, anon;
grant execute on function public.post_photo_upload_claim(int, text) to authenticated, service_role;

-- ---------------------------------------------------------------- 5) corpo só com foto do próprio herói
-- Provedor 'upload' escrito por usuário (não admin, não sistema, não confiável) só com uma foto que
-- ele mesmo reservou e gravou, em conteúdo do próprio herói, e que nenhum outro corpo usa.
create or replace function public.content_bodies_post_photo_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if new.media_provider is distinct from 'upload' then return new; end if;
  -- update que não mexe na mídia (ex.: texto do corpo) não precisa revalidar
  if tg_op = 'UPDATE' and old.media_provider = new.media_provider and old.media_ref is not distinct from new.media_ref then return new; end if;
  if v_uid is null or public.is_admin() or public.is_trusted_call() then return new; end if;
  if not exists (
    select 1 from public.content c join public.creator_profiles p on p.id = c.creator_id
    where c.id = new.content_id and p.user_id = v_uid
  ) or not public.post_photo_usable(new.media_ref, v_uid)
    or exists (select 1 from public.content_bodies b where b.media_provider = 'upload' and b.media_ref = new.media_ref and b.content_id <> new.content_id) then
    raise exception 'photo_media_forbidden' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.content_bodies_post_photo_guard() from public, anon;
grant execute on function public.content_bodies_post_photo_guard() to authenticated, service_role;
create or replace trigger trg_a_content_bodies_post_photo before insert or update on public.content_bodies
  for each row execute function public.content_bodies_post_photo_guard();

-- ---------------------------------------------------------------- 6) capa do conteúdo com foto do bucket só se for do próprio herói
-- cover_url é gravável pelo herói (guard de colunas): sem isto, um herói usaria a foto de outro
-- (pública) como capa do próprio post. Só olha URLs do bucket post-photos.
create or replace function public.content_post_photo_cover_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if new.cover_url is null or position('/post-photos/' in new.cover_url) = 0 then return new; end if;
  if tg_op = 'UPDATE' and old.cover_url is not distinct from new.cover_url and old.creator_id is not distinct from new.creator_id then return new; end if;
  if v_uid is null or public.is_admin() or public.is_trusted_call() then return new; end if;
  if not exists (select 1 from public.creator_profiles p where p.id = new.creator_id and p.user_id = v_uid)
     or not public.post_photo_usable(public.post_photo_path(new.cover_url), v_uid) then
    raise exception 'photo_media_forbidden' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.content_post_photo_cover_guard() from public, anon;
grant execute on function public.content_post_photo_cover_guard() to authenticated, service_role;
create or replace trigger trg_b_content_post_photo_cover before insert or update on public.content
  for each row execute function public.content_post_photo_cover_guard();

-- ---------------------------------------------------------------- 7) publicar confere a foto
-- Mesma assinatura e lógica da 0027; acrescenta: provedor 'upload' precisa de referência e só vai ao
-- ar com foto reservada pelo próprio herói (não apagada). Defesa em profundidade além do gatilho.
create or replace function public.creator_publish_content(p_content uuid, p_publish_at timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_uid uuid := auth.uid(); v_creator uuid;
        v_provider public.media_provider; v_ref text; v_round int;
        v_feedback constant text := 'Publicação direta pelo herói';
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.my_creator_id();
  select * into c from public.content where id = p_content for update;
  if not found or v_creator is null or c.creator_id is distinct from v_creator then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status <> 'draft' then raise exception 'not_draft'; end if;
  if public.content_review_required(c.type) then raise exception 'review_required'; end if;
  if p_publish_at is not null and (p_publish_at < now() + interval '1 minute' or p_publish_at > now() + interval '365 days') then
    raise exception 'invalid_publish_at' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(c.title, '')), '') is null then raise exception 'missing_title'; end if;
  select b.media_provider, nullif(btrim(coalesce(b.media_ref, '')), '') into v_provider, v_ref
  from public.content_bodies b where b.content_id = p_content;
  if not found then raise exception 'missing_body'; end if;
  if c.type = 'video' and (v_provider = 'none' or v_ref is null) then raise exception 'missing_media'; end if;
  if v_provider = 'upload' and v_ref is null then raise exception 'missing_media'; end if;
  perform public.content_assert_media_license(p_content);
  if v_provider = 'cloudflare_stream' and not exists (
    select 1 from public.stream_uploads s where s.uid = v_ref and s.creator_id = v_creator and s.discarded_at is null
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_provider = 'upload' and not exists (
    select 1 from public.post_photo_uploads u where u.path = v_ref and u.user_id = v_uid and u.deleted_at is null
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- checagens feitas: só agora liga o sinalizador, e desliga antes de qualquer outra coisa
  perform set_config('app.trusted', 'on', true);
  update public.content
  set status = 'published', review_status = 'approved',
      published_at = coalesce(p_publish_at, now()), publish_at = p_publish_at,
      access_level = coalesce(access_level, 'free')
  where id = p_content;
  perform set_config('app.trusted', 'off', true);

  update public.content_reviews
  set decision = 'approved', feedback = v_feedback, decided_by = v_uid, decided_at = now()
  where content_id = p_content and decision = 'in_review';
  if not found then
    select coalesce(max(round), 0) + 1 into v_round from public.content_reviews where content_id = p_content;
    insert into public.content_reviews (content_id, round, submitted_by, decision, feedback, decided_by, decided_at, requested_publish_at)
    values (p_content, v_round, v_uid, 'approved', v_feedback, v_uid, now(), p_publish_at);
  end if;

  perform public.audit_log('content.creator_publish', 'content', p_content::text,
    jsonb_build_object('status', c.status, 'review_status', c.review_status, 'access_level', c.access_level, 'publish_at', c.publish_at),
    jsonb_build_object('status', 'published', 'review_status', 'approved', 'access_level', coalesce(c.access_level, 'free'),
                       'media_provider', v_provider, 'media_license_kind', c.media_license_kind, 'publish_at', p_publish_at),
    null, 'creator');
  if p_publish_at is not null then
    return jsonb_build_object('id', c.id, 'slug', c.slug, 'status', 'published', 'publish_at', p_publish_at);
  end if;
  return jsonb_build_object('id', c.id, 'slug', c.slug, 'status', 'published');
end $$;
revoke execute on function public.creator_publish_content(uuid, timestamptz) from public, anon;
grant execute on function public.creator_publish_content(uuid, timestamptz) to authenticated, service_role;

-- ---------------------------------------------------------------- 8) descartar rascunho de foto
-- Como creator_discard_video_draft (0026): só o rascunho do próprio herói que nunca foi ao ar e
-- cujo corpo é foto ('upload'). Apaga o conteúdo (filhos cascateiam; uso em programa vira
-- 'content_in_use') e devolve o caminho da foto quando ela é do herói, não apagada e nenhum outro
-- conteúdo a usa (corpo ou capa): o servidor apaga o objeto e marca o envio. Se falhar, a foto
-- fica sem referência e a limpeza diária a apaga.
create or replace function public.creator_discard_photo_draft(p_content uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_uid uuid := auth.uid(); v_creator uuid; v_provider public.media_provider; v_ref text; v_owned text;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.my_creator_id();
  select * into c from public.content where id = p_content for update;
  if not found or v_creator is null or c.creator_id is distinct from v_creator then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status <> 'draft' then raise exception 'not_draft'; end if;
  if c.published_at is not null then raise exception 'already_published'; end if;
  select b.media_provider, b.media_ref into v_provider, v_ref from public.content_bodies b where b.content_id = p_content;
  if not found or v_provider is distinct from 'upload' then raise exception 'not_photo'; end if;
  select u.path into v_owned from public.post_photo_uploads u
  where u.path = v_ref and u.user_id = v_uid and u.deleted_at is null
    and not exists (select 1 from public.content_bodies b2 where b2.media_provider = 'upload' and b2.media_ref = v_ref and b2.content_id <> p_content)
    and not exists (select 1 from public.content c2 where c2.id <> p_content and public.post_photo_path(c2.cover_url) = v_ref)
  for update of u;

  begin
    delete from public.content where id = p_content;
  exception when foreign_key_violation then
    raise exception 'content_in_use';
  end;

  perform public.audit_log('content.creator_discard', 'content', p_content::text,
    jsonb_build_object('status', c.status, 'slug', c.slug, 'title', c.title, 'media_provider', v_provider, 'media_ref', v_ref),
    null, null, 'creator');
  return jsonb_build_object('id', c.id, 'path', v_owned);
end $$;
revoke execute on function public.creator_discard_photo_draft(uuid) from public, anon;
grant execute on function public.creator_discard_photo_draft(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- 9) limpeza diária (só o cron, service role)
-- (a) envio com mais de 1 h que nenhum conteúdo usa (corpo 'upload' ou capa): descarte cuja remoção
--     falhou, aba fechada no meio, rascunho apagado pelo admin;
-- (b) envio de conta excluída (user_id nulo), mesmo em uso: o post fica sem a foto (o cron limpa as
--     referências antes de apagar o objeto). Nunca se apaga storage.objects por SQL.
create or replace function public.post_photo_orphan_uploads(p_limit int)
returns setof text language plpgsql stable set search_path = public as $$
begin
  return query
  select u.path from public.post_photo_uploads u
  where u.deleted_at is null
    and (u.user_id is null
         or (u.created_at < now() - interval '1 hour'
             and not exists (select 1 from public.content_bodies b where b.media_provider = 'upload' and b.media_ref = u.path)
             and not exists (select 1 from public.content c where c.cover_url like ('%/post-photos/' || u.path))))
  order by u.created_at, u.path
  limit least(greatest(coalesce(p_limit, 100), 1), 1000);
end $$;
revoke execute on function public.post_photo_orphan_uploads(int) from public, anon, authenticated;
grant execute on function public.post_photo_orphan_uploads(int) to service_role;

-- ---------------------------------------------------------------- 10) bucket público; nenhuma escrita pela API
do $$
begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise notice '0043: schema storage ausente; bucket post-photos não foi criado';
    return;
  end if;
  execute $sql$
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('post-photos', 'post-photos', true, 3670016, array['image/webp', 'image/jpeg'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types
  $sql$;
  -- Sem políticas em storage.objects para este bucket: só o service role (bypassrls) grava e apaga.
end $$;
