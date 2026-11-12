-- 0142 — Hero aprovado continua só pelo aplicativo (correção da 0141, 12/11/2026).
--
-- Na 0141, depois da aprovação o "só pelo app" passava a depender só do papel creator. Quem se cadastra como Hero só ganha
-- esse papel ao terminar o passo a passo do Hero (no app); entre a aprovação e esse passo, a conta podia entrar pelo
-- navegador como usuário comum. A regra pedida é "Hero/Creator só pelo aplicativo, inclusive para contas já aprovadas":
-- conta que pediu o perfil Hero fica só pelo app em qualquer situação (pendente, aprovada ou recusada). Continuam na web
-- a Presidência e os administradores da plataforma (supervisão e aprovação), como na 0141.
--
-- Em 12/11/2026, a única conta afetada era a de teste da validação: os 13 Heroes existentes já têm o papel creator.
-- Idempotente; mesma assinatura (não muda permissões).

create or replace function public.account_app_only(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.access_approvers a where a.user_id = p_user)
     and not exists (select 1 from public.role_assignments r where r.user_id = p_user and r.role = 'admin' and r.revoked_at is null)
     and (exists (select 1 from public.role_assignments r where r.user_id = p_user and r.role = 'creator' and r.revoked_at is null)
          or exists (select 1 from public.account_approvals a where a.user_id = p_user and a.requested_profile = 'hero'))
$$;
revoke execute on function public.account_app_only(uuid) from public, anon, authenticated;

-- regrava access/app_only no app_metadata de quem pediu Hero (o gatilho de atualização recalcula)
update auth.users u set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
where exists (select 1 from public.account_approvals a where a.user_id = u.id and a.requested_profile = 'hero');
