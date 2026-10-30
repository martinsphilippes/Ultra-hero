-- =============================================================================
-- Ultra Hero · 0052 · Página do herói só com o que é do herói
--   Pedido do dono: ao abrir um herói, Programas e Produtos mostram só o que é dele.
--   1) Programas: etapa de programa de herói só com conteúdo do próprio herói. Limpa as etapas
--      herdadas da troca dos heróis fictícios pelos reais (0044), que ficaram com conteúdo de outro
--      herói, e um gatilho impede que voltem (inserir/trocar etapa, substituição, trocar o herói).
--   2) Produtos: remove as alocações em massa da 0021 (os 7 produtos Ultra.e Life em TODO herói).
--      Fica só o que foi alocado de propósito (por admin ou sugerido pelo herói) + os produtos
--      vinculados aos conteúdos do próprio herói (content_product_links, já filtrados no app).
--   (Treinos = só conteúdo do tipo workout é regra do app: src/lib/catalog/creator-libraries.ts.)
--
-- Por que apagar as etapas na própria versão em vez de criar uma versão nova:
--   - nada referencia program_items por id (substituições usam versão + conteúdo; progresso é por
--     conteúdo em completions; certificado guarda um snapshot); apagar não quebra chave nenhuma;
--   - inscrição fica presa à versão: uma versão nova deixaria quem já está inscrito vendo as etapas
--     de outro herói; limpando a versão, todo mundo passa a ver só as etapas do herói;
--   - para o inscrito só sai etapa (nenhuma entra): ninguém perde progresso, concluir fica igual ou
--     mais fácil; certificado já emitido não muda;
--   - versão nova também exigiria copiar traduções (program_localizations) e conceito por versão.
--   Programa arquivado não é tocado (programas dos heróis removidos na 0044 continuam como estão,
--   para a remoção seguir reversível); vale para rascunho e publicado, em todas as versões.
--   Posições são renumeradas 1..n na ordem atual. Substituições cujo item original saiu também saem.
--   Cada programa limpo ganha um registro em admin_audit (ator system) com o que saiu.
--
-- Alocações da 0021 = linhas de creator_products sem autor (created_by nulo), nunca validadas por
--   alguém (validated_by nulo), validadas, de produto Ultra.e Life e SEM nenhum registro em
--   admin_audit para a linha (toda alocação do admin passa por admin_set_creator_product, que audita).
--   Suspensas da 0044 (heróis removidos) ficam. Um registro de auditoria por herói com o que saiu.
--
-- Gatilhos security definer com search_path fixo e sem execute para anon/authenticated (a lista do
--   S14 continua com 17 funções para o visitante). Idempotente: reaplicar não apaga nem audita nada.
-- =============================================================================

-- ---------------------------------------------------------------- 1) etapas de outro herói
do $$
declare
  r record;
  v_removed jsonb;
  v_subs jsonb;
begin
  for r in
    select p.id as program_id, p.slug, p.creator_id
    from public.programs p
    where p.creator_id is not null
      and p.status <> 'archived'
      and exists (
        select 1 from public.program_versions v
        join public.program_items pi on pi.version_id = v.id
        join public.content c on c.id = pi.content_id
        where v.program_id = p.id and c.creator_id is distinct from p.creator_id)
    order by p.slug
  loop
    -- substituições do item que vai sair (versão + conteúdo original)
    with gone as (
      delete from public.program_item_substitutions s
      using public.program_versions v, public.program_items pi, public.content c
      where v.program_id = r.program_id and s.version_id = v.id
        and pi.version_id = v.id and pi.content_id = s.original_content_id
        and c.id = pi.content_id and c.creator_id is distinct from r.creator_id
      returning s.version_id, s.original_content_id, s.replacement_content_id, s.reason
    )
    select coalesce(jsonb_agg(to_jsonb(gone)), '[]'::jsonb) into v_subs from gone;

    with gone as (
      delete from public.program_items pi
      using public.program_versions v, public.content c
      where v.program_id = r.program_id and pi.version_id = v.id
        and c.id = pi.content_id and c.creator_id is distinct from r.creator_id
      returning pi.version_id, pi.content_id, pi.position, pi.section, pi.is_required, c.slug as content_slug, c.creator_id as content_creator_id
    )
    select jsonb_agg(to_jsonb(gone) order by gone.version_id, gone.position) into v_removed from gone;

    -- posições contíguas 1..n na ordem que já estava
    update public.program_items pi set position = o.n
    from (
      select pi2.id, row_number() over (partition by pi2.version_id order by pi2.position, pi2.id) as n
      from public.program_items pi2 join public.program_versions v on v.id = pi2.version_id
      where v.program_id = r.program_id
    ) o
    where pi.id = o.id and pi.position is distinct from o.n;

    perform public.audit_log('program.items_hero_scope_cleanup', 'program', r.program_id::text,
      jsonb_build_object('slug', r.slug, 'removed_items', v_removed, 'removed_substitutions', v_subs),
      jsonb_build_object('remaining_by_version', (
        select coalesce(jsonb_object_agg(v.id, (select count(*) from public.program_items pi where pi.version_id = v.id)), '{}'::jsonb)
        from public.program_versions v where v.program_id = r.program_id)),
      '0052: programa do herói só com conteúdos do próprio herói (etapas herdadas da troca de heróis da 0044)',
      'system');
  end loop;
