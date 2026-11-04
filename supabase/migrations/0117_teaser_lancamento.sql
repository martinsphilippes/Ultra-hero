-- =============================================================================
-- Groscove Ultra · 0117 · Teaser de lançamento: lista "Seja o primeiro a saber" (launch_leads)
-- Pedido do responsável (04/11): a /conheca vira o teaser oficial do lançamento (mesma data da loja, 01/01/2027
-- 00h de São Paulo) com um formulário curto (nome, celular, e-mail, aceite de novidades). Há duas portas: o público
-- em geral (kind 'publico') e "Sou influenciador" (kind 'influenciador', com o @ do Instagram opcional). Não existe
-- opção para empresas. Cenário S122. Idempotente; nada de drop de tabela/coluna.
--
-- Decisões (sem perguntar ao responsável):
--   • A tabela NÃO tem acesso nenhum pela API: RLS ligado, sem políticas, revoke de public/anon/authenticated. A
--     inserção é feita por server action no servidor com o cliente service role (createAdminClient), depois de
--     validar (zod), conferir o campo-isca anti-robô e o limite por IP (5 por IP a cada 10 min, contados em
--     quick_signup_attempts com HMAC e prefixo próprio "launch:", sem guardar IP puro). Nenhuma RPC executável por
--     anon foi criada (S14 segue 18).
--   • Único por (email, kind): a mesma pessoa repetindo o e-mail na mesma porta atualiza nome/celular/@/aceite sem
--     erro (upsert on conflict). Na outra porta vira outra linha (o influenciador também é público em geral).
--   • Celular em E.164 (+55DD9XXXXXXXX validado no app; o banco só exige o formato E.164), e-mail sempre minúsculo,
--     @ do Instagram sem o "@" (1–30 de [A-Za-z0-9._]). consent_at = quando a caixinha foi marcada (obrigatória).
--   • Origem opcional (source + utm_source/utm_medium/utm_campaign) para saber de onde veio; ip_hash (HMAC do
--     servidor) e user_agent curto (até 200) só para investigar abuso.
--   • Leitura só do admin da plataforma: admin_launch_leads(p_kind, p_limit, p_offset) security definer, confere
--     is_platform_admin(), revogada de public/anon; devolve totais por tipo + a página pedida (a planilha CSV do
--     /admin/interessados pagina por ela).
--   • O card de boas-vindas dos portais (mesma entrega) guarda o "já vi" no user_metadata da própria conta
--     (supabase.auth.updateUser): não precisa de tabela nem de coluna nova.
-- =============================================================================

create table if not exists public.launch_leads (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  name text not null,
  phone text not null,
  email text not null,
  instagram text,
  consent_at timestamptz not null,
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.launch_leads drop constraint if exists launch_leads_kind_check;
alter table public.launch_leads add constraint launch_leads_kind_check check (kind in ('publico', 'influenciador'));
alter table public.launch_leads drop constraint if exists launch_leads_name_check;
alter table public.launch_leads add constraint launch_leads_name_check check (char_length(btrim(name)) between 2 and 120);
alter table public.launch_leads drop constraint if exists launch_leads_phone_check;
alter table public.launch_leads add constraint launch_leads_phone_check check (phone ~ '^\+[1-9][0-9]{7,14}$');
alter table public.launch_leads drop constraint if exists launch_leads_email_check;
alter table public.launch_leads add constraint launch_leads_email_check
  check (email = lower(email) and char_length(email) between 3 and 254 and email ~ '^[^@\s]+@[^@\s]+$');
alter table public.launch_leads drop constraint if exists launch_leads_instagram_check;
alter table public.launch_leads add constraint launch_leads_instagram_check check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$');
alter table public.launch_leads drop constraint if exists launch_leads_extra_check;
alter table public.launch_leads add constraint launch_leads_extra_check check (
  coalesce(char_length(source), 0) <= 80 and coalesce(char_length(utm_source), 0) <= 80
  and coalesce(char_length(utm_medium), 0) <= 80 and coalesce(char_length(utm_campaign), 0) <= 120
  and coalesce(char_length(ip_hash), 0) <= 128 and coalesce(char_length(user_agent), 0) <= 200);

create unique index if not exists launch_leads_email_kind_key on public.launch_leads (email, kind);
create index if not exists launch_leads_created_idx on public.launch_leads (created_at desc);

alter table public.launch_leads enable row level security;
revoke all on table public.launch_leads from public, anon, authenticated;
grant select, insert, update, delete on table public.launch_leads to service_role;

-- updated_at em toda atualização (o upsert do servidor também passa por aqui)
create or replace function public.launch_leads_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.created_at := old.created_at;
  return new;
end $$;
revoke execute on function public.launch_leads_touch() from public, anon, authenticated;
grant execute on function public.launch_leads_touch() to service_role;

drop trigger if exists launch_leads_touch on public.launch_leads;
create trigger launch_leads_touch before update on public.launch_leads
  for each row execute function public.launch_leads_touch();

-- leitura do admin: totais por tipo + uma página (mais recentes primeiro) -------------------------------------------
create or replace function public.admin_launch_leads(p_kind text default null, p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_kind text := nullif(btrim(coalesce(p_kind, '')), '');
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 1000));
  v_offset int := greatest(0, coalesce(p_offset, 0));
  v_out jsonb;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_kind is not null and v_kind not in ('publico', 'influenciador') then raise exception 'invalid_kind' using errcode = '22023'; end if;

  select jsonb_build_object(
    'totals', jsonb_build_object(
      'publico', (select count(*) from public.launch_leads l where l.kind = 'publico'),
      'influenciador', (select count(*) from public.launch_leads l where l.kind = 'influenciador'),
      'all', (select count(*) from public.launch_leads l)),
    'filtered', (select count(*) from public.launch_leads l where v_kind is null or l.kind = v_kind),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'kind', x.kind, 'name', x.name, 'phone', x.phone, 'email', x.email, 'instagram', x.instagram,
        'consent_at', x.consent_at, 'source', x.source, 'utm_source', x.utm_source, 'utm_medium', x.utm_medium,
        'utm_campaign', x.utm_campaign, 'created_at', x.created_at, 'updated_at', x.updated_at) order by x.created_at desc, x.id)
      from (
        select l.* from public.launch_leads l
        where v_kind is null or l.kind = v_kind
        order by l.created_at desc, l.id
        limit v_limit offset v_offset
      ) x), '[]'::jsonb))
  into v_out;
  return v_out;
end $$;
revoke execute on function public.admin_launch_leads(text, int, int) from public, anon;
grant execute on function public.admin_launch_leads(text, int, int) to authenticated, service_role;
