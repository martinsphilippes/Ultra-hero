-- 0144 — Os ADMs também aprovam o acesso das contas novas, igual à Presidência (pedido de 13/11/2026).
--
-- Até aqui (0141) só a Presidência (tabela access_approvers) aprovava ou recusava. Agora aprovam, com o mesmo poder e
-- pela mesma fila (/agencia/aprovacoes):
--   • a Presidência (access_approvers, como antes);
--   • os ADMs da plataforma: papel 'admin' ativo em role_assignments;
--   • os ADMs da indústria Groscove (dona da plataforma): agency_members 'admin' ativo da indústria de slug 'groscove',
--     o mesmo grupo de is_groscove_admin, que já aprova marcas novas (0126).
-- Conta de demonstração (painel público de login, app_metadata.ultra_hero_demo) nunca aprova, mesmo com o papel.
-- Em 13/11/2026 isso dá 6 contas: a Presidência (que também é a Adm da Groscove) e os 5 admins da plataforma.
--
-- Decisões:
--   • Regra por PAPEL, não lista de nomes: quem deixa de ser ADM perde o poder na hora (nenhum privilégio esquecido numa
--     tabela). A Presidência continua na tabela da 0141 (é uma pessoa, não um papel).
--   • Adm de OUTRA indústria NÃO aprova: indústrias são clientes da plataforma; liberar contas é da dona (Groscove).
--   • Uma regra só (is_access_approver) para a fila, a decisão, o RLS das tabelas da fila, os avisos e o "entrar sem
--     senha" do site (quem aprova sempre usa senha).
--   • Vale a primeira decisão: quem decide a partir de uma tela desatualizada (outra pessoa já decidiu) recebe
--     already_decided em vez de sobrescrever (p_expected_status). Repetir a mesma decisão continua sem efeito.
--     Recusada continua podendo ser reconsiderada por qualquer aprovador, de propósito, pela aba "Decididos".
--   • Pedido decidido: o aviso "cadastro aguardando aprovação" sai como lido para todos os aprovadores (a tarefa acabou).
--   • Nomes das RPCs (presidency_*) mantidos: o site publicado continua funcionando durante a troca, e a decisão com 4
--     parâmetros (site antigo) cai na nova assinatura pelo valor padrão do 5º.
--   • account_app_only não muda: Adm de indústria nunca é Hero (um perfil de negócio por conta, 0116) e o admin da
--     plataforma e a Presidência já ficam fora do "só pelo app".

-- 1) Quem aprova ----------------------------------------------------------------------------------------------------------
create or replace function public.is_access_approver(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user is not null and (
    -- a Presidência (0141)
    exists (select 1 from public.access_approvers a where a.user_id = p_user)
    or (
      -- conta de demonstração nunca aprova (mesmo critério de is_demo_account/is_platform_admin)
      coalesce((select u.raw_app_meta_data ->> 'ultra_hero_demo' from auth.users u where u.id = p_user), '') <> 'true'
      and (
        -- ADM da plataforma
        exists (select 1 from public.role_assignments r where r.user_id = p_user and r.role = 'admin' and r.revoked_at is null)
        -- ADM da indústria Groscove: membro ativo de indústria ativa (mesmo critério de agency_role_of)
        or exists (select 1 from public.agency_members m
                   join public.agencies ag on ag.id = m.agency_id and ag.status = 'active'
                   where m.user_id = p_user and m.agency_id = public.groscove_agency_id()
                     and m.role = 'admin' and m.revoked_at is null)))
  )
$$;
-- consultar outra pessoa só pelo sistema (o site usa no "entrar sem senha"); a própria sessão usa can_approve_access
revoke execute on function public.is_access_approver(uuid) from public, anon, authenticated;
grant execute on function public.is_access_approver(uuid) to service_role;

-- a sessão aprova cadastros? (identidade do token, conferida no banco)
create or replace function public.can_approve_access()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_access_approver((select auth.uid()))
$$;
revoke execute on function public.can_approve_access() from public, anon;
grant execute on function public.can_approve_access() to authenticated, service_role;

-- todos os que aprovam (avisos no sino): candidatos das três origens, filtrados pela mesma regra
create or replace function public.access_approver_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select c.user_id from (
    select a.user_id from public.access_approvers a
    union
    select r.user_id from public.role_assignments r where r.role = 'admin' and r.revoked_at is null
    union
    select m.user_id from public.agency_members m
    where m.agency_id = public.groscove_agency_id() and m.role = 'admin' and m.revoked_at is null
  ) c
  where public.is_access_approver(c.user_id)
$$;
revoke execute on function public.access_approver_ids() from public, anon, authenticated;

-- 2) Leitura da fila e do histórico: quem aprova (e a própria pessoa, só a própria linha da fila) ---------------------------
drop policy if exists account_approvals_select on public.account_approvals;
create policy account_approvals_select on public.account_approvals for select to authenticated
  using (user_id = (select auth.uid()) or (select public.can_approve_access()));
