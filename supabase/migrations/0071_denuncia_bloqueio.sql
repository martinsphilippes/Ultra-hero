-- 0071 · Denunciar conteúdo ou herói e bloquear herói (conteúdo de terceiros: diretriz 1.2 da App Store).
-- Idempotente (create if not exists / or replace / drop policy if exists).
--
-- Decisões (31/10/2026, lançamento público):
--   • qualquer conta denuncia um conteúdo ou um herói (motivo de uma lista fixa + detalhe opcional); a equipe
--     analisa em /admin/denuncias e pode tirar o conteúdo do ar (arquivar) ou suspender o herói. Limite de 20
--     denúncias por dia por conta;
--   • bloquear um herói some com ele e com tudo o que ele publicou para quem bloqueou, em todo o app: a regra
--     mora nas políticas de leitura de content e creator_profiles (is_blocked_creator). Desbloquear fica em
--     Perfil › Heróis (my_blocked_heroes, que enxerga os bloqueados);
--   • exclusão da conta: os bloqueios saem junto (cascade); as denúncias ficam, sem o vínculo com quem
--     denunciou (set null), como diz a Política de Privacidade.

-- 1) tabelas -----------------------------------------------------------------------------------------------------
create table if not exists public.hero_blocks (
  user_id uuid not null constraint hero_blocks_user_fk references auth.users (id) on delete cascade,
  creator_id uuid not null constraint hero_blocks_creator_fk references public.creator_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, creator_id)
);

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid constraint content_reports_reporter_fk references auth.users (id) on delete set null,
  content_id uuid constraint content_reports_content_fk references public.content (id) on delete set null,
  creator_id uuid constraint content_reports_creator_fk references public.creator_profiles (id) on delete set null,
  reason text not null constraint content_reports_reason_check check (reason in ('offensive', 'harassment', 'misleading', 'rights', 'spam', 'other')),
  details text not null default '' constraint content_reports_details_check check (char_length(details) <= 1000),
  status text not null default 'new' constraint content_reports_status_check check (status in ('new', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid constraint content_reports_reviewed_by_fk references auth.users (id) on delete set null
);
create index if not exists content_reports_status_idx on public.content_reports (status, created_at desc);
create index if not exists content_reports_reporter_idx on public.content_reports (reporter_id, created_at);

do $$
declare t text;
begin
  foreach t in array array['hero_blocks', 'content_reports'] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
drop policy if exists hero_blocks_select_own on public.hero_blocks;
create policy hero_blocks_select_own on public.hero_blocks for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists content_reports_select_admin on public.content_reports;
create policy content_reports_select_admin on public.content_reports for select to authenticated using ((select public.is_platform_admin()));

-- 2) quem chama bloqueou este herói? (anônimo: nunca) ----------------------------------------------------------------
create or replace function public.is_blocked_creator(p_creator uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_creator is not null and auth.uid() is not null
    and exists (select 1 from public.hero_blocks b where b.user_id = auth.uid() and b.creator_id = p_creator)
$$;
revoke execute on function public.is_blocked_creator(uuid) from public;
grant execute on function public.is_blocked_creator(uuid) to anon, authenticated, service_role;

-- 3) leitura: o bloqueado some para quem bloqueou (dono, admin e agência pelo herói seguem vendo) ----------------------
drop policy if exists content_select on public.content;
create policy content_select on public.content for select to anon, authenticated using (
  (public.content_is_live(status, publish_at) and not public.is_blocked_creator(creator_id))
  or (select public.is_admin())
  or (creator_id is not null and creator_id = (select public.my_creator_id()))
);
drop policy if exists creators_select_public on public.creator_profiles;
create policy creators_select_public on public.creator_profiles for select to anon, authenticated using (
  (status = 'active' and not public.is_blocked_creator(id))
  or user_id = (select auth.uid())
  or (select public.is_admin())
);

