-- =============================================================================
-- Ultra Hero · 0059 · Programas com produto e profissional ligados (Etapa 4 da vitrine do herói)
--   Decisão do responsável (docs/decisions/hero-showcase.md): "programa pode ter 1 produto e/ou 1
--   serviço". Aceitamos até 3 produtos por programa, em ordem, com nota opcional ("por que este
--   produto"), e um serviço (opcional) por profissional sugerido no programa.
--
-- Tabelas / colunas
--   program_products                 produto(s) do programa (até 3; ordem 1..3; nota até 200).
--                                    Chave primária própria (id): nada de tabela-ponte na chave
--                                    (lição da 0055, PGRST201).
--   professional_suggestions.service_id
--                                    serviço escolhido para o profissional sugerido no programa
--                                    (só com program_id). FK composta (service_id, professional_id)
--                                    garante que o serviço é do mesmo profissional; serviço apagado
--                                    zera só a coluna.
-- Leitura pública: programa publicado e produto publicado/liberado (a RLS de products ainda vale no
--   embed). Escrita só por RPC do admin, sempre auditada (admin_audit).
-- Regras gerais: idempotente; search_path fixo; grants explícitos; RLS ligada; políticas com
--   (select ...); nenhuma função nova executável pelo visitante (S14 segue com 17).
-- =============================================================================

-- ---------------------------------------------------------------- 1) produtos do programa
create table if not exists public.program_products (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  sort_order smallint not null,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- ordem 1..3 e única por programa = no máximo 3 produtos
  constraint program_products_sort_check check (sort_order between 1 and 3),
  constraint program_products_note_check check (char_length(note) <= 200),
  constraint program_products_uq unique (program_id, product_id),
  constraint program_products_sort_uq unique (program_id, sort_order)
);
create index if not exists program_products_product_idx on public.program_products (product_id);

drop trigger if exists trg_program_products_updated on public.program_products;
create trigger trg_program_products_updated before update on public.program_products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- 2) serviço do profissional sugerido
-- alvo da FK composta: (id, professional_id) é único porque id já é a chave
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'professional_services_id_pro_uq') then
    alter table public.professional_services add constraint professional_services_id_pro_uq unique (id, professional_id);
  end if;
end $$;

alter table public.professional_suggestions add column if not exists service_id uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'professional_suggestions_service_fk') then
    alter table public.professional_suggestions add constraint professional_suggestions_service_fk
      foreign key (service_id, professional_id) references public.professional_services (id, professional_id)
      on delete set null (service_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'professional_suggestions_service_program') then
    alter table public.professional_suggestions add constraint professional_suggestions_service_program
      check (service_id is null or program_id is not null);
  end if;
end $$;
create index if not exists professional_suggestions_service_idx on public.professional_suggestions (service_id) where service_id is not null;

-- ---------------------------------------------------------------- 3) grants e RLS
revoke all on table public.program_products from public, anon, authenticated;
grant select on table public.program_products to anon, authenticated;
grant all on table public.program_products to service_role;

alter table public.program_products enable row level security;

drop policy if exists program_products_select_public on public.program_products;
create policy program_products_select_public on public.program_products for select to anon, authenticated
  using (exists (select 1 from public.programs pg where pg.id = program_products.program_id and pg.status = 'published')
         and exists (select 1 from public.products pr where pr.id = program_products.product_id
                     and pr.status = 'published' and pr.moderation_status = 'clear'));
