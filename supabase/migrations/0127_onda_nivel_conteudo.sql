-- =============================================================================
-- 0127 — Reunião Groscove (06/11/2026), lote D: Onda (o antigo Explorar) com curadoria, nível do conteúdo pela
-- escala de consciência (Hawkins) com o aceite de responsabilidade, e "Tirar do ar" pela Groscove.
--
-- Decisões:
--   • Onda: "só entra o que a gente quiser colocar". creator_profiles.onda marca as páginas liberadas (portais de
--     notícia, a própria Groscove, Heroes escolhidos); a aba Conteúdos da Onda só mostra conteúdo delas. Quem
--     libera é a Groscove (is_groscove_admin, 0126).
--   • Nível do conteúdo: ao publicar, quem publica declara o nível (400 Razão, 500 Amor, 540 Alegria, 600 Paz,
--     700 Iluminação) e aceita a responsabilidade pelo conteúdo. Fica em content.content_level e
--     content.responsibility_accepted_at; abaixo de 400 não se publica (a tela não oferece). Sem IA por enquanto:
--     a análise automática custa tokens e fica para depois, como combinado.
--   • Tirar do ar: a Groscove arquiva qualquer conteúdo publicado, com o motivo; o Hero recebe o aviso no sino.
-- =============================================================================

alter table public.creator_profiles add column if not exists onda boolean not null default false;
create index if not exists creator_profiles_onda_idx on public.creator_profiles (onda) where onda;

alter table public.content add column if not exists content_level smallint;
alter table public.content add column if not exists responsibility_accepted_at timestamptz;
alter table public.content drop constraint if exists content_level_check;
alter table public.content add constraint content_level_check check (content_level is null or content_level in (400, 500, 540, 600, 700));

-- liberar/tirar uma página da Onda
create or replace function public.onda_set(p_creator uuid, p_on boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_groscove_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform set_config('app.trusted', 'on', true);
  update public.creator_profiles set onda = coalesce(p_on, false) where id = p_creator;
  perform set_config('app.trusted', 'off', true);
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public.audit_log(case when p_on then 'onda.added' else 'onda.removed' end, 'creator', p_creator::text, null, null, null, 'admin');
  return true;
end $$;
revoke execute on function public.onda_set(uuid, boolean) from public, anon;
grant execute on function public.onda_set(uuid, boolean) to authenticated, service_role;

-- quem publica declara o nível e aceita a responsabilidade (titular/equipe do Hero ou admin)
create or replace function public.content_declare_level(p_content uuid, p_level int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_creator uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_level is null or p_level not in (400, 500, 540, 600, 700) then raise exception 'invalid_level' using errcode = '22023'; end if;
  select c.creator_id into v_creator from public.content c where c.id = p_content;
  if v_creator is null and not public.is_platform_admin() then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not (public.is_platform_admin()
          or exists (select 1 from public.creator_profiles cp where cp.id = v_creator and cp.user_id = auth.uid())
          or exists (select 1 from public.creator_team_members m where m.creator_profile_id = v_creator and m.user_id = auth.uid() and m.status = 'active')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform set_config('app.trusted', 'on', true);
  update public.content set content_level = p_level, responsibility_accepted_at = now() where id = p_content;
  perform set_config('app.trusted', 'off', true);
  perform public.audit_log('content.level_declared', 'content', p_content::text, null, jsonb_build_object('level', p_level), null, 'creator');
  return true;
end $$;
revoke execute on function public.content_declare_level(uuid, int) from public, anon;
grant execute on function public.content_declare_level(uuid, int) to authenticated, service_role;

-- a Groscove tira um conteúdo do ar (arquiva), com o motivo
create or replace function public.content_takedown(p_content uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare c public.content%rowtype; v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 300), '');
begin
  if not public.is_groscove_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_reason is null then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into c from public.content where id = p_content for update;
  if c.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if c.status = 'archived' then return true; end if;
  perform set_config('app.trusted', 'on', true);
  update public.content set status = 'archived', archived_at = now(), archived_by = 'admin', publish_at = null where id = c.id;
  perform set_config('app.trusted', 'off', true);
  perform public.audit_log('content.takedown', 'content', c.id::text, jsonb_build_object('status', c.status),
    jsonb_build_object('status', 'archived', 'archived_by', 'admin'), v_reason, 'admin');
  return true;
end $$;
revoke execute on function public.content_takedown(uuid, text) from public, anon;
grant execute on function public.content_takedown(uuid, text) to authenticated, service_role;
