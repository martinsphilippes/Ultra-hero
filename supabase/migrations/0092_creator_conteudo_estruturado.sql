-- =============================================================================
-- Groscove Ultra · 0092 · O creator cria conteúdo estruturado pelo próprio portal
-- Pedido do responsável (03/11): "O creator tem que ter a opção do Novo conteúdo! Para um post estruturado."
-- Cenário S99. Idempotente (create or replace); nada de drop de tabela/coluna; nenhuma função nova com execute para
-- anon (S14 segue 18); as RPCs recriadas mantêm a MESMA assinatura (sem sobrecarga nova).
--
-- Decisões (sem perguntar ao responsável):
--   • O banco já deixava o Hero dono (my_creator_id) criar rascunho, gravar corpo/blocos, publicar direto
--     (creator_publish_content, 0025/0043) ou enviar para revisão (submit_content_for_review, quando o admin liga
--     "Exigir revisão" para o tipo: content_review_required). A 0045 tinha fechado isso só no app; agora o app abre
--     /creator/content/new e esta migração só fecha o que faltava para a EQUIPE do Hero (0091):
--       - titular e membros criam, editam rascunho, publicam/enviam para revisão (como já era por my_creator_id);
--       - tirar do ar (despublicar), arquivar ou excluir conteúdo que JÁ ESTEVE NO AR (published_at preenchido) só o
--         titular, o admin (inclusive agindo pelo Hero) e a agência que representa o Hero (0070). O membro recebe
--         'owner_only'. Rascunho que nunca foi ao ar o membro ainda pode arquivar/descartar (é trabalho dele).
--   • Capa/foto do membro: post_photo_upload_claim (0045) só reconhecia o titular (hero_cover_active_creator, pelo
--     user_id) ou o admin agindo; o membro, que a 0091 já deixa postar pelo Hero, recebia not_a_hero ao enviar a capa
--     do conteúdo ou a foto do post. Passa a aceitar também quem tem Hero por my_creator_id() (titular ou membro
--     ativo de Hero ativo). A reserva continua na pasta de quem envia e com a mesma cota; foto e capa do PERFIL do
--     Hero seguem só com o titular (outras RPCs, sem mudança).
--   • Hero PENDENTE (aguardando o admin aprovar, criado por convite 0091): o titular e os membros já preparam posts e
--     conteúdos. my_creator_id() passa a devolver o Hero pendente quando a pessoa não tem Hero ativo (ativo sempre
--     vence; suspenso nunca). Criar e editar rascunho vale como sempre (por my_creator_id). PUBLICAR não: o gatilho
--     content_hero_active_guard recusa ('hero_not_active') qualquer passagem para 'published' (publicação direta,
--     agendada, aprovação do admin, restaurar, receita) enquanto o Hero não está ativo; o rascunho/enviado fica
--     guardado e basta publicar depois da aprovação. Nada de Hero pendente aparece ao público (perfil público e
--     conteúdo publicado exigem Hero ativo). Suspenso continua sem poder postar (nem rascunho).
--   • Creator em mais de um Hero: o app manda o cabeçalho `x-my-hero: <creator_id>` e my_creator_id() passa a
--     devolver esse Hero SÓ quando quem chama está ativo na equipe dele e o Hero está ativo. Não se reaproveitou o
--     x-acting-hero (acting_hero_id) de propósito: ele é a autoridade de hero_avatar_set/hero_avatar_clear e da capa
--     (0070), que na 0091 ficaram só com o titular; my_creator_id() é exatamente o conjunto "o membro age pelo
--     Hero" da 0091. Sem o cabeçalho (ou com um Hero de que a pessoa não faz parte) nada muda: titular primeiro,
--     depois a equipe mais antiga. O Storage (fotos de receita) não recebe o cabeçalho: receitas seguem pelo Hero
--     padrão da pessoa (o app só oferece Receita para ele).
-- =============================================================================

-- 1) Hero escolhido pelo creator que está em mais de uma equipe ---------------------------------------------------
-- Interna (só my_creator_id, definer, chama). Hero ativo ou pendente (rascunhos; publicar exige ativo, seção 7). Lê o cabeçalho antes de tudo: sem ele, nem consulta.
create or replace function public.my_hero_header_id()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_headers text; v_raw text; v_id uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then return null; end if;
  v_headers := nullif(current_setting('request.headers', true), '');
  if v_headers is null or position('x-my-hero' in v_headers) = 0 then return null; end if;
  begin
    v_raw := v_headers::json ->> 'x-my-hero';
  exception when others then
    return null;
  end;
  -- regex completa antes do cast: valor estranho não vira erro 22P02
  if v_raw is null or v_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  select c.id into v_id
  from public.creator_team_members m join public.creator_profiles c on c.id = m.creator_profile_id and c.status in ('active', 'pending')
  where m.user_id = v_uid and m.status = 'active' and m.creator_profile_id = v_raw::uuid;
  return v_id;