drop policy if exists account_approval_events_select on public.account_approval_events;
create policy account_approval_events_select on public.account_approval_events for select to authenticated
  using ((select public.can_approve_access()));

-- 3) Fila e contagem (corpo igual ao da 0141; muda só quem pode) -------------------------------------------------------
-- p_view: 'pending' (fila, mais antigos primeiro) ou 'decided' (decididos por alguém, mais recentes primeiro)
create or replace function public.presidency_access_queue(p_view text default 'pending')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_approve_access() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_view is null or p_view not in ('pending', 'decided') then raise exception 'invalid_input' using errcode = '22023'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(q)::jsonb order by
             case when p_view = 'pending' then extract(epoch from q.requested_at) else -extract(epoch from q.decided_at) end)
    from (
      select a.user_id, coalesce(u.email, a.email) as email,
             coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), nullif(btrim(p.display_name), '')) as name,
             -- e-mail comprovado: Google/Apple provam a posse; senha e cadastro rápido não (e-mail nunca verificado pelo app)
             ((u.raw_app_meta_data -> 'providers') ?| array['google', 'apple'])
               or (u.raw_app_meta_data ->> 'provider') in ('google', 'apple')
               or ((u.raw_app_meta_data ? 'quick_signup_unverified') and (u.raw_app_meta_data ->> 'quick_signup_unverified') = 'false')
               as email_verified,
             a.requested_profile, a.profile_confirmed, a.origin, a.requested_at, a.status,
             a.decided_at, a.decision_note,
             coalesce(nullif(btrim(d.full_name), ''), d.display_name) as decided_by_name,
             u.last_sign_in_at
      from public.account_approvals a
      join auth.users u on u.id = a.user_id
      left join public.profiles p on p.id = a.user_id
      left join public.profiles d on d.id = a.decided_by
      where (p_view = 'pending' and a.status = 'pending')
         or (p_view = 'decided' and a.status <> 'pending' and a.decided_by is not null)
      order by case when p_view = 'pending' then a.requested_at end asc, a.decided_at desc
      limit 300
    ) q), '[]'::jsonb);
end $$;
revoke execute on function public.presidency_access_queue(text) from public, anon;
grant execute on function public.presidency_access_queue(text) to authenticated;

create or replace function public.presidency_access_pending_count()
returns integer language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_approve_access() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select count(*)::integer from public.account_approvals a where a.status = 'pending');
end $$;
revoke execute on function public.presidency_access_pending_count() from public, anon;
grant execute on function public.presidency_access_pending_count() to authenticated;

