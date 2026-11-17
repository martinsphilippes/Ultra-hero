-- 0145 — "Casting Fonográfico 2027" no casting da Groscove (pedido do responsável, 17/11/2026).
--
-- O documento (852 artistas de 10 gravadoras, em 12 PDFs) entra no casting como o Casting Groscove 2027 (0122): foto
-- (/casting/<slug>.webp), selo "Musical artist", temas (gênero + gravadora) e o Instagram do documento; segmento Música.
--
-- Decisões:
--   • País pelo próprio documento: "Nacional" → Brasil; "Internacional" → aba EUA do seletor da 0144 (o responsável
--     pediu Brasil e EUA; o documento chama de internacional quem não é do Brasil — nem todos são americanos).
--   • Sem contato e sem convite: o documento não traz e-mail nem celular. Nada de e-mail "provável" nem de número
--     provisório (como na 0122). A ficha avisa "sem contato"; a indústria completa quando tiver (o acesso nasce na ficha).
--   • Quem já está no casting da agência (mesmo @ do Instagram) não é duplicado: só completa foto, selo e temas vazios.
--     Quando o mesmo @ aparece em duas páginas (Method Man e Method Man & Redman), vale o @ junto com o nome.
--   • Situação 'prospect', disponível, sem gestor, fora do catálogo das marcas (sem consentimento), sem página pública.
--   • Os dados ficam no repositório (supabase/data/casting_fonografico_2027.json); a importação roda uma vez pela
--     função casting_bulk_import (interna: só service_role), com o arquivo conferido por md5. Rodar de novo não duplica.
-- Idempotente; nenhuma função nova executável por anon.

create or replace function public.casting_bulk_import(p_agency_slug text, p_source text, p_rows jsonb, p_actor uuid default null)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_agency uuid; r jsonb; v_tid uuid; v_handle text; v_name text; v_topics text[]; v_seg uuid; v_country text; v_notes text;
  v_dups text[]; n_created int := 0; n_existing int := 0; v_skipped jsonb := '[]'::jsonb;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or char_length(btrim(coalesce(p_source, ''))) not between 2 and 80 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select a.id into v_agency from public.agencies a
  where a.slug = p_agency_slug and a.status = 'active' and not public.agency_is_demo(a.id);
  if v_agency is null then
    return jsonb_build_object('agency', null, 'note', 'agência não encontrada: nada a importar');
  end if;

  insert into public.talent_segments (agency_id, slug, name, sort_order) values (v_agency, 'musica', 'Música', 110)
  on conflict (agency_id, slug) do nothing;
  select s.id into v_seg from public.talent_segments s where s.agency_id = v_agency and s.slug = 'musica';

  -- @ repetido no lote: casa pelo @ junto com o nome
  select coalesce(array_agg(d.h), '{}'::text[]) into v_dups
  from (select lower(btrim(x ->> 'handle')) as h from jsonb_array_elements(p_rows) x group by 1 having count(*) > 1) d;

  for r in select x from jsonb_array_elements(p_rows) x loop
    v_handle := lower(btrim(coalesce(r ->> 'handle', '')));
    v_name := btrim(coalesce(r ->> 'name', ''));
    v_country := upper(coalesce(nullif(btrim(r ->> 'country'), ''), 'BR'));
    select coalesce(array_agg(btrim(t)), '{}'::text[]) into v_topics
    from jsonb_array_elements_text(coalesce(r -> 'topics', '[]'::jsonb)) t where btrim(t) <> '';

    -- já está no casting (mesmo @): só completa o que está vazio
    v_tid := null;
    if v_handle <> '' then
      select t.id into v_tid from public.talent_profiles t
      where t.agency_id = v_agency and t.archived_at is null
        and exists (select 1 from public.talent_social_accounts a
                    where a.talent_id = t.id and a.network = 'instagram' and lower(a.handle) = v_handle)
        and (not (v_handle = any (v_dups)) or lower(t.display_name) = lower(v_name))
      order by t.created_at limit 1;
    end if;
    if v_tid is not null then
      update public.talent_profiles set
        photo_url = coalesce(photo_url, r ->> 'photo'),
        category_label = coalesce(category_label, r ->> 'category'),
        topics = case when cardinality(topics) = 0 then v_topics else topics end
      where id = v_tid and (photo_url is null or category_label is null or cardinality(topics) = 0);
      n_existing := n_existing + 1;
      continue;
    end if;

    begin
      v_notes := 'Importado do ' || btrim(p_source) || ' (p. ' || coalesce(r ->> 'page', '?') || ', ' || coalesce(r ->> 'label', '—')
        || ', ' || coalesce(r ->> 'origin', '—') || '). Sem contato: o documento não traz e-mail nem celular.';
      insert into public.talent_profiles (agency_id, display_name, country, commercial_status, availability, internal_notes,
                                          photo_url, category_label, topics, is_demo, created_by)
      values (v_agency, v_name, v_country, 'prospect', 'available', v_notes,
              r ->> 'photo', r ->> 'category', v_topics, false, p_actor)
      returning id into v_tid;
      if v_seg is not null then
        insert into public.talent_segment_links (agency_id, talent_id, segment_id) values (v_agency, v_tid, v_seg)
        on conflict (talent_id, segment_id) do nothing;
      end if;
      if v_handle <> '' then
        insert into public.talent_social_accounts (agency_id, talent_id, network, handle, url, followers, source, as_of, declared_by, declared_side)
        values (v_agency, v_tid, 'instagram', btrim(r ->> 'handle'), r ->> 'url', null, 'declared', current_date, p_actor, 'agency')
        on conflict (talent_id, network, handle) do nothing;
      end if;
      n_created := n_created + 1;
    exception when others then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('name', v_name, 'page', r ->> 'page', 'reason', sqlerrm));
    end;
  end loop;

  perform public.audit_log('casting.import', 'agency', v_agency::text, null,
    jsonb_build_object('source', btrim(p_source), 'created', n_created, 'existing', n_existing, 'skipped', v_skipped), null, 'system');
  return jsonb_build_object('agency', v_agency, 'created', n_created, 'existing', n_existing, 'skipped', v_skipped);
end $$;
revoke execute on function public.casting_bulk_import(text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.casting_bulk_import(text, text, jsonb, uuid) to service_role;
