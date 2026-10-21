-- =============================================================================
-- Ultra Hero · 0026 · Dono do vídeo do Cloudflare Stream amarrado no banco
--   Até a 0025 a checagem "o uid é deste herói" vivia só na server action: pelo PostgREST o herói
--   conseguia gravar no próprio rascunho qualquer media_ref cloudflare_stream (o uid de outro
--   herói é público no cover_url) e publicar pela RPC, republicando como seu o vídeo alheio.
--   Agora todo uid nasce em stream_uploads, gravado só pelo servidor (service role) no momento
--   em que o ticket de upload é criado, e o banco exige esse vínculo para gravar e publicar.
-- Regras desta migração: nada de drop/truncate; search_path fixo; grants explícitos; políticas
-- com (select ...) para avaliar uma vez por consulta; funções security definer fora da lista
-- pública do S14 (revogadas de public/anon). Colunas protegidas só com app.trusted (0010).
-- =============================================================================

-- ---------------------------------------------------------------- 1) tabela de envios
create table if not exists public.stream_uploads (
  uid text primary key check (uid ~ '^[0-9a-f]{32}$'),
  creator_id uuid not null references public.creator_profiles (id),
  -- o rascunho some quando é descartado; o envio fica como histórico (e para a limpeza diária)
  content_id uuid references public.content (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  discarded_at timestamptz,
  provider_deleted_at timestamptz
);
create index if not exists stream_uploads_creator_created_idx on public.stream_uploads (creator_id, created_at desc);
-- a limpeza diária procura descartados ainda não apagados no Cloudflare e envios vencidos
create index if not exists stream_uploads_pending_cleanup_idx on public.stream_uploads (expires_at) where provider_deleted_at is null;
create index if not exists stream_uploads_content_idx on public.stream_uploads (content_id) where content_id is not null;

alter table public.stream_uploads enable row level security;

-- Leitura: o próprio herói (contagem do limite por hora na action) e o admin. Escrita: ninguém
-- pela API; o service role (bypassrls) grava no ticket, no descarte e na limpeza.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'stream_uploads' and policyname = 'stream_uploads_select') then
    create policy stream_uploads_select on public.stream_uploads for select to authenticated
      using ((select public.is_admin()) or creator_id = (select public.my_creator_id()));
  end if;
end $$;

revoke all on table public.stream_uploads from public, anon;
revoke insert, update, delete, truncate, references, trigger on table public.stream_uploads from authenticated;
grant select on table public.stream_uploads to authenticated;
grant all on table public.stream_uploads to service_role;

-- Vídeos que já existiam antes desta migração: vínculo do uid com o dono do conteúdo, desde que
-- o uid apareça em conteúdos de um só herói (uid compartilhado entre heróis não é herdado).
-- Roda antes do gatilho de limite para não contar o histórico como envio novo.
insert into public.stream_uploads (uid, creator_id, content_id, created_at, expires_at)
select b.media_ref, min(c.creator_id::text)::uuid, (array_agg(c.id order by c.created_at))[1], min(c.created_at), min(c.created_at)
from public.content_bodies b join public.content c on c.id = b.content_id
where b.media_provider = 'cloudflare_stream' and b.media_ref ~ '^[0-9a-f]{32}$' and c.creator_id is not null
group by b.media_ref
having count(distinct c.creator_id) = 1
on conflict (uid) do nothing;