-- 4) Decisão --------------------------------------------------------------------------------------------------------------
-- Aprova ou recusa. Quem aprova (identidade do token conferida aqui, no banco). Pendente → aprovada/recusada; recusada
-- pode ser reconsiderada (→ aprovada). Aprovada não volta a pendente por aqui (para tirar acesso há a suspensão).
-- p_expected_profile: o perfil que a tela mostrou; se a pessoa trocou o pedido depois, recusa (profile_changed).
-- p_expected_status (0144): a situação que a tela mostrou ('pending' na fila, 'rejected' em "Decididos"); se outra
-- pessoa decidiu nesse meio-tempo, recusa (already_decided) em vez de sobrescrever a decisão dela.
drop function if exists public.presidency_access_decide(uuid, text, text, text);
create or replace function public.presidency_access_decide(p_user uuid, p_decision text, p_note text default null,
                                                           p_expected_profile text default null,
                                                           p_expected_status text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid();
        v_old text;
        v_profile text;
        v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.can_approve_access() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user is null or p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_expected_status is not null and p_expected_status not in ('pending', 'rejected') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_user = v_actor then raise exception 'cannot_decide_self' using errcode = 'P0001'; end if;

  select a.status, a.requested_profile into v_old, v_profile from public.account_approvals a where a.user_id = p_user for update;
  if v_old is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_expected_profile is not null and p_expected_profile is distinct from v_profile then
    raise exception 'profile_changed' using errcode = 'P0001';
  end if;
  if v_old = p_decision then
    return jsonb_build_object('status', v_old, 'changed', false);
  end if;
  if p_expected_status is not null and p_expected_status is distinct from v_old then
    raise exception 'already_decided' using errcode = 'P0001';
  end if;
  if v_old = 'approved' then raise exception 'already_approved' using errcode = 'P0001'; end if;

  update public.account_approvals
     set status = p_decision, decided_by = v_actor, decided_at = now(), decision_note = v_note, updated_at = now()
   where user_id = p_user;
  insert into public.account_approval_events (user_id, action, actor_id, status, requested_profile, note)
  values (p_user, p_decision, v_actor, p_decision, v_profile, v_note);
  perform public.audit_log(case p_decision when 'approved' then 'account.access_approved' else 'account.access_rejected' end,
    'user', p_user::text, jsonb_build_object('status', v_old),
    jsonb_build_object('status', p_decision, 'requested_profile', v_profile), v_note, 'admin');
  perform public.account_claims_sync(p_user);
  -- aprovada quem se cadastrou sozinho como Hero, Marca ou Agência: o passo a passo do perfil já fica aberto (o login
  -- seguinte cai nele, como no cadastro antes da regra). Convite e criação pelo admin seguem o próprio fluxo.
  if p_decision = 'approved' and v_profile in ('hero', 'brand', 'agency')
     and exists (select 1 from public.account_approvals a where a.user_id = p_user and a.origin in ('password', 'quick', 'google', 'apple'))
     and not exists (select 1 from public.role_assignments r where r.user_id = p_user and r.revoked_at is null
                     and r.role::text in ('creator', 'brand', 'agency'))
     and not exists (select 1 from public.account_onboardings o where o.user_id = p_user and o.kind = v_profile and o.completed_at is null) then
    begin
      insert into public.account_onboardings (user_id, kind, source) values (p_user, v_profile, 'self');
    exception when others then
      null; -- ex.: a conta já tem outro perfil de negócio (0116); a aprovação vale e o passo a passo abre pelo /comecar
    end;
  end if;
  -- 0144: a tarefa acabou para todos os aprovadores: o aviso do pedido sai como lido no sino de cada um
  update public.inbox_notifications n set read_at = now()
   where n.kind = 'account_access_requested' and n.entity_type = 'account' and n.entity_id = p_user and n.read_at is null;
  -- aviso no sino da pessoa (aparece quando ela entrar; a tela de status já mostra a decisão). Melhor esforço.
  begin
    perform public.inbox_notify(p_user, 'account_access_decided', '/aguardando-aprovacao',
              jsonb_build_object('decision', p_decision), null, 'account', p_user, null);
  exception when others then
    null;
  end;
  return jsonb_build_object('status', p_decision, 'changed', true);
end $$;
revoke execute on function public.presidency_access_decide(uuid, text, text, text, text) from public, anon;
grant execute on function public.presidency_access_decide(uuid, text, text, text, text) to authenticated;

-- 5) Pedido novo avisa todos os que aprovam (corpo igual ao da 0141; muda só quem recebe o aviso) --------------------------
create or replace function public.account_access_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_meta jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
        v_provider text := coalesce(v_meta ->> 'provider', 'email');
        v_invite_profile text := public.account_profile_from_invitation(new.email);
        v_profile text;
        v_confirmed boolean;
        v_origin text;
        v_name text;
begin
  v_origin := case
    when v_provider in ('google', 'apple') then v_provider
    when (v_meta ->> 'created_by_admin') = 'true' then 'admin'
    when (v_meta ->> 'invite_first_access') = 'true' or v_invite_profile is not null then 'invite'
    when (v_meta ->> 'signup_profile') is not null then 'password'
    when (v_meta ->> 'quick_signup') = 'true' then 'quick'
    else 'password' end;
  v_profile := case
    when v_meta ->> 'signup_profile' in ('hero', 'brand', 'agency') then v_meta ->> 'signup_profile'
    when v_meta ->> 'requested_profile' in ('consumer', 'hero', 'brand', 'agency', 'professional', 'seller', 'staff', 'admin')
      then v_meta ->> 'requested_profile'
    when v_invite_profile is not null then v_invite_profile
    else 'consumer' end;
  -- Google/Apple sem convite nem perfil escolhido: a tela de status pergunta "Como você vai usar o Ultra?"
  v_confirmed := not (v_origin in ('google', 'apple') and v_invite_profile is null
                      and (v_meta ->> 'requested_profile') is null);

  insert into public.account_approvals (user_id, email, status, requested_profile, profile_confirmed, origin, requested_at)
  values (new.id, lower(new.email), 'pending', v_profile, v_confirmed, v_origin, coalesce(new.created_at, now()))
  on conflict (user_id) do nothing;
  insert into public.account_approval_events (user_id, action, status, requested_profile)
  values (new.id, 'requested', 'pending', v_profile);

  -- aviso no sino de cada um que aprova: Presidência e ADMs (sem dados pessoais além do nome)
  v_name := left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
                          split_part(coalesce(new.email, ''), '@', 1)), 80);
  begin
    perform public.inbox_notify(x.user_id, 'account_access_requested', '/agencia/aprovacoes',
              jsonb_build_object('name', v_name, 'profile', v_profile), null, 'account', new.id,
              'account_access:' || new.id::text || ':' || x.user_id::text)
    from public.access_approver_ids() as x(user_id);
  exception when others then
    null; -- o aviso é melhor esforço: o cadastro nunca falha por causa dele
  end;
  return new;
end $$;
revoke execute on function public.account_access_after_insert() from public, anon, authenticated;

notify pgrst, 'reload schema';
