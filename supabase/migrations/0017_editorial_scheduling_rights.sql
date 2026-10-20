-- =============================================================================
-- Ultra Hero · 0017 · Frente editorial do DMR 1.0
--   1) Agendamento de publicação (RF-007): content.publish_at; "no ar" = publicado E data chegou.
--   2) Direitos por personalidade (RF-003, RF-004, RB-05, RB-06): rights_status/holder/valid_until
--      públicos e só o admin altera; documento e notas em tabela privada (só admin).
--   3) Licença e crédito da mídia (RF-008): media_license_kind/ref/credit no conteúdo, coerência
--      com o provedor validada no banco; origem do vínculo conteúdo↔personalidade registrada por trigger.
--   4) Informação nutricional validada (RF-006, RB-08) no corpo de receitas do seed.
-- Regras desta migração: nada de drop/delete/truncate (conector remoto); toda função com
-- search_path fixo e grants explícitos; políticas com (select ...) para avaliar uma vez por consulta.
-- =============================================================================

-- ---------------------------------------------------------------- 1) agendamento
alter table public.content add column if not exists publish_at timestamptz;
create index if not exists content_publish_at_idx on public.content (publish_at) where publish_at is not null;

-- "Está no ar?": publicado E (sem agendamento OU a data já chegou). Security invoker: só olha os
-- argumentos; é usada na política de leitura, na busca e na regra de acesso.
create or replace function public.content_is_live(p_status public.content_status, p_publish_at timestamptz)
returns boolean language sql stable set search_path = public as $$
  select p_status = 'published' and (p_publish_at is null or p_publish_at <= now())
$$;
revoke execute on function public.content_is_live(public.content_status, timestamptz) from public;
grant execute on function public.content_is_live(public.content_status, timestamptz) to anon, authenticated, service_role;

-- Público só vê o que está no ar; admin e a personalidade dona continuam vendo o agendado.
alter policy content_select on public.content
  using (public.content_is_live(status, publish_at) or (select public.is_admin())
         or (creator_id is not null and creator_id = (select public.my_creator_id())));

