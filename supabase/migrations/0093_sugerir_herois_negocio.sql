-- =============================================================================
-- Groscove Ultra · 0093 · Sugerir heróis no negócio (busca na plataforma, ficha criada ao salvar, herói digitado)
-- Idempotente (create or replace). Depende da 0065 (casting), 0066 (elenco do negócio), 0070 (agência e herói),
-- 0087/0091 (convite do creator). Cenário RLS S100. S14 segue 18 (nada novo para o visitante).
--
-- Pedido do responsável: o diálogo "Sugerir creators do casting" passa a "Sugerir heróis". A caixa lê os
-- heróis da PLATAFORMA (creator_profiles ativos), não só a ficha do casting; a agência pode sugerir um herói que
-- ainda não está no casting (a ficha nasce ao salvar) ou digitar alguém que não está na plataforma.
--
-- Decisões:
--  1) agency_hero_search(p_deal, p_q, p_limit, p_offset): busca no servidor (nome ou endereço, sem acento),
--     20 por página (teto 50), gestor+ do negócio. Devolve só heróis ATIVOS que NÃO estão no casting desta
--     agência (os do casting a tela já tem, com os critérios do briefing) e, para cada um, o selo:
--       'outside'           fora do casting, selecionável;
--       'other_agency'      já ligado ao casting de OUTRA agência (índice único de creator_id) ou a conta dele já
--                           tem ficha em outro casting (regra D10 da 0065): indisponível, a RPC de sugerir também
--                           recusa (a agência não é identificada);
--       'person_in_casting' a conta do herói já tem outra ficha neste casting (login próprio): indisponível.
--     Só campos públicos: nome, endereço, foto, chamada, pilares, redes públicas (instagram/youtube/site) e o
--     número de seguidores na plataforma. Nenhum dado de direitos, conta ou e-mail. Suspenso/pendente não aparece.
--     Agência de demonstração não enxerga heróis reais (D6).
--  2) agency_deal_suggest_heroes(p_deal, p_items jsonb): UMA RPC atômica no lugar de agency_shortlist_set (que
--     fica como estava, sem uso do app). Gestor+ (colaborador recebe forbidden, como no elenco de antes), negócio
--     da própria agência e aberto. Itens (máx. 30, sem duplicar): {kind:'talent', talent_id}, {kind:'hero',
--     creator_id} e {kind:'typed', name, profile?, email?}, todos com reasons opcional.
--       talent: ficha ativa da agência (como antes).
--       hero:   herói ativo. Se já tem ficha nesta agência, reaproveita (idempotente). Senão a agência CRIA a ficha
--               ligada ao herói (commercial_status 'prospect', SEM consentimento: a consulta e o catálogo seguem
--               exigindo o que já exigiam), respeitando um herói num casting só (creator_already_in_casting), a
--               regra D10 (user_has_talent) e a agência de demonstração (demo_locked). Trava de transação por
--               herói e por pessoa, como agency_talent_link_creator.
--       typed:  alguém fora da plataforma: ficha SEM herói só com nome (2 a 80, sem controle nem < >), perfil opcional
--               (@endereço ou link https, guardado nas notas internas) e e-mail opcional (contact_email). Mesmo nome
--               (sem caixa) de ficha sem herói da agência reaproveita a existente. A ficha segue o convite do
--               creator (agency_invite_talent/0087) para entrar na plataforma. Agência demo respeita o limite de 20.
--     No máximo 10 fichas novas por salvamento (too_many_new_talents). Tudo numa transação: erro em um item não deixa
--     ficha pela metade. Sugerir de novo um creator já removido do negócio o traz de volta como sugerido.
--     Devolve {ids, created, revived}. Auditoria: talent.create (origem) por ficha nova e deal.shortlist.
--  3) Sem aviso novo ao dono do herói: a consulta de interesse (já existente) é o aviso, e a ficha nasce sem
--     consentimento. Ficha criada aqui nunca vira catálogo da marca sem a pessoa dar o consentimento.
-- =============================================================================

