-- =============================================================================
-- Groscove Ultra · 0086 · Agenda: editar compromisso manual (agência)
-- Pedido do responsável (03/11). Cenário S93. Idempotente; nenhuma função nova (só create or replace da mesma
-- assinatura: sem sobrecarga); nada para anon (S14 segue 18); nada aqui carrega valor.
--
-- Decisões:
--   • a edição usa a RPC que já existia desde a 0067 (agency_event_save com p_id): mesmas validações da criação
--     (sem negócio a marca não vê; sem creator o creator não vê; data comercial só gestor+, sem negócio/creator e
--     não vira outro tipo), mesma regra de papel de agency_event_delete (gestor+ em qualquer manual; colaborador só
--     nos negócios dele, antes E depois da edição; negócio fechado não se mexe) e evento de sistema recusado
--     (invalid_state) — inclusive a oportunidade de patrocínio da 0085, que é de sistema e se edita na tela dela;
--   • a única correção aqui é no aviso ao creator: a criação avisa quem passa a ver. Na edição, trocar o creator de
--     um evento já visível não avisava o novo (a condição olhava só "antes não era visível") e, mesmo quando avisava,
--     a chave de deduplicação 'event:<id>' é global em inbox_notifications e engolia o aviso de outra pessoa. Agora:
--     criação continua com 'event:<id>'; na edição, avisa quando passa a ver (ficou visível ou o creator mudou), com
--     chave 'event:<id>:<talent>' (o mesmo creator que some e volta não é avisado de novo);
--   • "deixa de ver" não gera aviso: a criação/remoção também não avisam disso (seguimos o que já existe);
--   • quem editou: não há coluna updated_by em calendar_events (e a tarefa pede só se houver); o audit_log da
--     0067 já registra ator, antes e depois em cada salvamento.

