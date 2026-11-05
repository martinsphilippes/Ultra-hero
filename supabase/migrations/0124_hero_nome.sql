-- 0124 · "Herói" vira "Hero" nos textos que o banco gera (avisos, mensagens de erro, termos, feedbacks).
-- Pedido do responsável (05/11/2026): em todo o app a palavra é "Hero" (plural "Heros"). Só muda texto: cada função
-- pública cujo corpo tem "herói" é recriada pela própria definição atual (pg_get_functiondef), com a troca feita
-- antes. CREATE OR REPLACE mantém dono, permissões, SECURITY DEFINER e search_path. Nenhuma comparação de dados
-- usa essas palavras (conferido antes); linhas já gravadas (avisos antigos) ficam como estão.
do $$
declare
  r record;
  d text;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p') and p.prosrc ~ 'her[óÓ]i|HERÓI'
  loop
    d := pg_get_functiondef(r.oid);
    d := replace(d, 'HERÓIS', 'HEROS');
    d := replace(d, 'Heróis', 'Heros');
    d := replace(d, 'heróis', 'Heros');
    d := replace(d, 'HERÓI', 'HERO');
    d := replace(d, 'Herói', 'Hero');
    d := replace(d, 'herói', 'Hero');
    execute d;
  end loop;
end
$$;