-- 1) busca de heróis da plataforma para sugerir ------------------------------------------------------------------
create or replace function public.agency_hero_search(p_deal uuid, p_q text default '', p_limit int default 20, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_agency uuid; v_q text; v_like text; v_limit int; v_off int; v_rows jsonb; v_more boolean;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select d.agency_id into v_agency from public.deals d where d.id = p_deal;
  if v_agency is null or not public.agency_can(v_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not public.agency_can(v_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  -- D6: a agência de demonstração não enxerga heróis reais
  if public.agency_is_demo(v_agency) then return jsonb_build_object('items', '[]'::jsonb, 'has_more', false); end if;
  v_limit := greatest(1, least(coalesce(p_limit, 20), 50));
  v_off := greatest(0, least(coalesce(p_offset, 0), 5000));
  v_q := left(btrim(regexp_replace(coalesce(p_q, ''), '[[:cntrl:]]', '', 'g')), 60);
  v_like := '%' || replace(replace(replace(lower(public.f_unaccent(v_q)), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with base as (
    select c.id, c.slug, c.name, c.avatar_url, c.headline, c.pillars, c.socials,
           (select f.followers from public.creator_follower_counts f where f.creator_id = c.id) as followers,
           case
             when exists (select 1 from public.talent_profiles t where t.creator_id = c.id and t.archived_at is null) then 'other_agency'
             when c.user_id is not null and exists (
                    select 1 from public.talent_profiles t left join public.creator_profiles c2 on c2.id = t.creator_id
                    where t.archived_at is null and t.agency_id <> v_agency and (t.user_id = c.user_id or c2.user_id = c.user_id)) then 'other_agency'
             when c.user_id is not null and exists (
                    select 1 from public.talent_profiles t left join public.creator_profiles c2 on c2.id = t.creator_id
                    where t.archived_at is null and t.agency_id = v_agency and (t.user_id = c.user_id or c2.user_id = c.user_id)) then 'person_in_casting'
             else 'outside'
           end as scope
    from public.creator_profiles c
    where c.status = 'active'
      and not exists (select 1 from public.talent_profiles t where t.creator_id = c.id and t.agency_id = v_agency and t.archived_at is null)
      and (v_q = '' or lower(public.f_unaccent(c.name)) like v_like escape '\' or lower(c.slug) like v_like escape '\')
  ), ranked as (
    -- selecionáveis primeiro, depois os indisponíveis; nome e id desempatam (paginação estável)
    select b.*, row_number() over (order by (b.scope <> 'outside'), lower(b.name), b.id) as rn from base b
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'slug', r.slug, 'name', r.name, 'avatar_url', r.avatar_url, 'headline', r.headline,
           'pillars', to_jsonb(r.pillars), 'followers', r.followers, 'scope', r.scope,
           'socials', jsonb_build_object('instagram', r.socials ->> 'instagram', 'youtube', r.socials ->> 'youtube', 'site', r.socials ->> 'site'))
         order by r.rn) filter (where r.rn > v_off and r.rn <= v_off + v_limit), '[]'::jsonb),
         coalesce(bool_or(r.rn > v_off + v_limit), false)
    into v_rows, v_more
  from ranked r where r.rn <= v_off + v_limit + 1;
  return jsonb_build_object('items', v_rows, 'has_more', v_more);
end $$;
revoke execute on function public.agency_hero_search(uuid, text, int, int) from public, anon;
grant execute on function public.agency_hero_search(uuid, text, int, int) to authenticated, service_role;

-- 2) sugerir heróis no negócio (substitui o uso de agency_shortlist_set) -------------------------------------------
create or replace function public.agency_deal_suggest_heroes(p_deal uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_agency uuid; v_stage text; e jsonb; v_kind text; v_talent uuid; v_creator uuid; v_ids uuid[] := '{}'::uuid[];
  v_created int := 0; v_revived int := 0; v_name text; v_profile text; v_email text; v_hero record; v_owner uuid;
  v_reasons jsonb; v_status text; v_demo boolean; v_new uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 30 then raise exception 'invalid_input' using errcode = '22023'; end if;
  -- gestor+ (colaborador: forbidden), negócio da agência do chamador, aberto (a função trava a linha do negócio)
  v_agency := public.deal_write_scope(p_deal, false);
  select d.stage into v_stage from public.deals d where d.id = p_deal;
  if public.deal_stage_index(v_stage) >= 8 then raise exception 'invalid_stage' using errcode = 'P0001'; end if;
  v_demo := public.agency_is_demo(v_agency);

  for e in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(e) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
    v_kind := coalesce(e ->> 'kind', 'talent');
    v_reasons := coalesce(e -> 'reasons', '[]'::jsonb);
    if jsonb_typeof(v_reasons) <> 'array' or jsonb_array_length(v_reasons) > 10
       or exists (select 1 from jsonb_array_elements(v_reasons) r where jsonb_typeof(r) <> 'object'
                  or (r ->> 'code') not in ('segment','region','audience_age','network','availability','brand_choice')) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_talent := null;

    if v_kind = 'talent' then
      begin v_talent := (e ->> 'talent_id')::uuid; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
      if not exists (select 1 from public.talent_profiles t where t.id = v_talent and t.agency_id = v_agency and t.archived_at is null) then
        raise exception 'not_found' using errcode = 'P0002';
      end if;

    elsif v_kind = 'hero' then
      begin v_creator := (e ->> 'creator_id')::uuid; exception when others then raise exception 'invalid_input' using errcode = '22023'; end;
      -- só herói ativo (suspenso e pendente não existem para a agência)
      select c.id, c.name, c.user_id into v_hero from public.creator_profiles c where c.id = v_creator and c.status = 'active';
      if v_hero.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
      perform pg_advisory_xact_lock(hashtext('hero_casting:' || v_creator::text));
      v_owner := v_hero.user_id;
      if v_owner is not null then perform pg_advisory_xact_lock(hashtext('talent_person:' || v_owner::text)); end if;
      select t.id into v_talent from public.talent_profiles t where t.creator_id = v_creator and t.agency_id = v_agency and t.archived_at is null;
      if v_talent is null then
        -- D6: nenhum herói real em agência inventada
        if v_demo then raise exception 'demo_locked' using errcode = 'P0001'; end if;
        if exists (select 1 from public.talent_profiles t where t.creator_id = v_creator) then raise exception 'creator_already_in_casting' using errcode = 'P0001'; end if;
        -- D10: a pessoa dona do herói já tem ficha (login próprio sem página ou outro herói dela num casting)
        if v_owner is not null and exists (
             select 1 from public.talent_profiles t left join public.creator_profiles c2 on c2.id = t.creator_id
             where t.user_id = v_owner or c2.user_id = v_owner) then
          raise exception 'user_has_talent' using errcode = 'P0001';
        end if;
        if v_created >= 10 then raise exception 'too_many_new_talents' using errcode = 'P0001'; end if;
        begin
          insert into public.talent_profiles (agency_id, creator_id, display_name, commercial_status, created_by)
          values (v_agency, v_creator, left(btrim(v_hero.name), 80), 'prospect', auth.uid())
          returning id into v_talent;
        exception when unique_violation then raise exception 'creator_already_in_casting' using errcode = 'P0001';
                  when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
        end;
        v_created := v_created + 1;
        perform public.audit_log('talent.create', 'talent', v_talent::text, null,
          jsonb_build_object('agency_id', v_agency, 'creator_id', v_creator, 'source', 'deal_hero', 'deal_id', p_deal), null,
          public.talent_audit_actor('agency', v_agency));
      end if;

    elsif v_kind = 'typed' then
      -- nome limpo: sem controle nem < >, espaços únicos, 2 a 80
      v_name := btrim(regexp_replace(regexp_replace(coalesce(e ->> 'name', ''), '[[:cntrl:]<>]', '', 'g'), '\s+', ' ', 'g'));
      if char_length(v_name) not between 2 and 80 then raise exception 'invalid_hero_name' using errcode = '22023'; end if;
      v_profile := nullif(btrim(coalesce(e ->> 'profile', '')), '');
      if v_profile is not null and not (v_profile ~ '^@[A-Za-z0-9._]{1,40}$' or (v_profile ~ '^https?://[^\s<>"'']{4,190}$' and char_length(v_profile) <= 200)) then
        raise exception 'invalid_profile_ref' using errcode = '22023';
      end if;
      v_email := nullif(lower(btrim(coalesce(e ->> 'email', ''))), '');
      if v_email is not null and not public.agency_email_ok(v_email) then raise exception 'invalid_email' using errcode = '22023'; end if;
      perform pg_advisory_xact_lock(hashtext('typed_talent:' || v_agency::text || ':' || lower(v_name)));
      select t.id into v_talent from public.talent_profiles t
      where t.agency_id = v_agency and t.archived_at is null and t.creator_id is null and lower(btrim(t.display_name)) = lower(v_name)
      order by t.created_at limit 1;
      if v_talent is null then
        if v_demo and (select count(*) from public.talent_profiles t where t.agency_id = v_agency) >= 20 then raise exception 'demo_limit' using errcode = 'P0001'; end if;
        if v_created >= 10 then raise exception 'too_many_new_talents' using errcode = 'P0001'; end if;
        begin
          insert into public.talent_profiles (agency_id, display_name, commercial_status, contact_email, internal_notes, is_demo, created_by)
          values (v_agency, v_name, 'prospect', v_email, coalesce('Perfil informado: ' || v_profile, ''), v_demo, auth.uid())
          returning id into v_talent;
        exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
        end;
        v_created := v_created + 1;
        perform public.audit_log('talent.create', 'talent', v_talent::text, null,
          jsonb_build_object('agency_id', v_agency, 'source', 'deal_typed', 'deal_id', p_deal), null,
          public.talent_audit_actor('agency', v_agency));
      end if;

    else
      raise exception 'invalid_input' using errcode = '22023';
    end if;

    -- mesmo creator duas vezes na lista: idempotente
    if v_talent = any (v_ids) then continue; end if;
    v_ids := v_ids || v_talent;
    select dt.status into v_status from public.deal_talents dt where dt.deal_id = p_deal and dt.talent_id = v_talent;
    if v_status is null then
      insert into public.deal_talents (agency_id, deal_id, talent_id, status, suggested_by, reasons)
      values (v_agency, p_deal, v_talent, 'suggested', auth.uid(), v_reasons);
    elsif v_status = 'removed' then
      -- voltou a ser sugerido: a consulta e a resposta antigas não valem mais
      update public.deal_talents set status = 'suggested', reasons = v_reasons, suggested_by = auth.uid(), terms_ready = false,
             consulted_by = null, consulted_at = null, respond_by = null, responded_at = null, response_note = '', response_channel = null
      where deal_id = p_deal and talent_id = v_talent;
      v_revived := v_revived + 1;
    elsif e ? 'reasons' then
      update public.deal_talents set reasons = v_reasons where deal_id = p_deal and talent_id = v_talent;
    end if;
  end loop;

  delete from public.deal_talents dt where dt.deal_id = p_deal and dt.status = 'suggested' and not (dt.talent_id = any (v_ids));
  if v_stage in ('briefing_received', 'qualification') and cardinality(v_ids) > 0 then
    update public.deals set stage = 'shortlist', stage_changed_at = now() where id = p_deal;
  end if;
  perform public.audit_log('deal.shortlist', 'deal', p_deal::text, null,
    jsonb_build_object('agency_id', v_agency, 'talents', to_jsonb(v_ids), 'created_talents', v_created), null,
    public.talent_audit_actor('agency', v_agency));
  return jsonb_build_object('ids', to_jsonb(v_ids), 'created', v_created, 'revived', v_revived);
end $$;
revoke execute on function public.agency_deal_suggest_heroes(uuid, jsonb) from public, anon;
grant execute on function public.agency_deal_suggest_heroes(uuid, jsonb) to authenticated, service_role;
