-- =============================================================================
-- Ultra Hero · 0033 · Receitas fase 5: trocar o ingrediente suspende o produto validado
--   O vínculo ingrediente ↔ produto (recipe_ingredient_products) é validado pelo admin para um par
--   (nome do ingrediente, produto). recipe_save regrava o ingrediente pelo mesmo id (on conflict
--   do update set name = ...), então, sem isto, o herói fazia validar um par legítimo e depois trocava
--   o nome: o vínculo seguia validado e a lista de compras oferecia o produto num item que o admin
--   nunca viu. Renomear (ignorando caixa e espaços nas pontas) suspende o validado com o motivo
--   'ingredient_changed'; mudar posição, quantidade, unidade ou nota não suspende.
-- Reaplicável. Sem dados para migrar.
-- =============================================================================

create or replace function public.recipe_ingredients_links_suspend()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- security definer: quem salva é o herói, que não tem grant de update na tabela de vínculos
  if lower(btrim(old.name)) is distinct from lower(btrim(new.name)) then
    update public.recipe_ingredient_products
    set status = 'suspended', suspended_reason = 'ingredient_changed'
    where ingredient_id = new.id and status = 'validated';
  end if;
  return null;
end $$;
revoke execute on function public.recipe_ingredients_links_suspend() from public, anon;
grant execute on function public.recipe_ingredients_links_suspend() to authenticated, service_role;

create or replace trigger trg_z_recipe_ingredients_links after update of name on public.recipe_ingredients
  for each row execute function public.recipe_ingredients_links_suspend();