end $$;
revoke execute on function public.my_hero_header_id() from public, anon, authenticated;
grant execute on function public.my_hero_header_id() to service_role;

-- Mesma assinatura e grants da 0016/0091 (anon segue executando: está na lista pública do S14).
create or replace function public.my_creator_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    public.acting_hero_id(),
    public.my_hero_header_id(),
    (select c.id from public.creator_profiles c where c.user_id = auth.uid() and c.status = 'active' limit 1),
    (select m.creator_profile_id from public.creator_team_members m
     join public.creator_profiles c on c.id = m.creator_profile_id and c.status = 'active'
     where m.user_id = auth.uid() and m.status = 'active' order by m.created_at limit 1),
    -- 0092: Hero pendente (ainda sem aprovação) só para preparar rascunhos; publicar exige Hero ativo
    (select c.id from public.creator_profiles c where c.user_id = auth.uid() and c.status = 'pending' limit 1),
    (select m.creator_profile_id from public.creator_team_members m
     join public.creator_profiles c on c.id = m.creator_profile_id and c.status = 'pending'
     where m.user_id = auth.uid() and m.status = 'active' order by m.created_at limit 1))
$$;
revoke execute on function public.my_creator_id() from public;
grant execute on function public.my_creator_id() to anon, authenticated, service_role;