-- 4) bloquear, desbloquear e listar os bloqueados ------------------------------------------------------------------
create or replace function public.block_hero(p_creator uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not exists (select 1 from public.creator_profiles where id = p_creator) then raise exception 'not_found'; end if;
  insert into public.hero_blocks (user_id, creator_id) values (auth.uid(), p_creator) on conflict do nothing;
  -- quem bloqueia deixa de seguir
  delete from public.hero_favorites where user_id = auth.uid() and creator_id = p_creator;
end $$;

create or replace function public.unblock_hero(p_creator uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  delete from public.hero_blocks where user_id = auth.uid() and creator_id = p_creator;
end $$;

create or replace function public.my_blocked_heroes()
returns table (id uuid, slug text, name text, avatar_url text, blocked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.id, c.slug, c.name, c.avatar_url, b.created_at
  from public.hero_blocks b join public.creator_profiles c on c.id = b.creator_id
  where b.user_id = auth.uid()
  order by b.created_at desc
$$;

-- 5) denunciar (conteúdo ou herói) ----------------------------------------------------------------------------------
create or replace function public.report_content(p_content uuid, p_creator uuid, p_reason text, p_details text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_creator uuid := p_creator; v_id uuid;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_content is null and p_creator is null then raise exception 'invalid_input'; end if;
  if p_reason is null or p_reason not in ('offensive', 'harassment', 'misleading', 'rights', 'spam', 'other') then raise exception 'invalid_input'; end if;
  if char_length(coalesce(p_details, '')) > 1000 then raise exception 'invalid_input'; end if;
  if p_content is not null then
    select c.creator_id into v_creator from public.content c where c.id = p_content;
    if not found then raise exception 'not_found'; end if;
  elsif not exists (select 1 from public.creator_profiles where id = p_creator) then
    raise exception 'not_found';
  end if;
  perform pg_advisory_xact_lock(hashtext('content_report:' || v_uid::text));
  if (select count(*) from public.content_reports where reporter_id = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many_reports';
  end if;
  insert into public.content_reports (reporter_id, content_id, creator_id, reason, details)
  values (v_uid, p_content, v_creator, p_reason, btrim(coalesce(p_details, '')))
  returning id into v_id;
  return v_id;
end $$;

-- 6) triagem (admin geral): dispensar ou agir (arquivar o conteúdo e/ou suspender o herói), auditado -------------
create or replace function public.admin_resolve_report(p_id uuid, p_status text, p_archive_content boolean, p_suspend_creator boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r public.content_reports%rowtype;
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_status not in ('dismissed', 'actioned') then raise exception 'invalid_input'; end if;
  select * into r from public.content_reports where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if p_status = 'actioned' and coalesce(p_archive_content, false) and r.content_id is not null then
    update public.content set status = 'archived' where id = r.content_id and status <> 'archived';
  end if;
  if p_status = 'actioned' and coalesce(p_suspend_creator, false) and r.creator_id is not null then
    update public.creator_profiles set status = 'suspended' where id = r.creator_id;
  end if;
  update public.content_reports set status = p_status, reviewed_at = now(), reviewed_by = auth.uid() where id = p_id;
  perform public.audit_log('report.' || p_status, 'content_report', p_id::text, null,
    jsonb_build_object('content_id', r.content_id, 'creator_id', r.creator_id, 'archive', coalesce(p_archive_content, false), 'suspend', coalesce(p_suspend_creator, false)),
    null, 'admin');
end $$;

revoke execute on function public.block_hero(uuid) from public, anon;
revoke execute on function public.unblock_hero(uuid) from public, anon;
revoke execute on function public.my_blocked_heroes() from public, anon;
revoke execute on function public.report_content(uuid, uuid, text, text) from public, anon;
revoke execute on function public.admin_resolve_report(uuid, text, boolean, boolean) from public, anon;
grant execute on function public.block_hero(uuid) to authenticated, service_role;
grant execute on function public.unblock_hero(uuid) to authenticated, service_role;
grant execute on function public.my_blocked_heroes() to authenticated, service_role;
grant execute on function public.report_content(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.admin_resolve_report(uuid, text, boolean, boolean) to authenticated, service_role;