drop policy if exists program_products_select_admin on public.program_products;
create policy program_products_select_admin on public.program_products for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------- 4) RPCs do admin (auditadas)
-- Troca a lista inteira de produtos do programa: p_items = [{"product_id": "...", "note": "..."}],
-- na ordem em que aparecem (até 3, sem repetir). Lista vazia tira todos.
create or replace function public.admin_program_products_save(p_program uuid, p_items jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb; v_after jsonb; v_kept jsonb; v_item jsonb; v_product uuid; v_note text; v_ids uuid[] := '{}'; v_i int := 0;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.programs where id = p_program) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'invalid_input' using errcode = '22023'; end if;
  if jsonb_array_length(p_items) > 3 then raise exception 'too_many_products' using errcode = '22023'; end if;

  select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'note', note) order by sort_order), '[]'::jsonb)
    into v_before from public.program_products where program_id = p_program;

  -- valida tudo antes de gravar
  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_product := (v_item->>'product_id')::uuid;
    exception when others then
      raise exception 'invalid_input' using errcode = '22023';
    end;
    v_note := btrim(coalesce(v_item->>'note', ''));
    if v_product is null or char_length(v_note) > 200 then raise exception 'invalid_input' using errcode = '22023'; end if;
    if v_product = any (v_ids) then raise exception 'duplicate_product' using errcode = '22023'; end if;
    if not exists (select 1 from public.products where id = v_product) then raise exception 'invalid_product' using errcode = '22023'; end if;
    v_ids := v_ids || v_product;
  end loop;

  -- regrava a lista (a ordem única 1..3 não deixa trocar posições linha a linha); quem já estava
  -- mantém id, autor e data de criação
  select coalesce(jsonb_object_agg(product_id::text, jsonb_build_object('id', id, 'created_by', created_by, 'created_at', created_at)), '{}'::jsonb)
    into v_kept from public.program_products where program_id = p_program;
  delete from public.program_products where program_id = p_program;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_i := v_i + 1;
    v_product := (v_item->>'product_id')::uuid;
    insert into public.program_products (id, program_id, product_id, sort_order, note, created_by, created_at)
    values (coalesce((v_kept->v_product::text->>'id')::uuid, gen_random_uuid()), p_program, v_product, v_i, btrim(coalesce(v_item->>'note', '')),
            case when v_kept ? v_product::text then (v_kept->v_product::text->>'created_by')::uuid else auth.uid() end,
            coalesce((v_kept->v_product::text->>'created_at')::timestamptz, now()));
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id, 'note', note) order by sort_order), '[]'::jsonb)
    into v_after from public.program_products where program_id = p_program;
  if v_before is distinct from v_after then
    perform public.audit_log('program.products', 'program', p_program::text, jsonb_build_object('products', v_before), jsonb_build_object('products', v_after), null);
  end if;
  return v_i;
end $$;
revoke execute on function public.admin_program_products_save(uuid, jsonb) from public, anon;
grant execute on function public.admin_program_products_save(uuid, jsonb) to authenticated, service_role;

-- Escolhe (ou limpa, com nulo) o serviço de um profissional já sugerido no programa.
create or replace function public.admin_program_professional_service_set(p_program uuid, p_professional uuid, p_service uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_before uuid; v_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select id, service_id into v_id, v_before from public.professional_suggestions
    where program_id = p_program and professional_id = p_professional;
  if v_id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_service is not null and not exists (select 1 from public.professional_services where id = p_service and professional_id = p_professional) then
    raise exception 'invalid_service' using errcode = '22023';
  end if;
  if v_before is not distinct from p_service then return; end if;
  update public.professional_suggestions set service_id = p_service where id = v_id;
  perform public.audit_log('program.professional_service', 'program', p_program::text,
    jsonb_build_object('professional_id', p_professional, 'service_id', v_before),
    jsonb_build_object('professional_id', p_professional, 'service_id', p_service), null);
end $$;
revoke execute on function public.admin_program_professional_service_set(uuid, uuid, uuid) from public, anon;
grant execute on function public.admin_program_professional_service_set(uuid, uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- 5) seed: exemplos ligados
-- Base de força: elástico e tapete (o que o programa pede); Cozinha rápida: kit do molho de ervas.
-- Reaplicar não sobrescreve edição do admin: programa que o admin já mexeu (auditoria) fica como está.
insert into public.program_products (id, program_id, product_id, sort_order, note)
select public.seed_uuid('program_product:' || s.key), pg.id, pr.id, s.sort, s.note
from (values
  ('forca-elastico', 'base-de-forca-4-semanas', 'elastico-de-resistencia-3-niveis-a1', 1::smallint,
   'O elástico das progressões do programa: força em casa, sem academia.'),
  ('forca-tapete', 'base-de-forca-4-semanas', 'tapete-de-treino-6-mm-a2', 2::smallint,
   'Conforto para os exercícios no chão.'),
  ('cozinha-molho', 'cozinha-rapida-do-dia-a-dia', 'kit-molho-de-ervas-ervas-secas-azeite-250-ml-k1', 1::smallint,
   'Tudo para o molho de ervas, o coringa do programa.')
) as s (key, program, product, sort, note)
join public.programs pg on pg.slug = s.program
join public.products pr on pr.slug = s.product
where not exists (select 1 from public.program_products x where x.program_id = pg.id and (x.product_id = pr.id or x.sort_order = s.sort))
  and not exists (select 1 from public.admin_audit a where a.action = 'program.products' and a.resource_id = pg.id::text)
on conflict (id) do nothing;

-- Téo no Base de força: o plano de treino de 4 semanas (só se o admin nunca mexeu nesse serviço)
update public.professional_suggestions s set service_id = public.seed_uuid('professional_service:teo-plano')
where s.id = public.seed_uuid('professional_suggestion:teo-forca')
  and s.service_id is null
  and s.professional_id = public.seed_uuid('professional:teo-folego')
  and exists (select 1 from public.professional_services ps where ps.id = public.seed_uuid('professional_service:teo-plano'))
  and not exists (select 1 from public.admin_audit a where a.action = 'program.professional_service' and a.resource_id = s.program_id::text);