end $$;

-- ---------------------------------------------------------------- 2) regra: etapa é do herói do programa
-- Programa sem herói (editorial) aceita qualquer conteúdo. Vale para etapa (program_items.content_id)
-- e para o substituto (program_item_substitutions.replacement_content_id).
create or replace function public.program_items_owner_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_program_creator uuid; v_content uuid; v_content_creator uuid;
begin
  if tg_table_name = 'program_items' then
    v_content := new.content_id;
  else
    v_content := new.replacement_content_id;
  end if;
  select p.creator_id into v_program_creator
  from public.program_versions v join public.programs p on p.id = v.program_id
  where v.id = new.version_id;
  if v_program_creator is null then return new; end if;
  select c.creator_id into v_content_creator from public.content c where c.id = v_content;
  if v_content_creator is distinct from v_program_creator then
    raise exception 'program_item_foreign_content' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.program_items_owner_guard() from public, anon, authenticated;

drop trigger if exists trg_program_items_owner on public.program_items;
create trigger trg_program_items_owner before insert or update of version_id, content_id on public.program_items
  for each row execute function public.program_items_owner_guard();
drop trigger if exists trg_program_item_substitutions_owner on public.program_item_substitutions;
create trigger trg_program_item_substitutions_owner before insert or update of version_id, replacement_content_id on public.program_item_substitutions
  for each row execute function public.program_items_owner_guard();

-- Trocar o herói do programa: só se todas as etapas (de qualquer versão) forem do novo herói.
create or replace function public.programs_creator_change_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.creator_id is not null and new.creator_id is distinct from old.creator_id and exists (
    select 1 from public.program_versions v
    join public.program_items pi on pi.version_id = v.id
    join public.content c on c.id = pi.content_id
    where v.program_id = new.id and c.creator_id is distinct from new.creator_id) then
    raise exception 'program_creator_has_foreign_items' using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.programs_creator_change_guard() from public, anon, authenticated;

drop trigger if exists trg_programs_creator_change on public.programs;
create trigger trg_programs_creator_change before update of creator_id on public.programs
  for each row execute function public.programs_creator_change_guard();

-- ---------------------------------------------------------------- 3) produtos: sai a alocação em massa da 0021
do $$
declare r record;
begin
  for r in
    with seed as (
      select cp.id, cp.creator_id, cp.product_id, p.slug as product_slug
      from public.creator_products cp
      join public.products p on p.id = cp.product_id
      where cp.status = 'validated'
        and cp.created_by is null
        and cp.validated_by is null
        and p.seller_org_id = public.seed_uuid('seller:ultrae')
        and not exists (select 1 from public.admin_audit a where a.resource_type = 'creator_product' and a.resource_id = cp.id::text)
    ), gone as (
      delete from public.creator_products cp using seed where cp.id = seed.id
      returning seed.creator_id, seed.product_id, seed.product_slug
    )
    select g.creator_id, h.slug as creator_slug, jsonb_agg(jsonb_build_object('product_id', g.product_id, 'slug', g.product_slug) order by g.product_slug) as removed
    from gone g left join public.creator_profiles h on h.id = g.creator_id
    group by g.creator_id, h.slug
  loop
    perform public.audit_log('creator_product.seed_cleanup', 'creator', r.creator_id::text,
      jsonb_build_object('slug', r.creator_slug, 'removed', r.removed), null,
      '0052: Produtos do herói só com o que ele indica (sai a alocação em massa da 0021)', 'system');
  end loop;
end $$;
