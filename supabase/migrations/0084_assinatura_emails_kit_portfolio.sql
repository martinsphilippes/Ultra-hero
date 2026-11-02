-- =============================================================================
-- Groscove Ultra · 0084 · Gestão: assinatura eletrônica dos termos, avisos por e-mail, media kit automático e portfólio
-- Bloco 7. Cenário S91. Idempotente; nenhuma função nova para anon (S14 segue 18); nada aqui carrega valor.
--
-- Decisões:
--   • Assinatura eletrônica SIMPLES (Lei 14.063/2020, art. 4º, I; MP 2.200-2/2001, art. 10, § 2º) no lugar do
--     "concordo" da 0068, para a marca (só o dono, como antes) e para o influenciador confirmado: a parte digita
--     o nome completo (nome e sobrenome) e o CPF ou CNPJ (dígitos verificadores conferidos aqui, em
--     br_tax_id_kind; o CNPJ alfanumérico da IN RFB 2.229/2024 também passa) e confirma. Grava em
--     deal_signatures: nome, documento (normalizado), tipo, e-mail da conta (auth.users), IP e navegador (vindos
--     do servidor do app, que os lê dos cabeçalhos da requisição; o banco só valida o formato do IP), data/hora e
--     o hash SHA-256 do TEXTO EXATO assinado (deal_terms_signable_text: texto canônico em português — idioma do
--     contrato, para o hash não depender do idioma da tela — com marca, agência, campanha, versão, resumo,
--     direitos de uso e exclusividade estruturados). O texto vai junto (signed_text), para o comprovante provar a
--     integridade a qualquer tempo (hash recalculado na leitura). A tela mostra o texto e o hash antes da
--     assinatura e manda o hash visto (p_expected_hash): se os termos mudaram no meio, recusa com terms_changed.
--   • O aceite continua em deal_acceptances (tudo o que confere aceite — contratação, painéis, avisos — segue
--     igual), agora com method = 'e_signature' e a assinatura ligada por acceptance_id. A assinatura vale para a
--     versão: versão nova (agency_terms_send) substitui a anterior e exige nova assinatura (o índice de aceite é
--     por terms_id). brand_terms_accept e talent_terms_accept (mesma assinatura) passam a recusar com
--     signature_required: o "concordo" sem nome e documento deixa de existir. A agência registrando aceite
--     recebido por fora (agency_record_acceptance, com nota) continua igual.
--   • Quem lê a assinatura (CPF/CNPJ é dado pessoal): quem assinou; a agência (gestor+ ou equipe do negócio); e a
--     marca (dono ou equipe) só a assinatura da própria marca — nunca o documento do influenciador (a agência fica
--     no meio). terms_signatures(p_deal) lista as visíveis (para o painel de termos ligar ao comprovante) e
--     terms_signature_receipt(p_id) devolve o comprovante.
--   • Avisos por e-mail: fila email_outbox (só service_role) preenchida por gatilho em inbox_notifications para os
--     avisos que valem e-mail (inbox_kind_emails, espelhada em src/lib/inbox/kinds.ts): oferta nova para o
--     influenciador (opportunity_received), ajuste pedido (deliverable_decided com status changes_requested, para
--     o influenciador), prazo chegando em 24 h (task_due_soon, novo, pelo cron diário task_due_soon_scan),
--     entrega aguardando a marca (deliverable_submitted com link da marca), termos para assinar
--     (contract_acceptance_requested) e contraproposta respondida (opportunity_updated com status
--     counter_accepted/counter_rejected). Preferência respeitada: notification_preferences.channel_email (0018;
--     sem linha = ligado, o padrão da tabela). O app esvazia a fila depois das server actions que geram esses
--     avisos (after(), sem bloquear) e no cron diário; só envia com RESEND_API_KEY e EMAIL_FROM (sem eles, nada
--     sai e o aviso fica no sino). Aviso já lido, com mais de 3 dias ou de quem desligou o e-mail é pulado.
--   • Media kit automático: números calculados na hora (talent_kit_stats): campanhas concluídas (negócio fechado
--     como ganho com o influenciador contratado), entregas publicadas, entrega no prazo (primeira versão enviada —
--     ou a publicação — até o prazo do entregável), nota média de todas as marcas (talent_ratings, 0081),
--     totais das métricas da 0083 (valor atual de cada métrica = leitura mais recente que a traz, somado),
--     seguidores do herói no app (hero_favorites) e a data da última atualização das redes. Campos novos do kit:
--     'stats' (padrão para kits novos; os kits existentes não mudam sozinhos o que é público) e 'portfolio'
--     (opt-in: expõe marcas e campanhas). media_kit_resolve (mesma assinatura) devolve os dois quando marcados.
--   • Portfólio (talent_kit_portfolio): campanhas com entregáveis publicados (link https e métricas atuais), da
--     mais recente para a mais antiga (até 20 campanhas, 10 entregáveis cada). talent_kit_insights(p_talent):
--     leitura dos dois para o próprio influenciador e para a agência dele (qualquer papel; não é valor).
--   • Todas as RPCs novas: search_path vazio; security definer só onde lê/escreve por cima da RLS; execute
--     revogado de public/anon; as internas só para service_role.
-- =============================================================================

-- 1) avisos: todos os valores da 0083 + task_due_soon ---------------------------------------------------------------
alter table public.inbox_notifications drop constraint if exists inbox_notifications_kind_check;
alter table public.inbox_notifications add constraint inbox_notifications_kind_check check (kind in (
  'member_joined', 'brand_member_joined',
  'talent_consent_given', 'talent_consent_revoked',
  'briefing_received', 'deal_assigned', 'campaign_status_changed', 'proposal_received', 'proposal_decided', 'message_received',
  'opportunity_received', 'opportunity_updated', 'opportunity_answered', 'contract_acceptance_requested', 'contract_confirmed',
  'task_assigned', 'deliverable_submitted', 'deliverable_decided', 'deliverable_published', 'talent_suggestion',
  'calendar_event_added', 'commercial_date_published',
  'relationship_alert', 'task_overdue', 'payout_updated',
  'internal_approval_requested', 'internal_approval_decided', 'shortlist_sent', 'shortlist_decided',
  'invoice_submitted', 'invoice_reviewed', 'payout_scheduled', 'budget_exceeded',
  'usage_rights_expiring', 'deliverable_comment',
  'task_due_soon'));