-- ---------------------------------------------------------------- 2) limite de envios por hora
-- Mais de 10 tickets do mesmo herói na última hora: abuso (ou laço no cliente). O lock por herói
-- serializa inserções concorrentes, senão duas requisições simultâneas passariam juntas da conta.
create or replace function public.stream_uploads_rate_limit()
returns trigger language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('stream_uploads:' || new.creator_id::text));
  if (select count(*) from public.stream_uploads
      where creator_id = new.creator_id and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_uploads' using errcode = '54000';
  end if;
  return new;
end $$;
revoke execute on function public.stream_uploads_rate_limit() from public, anon;
grant execute on function public.stream_uploads_rate_limit() to authenticated, service_role;
create or replace trigger trg_a_stream_uploads_rate_limit before insert on public.stream_uploads
  for each row execute function public.stream_uploads_rate_limit();

-- ---------------------------------------------------------------- 3) corpo só com uid do próprio herói
-- Mesmo padrão dos guards de 0010/0017: sistema (sem JWT), admin e funções confiáveis passam.
-- security definer para enxergar o vínculo e o conteúdo sem depender da RLS de quem grava.
create or replace function public.content_bodies_stream_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_creator uuid;
begin
  if new.media_provider is distinct from 'cloudflare_stream' then return new; end if;
  -- update que não mexe na mídia (ex.: texto do corpo) não precisa revalidar
  if tg_op = 'UPDATE' and old.media_provider = new.media_provider and old.media_ref is not distinct from new.media_ref then return new; end if;
  if auth.uid() is null or public.is_admin() or public.is_trusted_call() then return new; end if;
  select c.creator_id into v_creator from public.content c where c.id = new.content_id;
  if v_creator is null or not exists (
    select 1 from public.stream_uploads s
    where s.uid = new.media_ref and s.creator_id = v_creator and s.discarded_at is null
  ) then
    raise exception 'stream_media_forbidden' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.content_bodies_stream_guard() from public, anon;
grant execute on function public.content_bodies_stream_guard() to authenticated, service_role;
create or replace trigger trg_a_content_bodies_stream before insert or update on public.content_bodies
  for each row execute function public.content_bodies_stream_guard();

