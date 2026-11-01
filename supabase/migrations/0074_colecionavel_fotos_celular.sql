-- =============================================================================
-- Ultra Hero · 0074 · Fotos do colecionável enviadas do celular pelo admin
--   Até aqui o formulário do colecionável pedia endereços de imagem (um por linha). Agora o admin tira
--   a foto ou escolhe uma da galeria, no mesmo desenho de segurança da foto do post (0043): o
--   navegador reduz a foto, o servidor confere tipo e dimensões pelos bytes, reserva o envio aqui e
--   grava no bucket público `post-photos` com o service role. A URL pública entra em
--   collectibles.photos (o CHECK da 0057 já aceita https://).
--
--   * collectible_photo_upload_claim: reserva pelo ADMIN (sem herói; post_photo_upload_claim exige
--     herói ativo ou o admin agindo por um). Mesma tabela post_photo_uploads, mesmo kill switch
--     (post_photos.uploads_enabled), mesma cota de 30 por hora por conta e mesmo nome de objeto
--     <user_id>/<uuid>.(webp|jpg). Nada muda para o herói.
--   * post_photo_orphan_uploads: a foto usada por um colecionável deixa de contar como órfã (senão a
--     limpeza diária apagaria a foto 1 h depois do envio). Mesma assinatura e grants da 0043.
-- Regras: nada de drop/truncate; search_path fixo; grants explícitos; nenhuma função nova com execute
-- para anon (a lista pública do S14 continua com 18); nenhuma tabela nem política nova.
-- =============================================================================

-- ---------------------------------------------------------------- 1) reserva do envio pelo admin
create or replace function public.collectible_photo_upload_claim(p_bytes int, p_mime text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_ext text; v_path text;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not coalesce(public.public_settings() -> 'post_photos.uploads_enabled' = 'true'::jsonb, false) then
    raise exception 'uploads_disabled';
  end if;
  if p_mime = 'image/webp' then v_ext := 'webp';
  elsif p_mime = 'image/jpeg' then v_ext := 'jpg';
  else raise exception 'not_image'; end if;
  if p_bytes is null or p_bytes <= 0 then raise exception 'empty_file'; end if;
  if p_bytes > 3670016 then raise exception 'file_too_large'; end if;
  -- duas abas ao mesmo tempo não passam da cota (mesma chave da foto do post: a cota é por conta)
  perform pg_advisory_xact_lock(hashtext('post_photo_upload:' || v_uid::text));
  if (select count(*) from public.post_photo_uploads where user_id = v_uid and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too_many_uploads';
  end if;
  v_id := gen_random_uuid();
  v_path := v_uid::text || '/' || v_id::text || '.' || v_ext;
  insert into public.post_photo_uploads (id, user_id, path, bytes, mime) values (v_id, v_uid, v_path, p_bytes, p_mime);
  return v_path;
end $$;
revoke execute on function public.collectible_photo_upload_claim(int, text) from public, anon;
grant execute on function public.collectible_photo_upload_claim(int, text) to authenticated, service_role;

-- ---------------------------------------------------------------- 2) limpeza diária preserva as fotos dos colecionáveis
-- Igual à 0043, com uma referência a mais: collectibles.photos (URL pública do objeto). Ao contrário da foto
-- do post (conteúdo do próprio herói, que sai junto com a conta), a foto do colecionável é da plataforma:
-- fica mesmo que a conta do admin que enviou tenha sido excluída (user_id nulo).
create or replace function public.post_photo_orphan_uploads(p_limit int)
returns setof text language plpgsql stable set search_path = public as $$
begin
  return query
  select u.path from public.post_photo_uploads u
  where u.deleted_at is null
    and not exists (select 1 from public.collectibles k where exists (select 1 from unnest(k.photos) ph where ph like ('%/post-photos/' || u.path)))
    and (u.user_id is null
         or (u.created_at < now() - interval '1 hour'
             and not exists (select 1 from public.content_bodies b where b.media_provider = 'upload' and b.media_ref = u.path)
             and not exists (select 1 from public.content c where c.cover_url like ('%/post-photos/' || u.path))))
  order by u.created_at, u.path
  limit least(greatest(coalesce(p_limit, 100), 1), 1000);
end $$;
revoke execute on function public.post_photo_orphan_uploads(int) from public, anon, authenticated;
grant execute on function public.post_photo_orphan_uploads(int) to service_role;