-- Regra única de consumo: agendado não é consumível pelo público (admin e dona continuam podendo).
create or replace function public.can_access_content(p_content uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare c public.content%rowtype;
begin
  select * into c from public.content where id = p_content;
  if not found then return false; end if;
  if public.is_admin() then return true; end if;
  if c.creator_id is not null and c.creator_id = public.my_creator_id() then return true; end if;
  if not public.content_is_live(c.status, c.publish_at) then return false; end if;
  if c.access_level is null then return false; end if;              -- sem regra: indisponível
  if auth.uid() is null then return false; end if;                   -- visitante não consome
  if c.access_level = 'free' then return true; end if;
  return c.required_module_id in (select public.user_entitled_modules(auth.uid()));
end $$;

-- Busca pública (assinatura de 0011) só devolve o que está no ar.
create or replace function public.search_content(p_query text, p_pillar public.pillar default null, p_type public.content_type default null,
  p_creator uuid default null, p_access public.access_level default null, p_limit int default 40, p_offset int default 0,
  p_difficulty text default null)
returns setof public.content language sql stable security definer set search_path = public, extensions as $$
  with q as (select nullif(trim(coalesce(p_query, '')), '') as raw)
  select c.* from public.content c, q
  where public.content_is_live(c.status, c.publish_at)
    and (p_pillar is null or c.pillar = p_pillar)
    and (p_type is null or c.type = p_type)
    and (p_creator is null or c.creator_id = p_creator)
    and (p_access is null or c.access_level = p_access)
    and (p_difficulty is null or c.difficulty = p_difficulty)
    and (q.raw is null
         or c.search @@ plainto_tsquery('simple', public.f_unaccent(q.raw))
         or public.f_unaccent(c.title) ilike '%' || public.f_unaccent(q.raw) || '%'
         or exists (select 1 from public.creator_profiles cp where cp.id = c.creator_id and public.f_unaccent(cp.name) ilike '%' || public.f_unaccent(q.raw) || '%')
         or exists (select 1 from public.program_items pi join public.program_versions pv on pv.id = pi.version_id join public.programs p on p.id = pv.program_id
                    where pi.content_id = c.id and p.status = 'published' and public.f_unaccent(pv.title) ilike '%' || public.f_unaccent(q.raw) || '%'))
  order by (case when q.raw is null then 0 else ts_rank(c.search, plainto_tsquery('simple', public.f_unaccent(q.raw))) end) desc,
           c.is_featured desc, c.published_at desc
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
$$;

-- ---------------------------------------------------------------- 3a) licença e crédito da mídia
alter table public.content add column if not exists media_license_kind text not null default 'platform_demo';
alter table public.content add column if not exists media_license_ref text;
alter table public.content add column if not exists media_credit text;
alter table public.content add column if not exists creator_link_origin text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'content_media_license_kind_check') then
    alter table public.content add constraint content_media_license_kind_check
      check (media_license_kind in ('platform_demo', 'own', 'licensed', 'third_party_embed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'content_creator_link_origin_check') then
    alter table public.content add constraint content_creator_link_origin_check
      check (creator_link_origin is null or creator_link_origin in ('creator_submission', 'admin_assignment'));
  end if;
end $$;

-- Coerência licença × provedor: embed de terceiros (YouTube/Vimeo) exige 'third_party_embed';
-- sem mídia só 'platform_demo' ou 'own'; mídia hospedada (stream/mux/upload) nunca é 'third_party_embed'.
create or replace function public.media_license_compatible(p_provider public.media_provider, p_kind text)
returns boolean language sql immutable set search_path = public as $$
  select case
    when p_provider in ('embed_youtube', 'embed_vimeo') then p_kind = 'third_party_embed'
    when p_provider = 'none' then p_kind in ('platform_demo', 'own')
    else p_kind in ('platform_demo', 'own', 'licensed')
  end
$$;
revoke execute on function public.media_license_compatible(public.media_provider, text) from public;
grant execute on function public.media_license_compatible(public.media_provider, text) to anon, authenticated, service_role;

-- O corpo é sempre a última escrita do editor (content e depois content_bodies), por isso a
-- validação definitiva fica no corpo; a publicação revalida (content_assert_media_license).
create or replace function public.content_media_license_check()
returns trigger language plpgsql set search_path = public as $$
declare v_kind text;
begin
  select media_license_kind into v_kind from public.content where id = new.content_id;
  if v_kind is not null and not public.media_license_compatible(new.media_provider, v_kind) then
    raise exception 'media_license_mismatch: % x %', new.media_provider, v_kind using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.content_media_license_check() from public, anon;
grant execute on function public.content_media_license_check() to authenticated, service_role;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_a_content_bodies_license' and tgrelid = 'public.content_bodies'::regclass) then
    create trigger trg_a_content_bodies_license before insert or update on public.content_bodies
      for each row execute function public.content_media_license_check();
  end if;
end $$;

-- Nada inconsistente vai ao ar: usada por admin_review_content e admin_set_content_status.
create or replace function public.content_assert_media_license(p_content uuid)
returns void language plpgsql stable set search_path = public as $$
declare v_provider public.media_provider; v_kind text;
begin
  select b.media_provider, c.media_license_kind into v_provider, v_kind
  from public.content c join public.content_bodies b on b.content_id = c.id where c.id = p_content;
  if v_provider is not null and not public.media_license_compatible(v_provider, v_kind) then
    raise exception 'media_license_mismatch: % x %', v_provider, v_kind using errcode = '23514';
  end if;
end $$;
revoke execute on function public.content_assert_media_license(uuid) from public, anon, authenticated;
grant execute on function public.content_assert_media_license(uuid) to service_role;

-- A personalidade passa a poder preencher licença e crédito do próprio rascunho (guarda de colunas).
create or replace trigger trg_a_content_guard before update on public.content
  for each row execute function public.guard_protected_columns('{title,summary,cover_url,duration_minutes,difficulty,tags,has_captions,pillar,type,source_locale,disclaimer_kind,media_license_kind,media_license_ref,media_credit}');

-- ---------------------------------------------------------------- 1b) RPCs do admin com agendamento
-- Sobrecargas de 4 parâmetros (sem default no último): as chamadas existentes com 3 parâmetros
-- continuam resolvendo para a versão antiga, que agora delega com p_publish_at = null (publicar agora).
-- Semântica: p_publish_at no futuro agenda (publish_at = published_at = data); nula ou no passado
-- publica agora (publish_at = null; published_at = agora quando ainda não estava no ar).
create or replace function public.admin_review_content(p_content uuid, p_decision public.review_status, p_feedback text, p_publish_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_missing text[] := '{}'; v_at timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_decision not in ('returned', 'approved', 'rejected') then raise exception 'invalid_decision'; end if;
  select * into c from public.content where id = p_content for update;
  if not found then raise exception 'content_not_found'; end if;

  update public.content_reviews set decision = p_decision, feedback = p_feedback, decided_by = auth.uid(), decided_at = now()
  where content_id = p_content and decision = 'in_review';

  if p_decision = 'approved' then
    -- bloqueio: sem regra de acesso ou sem corpo/mídia não pode ser consumido
    if c.access_level is null then v_missing := array_append(v_missing, 'access_level'); end if;
    if not exists (select 1 from public.content_bodies b where b.content_id = p_content) then v_missing := array_append(v_missing, 'body'); end if;
    if cardinality(v_missing) > 0 then raise exception 'cannot_publish_missing: %', array_to_string(v_missing, ','); end if;
    perform public.content_assert_media_license(p_content);
    v_at := case when p_publish_at is not null and p_publish_at > now() then p_publish_at end;
    update public.content set status = 'published', review_status = 'approved',
      publish_at = v_at,
      published_at = case when v_at is not null then v_at
                          when published_at is null or published_at > now() then now()
                          else published_at end
    where id = p_content;
  else
    update public.content set review_status = p_decision where id = p_content;
  end if;
  perform public.audit_log('content.review', 'content', p_content::text,
    jsonb_build_object('status', c.status, 'review_status', c.review_status, 'publish_at', c.publish_at),
    jsonb_build_object('decision', p_decision, 'publish_at', v_at), p_feedback);
end $$;

create or replace function public.admin_review_content(p_content uuid, p_decision public.review_status, p_feedback text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_review_content(p_content, p_decision, p_feedback, null::timestamptz);
end $$;

create or replace function public.admin_set_content_status(p_content uuid, p_status public.content_status, p_justification text, p_publish_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_at timestamptz;
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object('status', status, 'publish_at', publish_at) into v_before from public.content where id = p_content;
  if p_status = 'published' then perform public.content_assert_media_license(p_content); end if;
  v_at := case when p_status = 'published' and p_publish_at is not null and p_publish_at > now() then p_publish_at end;
  update public.content set status = p_status,
    archived_at = case when p_status = 'archived' then now() else null end,
    publish_at = v_at,   -- rascunho/arquivado descartam o agendamento
    published_at = case when p_status <> 'published' then published_at
                        when v_at is not null then v_at
                        when published_at is null or published_at > now() then now()
                        else published_at end
  where id = p_content;
  perform public.audit_log('content.set_status', 'content', p_content::text, v_before, jsonb_build_object('status', p_status, 'publish_at', v_at), p_justification);
end $$;

create or replace function public.admin_set_content_status(p_content uuid, p_status public.content_status, p_justification text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_set_content_status(p_content, p_status, p_justification, null::timestamptz);
end $$;

revoke execute on function public.admin_review_content(uuid, public.review_status, text, timestamptz) from public, anon;
grant execute on function public.admin_review_content(uuid, public.review_status, text, timestamptz) to authenticated, service_role;
revoke execute on function public.admin_review_content(uuid, public.review_status, text) from public, anon;
grant execute on function public.admin_review_content(uuid, public.review_status, text) to authenticated, service_role;
revoke execute on function public.admin_set_content_status(uuid, public.content_status, text, timestamptz) from public, anon;
grant execute on function public.admin_set_content_status(uuid, public.content_status, text, timestamptz) to authenticated, service_role;
revoke execute on function public.admin_set_content_status(uuid, public.content_status, text) from public, anon;
grant execute on function public.admin_set_content_status(uuid, public.content_status, text) to authenticated, service_role;

-- ---------------------------------------------------------------- 2) direitos por personalidade
-- Alegações públicas: 'fictional' (padrão da POC), 'pending' (em validação; nunca exibido como
-- autorizado) e 'authorized' (titular e validade exibidos na página). Só o admin altera.
alter table public.creator_profiles add column if not exists rights_status text not null default 'fictional';
alter table public.creator_profiles add column if not exists rights_holder text;
alter table public.creator_profiles add column if not exists rights_valid_until date;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'creator_profiles_rights_status_check') then
    alter table public.creator_profiles add constraint creator_profiles_rights_status_check
      check (rights_status in ('fictional', 'authorized', 'pending'));
  end if;
end $$;

-- Guarda específica (além de guard_protected_columns, que já protege toda coluna fora da lista).
create or replace function public.creator_rights_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() or public.is_trusted_call() then return new; end if;
  if new.rights_status is distinct from old.rights_status then raise exception 'protected_column: rights_status' using errcode = '42501'; end if;
  if new.rights_holder is distinct from old.rights_holder then raise exception 'protected_column: rights_holder' using errcode = '42501'; end if;
  if new.rights_valid_until is distinct from old.rights_valid_until then raise exception 'protected_column: rights_valid_until' using errcode = '42501'; end if;
  return new;
end $$;
revoke execute on function public.creator_rights_guard() from public, anon;
grant execute on function public.creator_rights_guard() to authenticated, service_role;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_a_creator_rights_guard' and tgrelid = 'public.creator_profiles'::regclass) then
    create trigger trg_a_creator_rights_guard before update on public.creator_profiles
      for each row execute function public.creator_rights_guard();
  end if;
end $$;

-- Documentação da autorização: nunca pública; só o admin lê e escreve.
create table if not exists public.creator_rights_private (
  creator_id uuid primary key references public.creator_profiles (id) on delete cascade,
  document_ref text,
  notes text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.creator_rights_private enable row level security;
revoke all on table public.creator_rights_private from anon;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_creator_rights_private_updated' and tgrelid = 'public.creator_rights_private'::regclass) then
    create trigger trg_creator_rights_private_updated before update on public.creator_rights_private
      for each row execute function public.set_updated_at();
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'creator_rights_private' and policyname = 'creator_rights_private_admin') then
    create policy creator_rights_private_admin on public.creator_rights_private for all to authenticated
      using ((select public.is_admin())) with check ((select public.is_admin()));
  end if;
end $$;

-- Escrita auditada da parte privada (a pública passa pelo trigger audit_partner_changes).
create or replace function public.admin_set_creator_rights_private(p_creator uuid, p_document_ref text, p_notes text, p_justification text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_doc text := nullif(trim(coalesce(p_document_ref, '')), ''); v_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.creator_profiles where id = p_creator) then raise exception 'creator_not_found'; end if;
  select jsonb_build_object('document_ref', document_ref, 'has_notes', notes is not null, 'reviewed_at', reviewed_at)
    into v_before from public.creator_rights_private where creator_id = p_creator;
  insert into public.creator_rights_private (creator_id, document_ref, notes, reviewed_by, reviewed_at)
  values (p_creator, v_doc, v_notes, auth.uid(), now())
  on conflict (creator_id) do update
    set document_ref = excluded.document_ref, notes = excluded.notes, reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at;
  perform public.audit_log('creator.rights_private', 'creator_profile', p_creator::text, v_before,
    jsonb_build_object('document_ref', v_doc, 'has_notes', v_notes is not null), p_justification);
end $$;
revoke execute on function public.admin_set_creator_rights_private(uuid, text, text, text) from public, anon;
grant execute on function public.admin_set_creator_rights_private(uuid, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------- 3b) origem do vínculo conteúdo↔personalidade
-- Registrada antes do trigger existir (linhas anteriores a esta migração): tudo que já havia foi
-- atribuído pela plataforma/admin.
update public.content set creator_link_origin = 'admin_assignment' where creator_id is not null and creator_link_origin is null;

-- Quem vinculou: a própria personalidade (creator_submission) ou o admin/sistema (admin_assignment).
-- Fora da troca de creator_id a coluna é imutável (a guarda de colunas já recusa a personalidade).
create or replace function public.content_link_origin()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.creator_id is null then
    new.creator_link_origin := null;
  elsif tg_op = 'INSERT' or new.creator_id is distinct from old.creator_id then
    new.creator_link_origin := case when auth.uid() is null or public.is_admin() then 'admin_assignment' else 'creator_submission' end;
  else
    new.creator_link_origin := old.creator_link_origin;
  end if;
  return new;
end $$;
revoke execute on function public.content_link_origin() from public, anon;
grant execute on function public.content_link_origin() to authenticated, service_role;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_c_content_link_origin' and tgrelid = 'public.content'::regclass) then
    create trigger trg_c_content_link_origin before insert or update on public.content
      for each row execute function public.content_link_origin();
  end if;
end $$;

-- ---------------------------------------------------------------- 4) dados do seed
-- Licença coerente com o provedor já gravado (seed: sem mídia -> platform_demo; embeds -> third_party_embed).
update public.content c
set media_license_kind = case when b.media_provider in ('embed_youtube', 'embed_vimeo') then 'third_party_embed' else 'platform_demo' end
from public.content_bodies b
where b.content_id = c.id and not public.media_license_compatible(b.media_provider, c.media_license_kind);

-- Informação nutricional (valores ilustrativos por porção): g1 e g5 validadas pela equipe de
-- demonstração; g9 com números ainda em validação (exibida sem os números).
update public.content_bodies set body = body || jsonb_build_object('nutrition', jsonb_build_object(
  'per_serving', jsonb_build_object('kcal', 520, 'protein_g', 42, 'carbs_g', 38, 'fat_g', 21, 'fiber_g', 6, 'sodium_mg', 480),
  'validated', true, 'validated_by', 'Equipe de nutrição (demonstração)', 'validated_at', '2026-10-20',
  'note', 'Valores estimados por porção a partir dos ingredientes listados. Demonstração.'))
where content_id = public.seed_uuid('content:g1') and not (body ? 'nutrition');
update public.content_bodies set body = body || jsonb_build_object('nutrition', jsonb_build_object(
  'per_serving', jsonb_build_object('kcal', 610, 'protein_g', 38, 'carbs_g', 45, 'fat_g', 30, 'fiber_g', 5, 'sodium_mg', 320),
  'validated', true, 'validated_by', 'Equipe de nutrição (demonstração)', 'validated_at', '2026-10-20',
  'note', 'Valores estimados por porção a partir dos ingredientes listados. Demonstração.'))
where content_id = public.seed_uuid('content:g5') and not (body ? 'nutrition');
update public.content_bodies set body = body || jsonb_build_object('nutrition', jsonb_build_object(
  'per_serving', jsonb_build_object('kcal', 260, 'protein_g', 11, 'carbs_g', 36, 'fat_g', 8, 'fiber_g', 4, 'sodium_mg', 95),
  'validated', false, 'validated_by', null, 'validated_at', null, 'note', ''))
where content_id = public.seed_uuid('content:g9') and not (body ? 'nutrition');
