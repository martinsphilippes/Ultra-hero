-- =============================================================================
-- Ultra Hero · 0032 · Receitas fase 2: decisão das credenciais do chef sobre o texto que o admin viu (P7)
--   1) admin_set_creator_credentials ganha p_expected_text: aprovar ou reprovar só vale para o texto
--      que estava na fila do admin. O pedido é travado (for update) durante a decisão; se o herói
--      editou depois que a fila abriu, a RPC recusa com 'request_changed' e nada muda.
--      O 4º parâmetro tem default nulo para o app já publicado (3 argumentos) seguir funcionando
--      durante o deploy; o app novo sempre manda o texto.
--   2) A decisão fica no próprio pedido (decision, decided_at), que o herói lê pela RLS de dono:
--      "Reprovadas" deixa de aparecer como "Aguardando". Editar o texto limpa a decisão.
--   3) updated_at do pedido só muda quando o texto muda (a decisão do admin não é "pedido novo").
-- Reaplicável. Sem dados para migrar: pedidos antigos ficam sem decisão (a fila do admin segue
-- lendo admin_audit para os antigos).
-- =============================================================================

alter table public.creator_credentials_requests
  add column if not exists decision text,
  add column if not exists decided_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'creator_credentials_requests_decision_check') then
    alter table public.creator_credentials_requests
      add constraint creator_credentials_requests_decision_check check (decision is null or decision in ('approved', 'rejected'));
  end if;
end $$;
-- os grants de insert/update do herói continuam só em (creator_id, text) e (text): a decisão é do admin

-- updated_at e a decisão acompanham só o texto (a RPC grava a decisão sem tocar no texto)
create or replace trigger trg_creator_credentials_requests_updated before update of text on public.creator_credentials_requests
  for each row execute function public.set_updated_at();

create or replace function public.creator_credentials_request_reset_decision()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.text is distinct from old.text then
    new.decision := null;
    new.decided_at := null;
  end if;
  return new;
end $$;
revoke execute on function public.creator_credentials_request_reset_decision() from public, anon;
grant execute on function public.creator_credentials_request_reset_decision() to authenticated, service_role;
create or replace trigger trg_creator_credentials_request_decision before update of text on public.creator_credentials_requests
  for each row execute function public.creator_credentials_request_reset_decision();

-- a assinatura muda (4º parâmetro): a de 3 argumentos sai para não haver duas versões
drop function if exists public.admin_set_creator_credentials(uuid, boolean, text);
create or replace function public.admin_set_creator_credentials(p_creator uuid, p_approved boolean, p_reason text, p_expected_text text default null)
returns void language plpgsql security definer set search_path = public as $$
declare cp public.creator_profiles%rowtype; v_raw text; v_text text; v_has_request boolean; v_approved boolean := coalesce(p_approved, false);
begin
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into cp from public.creator_profiles where id = p_creator for update;
  if not found then raise exception 'creator_not_found'; end if;
  -- trava o pedido: uma edição do herói em paralelo espera esta decisão terminar
  select r.text into v_raw from public.creator_credentials_requests r where r.creator_id = p_creator for update;
  v_has_request := found;
  if p_expected_text is not null and (v_raw is null or btrim(v_raw) is distinct from btrim(p_expected_text)) then
    raise exception 'request_changed';
  end if;
  v_text := nullif(btrim(v_raw), '');
  if v_approved and v_text is null then raise exception 'credentials_empty'; end if;
  perform set_config('app.trusted', 'on', true);
  update public.creator_profiles
  set credentials = case when v_approved then v_text end, credentials_approved_at = case when v_approved then now() end
  where id = p_creator;
  perform set_config('app.trusted', 'off', true);
  if v_has_request then
    update public.creator_credentials_requests
    set decision = case when v_approved then 'approved' else 'rejected' end, decided_at = now()
    where creator_id = p_creator;
  end if;
  perform public.audit_log('creator.credentials', 'creator_profile', p_creator::text,
    jsonb_build_object('credentials', cp.credentials, 'credentials_approved_at', cp.credentials_approved_at),
    jsonb_build_object('approved', v_approved, 'credentials', case when v_approved then v_text end),
    nullif(btrim(coalesce(p_reason, '')), ''));
end $$;
revoke execute on function public.admin_set_creator_credentials(uuid, boolean, text, text) from public, anon;
grant execute on function public.admin_set_creator_credentials(uuid, boolean, text, text) to authenticated, service_role;