-- 2) CPF / CNPJ -----------------------------------------------------------------------------------------------------
-- normaliza: sem pontuação, maiúsculas (o CNPJ alfanumérico usa letras nas 12 primeiras posições)
create or replace function public.br_tax_id_normalize(p text)
returns text language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g'))
$$;
revoke execute on function public.br_tax_id_normalize(text) from public, anon;
grant execute on function public.br_tax_id_normalize(text) to authenticated, service_role;

-- 'cpf' | 'cnpj' | null (dígitos verificadores; sequência repetida não vale). Mesmo cálculo de src/lib/signature/tax-id.ts.
create or replace function public.br_tax_id_kind(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare d text := public.br_tax_id_normalize(p); s int; r int; i int; w int[];
begin
  if d ~ '^[0-9]{11}$' then
    if d = repeat(left(d, 1), 11) then return null; end if;
    s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    if r <> substr(d, 10, 1)::int then return null; end if;
    s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
    r := (s * 10) % 11; if r = 10 then r := 0; end if;
    if r <> substr(d, 11, 1)::int then return null; end if;
    return 'cpf';
  elsif d ~ '^[0-9A-Z]{12}[0-9]{2}$' then
    if d = repeat(left(d, 1), 14) then return null; end if;
    w := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    s := 0; for i in 1..12 loop s := s + (ascii(substr(d, i, 1)) - 48) * w[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    if r <> substr(d, 13, 1)::int then return null; end if;
    w := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    s := 0; for i in 1..13 loop s := s + (ascii(substr(d, i, 1)) - 48) * w[i]; end loop;
    r := s % 11; r := case when r < 2 then 0 else 11 - r end;
    if r <> substr(d, 14, 1)::int then return null; end if;
    return 'cnpj';
  end if;
  return null;
end $$;
revoke execute on function public.br_tax_id_kind(text) from public, anon;
grant execute on function public.br_tax_id_kind(text) to authenticated, service_role;

-- 3) aceite por assinatura eletrônica -------------------------------------------------------------------------------
alter table public.deal_acceptances drop constraint if exists deal_acceptances_method_check;
alter table public.deal_acceptances add constraint deal_acceptances_method_check check (method in ('in_app', 'recorded_by_agency', 'e_signature'));

create table if not exists public.deal_signatures (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null constraint deal_signatures_agency_fk references public.agencies (id) on delete cascade,
  brand_id uuid not null constraint deal_signatures_brand_fk references public.brands (id) on delete restrict,
  deal_id uuid not null constraint deal_signatures_deal_fk references public.deals (id) on delete cascade,
  terms_id uuid not null constraint deal_signatures_terms_fk references public.deal_terms (id) on delete cascade,
  acceptance_id uuid not null constraint deal_signatures_acceptance_fk references public.deal_acceptances (id) on delete cascade,
  terms_version integer not null,
  party text not null,
  deal_talent_id uuid constraint deal_signatures_deal_talent_fk references public.deal_talents (id) on delete cascade,
  talent_id uuid constraint deal_signatures_talent_fk references public.talent_profiles (id) on delete restrict,
  signer_user_id uuid constraint deal_signatures_signer_fk references auth.users (id) on delete set null,
  signer_name text not null,
  signer_tax_id text not null,
  signer_tax_kind text not null,
  signer_email text not null default '',
  signer_ip text,
  signer_user_agent text not null default '',
  signed_text text not null,
  text_sha256 text not null,
  signed_at timestamptz not null default now(),
  constraint deal_signatures_acceptance_uq unique (acceptance_id),
  constraint deal_signatures_party_check check (party in ('brand', 'talent')),
  constraint deal_signatures_shape check ((party = 'talent') = (deal_talent_id is not null and talent_id is not null)),
  constraint deal_signatures_name_check check (char_length(signer_name) between 5 and 120),
  constraint deal_signatures_tax_check check (signer_tax_kind in ('cpf', 'cnpj') and public.br_tax_id_kind(signer_tax_id) = signer_tax_kind
    and signer_tax_id = public.br_tax_id_normalize(signer_tax_id)),
  constraint deal_signatures_hash_check check (text_sha256 ~ '^[0-9a-f]{64}$'),
  constraint deal_signatures_meta_check check (char_length(signer_email) <= 320 and char_length(signer_user_agent) <= 400
    and (signer_ip is null or char_length(signer_ip) <= 64))
);
create index if not exists deal_signatures_deal_idx on public.deal_signatures (deal_id, terms_id);
create index if not exists deal_signatures_signer_idx on public.deal_signatures (signer_user_id);
revoke all on table public.deal_signatures from public, anon, authenticated;
grant select on table public.deal_signatures to authenticated;
grant all on table public.deal_signatures to service_role;
alter table public.deal_signatures enable row level security;
drop policy if exists deal_signatures_select_signer on public.deal_signatures;
create policy deal_signatures_select_signer on public.deal_signatures for select to authenticated
  using (signer_user_id = (select auth.uid()));
drop policy if exists deal_signatures_select_agency on public.deal_signatures;
create policy deal_signatures_select_agency on public.deal_signatures for select to authenticated
  using (agency_id = any ((select public.my_agency_ids('manager'))::uuid[]) or deal_id = any ((select public.my_staff_deal_ids())::uuid[]));
drop policy if exists deal_signatures_select_brand on public.deal_signatures;
create policy deal_signatures_select_brand on public.deal_signatures for select to authenticated
  using (party = 'brand' and brand_id = any ((select public.my_brand_ids(false))::uuid[]));

-- texto canônico dos termos (o que é assinado e entra no hash). Interna.
create or replace function public.deal_terms_signable_text(p_terms uuid)
returns text language sql stable set search_path = '' as $$
  select concat_ws(E'\n',
    'GROSCOVE ULTRA · TERMOS DA CAMPANHA',
    'Identificador dos termos: ' || t.id::text,
    'Versão: ' || t.version::text,
    'Campanha: ' || coalesce(nullif(btrim(r.title), ''), d.title),
    'Negócio: ' || d.title,
    'Marca: ' || b.name,
    'Agência: ' || a.name,
    'Enviados em: ' || coalesce(to_char(t.sent_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '—'),
    'Válidos até: ' || coalesce(to_char(t.valid_until, 'YYYY-MM-DD'), '—'),
    '',
    'RESUMO DAS CONDIÇÕES',
    t.summary,
    '',
    'DIREITOS DE USO',
    'Canais: ' || coalesce(nullif(array_to_string(array(
      select case c when 'social' then 'redes sociais' when 'website' then 'site' when 'paid_media' then 'mídia paga'
        when 'pos' then 'ponto de venda' when 'email' then 'e-mail' when 'ecommerce' then 'e-commerce' when 'ooh' then 'mídia exterior'
        when 'tv' then 'TV' else 'outro' end
      from unnest(t.usage_channels) with ordinality u(c, n) order by n), ', '), ''), '—'),
    'Prazo: ' || case when t.usage_perpetual then 'perpétuo' when t.usage_months is null then '—' else t.usage_months::text || ' meses' end,
    'Impulsionamento (mídia paga): ' || case when t.boost_allowed then 'permitido' else 'não permitido' end,
    'Observação: ' || coalesce(nullif(btrim(t.usage_rights), ''), '—'),
    '',
    'EXCLUSIVIDADE',
    case when t.exclusive then 'Sim, por ' || coalesce(t.exclusivity_months::text, '—') || ' meses' else 'Não' end,
    'Segmentos: ' || coalesce(nullif(array_to_string(array(select s.name from public.talent_segments s where s.id = any (t.exclusivity_segment_ids)
      order by s.sort_order, s.name), ', '), ''), '—'),
    'Categoria: ' || coalesce(nullif(t.exclusivity_category, ''), '—'),
    'Marcas concorrentes: ' || coalesce(nullif(array_to_string(t.competitor_brands, ', '), ''), '—'),
    'Observação: ' || coalesce(nullif(btrim(t.exclusivity), ''), '—'))
  from public.deal_terms t
  join public.deals d on d.id = t.deal_id
  join public.brands b on b.id = t.brand_id
  join public.agencies a on a.id = t.agency_id
  left join public.campaign_requests r on r.id = d.request_id
  where t.id = p_terms
$$;
revoke execute on function public.deal_terms_signable_text(uuid) from public, anon, authenticated;
grant execute on function public.deal_terms_signable_text(uuid) to service_role;

create or replace function public.text_sha256_hex(p text)
returns text language sql immutable set search_path = '' as $$
  select encode(pg_catalog.sha256(convert_to(coalesce(p, ''), 'UTF8')), 'hex')
$$;
revoke execute on function public.text_sha256_hex(text) from public, anon;
grant execute on function public.text_sha256_hex(text) to authenticated, service_role;

-- quem pode ler (e, no caso da marca/creator, assinar) uma versão enviada: 'agency' | 'brand' | 'talent' | null. Interna.
create or replace function public.terms_reader_side(p_terms uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare t public.deal_terms%rowtype; d public.deals%rowtype;
begin
  if auth.uid() is null then return null; end if;
  select * into t from public.deal_terms where id = p_terms;
  if t.id is null then return null; end if;
  select * into d from public.deals where id = t.deal_id;
  if public.agency_can(t.agency_id, 'manager') or d.id = any (public.my_staff_deal_ids()) then return 'agency'; end if;
  if t.status = 'draft' or t.sent_at is null then return null; end if;
  if d.brand_visible and public.brand_member_of(t.brand_id) is not null then return 'brand'; end if;
  if d.id = any (public.my_talent_contract_deal_ids()) then return 'talent'; end if;
  return null;
end $$;
revoke execute on function public.terms_reader_side(uuid) from public, anon, authenticated;
grant execute on function public.terms_reader_side(uuid) to service_role;

-- texto e hash para a tela mostrar antes de assinar
create or replace function public.terms_sign_preview(p_terms uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_text text; v_version int; v_status text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if public.terms_reader_side(p_terms) is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select t.version, t.status into v_version, v_status from public.deal_terms t where t.id = p_terms;
  v_text := public.deal_terms_signable_text(p_terms);
  return jsonb_build_object('terms_id', p_terms, 'version', v_version, 'status', v_status, 'text', v_text, 'sha256', public.text_sha256_hex(v_text));
end $$;
revoke execute on function public.terms_sign_preview(uuid) from public, anon;
grant execute on function public.terms_sign_preview(uuid) to authenticated, service_role;

-- grava aceite + assinatura (interna; quem chama já conferiu a parte e o estado dos termos)
create or replace function public.terms_signature_create(p_terms uuid, p_party text, p_deal_talent uuid, p_full_name text, p_tax_id text,
  p_expected_hash text, p_ip text, p_user_agent text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.deal_terms%rowtype; dt public.deal_talents%rowtype; v_name text; v_doc text; v_kind text; v_text text; v_hash text;
        v_email text; v_ip text; v_ua text; v_acc uuid; v_sig uuid;
begin
  select * into t from public.deal_terms where id = p_terms;
  if p_party = 'talent' then select * into dt from public.deal_talents where id = p_deal_talent; end if;
  v_name := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  if char_length(v_name) < 5 or char_length(v_name) > 120 or v_name !~ '^\S+( \S+)+$' then raise exception 'name_required' using errcode = '22023'; end if;
  v_doc := public.br_tax_id_normalize(p_tax_id);
  v_kind := public.br_tax_id_kind(v_doc);
  if v_kind is null then raise exception 'invalid_tax_id' using errcode = '22023'; end if;
  v_text := public.deal_terms_signable_text(p_terms);
  v_hash := public.text_sha256_hex(v_text);
  if nullif(btrim(coalesce(p_expected_hash, '')), '') is not null and lower(btrim(p_expected_hash)) <> v_hash then
    raise exception 'terms_changed' using errcode = 'P0001';
  end if;
  select u.email into v_email from auth.users u where u.id = auth.uid();
  begin
    v_ip := host(nullif(btrim(coalesce(p_ip, '')), '')::inet);
  exception when others then v_ip := null;
  end;
  v_ua := left(regexp_replace(btrim(coalesce(p_user_agent, '')), '[[:cntrl:]]', '', 'g'), 400);
  insert into public.deal_acceptances (agency_id, brand_id, deal_id, terms_id, party, deal_talent_id, talent_id, method, accepted_by, note)
  values (t.agency_id, t.brand_id, t.deal_id, p_terms, p_party, dt.id, dt.talent_id, 'e_signature', auth.uid(), '')
  on conflict (terms_id, party, deal_talent_id) do nothing
  returning id into v_acc;
  if v_acc is null then raise exception 'already_signed' using errcode = 'P0001'; end if;
  insert into public.deal_signatures (agency_id, brand_id, deal_id, terms_id, acceptance_id, terms_version, party, deal_talent_id, talent_id,
    signer_user_id, signer_name, signer_tax_id, signer_tax_kind, signer_email, signer_ip, signer_user_agent, signed_text, text_sha256)
  values (t.agency_id, t.brand_id, t.deal_id, p_terms, v_acc, t.version, p_party, dt.id, dt.talent_id,
    auth.uid(), v_name, v_doc, v_kind, left(coalesce(v_email, ''), 320), v_ip, v_ua, v_text, v_hash)
  returning id into v_sig;
  return v_sig;
end $$;
revoke execute on function public.terms_signature_create(uuid, text, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.terms_signature_create(uuid, text, uuid, text, text, text, text, text) to service_role;

-- assinatura da marca: só o dono, nos termos enviados (e dentro da validade) do negócio dela
create or replace function public.brand_terms_sign(p_terms uuid, p_full_name text, p_tax_id text, p_expected_hash text default null,
  p_ip text default null, p_user_agent text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.deal_terms%rowtype; d public.deals%rowtype; v_sig uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into t from public.deal_terms where id = p_terms for update;
  if t.id is null or t.status = 'draft' or public.brand_member_of(t.brand_id) is distinct from 'owner' or not (t.deal_id = any (public.my_brand_deal_ids())) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if t.status <> 'sent' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if t.valid_until is not null and t.valid_until < current_date then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  v_sig := public.terms_signature_create(p_terms, 'brand', null, p_full_name, p_tax_id, p_expected_hash, p_ip, p_user_agent);
  select * into d from public.deals where id = t.deal_id;
  perform public.audit_log('terms.sign', 'deal_terms', p_terms::text, null,
    jsonb_build_object('agency_id', t.agency_id, 'party', 'brand', 'method', 'e_signature', 'signature_id', v_sig), null, 'brand'::public.actor_type);
  perform public.inbox_notify_agency(t.agency_id, 'manager', 'campaign_status_changed', '/agencia/negocios/' || t.deal_id::text || '/termos',
    jsonb_build_object('deal', d.title, 'status', 'brand_accepted'), 'proposal', p_terms, 'accept:' || p_terms::text || ':brand');
  if d.owner_id is not null then
    perform public.inbox_notify(d.owner_id, 'campaign_status_changed', '/agencia/negocios/' || t.deal_id::text || '/termos',
      jsonb_build_object('deal', d.title, 'status', 'brand_accepted'), t.agency_id, 'proposal', p_terms, 'accept:' || p_terms::text || ':brand:' || d.owner_id::text);
  end if;
  return v_sig;
end $$;
revoke execute on function public.brand_terms_sign(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.brand_terms_sign(uuid, text, text, text, text, text) to authenticated, service_role;

-- assinatura do influenciador confirmado
create or replace function public.talent_terms_sign(p_terms uuid, p_full_name text, p_tax_id text, p_expected_hash text default null,
  p_ip text default null, p_user_agent text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t public.deal_terms%rowtype; dt public.deal_talents%rowtype; d public.deals%rowtype; v_sig uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into t from public.deal_terms where id = p_terms for update;
  if t.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into dt from public.deal_talents where deal_id = t.deal_id and talent_id = public.my_talent_id();
  if dt.id is null or dt.status not in ('proposed', 'contracted') or t.status = 'draft' then raise exception 'not_found' using errcode = 'P0002'; end if;
  if t.status <> 'sent' then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  if t.valid_until is not null and t.valid_until < current_date then raise exception 'invalid_state' using errcode = 'P0001'; end if;
  v_sig := public.terms_signature_create(p_terms, 'talent', dt.id, p_full_name, p_tax_id, p_expected_hash, p_ip, p_user_agent);
  select * into d from public.deals where id = t.deal_id;
  select x.display_name into v_name from public.talent_profiles x where x.id = dt.talent_id;
  perform public.audit_log('terms.sign', 'deal_terms', p_terms::text, null,
    jsonb_build_object('agency_id', t.agency_id, 'party', 'talent', 'deal_talent_id', dt.id, 'method', 'e_signature', 'signature_id', v_sig), null, 'creator'::public.actor_type);
  perform public.inbox_notify_agency(t.agency_id, 'manager', 'campaign_status_changed', '/agencia/negocios/' || t.deal_id::text || '/termos',
    jsonb_build_object('deal', d.title, 'talent', v_name, 'status', 'talent_accepted'), 'proposal', p_terms, 'accept:' || p_terms::text || ':' || dt.id::text);
  return v_sig;
end $$;
revoke execute on function public.talent_terms_sign(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.talent_terms_sign(uuid, text, text, text, text, text) to authenticated, service_role;

-- o "concordo" antigo (mesma assinatura da 0068) deixa de valer: a assinatura eletrônica o substitui
create or replace function public.brand_terms_accept(p_terms uuid, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  raise exception 'signature_required' using errcode = 'P0001';
end $$;
create or replace function public.talent_terms_accept(p_terms uuid, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  raise exception 'signature_required' using errcode = 'P0001';
end $$;
revoke execute on function public.brand_terms_accept(uuid, text) from public, anon;
grant execute on function public.brand_terms_accept(uuid, text) to authenticated, service_role;
revoke execute on function public.talent_terms_accept(uuid, text) from public, anon;
grant execute on function public.talent_terms_accept(uuid, text) to authenticated, service_role;

-- assinaturas visíveis de um negócio (para o painel de termos ligar ao comprovante); sem documento
create or replace function public.terms_signatures(p_deal uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d public.deals%rowtype; v_side text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into d from public.deals where id = p_deal;
  if d.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if public.agency_can(d.agency_id, 'manager') or d.id = any (public.my_staff_deal_ids()) then v_side := 'agency';
  elsif d.brand_visible and public.brand_member_of(d.brand_id) is not null then v_side := 'brand';
  elsif d.id = any (public.my_talent_contract_deal_ids()) then v_side := 'talent';
  else raise exception 'not_found' using errcode = 'P0002';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'terms_id', s.terms_id, 'party', s.party, 'deal_talent_id', s.deal_talent_id,
            'signer_name', s.signer_name, 'signed_at', s.signed_at, 'sha256', s.text_sha256) order by s.signed_at), '[]'::jsonb)
          from public.deal_signatures s
          where s.deal_id = p_deal
            and (v_side = 'agency' or (v_side = 'brand' and s.party = 'brand') or (v_side = 'talent' and s.signer_user_id = auth.uid())));
end $$;
revoke execute on function public.terms_signatures(uuid) from public, anon;
grant execute on function public.terms_signatures(uuid) to authenticated, service_role;

-- comprovante: quem assinou, a agência (gestor+ ou equipe do negócio) e a marca (só a assinatura dela)
create or replace function public.terms_signature_receipt(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.deal_signatures%rowtype; d public.deals%rowtype; v_side text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select * into s from public.deal_signatures where id = p_id;
  if s.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into d from public.deals where id = s.deal_id;
  if s.signer_user_id = auth.uid() then v_side := case when s.party = 'brand' then 'brand' else 'talent' end;
  elsif public.agency_can(s.agency_id, 'manager') or d.id = any (public.my_staff_deal_ids()) then v_side := 'agency';
  elsif s.party = 'brand' and public.brand_member_of(s.brand_id) is not null then v_side := 'brand';
  else raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', s.id, 'side', v_side, 'party', s.party, 'terms_id', s.terms_id, 'terms_version', s.terms_version,
    'terms_status', (select t.status from public.deal_terms t where t.id = s.terms_id),
    'deal_id', s.deal_id, 'deal', d.title, 'request_id', d.request_id, 'deal_talent_id', s.deal_talent_id,
    'brand', (select b.name from public.brands b where b.id = s.brand_id),
    'agency', (select a.name from public.agencies a where a.id = s.agency_id),
    'talent', (select x.display_name from public.talent_profiles x where x.id = s.talent_id),
    'signer_name', s.signer_name, 'tax_id', s.signer_tax_id, 'tax_kind', s.signer_tax_kind, 'email', s.signer_email,
    'ip', s.signer_ip, 'user_agent', s.signer_user_agent, 'signed_at', s.signed_at, 'sha256', s.text_sha256,
    'text', s.signed_text, 'intact', public.text_sha256_hex(s.signed_text) = s.text_sha256);
end $$;
revoke execute on function public.terms_signature_receipt(uuid) from public, anon;
grant execute on function public.terms_signature_receipt(uuid) to authenticated, service_role;

-- 4) avisos por e-mail ----------------------------------------------------------------------------------------------
-- o aviso vale e-mail? (mesma regra de src/lib/inbox/kinds.ts → inboxKindEmails)
create or replace function public.inbox_kind_emails(p_kind text, p_link text, p_params jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case p_kind
    when 'opportunity_received' then coalesce(p_link, '') like '/creator/escritorio%'
    when 'opportunity_updated' then coalesce(p_link, '') like '/creator/escritorio%' and coalesce(p_params ->> 'status', '') in ('counter_accepted', 'counter_rejected')
    when 'deliverable_decided' then coalesce(p_link, '') like '/creator/escritorio%' and coalesce(p_params ->> 'status', '') = 'changes_requested'
    when 'deliverable_submitted' then coalesce(p_link, '') like '/marca/%'
    when 'contract_acceptance_requested' then true
    when 'task_due_soon' then true
    else false end
$$;
revoke execute on function public.inbox_kind_emails(text, text, jsonb) from public, anon;
grant execute on function public.inbox_kind_emails(text, text, jsonb) to authenticated, service_role;

create table if not exists public.email_outbox (
  id bigint generated always as identity primary key,
  notification_id uuid not null constraint email_outbox_notification_fk references public.inbox_notifications (id) on delete cascade,
  user_id uuid not null constraint email_outbox_user_fk references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempts smallint not null default 0,
  sent_at timestamptz,
  skipped_at timestamptz,
  outcome text,
  constraint email_outbox_notification_uq unique (notification_id),
  constraint email_outbox_outcome_check check (outcome is null or char_length(outcome) <= 60)
);
create index if not exists email_outbox_pending_idx on public.email_outbox (id) where sent_at is null and skipped_at is null;
revoke all on table public.email_outbox from public, anon, authenticated;
grant all on table public.email_outbox to service_role;
alter table public.email_outbox enable row level security;
-- sem política: só o service role (que ignora RLS) lê e escreve

-- e-mail ligado? (sem linha = padrão da tabela: ligado). Interna.
create or replace function public.email_allowed(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.channel_email from public.notification_preferences p where p.user_id = p_user), true)
$$;
revoke execute on function public.email_allowed(uuid) from public, anon, authenticated;
grant execute on function public.email_allowed(uuid) to service_role;

create or replace function public.email_on_inbox_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.inbox_kind_emails(new.kind, new.link, new.params) then return new; end if;
  if not public.email_allowed(new.user_id) then return new; end if;
  if not exists (select 1 from auth.users u where u.id = new.user_id and coalesce(u.email, '') <> '') then return new; end if;
  insert into public.email_outbox (notification_id, user_id) values (new.id, new.user_id) on conflict (notification_id) do nothing;
  return new;
end $$;
revoke execute on function public.email_on_inbox_notification() from public, anon, authenticated;
drop trigger if exists trg_email_inbox_notification on public.inbox_notifications;
create trigger trg_email_inbox_notification after insert on public.inbox_notifications
  for each row execute function public.email_on_inbox_notification();

-- lote para envio: pula o que perdeu o sentido (lido, velho, e-mail desligado) e marca o resto como "pego".
-- Linha pega há mais de 5 minutos sem envio volta à fila; até 5 tentativas.
create or replace function public.email_outbox_claim(p_limit int default 50)
returns table (id bigint, user_id uuid, email text, locale text, kind text, params jsonb, link text, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  update public.email_outbox o set skipped_at = now(),
    outcome = case when n.read_at is not null then 'skipped_read' when o.created_at < now() - interval '3 days' then 'skipped_stale' else 'skipped_consent' end
  from public.inbox_notifications n
  where n.id = o.notification_id and o.sent_at is null and o.skipped_at is null
    and (n.read_at is not null or o.created_at < now() - interval '3 days' or not public.email_allowed(o.user_id));
  return query
  with picked as (
    update public.email_outbox o set claimed_at = now(), attempts = o.attempts + 1
    where o.id in (select x.id from public.email_outbox x
                   where x.sent_at is null and x.skipped_at is null and x.attempts < 5
                     and (x.claimed_at is null or x.claimed_at < now() - interval '5 minutes')
                   order by x.id limit greatest(1, least(coalesce(p_limit, 50), 200))
                   for update skip locked)
    returning o.id, o.user_id, o.notification_id, o.created_at)
  select p.id, p.user_id, u.email::text, coalesce(pr.locale::text, 'pt-BR'), n.kind, n.params, n.link, p.created_at
  from picked p
  join public.inbox_notifications n on n.id = p.notification_id
  join auth.users u on u.id = p.user_id
  left join public.profiles pr on pr.id = p.user_id;
end $$;
revoke execute on function public.email_outbox_claim(int) from public, anon, authenticated;
grant execute on function public.email_outbox_claim(int) to service_role;

-- limpeza (cron): enviados ou pulados há mais de 30 dias; desistidos (5 tentativas) também
create or replace function public.email_outbox_cleanup()
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  with gone as (delete from public.email_outbox where created_at < now() - interval '30 days' returning 1)
  select count(*) into v_n from gone;
  return v_n;
end $$;
revoke execute on function public.email_outbox_cleanup() from public, anon, authenticated;
grant execute on function public.email_outbox_cleanup() to service_role;

-- prazo chegando: tarefa aberta que vence nas próximas 24 h (cron diário). Mesmo destinatário do aviso de atraso.
create or replace function public.task_due_soon_scan()
returns int language plpgsql security definer set search_path = '' as $$
declare k record; v_to uuid; v_talent_user uuid; v_link text; v_params jsonb; v_dedupe text; v_n int := 0;
begin
  for k in select tk.id, tk.agency_id, tk.title, tk.template_step, tk.side, tk.assignee_id, tk.deal_id, tk.talent_id, tk.due_at, d.owner_id, d.title as deal_title,
                  coalesce(ag.timezone, 'America/Sao_Paulo') as tz
           from public.tasks tk
           join public.agencies ag on ag.id = tk.agency_id and ag.status = 'active'
           left join public.deals d on d.id = tk.deal_id
           where tk.status in ('todo', 'doing', 'blocked') and tk.due_at > now() and tk.due_at <= now() + interval '24 hours' loop
    v_talent_user := case when k.side = 'talent' then public.talent_user_id(k.talent_id) end;
    v_to := coalesce(k.assignee_id, v_talent_user, k.owner_id);
    v_params := jsonb_build_object('deal', coalesce(k.deal_title, nullif(k.title, ''), ''), 'step', coalesce(k.template_step::text, ''),
      'date', to_char(k.due_at at time zone k.tz, 'YYYY-MM-DD HH24:MI'));
    v_dedupe := 'due_soon:' || k.id::text || ':' || to_char(k.due_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI');
    if v_to is not null then
      v_link := case when v_to = v_talent_user then '/creator/escritorio/tarefas' when k.deal_id is not null then '/agencia/negocios/' || k.deal_id::text || '/tarefas' else '/agencia/tarefas' end;
      if public.inbox_notify(v_to, 'task_due_soon', v_link, v_params, k.agency_id, 'task', k.id, v_dedupe) is not null then v_n := v_n + 1; end if;
    else
      v_link := case when k.deal_id is not null then '/agencia/negocios/' || k.deal_id::text || '/tarefas' else '/agencia/tarefas' end;
      v_n := v_n + public.inbox_notify_agency(k.agency_id, 'manager', 'task_due_soon', v_link, v_params, 'task', k.id, v_dedupe);
    end if;
  end loop;
  return v_n;
end $$;
revoke execute on function public.task_due_soon_scan() from public, anon, authenticated;
grant execute on function public.task_due_soon_scan() to service_role;

-- 5) media kit automático e portfólio -------------------------------------------------------------------------------
alter table public.media_kits drop constraint if exists media_kits_fields_check;
alter table public.media_kits add constraint media_kits_fields_check check (visible_fields <@ array['photo','headline','about','location','segments','networks',
  'followers','views','reach','engagement','audience','brands','agency_contact','stats','portfolio']::text[]);
alter table public.media_kits alter column visible_fields set default '{headline,about,segments,networks,followers,stats}';

-- valor atual de cada métrica de um entregável (a leitura mais recente que a traz). Interna.
create or replace function public.deliverable_metric_current(p_deliverable uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'reach', (select m.reach from public.deliverable_metrics m where m.deliverable_id = p_deliverable and m.reach is not null order by m.measured_on desc, m.updated_at desc limit 1),
    'views', (select m.views from public.deliverable_metrics m where m.deliverable_id = p_deliverable and m.views is not null order by m.measured_on desc, m.updated_at desc limit 1),
    'likes', (select m.likes from public.deliverable_metrics m where m.deliverable_id = p_deliverable and m.likes is not null order by m.measured_on desc, m.updated_at desc limit 1),
    'comments', (select m.comments from public.deliverable_metrics m where m.deliverable_id = p_deliverable and m.comments is not null order by m.measured_on desc, m.updated_at desc limit 1),
    'shares', (select m.shares from public.deliverable_metrics m where m.deliverable_id = p_deliverable and m.shares is not null order by m.measured_on desc, m.updated_at desc limit 1),
    'saves', (select m.saves from public.deliverable_metrics m where m.deliverable_id = p_deliverable and m.saves is not null order by m.measured_on desc, m.updated_at desc limit 1),
    'clicks', (select m.clicks from public.deliverable_metrics m where m.deliverable_id = p_deliverable and m.clicks is not null order by m.measured_on desc, m.updated_at desc limit 1)))
$$;
revoke execute on function public.deliverable_metric_current(uuid) from public, anon, authenticated;
grant execute on function public.deliverable_metric_current(uuid) to service_role;

-- números do kit, calculados na hora. Interna (o /kit e talent_kit_insights chamam).
create or replace function public.talent_kit_stats(p_talent uuid)
returns jsonb language sql stable set search_path = '' as $$
  with dl as (
    select x.id, x.status, x.due_at,
      coalesce((select min(v.submitted_at) from public.deliverable_versions v where v.deliverable_id = x.id and v.kind = 'submission'), x.published_at) as delivered_at,
      case when x.status in ('published', 'proof_submitted', 'done') then public.deliverable_metric_current(x.id) else '{}'::jsonb end as m
    from public.deliverables x
    join public.deal_talents dt on dt.id = x.deal_talent_id and dt.status = 'contracted'
    where x.talent_id = p_talent and x.status <> 'cancelled')
  select jsonb_build_object(
    'completed_campaigns', (select count(distinct d.id) from public.deal_talents dt join public.deals d on d.id = dt.deal_id
                            where dt.talent_id = p_talent and dt.status = 'contracted' and d.stage = 'closed' and d.outcome = 'won'),
    'published_deliverables', (select count(*) from dl where dl.status in ('published', 'proof_submitted', 'done')),
    'on_time_base', (select count(*) from dl where dl.status in ('approved', 'published', 'proof_submitted', 'done') and dl.due_at is not null and dl.delivered_at is not null),
    'on_time_count', (select count(*) from dl where dl.status in ('approved', 'published', 'proof_submitted', 'done') and dl.due_at is not null and dl.delivered_at is not null
                      and dl.delivered_at <= dl.due_at),
    'rating_avg', (select round(avg(r.quality)::numeric, 1) from public.talent_ratings r where r.talent_id = p_talent),
    'rating_count', (select count(*) from public.talent_ratings r where r.talent_id = p_talent),
    'metrics', (select jsonb_strip_nulls(jsonb_build_object(
                  'reach', sum((dl.m ->> 'reach')::bigint), 'views', sum((dl.m ->> 'views')::bigint), 'likes', sum((dl.m ->> 'likes')::bigint),
                  'comments', sum((dl.m ->> 'comments')::bigint), 'shares', sum((dl.m ->> 'shares')::bigint), 'saves', sum((dl.m ->> 'saves')::bigint),
                  'clicks', sum((dl.m ->> 'clicks')::bigint))) from dl),
    'app_followers', case when tp.creator_id is null then null else (select count(*) from public.hero_favorites f where f.creator_id = tp.creator_id) end,
    'networks_updated_at', (select max(a.updated_at) from public.talent_social_accounts a where a.talent_id = p_talent),
    'computed_at', now())
  from public.talent_profiles tp where tp.id = p_talent
$$;
revoke execute on function public.talent_kit_stats(uuid) from public, anon, authenticated;
grant execute on function public.talent_kit_stats(uuid) to service_role;

-- portfólio: campanhas com entregáveis publicados (link e métricas atuais), da mais recente. Interna.
create or replace function public.talent_kit_portfolio(p_talent uuid)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(c.item order by c.last_at desc), '[]'::jsonb)
  from (
    select max(x.published_at) as last_at,
      jsonb_build_object('campaign', coalesce(nullif(btrim(r.title), ''), d.title), 'brand', b.name, 'brand_logo', b.logo_url,
        'last_published_at', max(x.published_at),
        'deliverables', (select coalesce(jsonb_agg(y.item order by y.at desc), '[]'::jsonb) from (
            select z.published_at as at, jsonb_build_object('title', coalesce(nullif(z.title, ''), z.kind), 'kind', z.kind, 'network', z.network,
              'url', z.published_url, 'published_at', z.published_at, 'metrics', public.deliverable_metric_current(z.id)) as item
            from public.deliverables z
            where z.deal_id = d.id and z.talent_id = p_talent and z.status in ('published', 'proof_submitted', 'done') and z.published_url is not null
            order by z.published_at desc nulls last limit 10) y)) as item
    from public.deliverables x
    join public.deal_talents dt on dt.id = x.deal_talent_id and dt.status = 'contracted'
    join public.deals d on d.id = x.deal_id and coalesce(d.outcome, 'won') = 'won'
    join public.brands b on b.id = d.brand_id
    left join public.campaign_requests r on r.id = d.request_id
    where x.talent_id = p_talent and x.status in ('published', 'proof_submitted', 'done') and x.published_url is not null
    group by d.id, d.title, r.title, b.name, b.logo_url
    order by max(x.published_at) desc nulls last
    limit 20) c
$$;
revoke execute on function public.talent_kit_portfolio(uuid) from public, anon, authenticated;
grant execute on function public.talent_kit_portfolio(uuid) to service_role;

-- leitura para o próprio influenciador e para a agência dele (qualquer papel: não há valor aqui)
create or replace function public.talent_kit_insights(p_talent uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_agency uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  select t.agency_id into v_agency from public.talent_profiles t where t.id = p_talent;
  if v_agency is null or not (p_talent is not distinct from public.my_talent_id() or public.agency_can(v_agency, 'staff')) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('stats', public.talent_kit_stats(p_talent), 'portfolio', public.talent_kit_portfolio(p_talent));
end $$;
revoke execute on function public.talent_kit_insights(uuid) from public, anon;
grant execute on function public.talent_kit_insights(uuid) to authenticated, service_role;

-- /kit/<token> (mesma assinatura da 0065): + 'stats' e 'portfolio' quando marcados
create or replace function public.media_kit_resolve(p_token text, p_count boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare k public.media_kits%rowtype; t public.talent_profiles%rowtype; c public.creator_profiles%rowtype;
        f text[]; v jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into k from public.media_kits where share_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if not found or k.share_revoked_at is not null or k.share_expires_at <= now() then return null; end if;
  select * into t from public.talent_profiles where id = k.talent_id;
  if t.archived_at is not null or t.consent_at is null or t.consent_revoked_at is not null then return null; end if;
  -- agência suspensa ou de demonstração: sem kit público (D5/D6)
  if not exists (select 1 from public.agencies a where a.id = t.agency_id and a.status = 'active' and not a.is_demo) then return null; end if;
  if t.creator_id is not null then
    select * into c from public.creator_profiles where id = t.creator_id and status = 'active';
    if c.id is null then return null; end if;   -- herói suspenso ou pendente: o kit sai do ar junto
  end if;
  f := k.visible_fields;
  v := jsonb_build_object('name', t.display_name, 'fields', to_jsonb(f), 'expires_at', k.share_expires_at);
  if 'photo' = any (f) then v := v || jsonb_build_object('photo_url', c.avatar_url); end if;
  if 'headline' = any (f) then v := v || jsonb_build_object('headline', k.headline); end if;
  if 'about' = any (f) then v := v || jsonb_build_object('about', k.about); end if;
  if 'location' = any (f) then v := v || jsonb_build_object('city', t.city, 'state', t.state); end if;
  if 'segments' = any (f) then v := v || jsonb_build_object('segments', (select coalesce(jsonb_agg(s.name order by s.sort_order), '[]')
      from public.talent_segment_links l join public.talent_segments s on s.id = l.segment_id and s.active where l.talent_id = t.id)); end if;
  if 'networks' = any (f) then
    v := v || jsonb_build_object('networks', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'network', a.network, 'handle', a.handle, 'url', a.url, 'source', a.source, 'as_of', a.as_of,
      'declared_side', a.declared_side, 'declared_at', a.updated_at::date,
      'followers', case when 'followers' = any (f) then a.followers end,
      'avg_views', case when 'views' = any (f) then a.avg_views end,
      'avg_reach', case when 'reach' = any (f) then a.avg_reach end,
      'engagement_bp', case when 'engagement' = any (f) then a.engagement_bp end,
      'audience', case when 'audience' = any (f) and a.audience <> '{}'::jsonb then a.audience end)) order by a.followers desc nulls last), '[]')
      from public.talent_social_accounts a where a.talent_id = t.id));
  end if;
  if 'brands' = any (f) and c.id is not null then v := v || jsonb_build_object('brands', (select coalesce(jsonb_agg(jsonb_build_object('name', b.name, 'logo_url', b.logo_url) order by cb.sort_order), '[]')
      from public.creator_brands cb join public.brands b on b.id = cb.brand_id and b.status = 'active'
      where cb.creator_id = c.id and cb.status = 'active')); end if;
  if 'agency_contact' = any (f) then v := v || (select jsonb_build_object('agency', a.name, 'agency_email', a.contact_email) from public.agencies a where a.id = t.agency_id); end if;
  if 'stats' = any (f) then v := v || jsonb_build_object('stats', public.talent_kit_stats(t.id)); end if;
  if 'portfolio' = any (f) then v := v || jsonb_build_object('portfolio', public.talent_kit_portfolio(t.id)); end if;
  if p_count then update public.media_kits set view_count = view_count + 1, last_viewed_at = now() where id = k.id; end if;
  return v;
end $$;
revoke execute on function public.media_kit_resolve(text, boolean) from public, anon, authenticated;
grant execute on function public.media_kit_resolve(text, boolean) to service_role;
