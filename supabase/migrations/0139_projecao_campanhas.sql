-- =============================================================================
-- 0139 — Projeção de campanhas: aba "Projeção" do Financeiro (pedido de 08/11/2026)
--   Dois números para gestor, equipe e Hero: "Projeção no seu segmento" e "Projeção para você", no ano escolhido
--   (padrão: o ano atual; ou o total, sem data). Entra tudo de campanha:
--     - negócios: o cachê de cada Hero, fechado (ganho) ou em negociação (permuta e demonstração não entram);
--     - patrocínio: acordos fechados, propostas em negociação e as cotas ainda livres das oportunidades abertas
--       (preço da cota × vagas sem acordo);
--     - chamadas abertas das marcas: a verba anunciada (no modelo "por Hero", verba × máximo de Heros).
--   Data de cada valor: o início previsto (negócio, evento, chamada); sem ele, o fechamento ou a criação.
--   Segmento: o do casting do Hero (talent_segments). Chamadas casam pelo nicho com o nome do segmento, sem acento e
--   sem diferença de maiúsculas. Fora do que é da pessoa só aparecem somas: nada de marca, Hero ou negócio.
--   "Para você": Hero = os cachês e as cotas dele; na agência = os Heros de que a pessoa é a gestora responsável e os
--   negócios em que ela é a responsável. "Seu segmento": os desses Heros; na agência, sem Hero sob cuidado, os da
--   agência inteira. O total da agência só o Adm vê. Decisão do dono (08/11/2026): gestor e equipe veem a aba
--   (somas, nunca valor de negócio a negócio); as outras abas do Financeiro continuam só do Adm.
--   Substitui finance_projection (0128) nas telas; aquela função fica, sem uso.
-- =============================================================================