-- 2) quem tira do ar / arquiva / exclui o que já esteve no ar -------------------------------------------------------
-- Interna: admin (também agindo pelo Hero), titular do Hero ou agência que o representa (0070).
create or replace function public.hero_can_remove(p_creator uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_creator is not null and (
    public.is_admin()
    or coalesce(public.creator_team_role(p_creator, auth.uid()) = 'owner', false)
    or p_creator = any (public.agency_hero_ids()))
$$;
revoke execute on function public.hero_can_remove(uuid) from public, anon, authenticated;
grant execute on function public.hero_can_remove(uuid) to service_role;

-- 3) despublicar: mesma função da 0025 + só titular/admin/agência ---------------------------------------------------
create or replace function public.creator_unpublish_content(p_content uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_creator uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.my_creator_id();
  select * into c from public.content where id = p_content for update;
  if not found or v_creator is null or c.creator_id is distinct from v_creator then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status <> 'published' then raise exception 'not_published'; end if;
  -- 0092: tirar do ar é do titular (o membro da equipe pede a ele)
  if not public.hero_can_remove(c.creator_id) then raise exception 'owner_only' using errcode = '42501'; end if;

  perform set_config('app.trusted', 'on', true);
  update public.content set status = 'draft', review_status = 'none', publish_at = null where id = p_content;
  perform set_config('app.trusted', 'off', true);

  perform public.audit_log('content.creator_unpublish', 'content', p_content::text,
    jsonb_build_object('status', c.status, 'review_status', c.review_status, 'publish_at', c.publish_at),
    jsonb_build_object('status', 'draft', 'review_status', 'none'),
    null, 'creator');
  return jsonb_build_object('id', c.id, 'slug', c.slug, 'status', 'draft');
end $$;
revoke execute on function public.creator_unpublish_content(uuid) from public, anon;
grant execute on function public.creator_unpublish_content(uuid) to authenticated, service_role;

-- 4) arquivar: mesma função da 0027 + o que já esteve no ar só titular/admin/agência --------------------------------
create or replace function public.creator_archive_content(p_content uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_uid uuid := auth.uid(); v_creator uuid;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.my_creator_id();
  select * into c from public.content where id = p_content for update;
  if not found or v_creator is null or c.creator_id is distinct from v_creator then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.status = 'archived' then raise exception 'already_archived'; end if;
  if (c.status = 'published' or c.published_at is not null) and not public.hero_can_remove(c.creator_id) then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if c.review_status = 'in_review' then
    update public.content_reviews set decision = 'returned', feedback = 'Arquivada pelo Hero', decided_by = v_uid, decided_at = now()
    where content_id = p_content and decision = 'in_review';
  end if;
  perform set_config('app.trusted', 'on', true);
  update public.content
  set status = 'archived', archived_at = now(), archived_by = 'creator', publish_at = null,
      review_status = case when c.review_status = 'in_review' then 'none'::public.review_status else c.review_status end
  where id = p_content;
  perform set_config('app.trusted', 'off', true);
  perform public.audit_log('content.creator_archive', 'content', p_content::text,
    jsonb_build_object('status', c.status, 'review_status', c.review_status, 'publish_at', c.publish_at),
    jsonb_build_object('status', 'archived', 'archived_by', 'creator'), nullif(btrim(coalesce(p_reason, '')), ''), 'creator');
  return jsonb_build_object('id', c.id, 'status', 'archived');
end $$;
revoke execute on function public.creator_archive_content(uuid, text) from public, anon;
grant execute on function public.creator_archive_content(uuid, text) to authenticated, service_role;

-- 5) excluir receita: mesma função da 0036 + arquivada que já esteve no ar só titular/admin/agência -----------------
create or replace function public.creator_delete_recipe(p_content uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_creator uuid; v_paths text[]; v_provider public.media_provider; v_ref text; v_owned text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.my_creator_id();
  select * into c from public.content where id = p_content for update;
  if not found or v_creator is null or c.creator_id is distinct from v_creator then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.type <> 'recipe' then raise exception 'not_recipe' using errcode = '22023'; end if;
  if c.status = 'archived' then
    if c.archived_by is distinct from 'creator' then raise exception 'archived_by_admin'; end if;
    if c.published_at is not null and not public.hero_can_remove(c.creator_id) then raise exception 'owner_only' using errcode = '42501'; end if;
  elsif c.status = 'draft' then
    if c.published_at is not null then raise exception 'already_published'; end if;
    if c.review_status = 'in_review' then raise exception 'content_not_editable' using errcode = '42501'; end if;
  else
    raise exception 'not_deletable';
  end if;
  select coalesce(array_agg(m.storage_path order by m.storage_path), '{}') into v_paths from public.recipe_media m where m.content_id = p_content;
  select b.media_provider, b.media_ref into v_provider, v_ref from public.content_bodies b where b.content_id = p_content;
  -- o vídeo do Stream só é descartado se foi este Hero que enviou e nenhum outro conteúdo o usa
  if v_provider = 'cloudflare_stream' then
    select s.uid into v_owned from public.stream_uploads s
    where s.uid = v_ref and s.creator_id = v_creator and s.discarded_at is null and (s.content_id is null or s.content_id = p_content)
      and not exists (select 1 from public.content_bodies b2 where b2.media_provider = 'cloudflare_stream' and b2.media_ref = v_ref and b2.content_id <> p_content)
    for update of s;
  end if;
  begin
    delete from public.content where id = p_content;
  exception when foreign_key_violation then
    raise exception 'content_in_use';
  end;
  if v_owned is not null then update public.stream_uploads set discarded_at = now() where uid = v_owned; end if;
  perform public.audit_log('content.creator_delete', 'content', p_content::text,
    jsonb_build_object('status', c.status, 'slug', c.slug, 'title', c.title, 'published_at', c.published_at,
                       'archived_by', c.archived_by, 'media_paths', to_jsonb(v_paths), 'media_ref', v_ref),
    null, null, 'creator');
  return jsonb_build_object('id', c.id, 'slug', c.slug, 'paths', to_jsonb(v_paths), 'uid', v_owned);
end $$;
revoke execute on function public.creator_delete_recipe(uuid) from public, anon;
grant execute on function public.creator_delete_recipe(uuid) to authenticated, service_role;

-- 6) reserva da foto (capa do conteúdo e foto do post): também o membro da equipe (0092) ------------------------------
-- Igual à 0045, com uma regra a mais: quem tem Hero por my_creator_id() (titular ou membro ativo, Hero ativo).
create or replace function public.post_photo_upload_claim(p_bytes int, p_mime text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_ext text; v_path text;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not coalesce(public.public_settings() -> 'post_photos.uploads_enabled' = 'true'::jsonb, false) then
    raise exception 'uploads_disabled';
  end if;
  -- Hero ativo da capa (0042), admin agindo por Hero ativo (0045) ou equipe do Hero (0091/0092)
  if public.hero_cover_active_creator(v_uid) is null and public.acting_hero_id() is null and public.my_creator_id() is null then
    raise exception 'not_a_hero' using errcode = '42501';
  end if;
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

-- 7) publicar só com Hero ativo ---------------------------------------------------------------------------------------
create or replace function public.content_hero_active_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published' and new.creator_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and not exists (select 1 from public.creator_profiles c where c.id = new.creator_id and c.status = 'active') then
    raise exception 'hero_not_active' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.content_hero_active_guard() from public, anon, authenticated;
drop trigger if exists trg_content_hero_active_guard on public.content;
create trigger trg_content_hero_active_guard before insert or update of status on public.content
  for each row execute function public.content_hero_active_guard();