-- ---------------------------------------------------------------- 4) publicar exige o vínculo
-- Mesma assinatura e lógica da 0025; acrescenta: vídeo do Stream só vai ao ar com stream_uploads
-- do próprio herói para aquele uid (não descartado). Defesa em profundidade além do gatilho:
-- cobre corpo gravado antes desta migração ou por caminho confiável.
create or replace function public.creator_publish_content(p_content uuid)
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
  if nullif(btrim(coalesce(c.title, '')), '') is null then raise exception 'missing_title'; end if;
  select b.media_provider, nullif(btrim(coalesce(b.media_ref, '')), '') into v_provider, v_ref
  from public.content_bodies b where b.content_id = p_content;
  if not found then raise exception 'missing_body'; end if;
  if c.type = 'video' and (v_provider = 'none' or v_ref is null) then raise exception 'missing_media'; end if;
  perform public.content_assert_media_license(p_content);
  if v_provider = 'cloudflare_stream' and not exists (
    select 1 from public.stream_uploads s where s.uid = v_ref and s.creator_id = v_creator and s.discarded_at is null
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- checagens feitas: só agora liga o sinalizador, e desliga antes de qualquer outra coisa
  perform set_config('app.trusted', 'on', true);
  update public.content
  set status = 'published', review_status = 'approved', published_at = now(), publish_at = null,
      access_level = coalesce(access_level, 'free')
  where id = p_content;
  perform set_config('app.trusted', 'off', true);

  update public.content_reviews
  set decision = 'approved', feedback = v_feedback, decided_by = v_uid, decided_at = now()
  where content_id = p_content and decision = 'in_review';
  if not found then
    select coalesce(max(round), 0) + 1 into v_round from public.content_reviews where content_id = p_content;
    insert into public.content_reviews (content_id, round, submitted_by, decision, feedback, decided_by, decided_at)
    values (p_content, v_round, v_uid, 'approved', v_feedback, v_uid, now());
  end if;

  perform public.audit_log('content.creator_publish', 'content', p_content::text,
    jsonb_build_object('status', c.status, 'review_status', c.review_status, 'access_level', c.access_level, 'publish_at', c.publish_at),
    jsonb_build_object('status', 'published', 'review_status', 'approved', 'access_level', coalesce(c.access_level, 'free'),
                       'media_provider', v_provider, 'media_license_kind', c.media_license_kind),
    null, 'creator');
  return jsonb_build_object('id', c.id, 'slug', c.slug, 'status', 'published');
end $$;
revoke execute on function public.creator_publish_content(uuid) from public, anon;
grant execute on function public.creator_publish_content(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- 5) descartar rascunho de vídeo
-- O herói não apaga conteúdo pela RLS (content_delete_admin). Esta RPC apaga só o rascunho de
-- vídeo do Stream do próprio herói que nunca foi ao ar (published_at nulo: algo que já esteve
-- publicado pode ter links e histórico; despublicado não é descartável). Os filhos de content
-- cascateiam; program_items/completions/substituições são restrict e viram 'content_in_use'.
-- O envio fica marcado como descartado (content_id vira nulo pelo FK) e o servidor apaga o
-- vídeo no Cloudflare com o uid devolvido; se falhar, a limpeza diária tenta de novo.
create or replace function public.creator_discard_video_draft(p_content uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_creator uuid; v_provider public.media_provider; v_ref text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.my_creator_id();
  select * into c from public.content where id = p_content for update;
  if not found or v_creator is null or c.creator_id is distinct from v_creator then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status <> 'draft' then raise exception 'not_draft'; end if;
  if c.published_at is not null then raise exception 'already_published'; end if;
  select b.media_provider, b.media_ref into v_provider, v_ref from public.content_bodies b where b.content_id = p_content;
  if not found or v_provider is distinct from 'cloudflare_stream' then raise exception 'not_stream'; end if;

  begin
    delete from public.content where id = p_content;
  exception when foreign_key_violation then
    raise exception 'content_in_use';
  end;
  update public.stream_uploads set discarded_at = coalesce(discarded_at, now())
  where uid = v_ref and creator_id = v_creator;

  perform public.audit_log('content.creator_discard', 'content', p_content::text,
    jsonb_build_object('status', c.status, 'slug', c.slug, 'title', c.title, 'media_provider', v_provider, 'media_ref', v_ref),
    null, null, 'creator');
  return jsonb_build_object('id', c.id, 'uid', v_ref);
end $$;
revoke execute on function public.creator_discard_video_draft(uuid) from public, anon;
grant execute on function public.creator_discard_video_draft(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- 6) slug do rascunho
-- O rascunho do composer nasce com o título provisório ("post-em-video-xxxx"); antes de publicar
-- a action troca pelo slug do título final. slug é coluna protegida (guard_protected_columns),
-- por isso a troca passa por aqui com app.trusted, e só enquanto nunca foi ao ar (URL estável).
create or replace function public.creator_set_draft_slug(p_content uuid, p_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_creator uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.my_creator_id();
  select * into c from public.content where id = p_content for update;
  if not found or v_creator is null or c.creator_id is distinct from v_creator then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status <> 'draft' then raise exception 'not_draft'; end if;
  if c.published_at is not null then raise exception 'already_published'; end if;
  if p_slug is null or length(p_slug) > 120 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid_slug' using errcode = '22023';
  end if;
  if p_slug = c.slug then return jsonb_build_object('id', c.id, 'slug', c.slug); end if;

  perform set_config('app.trusted', 'on', true);
  begin
    update public.content set slug = p_slug where id = p_content;
  exception when unique_violation then
    perform set_config('app.trusted', 'off', true);
    -- sem errcode 23505: a action trata a mensagem (tenta outro sufixo) em vez de "duplicate"
    raise exception 'slug_taken';
  end;
  perform set_config('app.trusted', 'off', true);
  return jsonb_build_object('id', c.id, 'slug', p_slug);
end $$;
revoke execute on function public.creator_set_draft_slug(uuid, text) from public, anon;
grant execute on function public.creator_set_draft_slug(uuid, text) to authenticated, service_role;
