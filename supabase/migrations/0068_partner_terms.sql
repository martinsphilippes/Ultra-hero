-- 0068 · Termos do Parceiro: aceite no convite e confirmação de direitos antes do primeiro envio.
-- Idempotente (create if not exists / or replace / drop if exists).
--
-- Decisões (31/10/2026, lançamento público):
--   • heróis e agências entram por convite e, no aceite, aceitam os Termos do Parceiro (/legal/partner-terms).
--     Guardamos a versão aceita e a data: é a prova do aceite (clickwrap), como num cadastro de rede social;
--   • antes do primeiro envio de foto ou vídeo, a pessoa confirma a declaração de direitos (imagem, voz, autoria).
--     A data também fica guardada. Nova versão dos Termos zera a confirmação: o próximo envio pede de novo;
--   • a versão vigente mora no código (PARTNER_TERMS_VERSION); o banco só guarda o que a pessoa aceitou;
--   • uma linha por pessoa, apagada junto com a conta (on delete cascade), como diz a Política de Privacidade.

create table if not exists public.partner_terms_acceptances (
  user_id uuid primary key constraint partner_terms_acceptances_user_fk references auth.users (id) on delete cascade,
  terms_version text not null constraint partner_terms_acceptances_version_check check (terms_version ~ '^\d{4}-\d{2}-\d{2}$'),
  accepted_at timestamptz not null default now(),
  upload_rights_confirmed_at timestamptz
);

revoke all on table public.partner_terms_acceptances from public, anon, authenticated;
grant select on table public.partner_terms_acceptances to authenticated;
grant all on table public.partner_terms_acceptances to service_role;
alter table public.partner_terms_acceptances enable row level security;
drop policy if exists partner_terms_acceptances_select_own on public.partner_terms_acceptances;
create policy partner_terms_acceptances_select_own on public.partner_terms_acceptances
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_platform_admin()));

-- aceite (no convite): grava a versão; versão nova zera a confirmação de direitos
create or replace function public.accept_partner_terms(p_version text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_version is null or p_version !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_terms_version'; end if;
  insert into public.partner_terms_acceptances (user_id, terms_version)
  values (v_uid, p_version)
  on conflict (user_id) do update
    set terms_version = excluded.terms_version,
        accepted_at = now(),
        upload_rights_confirmed_at = case
          when public.partner_terms_acceptances.terms_version = excluded.terms_version
            then public.partner_terms_acceptances.upload_rights_confirmed_at
          else null
        end;
end $$;

-- confirmação de direitos (antes do 1º envio): só vale sobre a versão aceita
create or replace function public.confirm_upload_rights(p_version text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  update public.partner_terms_acceptances
     set upload_rights_confirmed_at = now()
   where user_id = v_uid and terms_version = p_version;
  if not found then raise exception 'partner_terms_not_accepted'; end if;
end $$;

revoke all on function public.accept_partner_terms(text) from public, anon;
revoke all on function public.confirm_upload_rights(text) from public, anon;
grant execute on function public.accept_partner_terms(text) to authenticated;
grant execute on function public.confirm_upload_rights(text) to authenticated;