-- chave de comparação de segmento e nicho: minúsculas, sem acento, sem espaço nas pontas
create or replace function public.projection_key(p text)
returns text language sql immutable set search_path = '' as $$
  select nullif(translate(lower(btrim(coalesce(p, ''))), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '')
$$;
revoke execute on function public.projection_key(text) from public, anon;
grant execute on function public.projection_key(text) to authenticated, service_role;

create or replace function public.campaign_projection(p_agency uuid default null, p_year int default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_member boolean := p_agency is not null; v_admin boolean := false; v_talents uuid[]; v_seg text[];
        v_from date; v_to date; v_pref uuid; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_member then
    if not public.agency_can(p_agency, 'staff') then raise exception 'forbidden' using errcode = '42501'; end if;
    v_admin := public.agency_can(p_agency, 'admin');
  end if;
  if p_year is not null then
    if p_year not between 2000 and 2100 then raise exception 'invalid_input' using errcode = '22023'; end if;
    v_from := make_date(p_year, 1, 1);
    v_to := make_date(p_year + 1, 1, 1);
  end if;

  -- "para você": na agência, os Heros que a pessoa cuida; fora dela, os talentos da própria conta (o Hero)
  if v_member then
    select coalesce(array_agg(t.id), '{}') into v_talents from public.talent_profiles t
    where t.agency_id = p_agency and t.manager_id = auth.uid() and t.archived_at is null;
  else
    select coalesce(array_agg(t.id), '{}') into v_talents from public.talent_profiles t
    left join public.creator_profiles c on c.id = t.creator_id
    where t.user_id = auth.uid() or c.user_id = auth.uid();
    -- fora da agência, só quem é Hero de um casting (marca não vê a projeção)
    if cardinality(v_talents) = 0 then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;

  -- nomes de segmento como a agência de quem pergunta escreve (o Hero: a agência do casting dele)
  v_pref := coalesce(p_agency, (select t.agency_id from public.talent_profiles t where t.id = any (v_talents) order by t.created_at limit 1));

  -- "seu segmento": os segmentos desses Heros; na agência, sem Hero sob cuidado, os da agência inteira
  select coalesce(array_agg(distinct public.projection_key(s.name)), '{}') into v_seg
  from public.talent_segment_links l join public.talent_segments s on s.id = l.segment_id
  where l.talent_id = any (v_talents) and s.active;
  if v_member and cardinality(v_seg) = 0 then
    select coalesce(array_agg(distinct public.projection_key(s.name)), '{}') into v_seg
    from public.talent_segment_links l join public.talent_segments s on s.id = l.segment_id
    join public.talent_profiles t on t.id = l.talent_id
    where t.agency_id = p_agency and t.archived_at is null and s.active;
  end if;

  with seg as (
    select l.talent_id, array_agg(distinct public.projection_key(s.name)) as keys
    from public.talent_segment_links l join public.talent_segments s on s.id = l.segment_id
    group by l.talent_id
  ), items as (
    -- negócios fechados (ganhos)
    select 'won'::text as bucket, f.fee_cents::bigint as cents,
           coalesce(d.expected_start::date, d.closed_at::date, d.created_at::date) as day,
           f.talent_id, d.agency_id, d.owner_id, g.keys
    from public.deal_talent_fees f join public.deals d on d.id = f.deal_id left join seg g on g.talent_id = f.talent_id
    where not d.is_demo and d.compensation_type <> 'barter' and d.outcome = 'won'
    union all
    -- negócios em negociação
    select 'open', f.fee_cents::bigint, coalesce(d.expected_start::date, d.created_at::date), f.talent_id, d.agency_id, d.owner_id, g.keys
    from public.deal_talent_fees f join public.deals d on d.id = f.deal_id left join seg g on g.talent_id = f.talent_id
    where not d.is_demo and d.compensation_type <> 'barter' and d.outcome is null
    union all
    -- patrocínio fechado
    select 'won', p.agreed_cents::bigint, coalesce(o.starts_at::date, p.agreed_at::date, p.created_at::date), o.talent_id, o.agency_id, null::uuid, g.keys
    from public.sponsorship_proposals p join public.sponsorship_opportunities o on o.id = p.opportunity_id
    left join seg g on g.talent_id = o.talent_id
    where p.status = 'agreed'
    union all
    -- patrocínio em negociação
    select 'open', p.amount_cents::bigint, coalesce(o.starts_at::date, p.created_at::date), o.talent_id, o.agency_id, null::uuid, g.keys
    from public.sponsorship_proposals p join public.sponsorship_opportunities o on o.id = p.opportunity_id
    left join seg g on g.talent_id = o.talent_id
    where p.status = 'open' and o.status = 'open'
    union all
    -- cotas de patrocínio ainda livres (preço × vagas sem acordo)
    select 'available',
           tr.price_cents::bigint * greatest(tr.slots - (select count(*) from public.sponsorship_proposals x where x.tier_id = tr.id and x.status = 'agreed'), 0),
           coalesce(o.starts_at::date, o.respond_by::date, o.created_at::date), o.talent_id, o.agency_id, null::uuid, g.keys
    from public.sponsorship_tiers tr join public.sponsorship_opportunities o on o.id = tr.opportunity_id
    left join seg g on g.talent_id = o.talent_id
    where o.status = 'open'
    union all
    -- chamadas abertas das marcas (verba anunciada; "por Hero" = verba × máximo de Heros)
    select 'available',
           case when c.value_model = 'por_heroi' then c.budget_cents::bigint * coalesce(c.max_heroes, 1) else c.budget_cents::bigint end,
           coalesce(c.starts_on::date, c.respond_by::date, c.created_at::date), null::uuid, null::uuid, null::uuid,
           (select array_agg(public.projection_key(n)) from unnest(c.niches) n)
    from public.brand_calls c
    where c.status = 'open'
  ), scoped as (
    select * from items where coalesce(cents, 0) > 0 and (v_from is null or (day >= v_from and day < v_to))
  ), names as (
    -- nome de cada segmento para mostrar (o da agência de quem pergunta primeiro)
    select distinct on (public.projection_key(s.name)) public.projection_key(s.name) as k, s.name
    from public.talent_segments s where s.active
    order by public.projection_key(s.name), (s.agency_id is distinct from v_pref), s.name
  ), per_segment as (
    select k, coalesce(sum(cents) filter (where bucket = 'won'), 0) as won, coalesce(sum(cents) filter (where bucket = 'open'), 0) as open,
           coalesce(sum(cents) filter (where bucket = 'available'), 0) as available
    from scoped, unnest(keys) k where k is not null group by k
  )
  select jsonb_build_object(
    'year', p_year,
    'mine', (select jsonb_build_object('won', coalesce(sum(cents) filter (where bucket = 'won'), 0),
                                       'open', coalesce(sum(cents) filter (where bucket = 'open'), 0),
                                       'available', coalesce(sum(cents) filter (where bucket = 'available'), 0))
             from scoped where talent_id = any (v_talents) or (v_member and agency_id = p_agency and owner_id = auth.uid())),
    'segment', (select jsonb_build_object('won', coalesce(sum(cents) filter (where bucket = 'won'), 0),
                                          'open', coalesce(sum(cents) filter (where bucket = 'open'), 0),
                                          'available', coalesce(sum(cents) filter (where bucket = 'available'), 0))
                from scoped where keys && v_seg),
    'platform', (select jsonb_build_object('won', coalesce(sum(cents) filter (where bucket = 'won'), 0),
                                           'open', coalesce(sum(cents) filter (where bucket = 'open'), 0),
                                           'available', coalesce(sum(cents) filter (where bucket = 'available'), 0))
                 from scoped),
    'agency', case when v_admin then (select jsonb_build_object('won', coalesce(sum(cents) filter (where bucket = 'won'), 0),
                                                                'open', coalesce(sum(cents) filter (where bucket = 'open'), 0),
                                                                'available', coalesce(sum(cents) filter (where bucket = 'available'), 0))
                                      from scoped where agency_id = p_agency) end,
    'segments', coalesce((select jsonb_agg(jsonb_build_object('name', n.name, 'won', x.won, 'open', x.open, 'available', x.available,
                                                              'mine', x.k = any (v_seg)) order by x.won + x.open + x.available desc, n.name)
                          from per_segment x join names n on n.k = x.k), '[]'::jsonb),
    'my_segments', coalesce((select jsonb_agg(n.name order by n.name) from names n where n.k = any (v_seg)), '[]'::jsonb),
    'years', coalesce((select jsonb_agg(y order by y) from (select distinct extract(year from day)::int as y from items
                       where day is not null and coalesce(cents, 0) > 0) z), '[]'::jsonb))
  into v_result;
  return v_result;
end $$;
revoke execute on function public.campaign_projection(uuid, int) from public, anon;
grant execute on function public.campaign_projection(uuid, int) to authenticated, service_role;
