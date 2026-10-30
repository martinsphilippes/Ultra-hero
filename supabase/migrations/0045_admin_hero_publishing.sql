-- =============================================================================
-- Ultra Hero · 0045 · Só o administrador publica pelos heróis ("Publicar como hero")
--   Decisão do responsável: o herói (não admin) fica só com o "Novo post" rápido; conteúdos,
--   receitas, vínculos e painel passam a ser do admin, que escolhe o herói antes de cada fluxo.
--
-- Desenho: o servidor do app manda, só nas telas/ações do fluxo "Publicar como hero" do admin, o
--   cabeçalho HTTP `x-acting-hero: <creator_id>` (o PostgREST o expõe em request.headers). O banco
--   honra o cabeçalho SÓ quando quem chama é admin (is_admin()) e o herói existe e está ativo:
--   acting_hero_id() devolve o herói; my_creator_id() passa a devolver esse herói para o admin.
--   Assim todas as RPCs, políticas e gatilhos que já conferem "herói dono" (0025–0028, 0036, 0043)
--   valem para o admin agindo pelo herói X, sem variantes novas, e nunca para outra pessoa:
--     * herói, consumidor ou visitante com o cabeçalho: ignorado (is_admin() falso) — my_creator_id()
--       continua sendo o próprio herói (ou nulo);
--     * admin sem o cabeçalho (moderação, /admin/*): nada muda;
--     * herói suspenso/inexistente ou valor que não é uuid: ignorado.
--   O cabeçalho é escopo por requisição: não fica estado no banco entre chamadas.
--
-- Auditoria (admin_audit): escolher o herói (admin_act_as_hero) e cada escrita feita agindo pelo
--   herói — conteúdo criado/excluído/mudança de status e vínculo conteúdo–produto criado/excluído —
--   ganham uma linha 'hero_act.*' com o herói em after_data.acting_creator e actor_type 'admin'.
--
-- Também:
--   * post_photo_upload_claim (0043) aceita o admin agindo por um herói ativo (a foto fica na pasta
--     do admin; a publicação já confere o envio por auth.uid()).
--   * Storage recipe-media (0028): o navegador do admin envia a foto direto ao bucket; o Storage não
--     recebe o cabeçalho, então uma política nova deixa SÓ o admin enviar para a pasta
--     <creator_id>/<content_id>/ de um rascunho de receita de herói ativo, fora de revisão.
-- Regras: nada de drop/truncate; search_path fixo; grants explícitos; nenhuma função nova com
-- execute para anon (a lista pública do S14 continua com 17); nenhuma tabela nova; políticas com
-- (select ...).
-- =============================================================================

-- ---------------------------------------------------------------- 1) herói em nome de quem o admin age
-- Lê o cabeçalho antes de tudo (sem cabeçalho, nem consulta): o custo para quem não é admin é nulo.
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
  if not public.is_admin() then return null; end if;
  select c.id into v_id from public.creator_profiles c where c.id = v_raw::uuid and c.status = 'active';
  return v_id;
end $$;
revoke execute on function public.acting_hero_id() from public, anon;
grant execute on function public.acting_hero_id() to authenticated, service_role;

-- Mesma assinatura e grants da 0001/0016 (anon segue executando: está na lista pública do S14).
-- O admin agindo por um herói vale primeiro; fora disso, o perfil ativo vinculado, como antes.
create or replace function public.my_creator_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    public.acting_hero_id(),
    (select c.id from public.creator_profiles c where c.user_id = auth.uid() and c.status = 'active' limit 1))
$$;

-- ---------------------------------------------------------------- 2) escolher o herói (auditado)
-- O app chama ao tocar num herói do seletor: confere admin e herói ativo e registra a escolha.
create or replace function public.admin_act_as_hero(p_creator uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.creator_profiles%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.creator_profiles where id = p_creator and status = 'active';
  if not found then raise exception 'hero_unavailable'; end if;
  perform public.audit_log('hero_act.select', 'creator_profile', c.id::text, null,
    jsonb_build_object('acting_creator', c.id, 'slug', c.slug, 'name', c.name), null, 'admin');
  return jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'avatar_url', c.avatar_url);
end $$;
revoke execute on function public.admin_act_as_hero(uuid) from public, anon;
grant execute on function public.admin_act_as_hero(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- 3) auditoria das escritas em nome do herói
-- Conteúdo: criar, excluir e mudar status/revisão/agendamento/herói (o autosave do editor não entra).
-- Vínculo conteúdo–produto: criar e excluir.
create or replace function public.acting_hero_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_acting uuid; v_row jsonb; v_old jsonb;
begin
  v_acting := public.acting_hero_id();
  if v_acting is null then return null; end if;
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
      null, 'admin');
  else
    perform public.audit_log('hero_act.' || tg_table_name || '.' || lower(tg_op), tg_table_name, v_row ->> 'id', null,
      jsonb_build_object('acting_creator', v_acting, 'content_id', v_row -> 'content_id', 'product_id', v_row -> 'product_id', 'status', v_row -> 'status'),
      null, 'admin');
  end if;
  return null;
end $$;
revoke execute on function public.acting_hero_audit() from public, anon;
grant execute on function public.acting_hero_audit() to authenticated, service_role;

create or replace trigger trg_z_content_acting_audit
  after insert or delete or update of status, review_status, publish_at, creator_id on public.content
  for each row execute function public.acting_hero_audit();
create or replace trigger trg_z_content_product_links_acting_audit
  after insert or delete on public.content_product_links
  for each row execute function public.acting_hero_audit();

-- ---------------------------------------------------------------- 4) foto do post: admin agindo por herói ativo
-- Igual à 0043, com uma regra a mais: além do herói ativo vinculado, o admin com acting_hero_id().
create or replace function public.post_photo_upload_claim(p_bytes int, p_mime text)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_ext text; v_path text;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not coalesce(public.public_settings() -> 'post_photos.uploads_enabled' = 'true'::jsonb, false) then
    raise exception 'uploads_disabled';
  end if;
  -- mesma regra de herói ativo da capa (0042): papel de herói (ou admin) e perfil ativo vinculado;
  -- ou o admin publicando por um herói ativo (0045)
  if public.hero_cover_active_creator(v_uid) is null and public.acting_hero_id() is null then
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

-- ---------------------------------------------------------------- 5) foto de receita: envio do admin
-- Caminho <creator_id>/<content_id>/<uuid>.<ext> de rascunho de receita (fora de revisão) de herói
-- ativo, e quem envia é admin. Invoker: a leitura de content passa pela RLS (o admin vê tudo).
create or replace function public.recipe_media_admin_path_ok(p_name text)
returns boolean language plpgsql stable set search_path = public as $$
declare v_parts text[];
begin
  if p_name is null or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$' then
    return false;
  end if;
  if not public.is_admin() then return false; end if;
  v_parts := string_to_array(p_name, '/');
  return exists (
    select 1 from public.content c join public.creator_profiles p on p.id = c.creator_id
    where c.id = v_parts[2]::uuid and c.creator_id = v_parts[1]::uuid and p.status = 'active'
      and c.type = 'recipe' and c.status = 'draft' and c.review_status <> 'in_review');
end $$;
revoke execute on function public.recipe_media_admin_path_ok(text) from public, anon;
grant execute on function public.recipe_media_admin_path_ok(text) to authenticated, service_role;

do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice '0045: schema storage ausente; política de envio do admin em recipe-media não foi criada';
    return;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'admin_recipe_media_insert') then
    execute $sql$
      create policy admin_recipe_media_insert on storage.objects for insert to authenticated
        with check (bucket_id = 'recipe-media'
                    and (select public.is_admin())
                    and public.recipe_media_admin_path_ok(name)
                    and public.recipe_setting_on('recipes.uploads_enabled')
                    and public.recipe_media_quota_ok())
    $sql$;
  end if;
end $$;