create or replace function public.agency_event_save(p_agency uuid, p_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := p_id; v_kind text; v_deal uuid; v_talent uuid; v_brand uuid; v_start timestamptz; v_end timestamptz; v_all_day boolean;
        v_title text; v_vb boolean; v_vt boolean; v_label text; v_to uuid; r record; v_before public.calendar_events%rowtype;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if not public.agency_can(p_agency, 'staff') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_id is not null then
    select * into v_before from public.calendar_events e where e.id = v_id and e.agency_id = p_agency;
    if v_before.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if v_before.source = 'system' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    -- quem pode mexer no evento como ele está hoje (não só como ficaria depois): colaborador só no negócio dele
    if v_before.deal_id is not null then perform public.deal_write_scope(v_before.deal_id, true);
    elsif not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  v_kind := coalesce(nullif(p_data ->> 'kind', ''), v_before.kind, 'meeting');
  if v_kind not in ('meeting', 'recording', 'commercial_date', 'other') then raise exception 'invalid_input' using errcode = '22023'; end if;
  begin
    v_deal := case when p_data ? 'deal_id' then nullif(btrim(coalesce(p_data ->> 'deal_id', '')), '')::uuid else v_before.deal_id end;
    v_talent := case when p_data ? 'talent_id' then nullif(btrim(coalesce(p_data ->> 'talent_id', '')), '')::uuid else v_before.talent_id end;
    v_brand := case when p_data ? 'brand_id' then nullif(btrim(coalesce(p_data ->> 'brand_id', '')), '')::uuid else v_before.brand_id end;
    v_start := coalesce((p_data ->> 'starts_at')::timestamptz, v_before.starts_at);
    v_end := coalesce((p_data ->> 'ends_at')::timestamptz, v_before.ends_at, v_start);
  exception when others then raise exception 'invalid_input' using errcode = '22023';
  end;
  v_all_day := coalesce((p_data ->> 'all_day')::boolean, v_before.all_day, false);
  v_title := btrim(coalesce(p_data ->> 'title', v_before.title, ''));
  v_vb := coalesce((p_data ->> 'visible_to_brand')::boolean, v_before.visible_to_brand, false);
  v_vt := coalesce((p_data ->> 'visible_to_talent')::boolean, v_before.visible_to_talent, false);
  if v_kind = 'commercial_date' or v_before.kind = 'commercial_date' then
    -- publicação para as marcas: só gestor+, sem negócio nem creator, sempre visível à marca (e não vira outra coisa)
    if not public.agency_can(p_agency, 'manager') then raise exception 'forbidden' using errcode = '42501'; end if;
    if v_before.kind = 'commercial_date' and v_kind <> 'commercial_date' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
    v_deal := null; v_talent := null; v_vb := true; v_vt := false;
  elsif v_deal is not null then
    perform public.deal_write_scope(v_deal, true);
  elsif not public.agency_can(p_agency, 'manager') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- sem negócio, a marca não vê (só data comercial); sem creator, o creator não vê
  if v_deal is null and v_kind <> 'commercial_date' then v_vb := false; end if;
  if v_talent is null then v_vt := false; end if;
  if v_start is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  begin
    if v_id is null then
      insert into public.calendar_events (agency_id, kind, title, description, starts_at, ends_at, all_day, location, brand_id, deal_id, talent_id, source, visible_to_brand, visible_to_talent, created_by)
      values (p_agency, v_kind, v_title, left(btrim(coalesce(p_data ->> 'description', '')), 2000), v_start, v_end, v_all_day, left(btrim(coalesce(p_data ->> 'location', '')), 200),
              v_brand, v_deal, v_talent, 'manual', v_vb, v_vt, auth.uid())
      returning id into v_id;
    else
      update public.calendar_events set kind = v_kind, title = v_title,
        description = case when p_data ? 'description' then left(btrim(coalesce(p_data ->> 'description', '')), 2000) else description end,
        starts_at = v_start, ends_at = v_end, all_day = v_all_day,
        location = case when p_data ? 'location' then left(btrim(coalesce(p_data ->> 'location', '')), 200) else location end,
        brand_id = v_brand, deal_id = v_deal, talent_id = v_talent, visible_to_brand = v_vb, visible_to_talent = v_vt
      where id = v_id;
    end if;
  exception when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = '22023';
  end;
  perform public.audit_log('calendar.event', 'calendar_event', v_id::text,
    case when v_before.id is null then null else jsonb_build_object('agency_id', p_agency, 'kind', v_before.kind, 'starts_at', v_before.starts_at,
      'talent_id', v_before.talent_id, 'deal_id', v_before.deal_id, 'visible_to_brand', v_before.visible_to_brand, 'visible_to_talent', v_before.visible_to_talent) end,
    jsonb_build_object('agency_id', p_agency, 'kind', v_kind, 'starts_at', v_start, 'talent_id', v_talent, 'deal_id', v_deal, 'visible_to_brand', v_vb, 'visible_to_talent', v_vt), null,
    public.talent_audit_actor('agency', p_agency));
  -- avisos: creator que passa a ver (evento novo visível; ou, na edição, ficou visível ou trocou de creator)
  if v_vt and v_talent is not null then
    v_to := public.talent_user_id(v_talent);
    if v_before.id is null then
      perform public.inbox_notify(v_to, 'calendar_event_added', '/creator/escritorio/agenda', jsonb_build_object('date', to_char(v_start, 'YYYY-MM-DD'), 'title', v_title),
        p_agency, 'event', v_id, 'event:' || v_id::text);
    elsif not v_before.visible_to_talent or v_before.talent_id is distinct from v_talent then
      perform public.inbox_notify(v_to, 'calendar_event_added', '/creator/escritorio/agenda', jsonb_build_object('date', to_char(v_start, 'YYYY-MM-DD'), 'title', v_title),
        p_agency, 'event', v_id, 'event:' || v_id::text || ':' || v_talent::text);
    end if;
  end if;
  -- marcas: data comercial nova (editar não reavisa, como antes)
  if v_kind = 'commercial_date' and v_before.id is null then
    for r in select ab.brand_id from public.agency_brands ab where ab.agency_id = p_agency and ab.status = 'active' and (v_brand is null or ab.brand_id = v_brand) loop
      perform public.inbox_notify_brand(r.brand_id, false, 'commercial_date_published', '/marca/agenda',
        jsonb_build_object('date', to_char(v_start, 'YYYY-MM-DD'), 'title', v_title), p_agency, 'commercial_date', v_id, 'cdate:' || v_id::text || ':' || r.brand_id::text);
    end loop;
  end if;
  return v_id;
end $$;

revoke execute on function public.agency_event_save(uuid, uuid, jsonb) from public, anon;
grant execute on function public.agency_event_save(uuid, uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
