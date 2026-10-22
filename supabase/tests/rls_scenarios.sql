-- =============================================================================
-- Ultra Hero · Cenários de RLS e regras de negócio (banco local isolado)
-- Cada bloco imprime PASS/… ou aborta com erro. Executado por scripts/db/test-rls.sh.
-- Papéis simulados via SET ROLE + request.jwt.claims (mesmo mecanismo do PostgREST).
-- =============================================================================
\set ON_ERROR_STOP on
begin;

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

create or replace function tests.login(p_uid uuid, p_email text) returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'email', p_email, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function tests.anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end $$;
create or replace function tests.su() returns void language plpgsql as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
create or replace function tests.ok(p_name text, p_cond boolean) returns void language plpgsql as $$
begin
  if coalesce(p_cond, false) then raise notice 'PASS %', p_name;
  else raise exception 'FAIL %', p_name; end if;
end $$;
-- Executa SQL dinâmico esperando erro cuja mensagem comece com p_code (ou SQLSTATE igual).
create or replace function tests.expect_error(p_name text, p_sql text, p_code text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_code in sqlerrm) = 1 or sqlstate = p_code or sqlerrm like '%' || p_code || '%' then
      raise notice 'PASS % (erro esperado: %)', p_name, p_code; return;
    else
      raise exception 'FAIL % — erro diferente do esperado: % (% )', p_name, sqlerrm, sqlstate;
    end if;
  end;
  raise exception 'FAIL % — esperava erro %, mas executou sem erro', p_name, p_code;
end $$;
grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------- usuários de teste
select tests.su();
insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'admin@test.local'),
  ('10000000-0000-4000-8000-000000000002', 'consumer1@test.local'),
  ('10000000-0000-4000-8000-000000000003', 'consumer2@test.local'),
  ('10000000-0000-4000-8000-000000000004', 'creator1@test.local'),
  ('10000000-0000-4000-8000-000000000005', 'sellera@test.local'),
  ('10000000-0000-4000-8000-000000000006', 'sellerb@test.local');
insert into public.role_assignments (user_id, role, scope_type) values ('10000000-0000-4000-8000-000000000001', 'admin', 'global');
insert into public.seller_memberships (org_id, user_id) values
  (public.seed_uuid('seller:vertice'), '10000000-0000-4000-8000-000000000005'),
  (public.seed_uuid('seller:horta'), '10000000-0000-4000-8000-000000000006');
insert into public.role_assignments (user_id, role, scope_type, scope_id) values
  ('10000000-0000-4000-8000-000000000005', 'seller', 'seller_org', public.seed_uuid('seller:vertice')),
  ('10000000-0000-4000-8000-000000000006', 'seller', 'seller_org', public.seed_uuid('seller:horta'));

select tests.ok('trigger criou perfis e papel consumer', (select count(*) from public.profiles) = 6
  and (select count(*) from public.role_assignments where role = 'consumer') = 6);

-- ================================================================ S0 · Integridade do seed
-- Todo id uuid do seed segue o RFC 4122 (versão 1-5, variante 10xx): os validadores do app usam z.uuid().
do $s0$
declare r record; v_bad bigint; v_total bigint := 0;
begin
  for r in select c.table_name from information_schema.columns c join information_schema.tables t using (table_schema, table_name)
           where c.table_schema = 'public' and c.column_name = 'id' and c.data_type = 'uuid' and t.table_type = 'BASE TABLE' loop
    execute format('select count(*) from public.%I where id::text !~ ''^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$''', r.table_name) into v_bad;
    if v_bad > 0 then raise exception 'FAIL S0 % ids fora do RFC 4122 em public.%', v_bad, r.table_name; end if;
    execute format('select count(*) from public.%I', r.table_name) into v_total;
  end loop;
  raise notice 'PASS S0 ids uuid do seed seguem o RFC 4122 em todas as tabelas públicas';
end $s0$;
select tests.ok('S0 seed_uuid é determinístico e RFC 4122', public.seed_uuid('content:r1') = public.seed_uuid('content:r1')
  and public.seed_uuid('content:r1')::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.seed_uuid('content:r1') <> public.seed_uuid('content:r2'));

-- ================================================================ S1 · Visitante
select tests.anon();
select tests.ok('S1 visitante vê catálogo publicado (40)', (select count(*) from public.content where status = 'published') = 40);
select tests.ok('S1 visitante não lê corpo de conteúdo', (select count(*) from public.content_bodies) = 0);
select tests.ok('S1 visitante vê personalidades ativas (8)', (select count(*) from public.creator_profiles) = 8);
select tests.ok('S1 visitante vê produtos regulares (31 = 24 do seed + 7 Ultra.e Life; 1 indisponível ainda aparece; nenhum oculto)', (select count(*) from public.products) = 31);
select tests.ok('S1 visitante não vê pedidos', (select count(*) from public.test_orders) = 0);
select tests.expect_error('S1 visitante não faz checkout', $q$select public.checkout_cart(public.seed_uuid('dest:centro'))$q$, 'permission denied');
select tests.expect_error('S1 visitante não conclui conteúdo', $q$select public.complete_content(public.seed_uuid('content:r1'), 'America/Sao_Paulo')$q$, 'permission denied');
select tests.ok('S1 public_settings disponível e sem chaves sensíveis', (public.public_settings() ? 'commerce.enabled') and not (public.public_settings() ? 'bootstrap_admin_emails'));
select tests.expect_error('S1 setting() sensível não é executável pelo público', $q$select public.setting('bootstrap_admin_emails')$q$, 'permission denied');

-- ================================================================ S2 · Consumidor gratuito
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
select tests.ok('S2 corpo de conteúdo gratuito visível', (select count(*) from public.content_bodies where content_id = public.seed_uuid('content:r1')) = 1);
select tests.ok('S2 corpo de conteúdo premium (Treino FULL) bloqueado', (select count(*) from public.content_bodies where content_id = public.seed_uuid('content:t7')) = 0);
select tests.ok('S2 card premium continua visível no catálogo', (select count(*) from public.content where id = public.seed_uuid('content:t7')) = 1);
select tests.ok('S2 conclui conteúdo gratuito', (public.complete_content(public.seed_uuid('content:r1'), 'America/Sao_Paulo') ->> 'new')::boolean);
select tests.expect_error('S2 não conclui conteúdo premium sem direito', $q$select public.complete_content(public.seed_uuid('content:t7'), 'America/Sao_Paulo')$q$, 'content_forbidden');
select tests.ok('S2 streak de hoje = 1', public.compute_streak('10000000-0000-4000-8000-000000000002', 'America/Sao_Paulo') = 1);
select tests.ok('S2 conquista "primeiro passo" concedida', exists (select 1 from public.user_achievements ua join public.achievements a on a.id = ua.achievement_id where ua.user_id = '10000000-0000-4000-8000-000000000002' and a.code = 'first_step'));
select tests.expect_error('S2 fuso inválido rejeitado', $q$select public.complete_content(public.seed_uuid('content:r2'), 'Marte/Olympus')$q$, 'invalid_timezone');
select public.cart_set_item(public.seed_uuid('product:m2'), 1); -- usuário gratuito pode adicionar produto ao carrinho de teste
select tests.ok('S2 carrinho tem 1 item', (select count(*) from public.cart_items ci join public.carts c on c.id = ci.cart_id where c.user_id = '10000000-0000-4000-8000-000000000002') = 1);
select tests.expect_error('S2 produto indisponível não entra no carrinho', $q$select public.cart_set_item(public.seed_uuid('product:a6'), 1)$q$, 'product_not_purchasable');

-- ================================================================ S3 · Direitos de acesso / assinatura simulada
select tests.ok('S3 assina Treino FULL (sem exigir Base)', (public.select_modules(array[public.seed_uuid('module:training_full')]) ->> 'status') = 'active');
select tests.ok('S3 corpo premium agora visível', (select count(*) from public.content_bodies where content_id = public.seed_uuid('content:t7')) = 1);
select tests.ok('S3 cancelamento mantém acesso até o fim do período', (public.cancel_subscription() ->> 'status') = 'cancelled'
  and (select count(*) from public.content_bodies where content_id = public.seed_uuid('content:t7')) = 1);
select tests.su();
update public.simulated_subscriptions set current_period_end = now() - interval '1 day' where user_id = '10000000-0000-4000-8000-000000000002';
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
select tests.ok('S3 após o fim do período volta ao gratuito', (public.my_subscription() ->> 'status') = 'free');
select tests.ok('S3 corpo premium bloqueado novamente', (select count(*) from public.content_bodies where content_id = public.seed_uuid('content:t7')) = 0);
-- downgrade agendado: adiciona dois módulos, remove um → só sai no fim do período
select tests.ok('S3 upgrade imediato com 2 módulos', jsonb_array_length(public.select_modules(array[public.seed_uuid('module:base'), public.seed_uuid('module:chef_full')]) -> 'modules') = 2);
-- desde a 0027 a etapa demonstrativa vale no banco: g8 é receita, então consumer1 conclui a etapa
-- antes (a linha sai logo depois, porque o S22 confere que consumer1 não tem etapa)
insert into public.recipe_onboarding (user_id, notice_accepted_at) values ('10000000-0000-4000-8000-000000000002', now());
select tests.ok('S3 downgrade fica agendado (módulo segue ativo até o fim)', (select count(*) from jsonb_array_elements(public.select_modules(array[public.seed_uuid('module:base')]) -> 'modules') m where m ->> 'status' = 'scheduled_removal') = 1
  and (select count(*) from public.content_bodies where content_id = public.seed_uuid('content:g8')) = 1);
delete from public.recipe_onboarding where user_id = '10000000-0000-4000-8000-000000000002';
select tests.ok('S3 sem a etapa, o mesmo módulo não abre o corpo da receita g8', (select count(*) from public.content_bodies where content_id = public.seed_uuid('content:g8')) = 0);
-- dependência configurável
select tests.su();
insert into public.module_dependencies (module_id, requires_module_id) values (public.seed_uuid('module:nutrition_full'), public.seed_uuid('module:base'));
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
select tests.expect_error('S3 dependência configurada é exigida', $q$select public.select_modules(array[public.seed_uuid('module:nutrition_full')])$q$, 'module_dependency_missing');
select tests.ok('S3 dependência satisfeita aceita', (public.select_modules(array[public.seed_uuid('module:base'), public.seed_uuid('module:nutrition_full')]) ->> 'status') = 'active');
select tests.su(); delete from public.module_dependencies;
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
select tests.expect_error('S3 usuário não insere direito direto na tabela', $q$insert into public.subscription_modules (subscription_id, module_id) select id, public.seed_uuid('module:training_full') from public.simulated_subscriptions where user_id = '10000000-0000-4000-8000-000000000002'$q$, '42501');

-- ================================================================ S4 · Convites
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
create temporary table t_inv as select * from public.admin_create_invitation('creator1@test.local', 'creator', null, public.seed_uuid('creator:lia'), 7);
create temporary table t_inv2 as select * from public.admin_create_invitation('consumer2@test.local', 'seller', public.seed_uuid('seller:forja'), null, 7);
select tests.ok('S4 convites criados com token', (select count(*) from t_inv) = 1 and length((select token from t_inv)) = 64);
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
select tests.expect_error('S4 token inválido não concede papel', $q$select public.accept_invitation('deadbeef')$q$, 'invitation_invalid');
select tests.expect_error('S4 e-mail diferente não aceita convite', format($q$select public.accept_invitation(%L)$q$, (select token from t_inv2)), 'invitation_email_mismatch');
create temporary table t_acc as select public.accept_invitation((select token from t_inv)) as r;
select tests.ok('S4 criadora aceita convite e fica vinculada', ((select r from t_acc) ->> 'role') = 'creator' and public.my_creator_id() = public.seed_uuid('creator:lia'));
select tests.expect_error('S4 convite é de uso único', format($q$select public.accept_invitation(%L)$q$, (select token from t_inv)), 'invitation_invalid');
select tests.su(); update public.invitations set expires_at = now() - interval '1 hour' where id = (select invitation_id from t_inv2);
select tests.login('10000000-0000-4000-8000-000000000003', 'consumer2@test.local');
select tests.expect_error('S4 convite expirado não concede papel', format($q$select public.accept_invitation(%L)$q$, (select token from t_inv2)), 'invitation_expired');
select tests.ok('S4 consumidor não virou fornecedor', not public.has_role('seller'));
select tests.expect_error('S4 não-admin não cria convite', $q$select * from public.admin_create_invitation('x@test.local', 'seller', public.seed_uuid('seller:forja'), null, 7)$q$, '42501');
select tests.expect_error('S4 não-admin não lê convites', $q$select case when (select count(*) from public.invitations) = 0 then 1/0 else 1 end$q$, 'division by zero');

-- ================================================================ S5 · Personalidade: conteúdo e aprovação
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
insert into public.content (id, slug, creator_id, pillar, type, title, summary) values
  ('20000000-0000-4000-8000-000000000001', 'teste-rascunho-lia', public.seed_uuid('creator:lia'), 'routine', 'guide', 'Rascunho de teste', 'Resumo de teste');
select tests.ok('S5 criadora cria rascunho próprio', (select count(*) from public.content where id = '20000000-0000-4000-8000-000000000001') = 1);
select tests.expect_error('S5 criadora não cria conteúdo em nome de outra', $q$insert into public.content (slug, creator_id, pillar, type, title) values ('x-outra', public.seed_uuid('creator:rafael'), 'routine', 'guide', 'X')$q$, '42501');
update public.content set title = 'Rascunho de teste 2' where id = '20000000-0000-4000-8000-000000000001';
select tests.ok('S5 criadora edita rascunho próprio', (select title from public.content where id = '20000000-0000-4000-8000-000000000001') = 'Rascunho de teste 2');
select tests.expect_error('S5 criadora não publica diretamente', $q$update public.content set status = 'published' where id = '20000000-0000-4000-8000-000000000001'$q$, 'protected_column');
select tests.expect_error('S5 criadora não define regra de acesso', $q$update public.content set access_level = 'free' where id = '20000000-0000-4000-8000-000000000001'$q$, 'protected_column');
insert into public.content_bodies (content_id, body) values ('20000000-0000-4000-8000-000000000001', '{"kind":"article","sections":[{"heading":"a","text":"b"}]}');
select tests.ok('S5 criadora lê o corpo do próprio rascunho', (select count(*) from public.content_bodies where content_id = '20000000-0000-4000-8000-000000000001') = 1);
select public.submit_content_for_review('20000000-0000-4000-8000-000000000001');
select tests.ok('S5 submissão marca em revisão', (select review_status from public.content where id = '20000000-0000-4000-8000-000000000001') = 'in_review');
select tests.expect_error('S5 em revisão não é editável', $q$update public.content set title = 'x' where id = '20000000-0000-4000-8000-000000000001'$q$, 'content_not_editable');
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
select tests.ok('S5 consumidor não vê rascunho alheio', (select count(*) from public.content where id = '20000000-0000-4000-8000-000000000001') = 0);
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select tests.expect_error('S5 aprovação bloqueada sem regra de acesso', $q$select public.admin_review_content('20000000-0000-4000-8000-000000000001', 'approved', null)$q$, 'cannot_publish_missing');
update public.content set access_level = 'free' where id = '20000000-0000-4000-8000-000000000001';
select public.admin_review_content('20000000-0000-4000-8000-000000000001', 'returned', 'Ajuste o título');
select tests.ok('S5 devolvido para ajustes', (select review_status from public.content where id = '20000000-0000-4000-8000-000000000001') = 'returned');
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
update public.content set title = 'Título ajustado' where id = '20000000-0000-4000-8000-000000000001';
select public.submit_content_for_review('20000000-0000-4000-8000-000000000001');
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_review_content('20000000-0000-4000-8000-000000000001', 'approved', 'ok');
select tests.ok('S5 aprovado e publicado com histórico de 2 rodadas', (select status from public.content where id = '20000000-0000-4000-8000-000000000001') = 'published'
  and (select count(*) from public.content_reviews where content_id = '20000000-0000-4000-8000-000000000001') = 2
  and (select count(*) from public.admin_audit where action = 'content.review') >= 2);
-- sugestão de vínculo pela personalidade e validação pelo admin
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
insert into public.content_product_links (id, content_id, product_id, status, suggested_by_creator, note) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', public.seed_uuid('product:l1'), 'suggested', public.seed_uuid('creator:lia'), 'Caderno');
select tests.expect_error('S5 personalidade não valida o próprio vínculo', $q$select public.admin_set_link_status('30000000-0000-4000-8000-000000000001', 'validated', null)$q$, '42501');
select tests.expect_error('S5 personalidade não insere vínculo já validado', $q$insert into public.content_product_links (content_id, product_id, status, suggested_by_creator) values ('20000000-0000-4000-8000-000000000001', public.seed_uuid('product:l2'), 'validated', public.seed_uuid('creator:lia'))$q$, '42501');
select tests.anon();
select tests.ok('S5 vínculo sugerido não aparece ao público', (select count(*) from public.content_product_links where id = '30000000-0000-4000-8000-000000000001') = 0);
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_set_link_status('30000000-0000-4000-8000-000000000001', 'validated', 'ok');
select tests.anon();
select tests.ok('S5 vínculo validado aparece ao público', (select count(*) from public.content_product_links where id = '30000000-0000-4000-8000-000000000001') = 1);

-- ================================================================ S6 · Fornecedores: isolamento e moderação
select tests.login('10000000-0000-4000-8000-000000000005', 'sellera@test.local');
select tests.ok('S6 fornecedor A é membro da Vértice', public.is_seller_of(public.seed_uuid('seller:vertice')));
insert into public.products (id, seller_org_id, category_id, slug, title, description, image_url, price_cents_demo, product_type, status)
  values ('40000000-0000-4000-8000-000000000001', public.seed_uuid('seller:vertice'), public.seed_uuid('cat:accessory'), 'produto-teste-a', 'Produto teste A', 'Descrição demonstrativa', '/placeholders/product-1.svg', 1000, 'physical', 'published');
select tests.ok('S6 fornecedor publica produto direto, sem aprovação prévia', (select status from public.products where id = '40000000-0000-4000-8000-000000000001') = 'published');
select tests.expect_error('S6 alimento sem ficha (ingredientes/alergênicos/conservação) não publica', $q$insert into public.products (seller_org_id, category_id, slug, title, description, image_url, price_cents_demo, product_type, status) values (public.seed_uuid('seller:vertice'), public.seed_uuid('cat:meal'), 'refeicao-sem-ficha', 'Refeição sem ficha', 'Descrição demonstrativa', '/placeholders/product-1.svg', 1000, 'physical', 'published')$q$, 'food_product_requires_food_info');
select tests.expect_error('S6 fornecedor A não cria produto para B', $q$insert into public.products (seller_org_id, category_id, slug, title, description, image_url, price_cents_demo, product_type) values (public.seed_uuid('seller:horta'), public.seed_uuid('cat:accessory'), 'x-b', 'Produto B falso', 'Descrição demonstrativa', '/placeholders/product-1.svg', 1000, 'physical')$q$, '42501');
update public.products set price_cents_demo = 1 where id = public.seed_uuid('product:k1');
select tests.ok('S6 fornecedor A não altera produto de B (0 linhas)', (select price_cents_demo from public.products where id = public.seed_uuid('product:k1')) = 3490);
select tests.ok('S6 fornecedor A não vê histórico de versões de B', (select count(*) from public.product_versions pv join public.products p on p.id = pv.product_id where p.seller_org_id = public.seed_uuid('seller:horta')) = 0);
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_moderate_product(public.seed_uuid('product:m1'), 'suspend', 'Alegação de saúde não comprovada');
select tests.login('10000000-0000-4000-8000-000000000005', 'sellera@test.local');
select tests.expect_error('S6 fornecedor não altera campos de moderação', $q$update public.products set moderation_status = 'clear' where id = public.seed_uuid('product:m1')$q$, 'protected_column');
update public.products set status = 'published', description = 'Descrição republicada pelo fornecedor' where id = public.seed_uuid('product:m1');
select tests.ok('S6 republicar/editar não reativa produto suspenso pelo admin', (select moderation_status from public.products where id = public.seed_uuid('product:m1')) = 'suspended');
select tests.ok('S6 produto suspenso não é comprável', not public.product_is_purchasable(public.seed_uuid('product:m1')));
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
select tests.expect_error('S6 consumidor não adiciona produto suspenso', $q$select public.cart_set_item(public.seed_uuid('product:m1'), 1)$q$, 'product_not_purchasable');
select tests.ok('S6 produto suspenso some do catálogo público', (select count(*) from public.products where id = public.seed_uuid('product:m1')) = 0);

-- ================================================================ S7 · Mudança significativa suspende vínculo
select tests.login('10000000-0000-4000-8000-000000000005', 'sellera@test.local');
select tests.ok('S7 vínculo g2→m3 começa validado', (select status from public.content_product_links where id = public.seed_uuid('link:g2:m3')) = 'validated');
update public.products set price_cents_demo = 2090 where id = public.seed_uuid('product:m3');
select tests.ok('S7 mudança de preço não invalida vínculo, mas é auditada', (select status from public.content_product_links where id = public.seed_uuid('link:g2:m3')) = 'validated'
  and exists (select 1 from public.product_versions where product_id = public.seed_uuid('product:m3') and 'price_cents_demo' = any (changed_fields)));
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select tests.ok('S7 auditoria registrou a alteração de preço', exists (select 1 from public.admin_audit where action = 'product.update' and resource_id = public.seed_uuid('product:m3')::text));
select tests.login('10000000-0000-4000-8000-000000000005', 'sellera@test.local');
update public.products set title = 'Omelete de forno com espinafre e cogumelos (2 porções)' where id = public.seed_uuid('product:m3');
select tests.ok('S7 mudança significativa suspende vínculo e conteúdo segue publicado', (select status from public.content_product_links where id = public.seed_uuid('link:g2:m3')) = 'suspended'
  and (select status from public.content where id = public.seed_uuid('content:g2')) = 'published'
  and (select version from public.products where id = public.seed_uuid('product:m3')) = 3);
select tests.anon();
select tests.ok('S7 vínculo suspenso não aparece ao público', (select count(*) from public.content_product_links where id = public.seed_uuid('link:g2:m3')) = 0);
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_set_link_status(public.seed_uuid('link:g2:m3'), 'validated', 'Revalidado após revisão');
select tests.ok('S7 admin revalida registrando a versão do produto', (select product_version_at_validation from public.content_product_links where id = public.seed_uuid('link:g2:m3')) = 3);

-- ================================================================ S8 · Checkout multi-fornecedor, snapshots e remessas
select tests.login('10000000-0000-4000-8000-000000000003', 'consumer2@test.local');
select public.cart_set_item(public.seed_uuid('product:m2'), 2);   -- Vértice
select public.cart_set_item(public.seed_uuid('product:k1'), 1);   -- Horta
select public.cart_set_item(public.seed_uuid('product:m6'), 1);   -- operação própria
select tests.expect_error('S8 preço divergente exige confirmação', format($q$select public.checkout_cart(%L, '[{"product_id":"%s","price_cents":100}]'::jsonb, false)$q$, public.seed_uuid('dest:centro'), public.seed_uuid('product:m2')), 'cart_changed');
create temporary table t_order as select public.checkout_cart(public.seed_uuid('dest:centro'), '[]'::jsonb, false) as id;
select tests.ok('S8 pedido único criado', (select count(*) from public.test_orders where id = (select id from t_order)) = 1);
select tests.ok('S8 três remessas independentes (uma por operação)', (select count(*) from public.test_fulfillments where order_id = (select id from t_order)) = 3);
select tests.ok('S8 itens com snapshot de preço e versão', (select count(*) from public.test_order_items where order_id = (select id from t_order) and price_cents_snapshot > 0 and product_version_snapshot is not null) = 3);
select tests.ok('S8 total = subtotal + frete fictício', (select total_cents = subtotal_cents + shipping_cents and shipping_cents = 990 + 490 * 2 from public.test_orders where id = (select id from t_order)));
select tests.ok('S8 carrinho esvaziado', (select count(*) from public.cart_items ci join public.carts c on c.id = ci.cart_id where c.user_id = '10000000-0000-4000-8000-000000000003') = 0);
select tests.ok('S8 estoque demonstrativo decrementado', (select demo_stock from public.products where id = public.seed_uuid('product:m2')) = 38);
select tests.ok('S8 destino é fictício e marcado', (select (destination_snapshot ->> 'fictional')::boolean from public.test_orders where id = (select id from t_order)));
select tests.su(); update public.products set price_cents_demo = 9999 where id = public.seed_uuid('product:m2');
select tests.login('10000000-0000-4000-8000-000000000003', 'consumer2@test.local');
select tests.ok('S8 edição posterior do catálogo não altera snapshot do pedido', (select price_cents_snapshot from public.test_order_items where order_id = (select id from t_order) and product_id = public.seed_uuid('product:m2')) = 2990);
-- visão do fornecedor A (Vértice)
select tests.su();
create temporary table t_f_horta as select id from public.test_fulfillments where order_id = (select id from t_order) and seller_org_id = public.seed_uuid('seller:horta');
grant select on t_f_horta to authenticated;
select tests.login('10000000-0000-4000-8000-000000000005', 'sellera@test.local');
select tests.ok('S8 fornecedor A vê só a sua remessa', (select count(*) from public.test_fulfillments where order_id = (select id from t_order)) = 1
  and (select count(*) from public.test_order_items where order_id = (select id from t_order)) = 1);
select tests.ok('S8 fornecedor não lê o pedido completo', (select count(*) from public.test_orders) = 0);
select public.fulfillment_transition((select id from public.test_fulfillments where order_id = (select id from t_order) and seller_org_id = public.seed_uuid('seller:vertice')), 'preparing', null);
select public.fulfillment_transition((select id from public.test_fulfillments where order_id = (select id from t_order) and seller_org_id = public.seed_uuid('seller:vertice')), 'ready_for_dispatch', null);
select tests.expect_error('S8 fornecedor não marca entrega', format($q$select public.fulfillment_transition(%L, 'delivered', null)$q$, (select id from public.test_fulfillments where order_id = (select id from t_order) and seller_org_id = public.seed_uuid('seller:vertice'))), 'invalid_transition');
select tests.expect_error('S8 fornecedor A não opera remessa de B (mesmo conhecendo o id)', format($q$select public.fulfillment_transition(%L, 'preparing', null)$q$, (select id from t_f_horta)), '42501');
select tests.ok('S8 fornecedor A não enxerga a remessa de B nem por id', (select count(*) from public.test_fulfillments where seller_org_id = public.seed_uuid('seller:horta')) = 0);
select tests.login('10000000-0000-4000-8000-000000000006', 'sellerb@test.local');
select tests.ok('S8 fornecedor B vê apenas a sua remessa', (select count(*) from public.test_order_items where order_id = (select id from t_order)) = 1
  and (select seller_org_id from public.test_order_items where order_id = (select id from t_order)) = public.seed_uuid('seller:horta'));
-- transporte simulado pelo sistema
select tests.su();
alter table public.test_fulfillments disable trigger trg_test_fulfillments_updated; -- só no teste: simula passagem do tempo
update public.test_fulfillments set updated_at = now() - interval '1 hour' where order_id = (select id from t_order);
create temporary table t_adv1 as select public.advance_simulated_transport(10) as n;
select tests.ok('S8 sistema avança expedido → em trânsito', (select n from t_adv1) = 1
  and (select status from public.test_fulfillments where order_id = (select id from t_order) and seller_org_id = public.seed_uuid('seller:vertice')) = 'in_transit');
update public.test_fulfillments set updated_at = now() - interval '1 hour' where order_id = (select id from t_order);
create temporary table t_adv2 as select public.advance_simulated_transport(10) as n;
alter table public.test_fulfillments enable trigger trg_test_fulfillments_updated;
select tests.ok('S8 sistema conclui entrega e pedido fica em andamento', (select n from t_adv2) = 1
  and (select status from public.test_fulfillments where order_id = (select id from t_order) and seller_org_id = public.seed_uuid('seller:vertice')) = 'delivered'
  and (select status from public.test_orders where id = (select id from t_order)) = 'in_progress');
select tests.login('10000000-0000-4000-8000-000000000003', 'consumer2@test.local');
select tests.expect_error('S8 consumidor não cancela pedido já expedido', format($q$select public.cancel_test_order(%L)$q$, (select id from t_order)), 'order_already_dispatched');
select tests.ok('S8 consumidor vê a linha do tempo de eventos das remessas', (select count(*) from public.fulfillment_events fe join public.test_fulfillments f on f.id = fe.fulfillment_id where f.order_id = (select id from t_order)) >= 5);
select tests.ok('S8 cliente final nunca recebe kill switch desligado: commerce.enabled=true', (public.public_settings() -> 'commerce.enabled')::text = 'true');
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_set_setting('commerce.enabled', 'false'::jsonb, 'Teste de incidente');
select tests.login('10000000-0000-4000-8000-000000000003', 'consumer2@test.local');
select public.cart_set_item(public.seed_uuid('product:k2'), 1);
select tests.expect_error('S8 kill switch do comércio bloqueia checkout', format($q$select public.checkout_cart(%L)$q$, public.seed_uuid('dest:centro')), 'commerce_disabled');
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_set_setting('commerce.enabled', 'true'::jsonb, 'Fim do teste');

-- ================================================================ S9 · Programas versionados, substituição e certificado
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
create temporary table t_enr as select public.enroll_program(public.seed_uuid('program:p1'), 'America/Sao_Paulo') as id;
select tests.ok('S9 inscrição vinculada à versão 1', (select version_id from public.enrollments where id = (select id from t_enr)) = public.seed_uuid('pv:p1:1'));
select public.complete_content(public.seed_uuid('content:r4'), 'America/Sao_Paulo');
select public.complete_content(public.seed_uuid('content:r2'), 'America/Sao_Paulo');
create temporary table t_done as select public.complete_content(public.seed_uuid('content:r9'), 'America/Sao_Paulo') as r;
select tests.ok('S9 concluir os obrigatórios conclui o programa e emite certificado', jsonb_array_length((select r from t_done) -> 'programs_completed') = 1
  and (select status from public.enrollments where id = (select id from t_enr)) = 'completed'
  and (select count(*) from public.certificates where enrollment_id = (select id from t_enr)) = 1);
select tests.ok('S9 certificado verificável publicamente e simbólico', (public.verify_certificate((select code from public.certificates where enrollment_id = (select id from t_enr))) ->> 'valid')::boolean
  and ((select snapshot ->> 'version' from public.certificates where enrollment_id = (select id from t_enr)) = '1'));
select tests.ok('S9 conquista "programa concluído"', exists (select 1 from public.user_achievements ua join public.achievements a on a.id = ua.achievement_id where ua.user_id = '10000000-0000-4000-8000-000000000002' and a.code = 'program_done'));
-- nova versão não reescreve histórico
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
create temporary table t_v2 as select public.admin_create_program_version(public.seed_uuid('program:p1'), public.seed_uuid('pv:p1:1')) as id;
select public.admin_publish_program_version((select id from t_v2));
select tests.ok('S9 versão 2 publicada e participante segue na versão 1', (select current_version_id from public.programs where id = public.seed_uuid('program:p1')) = (select id from t_v2)
  and (select version_id from public.enrollments where id = (select id from t_enr)) = public.seed_uuid('pv:p1:1')
  and (select count(*) from public.certificates where enrollment_id = (select id from t_enr)) = 1);
-- conteúdo obrigatório arquivado + substituição auditável
select tests.login('10000000-0000-4000-8000-000000000003', 'consumer2@test.local');
select public.enroll_program(public.seed_uuid('program:p2'), 'America/Sao_Paulo');
select public.complete_content(public.seed_uuid('content:r3'), 'America/Sao_Paulo');
select public.complete_content(public.seed_uuid('content:r4'), 'America/Sao_Paulo');
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_set_content_status(public.seed_uuid('content:r7'), 'archived', 'Conteúdo desatualizado');
select tests.login('10000000-0000-4000-8000-000000000003', 'consumer2@test.local');
select tests.expect_error('S9 conteúdo arquivado não pode ser consumido', $q$select public.complete_content(public.seed_uuid('content:r7'), 'America/Sao_Paulo')$q$, 'content_forbidden');
select tests.ok('S9 conclusões antigas de r7 preservadas (consumer1 não tinha; histórico intacto)', (select count(*) from public.completions where content_id = public.seed_uuid('content:r7')) = 0);
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_substitute_program_item(public.seed_uuid('pv:p2:1'), public.seed_uuid('content:r7'), public.seed_uuid('content:r1'), 'r7 arquivado; r1 cobre o tema');
select tests.login('10000000-0000-4000-8000-000000000003', 'consumer2@test.local');
create temporary table t_done2 as select public.complete_content(public.seed_uuid('content:r1'), 'America/Sao_Paulo') as r;
select tests.ok('S9 substituição permite concluir programa pendente', (select status from public.enrollments where user_id = '10000000-0000-4000-8000-000000000003' and program_id = public.seed_uuid('program:p2')) = 'completed'
  and jsonb_array_length((select r from t_done2) -> 'programs_completed') = 1);
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select tests.ok('S9 substituição ficou na auditoria', exists (select 1 from public.admin_audit where action = 'program.item_substitute'));

-- ================================================================ S10 · Analytics, feedback e antiabuso
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
select public.track_event('content.view', '{"content_id":"abc","pillar":"routine"}'::jsonb, null, 'pt-BR');
select tests.expect_error('S10 PII em propriedades é rejeitada', $q$select public.track_event('content.view', '{"email":"a@b.c"}'::jsonb)$q$, 'pii_not_allowed_in_properties');
select tests.expect_error('S10 nome de evento inválido', $q$select public.track_event('DROP TABLE', '{}'::jsonb)$q$, 'invalid_event_name');
select tests.ok('S10 usuário não lê analytics', (select count(*) from public.analytics_events) = 0);
select tests.ok('S10 feedback enviado', (select public.submit_feedback('content:r1', 5, 'Ótimo', 'pt-BR')) is not null);
select tests.expect_error('S10 feedback vazio rejeitado', $q$select public.submit_feedback('page:/', null, '', 'pt-BR')$q$, 'feedback_empty');
select tests.ok('S10 usuário não lê feedback de terceiros', (select count(*) from public.feedback) = 0);
select tests.expect_error('S10 usuário não grava recomendações diretamente', $q$insert into public.user_recommendations (user_id, content_id, rank, engine) values ('10000000-0000-4000-8000-000000000002', public.seed_uuid('content:r1'), 1, 'deterministic')$q$, '42501');
select tests.expect_error('S10 usuário não altera colunas protegidas do perfil', $q$update public.profiles set anonymized_at = now() where id = '10000000-0000-4000-8000-000000000002'$q$, 'protected_column');
update public.profiles set display_name = 'Consumidor Um', timezone = 'America/Sao_Paulo' where id = '10000000-0000-4000-8000-000000000002';
select tests.ok('S10 usuário edita campos permitidos do perfil', (select display_name from public.profiles where id = '10000000-0000-4000-8000-000000000002') = 'Consumidor Um');
select tests.expect_error('S10 não-admin não altera configurações', $q$select public.admin_set_setting('commerce.enabled', 'false'::jsonb, 'x')$q$, '42501');
select tests.ok('S10 não-admin não lista usuários', (select count(*) from public.admin_list_users()) = 0);
select tests.expect_error('S10 não-admin não lê métricas', $q$select public.admin_metrics(14)$q$, '42501');
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select tests.ok('S10 métricas separam interesse, pedido de teste e receita real = 0', (public.admin_metrics(14) ->> 'real_revenue_cents') = '0' and (public.admin_metrics(14) ->> 'test_orders')::int = 1);
select tests.ok('S10 admin lista usuários com papéis', (select count(*) from public.admin_list_users()) = 6);

-- ================================================================ S11 · Exclusão de conta e retenção
select tests.login('10000000-0000-4000-8000-000000000003', 'consumer2@test.local');
select public.delete_my_account();
select tests.su();
select tests.ok('S11 conta removida e pedido de teste anonimizado', not exists (select 1 from auth.users where id = '10000000-0000-4000-8000-000000000003')
  and (select user_id is null and anonymized_at is not null and not (destination_snapshot ? 'name') from public.test_orders where id = (select id from t_order)));
select tests.ok('S11 remessas preservadas para o fornecedor (sem dados pessoais)', (select count(*) from public.test_fulfillments where order_id = (select id from t_order)) = 3);
insert into public.analytics_events (user_id, event_name, expires_at) values (null, 'content.view', now() - interval '1 day');
insert into public.test_orders (user_id, destination_snapshot, subtotal_cents, shipping_cents, total_cents, retention_expires_at)
  values ('10000000-0000-4000-8000-000000000002', '{"name":"x","zone":"local"}', 100, 0, 100, now() - interval '1 day');
insert into public.retention_exceptions (scope_type, scope_id, reason, review_at) select 'test_order', id::text, 'evidência de incidente', current_date + 30 from public.test_orders where subtotal_cents = 100;
create temporary table t_ret as select public.run_retention() as r;
select tests.ok('S11 retenção apaga analytics vencidos', ((select r from t_ret) ->> 'analytics_deleted')::int >= 1);
select tests.ok('S11 exceção de retenção documentada preserva o pedido', (select anonymized_at is null from public.test_orders where subtotal_cents = 100));
update public.retention_exceptions set closed_at = now();
select public.run_retention();
select tests.ok('S11 fechada a exceção, o pedido é anonimizado', (select anonymized_at is not null from public.test_orders where subtotal_cents = 100));

-- ================================================================ S12 · Portão do experimento (experiment.open)
-- O trigger de auth.users recusa contas novas com o cadastro fechado, exceto bootstrap/convite pendente.
select tests.su();
update public.app_settings set value = 'false'::jsonb where key = 'experiment.open';
select tests.expect_error('S12 fechado + sem convite: auth.users recusa com experiment_closed',
  $q$insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000101', 'stranger@test.local')$q$, 'experiment_closed');
select tests.ok('S12 recusa não deixa usuário, perfil nem papel', not exists (select 1 from auth.users where email = 'stranger@test.local')
  and not exists (select 1 from public.profiles where id = '10000000-0000-4000-8000-000000000101')
  and not exists (select 1 from public.role_assignments where user_id = '10000000-0000-4000-8000-000000000101'));
insert into public.invitations (email, role, creator_profile_id, token_hash, expires_at) values
  ('Convidada@Test.local', 'creator', public.seed_uuid('creator:rafael'), 's12-pending', now() + interval '7 days'),
  ('atrasada@test.local', 'creator', public.seed_uuid('creator:rafael'), 's12-expired', now() - interval '1 day');
insert into public.invitations (email, role, creator_profile_id, token_hash, expires_at, status, revoked_at) values
  ('revogada@test.local', 'creator', public.seed_uuid('creator:rafael'), 's12-revoked', now() + interval '7 days', 'revoked', now());
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000102', 'convidada@test.local');
select tests.ok('S12 fechado + convite pendente: conta criada como consumidora', exists (select 1 from public.profiles where id = '10000000-0000-4000-8000-000000000102')
  and exists (select 1 from public.role_assignments where user_id = '10000000-0000-4000-8000-000000000102' and role = 'consumer' and revoked_at is null)
  and (select status from public.invitations where token_hash = 's12-pending') = 'pending');
update public.app_settings set value = value || '["boot@test.local"]'::jsonb where key = 'bootstrap_admin_emails';
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000103', 'Boot@Test.local');
select tests.ok('S12 fechado + e-mail de bootstrap: conta criada com papel admin', exists (select 1 from public.role_assignments where user_id = '10000000-0000-4000-8000-000000000103' and role = 'admin' and revoked_at is null));
select tests.expect_error('S12 fechado + convite expirado: recusado',
  $q$insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000104', 'atrasada@test.local')$q$, 'experiment_closed');
select tests.expect_error('S12 fechado + convite revogado: recusado',
  $q$insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000105', 'revogada@test.local')$q$, 'experiment_closed');
insert into public.invitations (email, role, creator_profile_id, token_hash, expires_at, status, accepted_at) values
  ('aceita@test.local', 'creator', public.seed_uuid('creator:rafael'), 's12-accepted', now() + interval '7 days', 'accepted', now());
select tests.expect_error('S12 fechado + convite já aceito: recusado',
  $q$insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000108', 'aceita@test.local')$q$, 'experiment_closed');
select tests.expect_error('S12 fechado + convite pendente de OUTRO e-mail não libera',
  $q$insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000109', 'convidada2@test.local')$q$, 'experiment_closed');
update public.app_settings set value = '"false"'::jsonb where key = 'experiment.open';
select tests.expect_error('S12 fechado com "false" (texto): recusado',
  $q$insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000110', 'texto@test.local')$q$, 'experiment_closed');
update public.app_settings set value = '" FALSE "'::jsonb where key = 'experiment.open';
select tests.expect_error('S12 fechado com " FALSE " (maiúsculas/espaços): recusado',
  $q$insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000111', 'maiusculas@test.local')$q$, 'experiment_closed');
update public.app_settings set value = 'null'::jsonb where key = 'experiment.open';
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000112', 'nulo@test.local');
select tests.ok('S12 setting null = aberto', exists (select 1 from public.profiles where id = '10000000-0000-4000-8000-000000000112'));
select tests.ok('S12 handle_new_user é security definer com search_path fixo',
  (select p.prosecdef and p.proconfig @> array['search_path=public'] from pg_proc p where p.oid = 'public.handle_new_user()'::regprocedure));
update public.app_settings set value = 'false'::jsonb where key = 'experiment.open';
insert into auth.users (id, email, raw_app_meta_data) values ('10000000-0000-4000-8000-000000000113', 'demo-admin@test.local', '{"provider":"email","ultra_hero_demo":true}');
select tests.ok('S12 fechado + conta demo criada pelo admin (app_metadata): conta criada', exists (select 1 from public.profiles where id = '10000000-0000-4000-8000-000000000113'));
select tests.expect_error('S12 fechado + marcador demo em user_metadata (controlado pelo usuário) não libera',
  $q$insert into auth.users (id, email, raw_user_meta_data) values ('10000000-0000-4000-8000-000000000114', 'falso-demo@test.local', '{"ultra_hero_demo":true}')$q$, 'experiment_closed');
select tests.expect_error('S12 fechado + marcador demo com valor diferente de true não libera',
  $q$insert into auth.users (id, email, raw_app_meta_data) values ('10000000-0000-4000-8000-000000000115', 'quase-demo@test.local', '{"ultra_hero_demo":"yes"}')$q$, 'experiment_closed');
update public.app_settings set value = 'true'::jsonb where key = 'experiment.open';
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000106', 'aberto@test.local');
select tests.ok('S12 aberto: qualquer e-mail cria conta', exists (select 1 from public.profiles where id = '10000000-0000-4000-8000-000000000106'));
delete from public.app_settings where key = 'experiment.open';
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000107', 'semsetting@test.local');
select tests.ok('S12 setting ausente = aberto', exists (select 1 from public.profiles where id = '10000000-0000-4000-8000-000000000107'));
insert into public.app_settings (key, value) values ('experiment.open', 'true'::jsonb);

-- ================================================================ S13 · Suspensão auditada de contas
-- O ban em si é do Auth Admin API (service role); aqui simulamos banned_until e testamos a RPC de auditoria.
select tests.su();
update auth.users set banned_until = now() + interval '876000 hours' where id = '10000000-0000-4000-8000-000000000004';
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
select tests.expect_error('S13 não-admin não registra suspensão', $q$select public.admin_log_account_status('10000000-0000-4000-8000-000000000004', true, 'Violação dos Termos')$q$, '42501');
select tests.ok('S13 não-admin não lê usuário por id', (select count(*) from public.admin_get_user('10000000-0000-4000-8000-000000000004')) = 0);
select tests.anon();
select tests.expect_error('S13 visitante não executa admin_log_account_status', $q$select public.admin_log_account_status('10000000-0000-4000-8000-000000000004', true, 'Violação dos Termos')$q$, 'permission denied');
select tests.expect_error('S13 visitante não executa admin_get_user', $q$select * from public.admin_get_user('10000000-0000-4000-8000-000000000004')$q$, 'permission denied');
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select tests.expect_error('S13 justificativa vazia recusada', $q$select public.admin_log_account_status('10000000-0000-4000-8000-000000000004', true, '   ')$q$, 'justification_required');
select tests.expect_error('S13 admin não suspende a si mesmo', $q$select public.admin_log_account_status('10000000-0000-4000-8000-000000000001', true, 'Teste de bloqueio')$q$, 'cannot_suspend_self');
select tests.expect_error('S13 admin não suspende outro admin ativo', $q$select public.admin_log_account_status('10000000-0000-4000-8000-000000000103', true, 'Teste de bloqueio')$q$, 'cannot_suspend_admin');
select tests.expect_error('S13 usuário inexistente', $q$select public.admin_log_account_status('10000000-0000-4000-8000-000000000999', true, 'Teste de bloqueio')$q$, 'user_not_found');
select tests.expect_error('S13 não audita suspensão sem ban no Auth', $q$select public.admin_log_account_status('10000000-0000-4000-8000-000000000002', true, 'Teste de bloqueio')$q$, 'account_status_mismatch');
select tests.expect_error('S13 não audita reativação com ban ainda ativo', $q$select public.admin_log_account_status('10000000-0000-4000-8000-000000000004', false, 'Teste de bloqueio')$q$, 'account_status_mismatch');
select public.admin_log_account_status('10000000-0000-4000-8000-000000000004', true, 'Violação dos Termos (teste)');
select tests.ok('S13 suspensão gravada na auditoria (ator admin + justificativa)', exists (select 1 from public.admin_audit
  where action = 'user.suspend' and resource_type = 'user' and resource_id = '10000000-0000-4000-8000-000000000004'
    and actor_id = '10000000-0000-4000-8000-000000000001' and actor_type = 'admin'
    and justification = 'Violação dos Termos (teste)' and (after_data ->> 'suspended')::boolean and after_data ->> 'banned_until' is not null));
select tests.ok('S13 admin_get_user devolve banned_until', (select banned_until > now() + interval '50 years' from public.admin_get_user('10000000-0000-4000-8000-000000000004')));
select tests.su();
update auth.users set banned_until = null where id = '10000000-0000-4000-8000-000000000004';
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_log_account_status('10000000-0000-4000-8000-000000000004', false, 'Revisão concluída');
select tests.ok('S13 reativação auditada e banned_until limpo', exists (select 1 from public.admin_audit where action = 'user.reactivate' and resource_id = '10000000-0000-4000-8000-000000000004' and not (after_data ->> 'suspended')::boolean)
  and (select banned_until is null from public.admin_get_user('10000000-0000-4000-8000-000000000004')));
select tests.su();
select tests.ok('S13 tentativas recusadas não deixam auditoria', (select count(*) from public.admin_audit where action in ('user.suspend', 'user.reactivate')) = 2
  and not exists (select 1 from public.admin_audit where action in ('user.suspend', 'user.reactivate') and resource_id <> '10000000-0000-4000-8000-000000000004'));
select tests.ok('S13 grants: visitante sem execute; autenticado com execute (is_admin decide)',
  not has_function_privilege('anon', 'public.admin_log_account_status(uuid, boolean, text)', 'execute')
  and not has_function_privilege('anon', 'public.admin_get_user(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.admin_log_account_status(uuid, boolean, text)', 'execute')
  and has_function_privilege('authenticated', 'public.admin_get_user(uuid)', 'execute'));
select tests.ok('S13 RPCs novas são security definer com search_path fixo',
  (select bool_and(p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
   from pg_proc p where p.oid in ('public.admin_log_account_status(uuid, boolean, text)'::regprocedure, 'public.admin_get_user(uuid)'::regprocedure)));

-- ================================================================ S17 · Preferências de notificação (0018)
-- Uma linha por usuário; só o dono lê e grava; sem política de remoção; nada para anon; some com a conta.
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
insert into public.notification_preferences (user_id, editorial_digest, channel_email) values ('10000000-0000-4000-8000-000000000002', true, true);
select tests.ok('S17 usuário cria as próprias preferências', (select editorial_digest and channel_email and not channel_push from public.notification_preferences where user_id = '10000000-0000-4000-8000-000000000002'));
update public.notification_preferences set streak_reminders = true, channel_push = true where user_id = '10000000-0000-4000-8000-000000000002';
select tests.ok('S17 usuário atualiza as próprias preferências', (select streak_reminders and channel_push from public.notification_preferences where user_id = '10000000-0000-4000-8000-000000000002'));
select tests.expect_error('S17 usuário não cria preferências em nome de outro', $q$insert into public.notification_preferences (user_id) values ('10000000-0000-4000-8000-000000000004')$q$, '42501');
select tests.expect_error('S17 usuário não transfere a própria linha para outro usuário', $q$update public.notification_preferences set user_id = '10000000-0000-4000-8000-000000000004' where user_id = '10000000-0000-4000-8000-000000000002'$q$, '42501');
delete from public.notification_preferences where user_id = '10000000-0000-4000-8000-000000000002'; -- sem política de delete: nenhuma linha afetada
select tests.ok('S17 sem política de remoção: a linha permanece', exists (select 1 from public.notification_preferences where user_id = '10000000-0000-4000-8000-000000000002'));
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
select tests.ok('S17 preferências de outro usuário são invisíveis', (select count(*) from public.notification_preferences) = 0);
update public.notification_preferences set editorial_digest = false, channel_email = false where user_id = '10000000-0000-4000-8000-000000000002'; -- RLS: 0 linhas
select tests.su();
select tests.ok('S17 update de terceiro não altera nada', (select editorial_digest and channel_email from public.notification_preferences where user_id = '10000000-0000-4000-8000-000000000002'));
select tests.ok('S17 trigger de updated_at instalado', exists (select 1 from pg_trigger where tgrelid = 'public.notification_preferences'::regclass and tgname = 'trg_notification_preferences_updated_at'));
select tests.ok('S17 políticas usam (select auth.uid()) e não há política de delete nem para anon',
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'notification_preferences') = 3
  and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notification_preferences' and (cmd = 'DELETE' or 'anon' = any (roles))));
select tests.anon();
select tests.expect_error('S17 visitante não lê preferências', $q$select count(*) from public.notification_preferences$q$, 'permission denied');
select tests.expect_error('S17 visitante não grava preferências', $q$insert into public.notification_preferences (user_id) values ('10000000-0000-4000-8000-000000000002')$q$, '42501');
-- exclusão da conta: a linha vai junto (on delete cascade de auth.users), sem alterar anonymize_user_data
select tests.su();
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000017', 's17@test.local');
select tests.login('10000000-0000-4000-8000-000000000017', 's17@test.local');
insert into public.notification_preferences (user_id, commerce_updates) values ('10000000-0000-4000-8000-000000000017', true);
select public.delete_my_account();
select tests.su();
select tests.ok('S17 excluir a conta remove as preferências (cascade)', not exists (select 1 from auth.users where id = '10000000-0000-4000-8000-000000000017')
  and not exists (select 1 from public.notification_preferences where user_id = '10000000-0000-4000-8000-000000000017'));

-- ================================================================ S18 · Feedback com categoria, prioridade e responsável (0018)
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
create temporary table t_fb as select public.submit_feedback('page:/explore', 4, 'Falta filtro por duração', 'pt-BR', 'suggestion') as id;
create temporary table t_fb_legacy as select public.submit_feedback('page:/explore', 3, 'assinatura antiga', 'pt-BR') as id;
select tests.expect_error('S18 categoria inválida rejeitada pela RPC', $q$select public.submit_feedback('page:/', 3, 'x', 'pt-BR', 'spam')$q$, 'invalid_category');
select tests.expect_error('S18 usuário não insere feedback direto na tabela', $q$insert into public.feedback (context, category) values ('page:/', 'bug')$q$, '42501');
update public.feedback set priority = 'high', admin_note = 'tentativa', assignee = '10000000-0000-4000-8000-000000000001' where id = (select id from t_fb); -- RLS: 0 linhas
select tests.expect_error('S18 usuário não executa a triagem', $q$select public.admin_triage_feedback((select id from t_fb), '{"priority":"high"}'::jsonb)$q$, '42501');
select tests.su();
select tests.ok('S18 categoria gravada pela RPC', (select category from public.feedback where id = (select id from t_fb)) = 'suggestion');
select tests.ok('S18 assinatura antiga continua válida (categoria other)', (select category from public.feedback where id = (select id from t_fb_legacy)) = 'other');
select tests.ok('S18 usuário não altera prioridade, responsável nem nota', (select priority is null and assignee is null and admin_note is null from public.feedback where id = (select id from t_fb)));
select tests.expect_error('S18 check de categoria vale até para o sistema', $q$insert into public.feedback (context, category) values ('page:/', 'nope')$q$, '23514');
select tests.expect_error('S18 check de prioridade vale até para o sistema', $q$update public.feedback set priority = 'urgent' where id = (select id from t_fb)$q$, '23514');
select tests.anon();
select tests.ok('S18 visitante envia feedback com categoria', public.submit_feedback('page:/', 5, null, 'pt-BR', 'bug') is not null);
select tests.ok('S18 visitante não lê feedback', (select count(*) from public.feedback) = 0);
select tests.expect_error('S18 visitante não executa a triagem', $q$select public.admin_triage_feedback(gen_random_uuid(), '{}'::jsonb)$q$, 'permission denied');
select tests.expect_error('S18 visitante não lista admins', $q$select * from public.admin_list_admins()$q$, 'permission denied');
-- Usuário autenticado sem papel admin (creator1): não tria, não lista admins, não lê feedback, update não altera nada.
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
select tests.expect_error('S18 usuário sem papel admin não executa a triagem', $q$select public.admin_triage_feedback((select id from t_fb), '{"priority":"low","assignee":"10000000-0000-4000-8000-000000000004"}'::jsonb)$q$, '42501');
select tests.ok('S18 usuário sem papel admin não lista admins nem lê feedback', (select count(*) from public.admin_list_admins()) = 0 and (select count(*) from public.feedback) = 0);
update public.feedback set priority = 'low', assignee = '10000000-0000-4000-8000-000000000004', status = 'archived' where id = (select id from t_fb); -- RLS: 0 linhas
select tests.su();
select tests.ok('S18 update de usuário sem papel admin não altera a triagem', (select priority is null and assignee is null and status = 'new' from public.feedback where id = (select id from t_fb)));
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select tests.ok('S18 admin define prioridade, responsável, nota e status',
  (public.admin_triage_feedback((select id from t_fb), jsonb_build_object('priority', 'high', 'assignee', '10000000-0000-4000-8000-000000000001', 'admin_note', 'Verificar filtro', 'status', 'reviewed'), 'triagem inicial') ->> 'priority') = 'high');
select tests.ok('S18 triagem persistida', (select priority = 'high' and assignee = '10000000-0000-4000-8000-000000000001' and admin_note = 'Verificar filtro' and status = 'reviewed' from public.feedback where id = (select id from t_fb)));
select tests.expect_error('S18 prioridade inválida rejeitada', $q$select public.admin_triage_feedback((select id from t_fb), '{"priority":"urgent"}'::jsonb)$q$, 'invalid_priority');
select tests.expect_error('S18 status inválido rejeitado', $q$select public.admin_triage_feedback((select id from t_fb), '{"status":"done"}'::jsonb)$q$, 'invalid_status');
select tests.expect_error('S18 responsável precisa ter papel admin', $q$select public.admin_triage_feedback((select id from t_fb), '{"assignee":"10000000-0000-4000-8000-000000000002"}'::jsonb)$q$, 'assignee_not_admin');
select tests.expect_error('S18 nota acima de 1000 caracteres rejeitada', $q$select public.admin_triage_feedback((select id from t_fb), jsonb_build_object('admin_note', repeat('x', 1001)))$q$, 'note_too_long');
select tests.expect_error('S18 feedback inexistente', $q$select public.admin_triage_feedback(gen_random_uuid(), '{"status":"archived"}'::jsonb)$q$, 'not_found');
select tests.ok('S18 null limpa prioridade e responsável', (select (r ->> 'priority') is null and (r ->> 'assignee') is null and (r ->> 'admin_note') = 'Verificar filtro'
  from public.admin_triage_feedback((select id from t_fb), '{"priority":null,"assignee":null}'::jsonb) r));
update public.feedback set priority = 'low' where id = (select id from t_fb);
select tests.ok('S18 admin também altera pela política da tabela', (select priority from public.feedback where id = (select id from t_fb)) = 'low');
select tests.ok('S18 admin_list_admins lista só admins ativos',
  (select count(*) from public.admin_list_admins()) = (select count(distinct user_id) from public.role_assignments where role = 'admin' and revoked_at is null)
  and exists (select 1 from public.admin_list_admins() where id = '10000000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.admin_list_admins() where id = '10000000-0000-4000-8000-000000000002'));
select tests.su();
select tests.ok('S18 triagem auditada (feedback.triage, ator admin, antes/depois)', (select count(*) from public.admin_audit
  where action = 'feedback.triage' and resource_type = 'feedback' and resource_id = (select id::text from t_fb)
    and actor_id = '10000000-0000-4000-8000-000000000001' and actor_type = 'admin') = 2
  and exists (select 1 from public.admin_audit where action = 'feedback.triage' and justification = 'triagem inicial'
    and before_data ->> 'priority' is null and after_data ->> 'priority' = 'high' and after_data ->> 'status' = 'reviewed'));
select tests.ok('S18 tentativas recusadas não deixam auditoria', (select count(*) from public.admin_audit where action = 'feedback.triage') = 2);
select tests.ok('S18 RPCs novas são security definer com search_path fixo e sem anon',
  (select bool_and(p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%') and not has_function_privilege('anon', p.oid, 'execute'))
   from pg_proc p where p.oid in ('public.admin_triage_feedback(uuid, jsonb, text)'::regprocedure, 'public.admin_list_admins()'::regprocedure)));
select tests.ok('S18 atalho de 4 argumentos é security invoker (não amplia a lista de anon)',
  (select not p.prosecdef from pg_proc p where p.oid = 'public.submit_feedback(text, int, text, public.locale_code)'::regprocedure));

-- ================================================================ S19 · explore_feed: feed do Explorar em grade (0020)
-- Security invoker: a RLS já esconde rascunho e agendado do público; a função repete content_is_live
-- para admin e herói não verem os próprios rascunhos no feed. Ordem determinística por semente, cada
-- rodada com no máximo um post por herói, então paginar por offset não repete nem pula. now() é fixo
-- na transação: "a data chegou" é simulado movendo publish_at para o passado como sistema.
select tests.su();
select tests.ok('S19 explore_feed é security invoker, com search_path fixo, executável por anon e authenticated',
  (select not p.prosecdef and p.proconfig @> array['search_path=public'] from pg_proc p
    where p.oid = 'public.explore_feed(public.pillar, public.content_type, public.access_level, text, integer, integer, integer)'::regprocedure)
  and has_function_privilege('anon', 'public.explore_feed(public.pillar, public.content_type, public.access_level, text, integer, integer, integer)', 'execute')
  and has_function_privilege('authenticated', 'public.explore_feed(public.pillar, public.content_type, public.access_level, text, integer, integer, integer)', 'execute'));
-- Referência medida como sistema (fora da RLS): tudo que está no ar, com os atributos filtráveis.
create temporary table t_s19_live as
  select id, creator_id, pillar, type, access_level, difficulty from public.content where public.content_is_live(status, publish_at);
grant select on t_s19_live to anon, authenticated; -- o visitante e o herói comparam o feed com a referência
select tests.ok('S19 referência: 40 no ar, de 8 heróis, todos com herói', (select count(*) from t_s19_live) = 40
  and (select count(distinct creator_id) from t_s19_live) = 8 and not exists (select 1 from t_s19_live where creator_id is null));

-- 1) visitante recebe exatamente o catálogo no ar
select tests.anon();
select tests.ok('S19 visitante executa explore_feed e recebe todo o catálogo no ar (p_limit=100)',
  (select count(*) from public.explore_feed(null, null, null, null, 7, 100, 0)) = (select count(*) from t_s19_live)
  and not exists (select id from public.explore_feed(null, null, null, null, 7, 100, 0) except select id from t_s19_live)
  and (select bool_and(status = 'published' and (publish_at is null or publish_at <= now())) from public.explore_feed(null, null, null, null, 7, 100, 0)));

-- 3) variedade: a primeira rodada traz um post por herói. Entre rodadas a função não impede que o último
-- de uma e o primeiro da seguinte sejam do mesmo herói (com este seed, as sementes 1 e 6 repetem);
-- a semente 7 dá 15 posições sem repetição seguida. Se o seed de conteúdo mudar, troque a semente.
select tests.ok('S19 primeira rodada: com p_limit = nº de heróis no ar, nenhum herói se repete',
  (select count(*) = (select count(distinct creator_id) from t_s19_live) and count(distinct creator_id) = count(*)
   from public.explore_feed(null, null, null, null, 7, (select count(distinct creator_id) from t_s19_live)::int, 0)));
select tests.ok('S19 15 primeiras posições sem dois posts seguidos do mesmo herói (semente 7)',
  (select count(*) = 15 and not bool_or(same)
   from (select creator_id = lag(creator_id) over (order by ordinality) as same
         from public.explore_feed(null, null, null, null, 7, 15, 0) with ordinality) x));

-- 4) estabilidade e paginação: mesma semente, mesma sequência; páginas de 15 disjuntas e completas
do $s19$
declare v_a text; v_b text; v_all uuid[] := '{}'; v_page uuid[]; v_off int := 0; v_pages int := 0;
begin
  select string_agg(id::text, ',' order by ordinality) into v_a from public.explore_feed(null, null, null, null, 7, 100, 0) with ordinality;
  select string_agg(id::text, ',' order by ordinality) into v_b from public.explore_feed(null, null, null, null, 7, 100, 0) with ordinality;
  perform tests.ok('S19 duas chamadas com a mesma semente devolvem a mesma sequência de ids', v_a is not null and v_a = v_b);
  loop
    select coalesce(array_agg(id order by ordinality), '{}') into v_page from public.explore_feed(null, null, null, null, 7, 15, v_off) with ordinality;
    exit when cardinality(v_page) = 0;
    if v_off > 0 then
      perform tests.ok(format('S19 página offset %s (limit 15) é disjunta das anteriores', v_off), not (v_page && v_all));
    end if;
    v_all := v_all || v_page; v_off := v_off + 15; v_pages := v_pages + 1;
  end loop;
  perform tests.ok('S19 união das páginas de 15 em 15 cobre todo o catálogo no ar sem repetição',
    v_pages = ceil((select count(*) from t_s19_live) / 15.0)
    and cardinality(v_all) = (select count(*) from t_s19_live)
    and (select count(distinct u) from unnest(v_all) u) = cardinality(v_all)
    and (select bool_and(l.id = any (v_all)) from t_s19_live l));
end $s19$;

-- 4b) search_content (0023): desempate único por id; páginas por offset estáveis, disjuntas e completas
do $s19b$
declare v_a text; v_b text; v_all uuid[] := '{}'; v_page uuid[]; v_off int := 0;
begin
  select string_agg(id::text, ',' order by ordinality) into v_a from public.search_content('', null, null, null, null, 100, 0) with ordinality;
  select string_agg(id::text, ',' order by ordinality) into v_b from public.search_content('', null, null, null, null, 100, 0) with ordinality;
  perform tests.ok('S19 search_content: duas chamadas iguais devolvem a mesma sequência de ids', v_a is not null and v_a = v_b);
  loop
    select coalesce(array_agg(id order by ordinality), '{}') into v_page from public.search_content('', null, null, null, null, 15, v_off) with ordinality;
    exit when cardinality(v_page) = 0;
    if v_off > 0 and v_page && v_all then
      perform tests.ok(format('S19 search_content: página offset %s repete id de página anterior', v_off), false);
    end if;
    v_all := v_all || v_page; v_off := v_off + 15;
  end loop;
  perform tests.ok('S19 search_content: páginas de 15 cobrem todo o catálogo no ar sem repetição',
    cardinality(v_all) = (select count(*) from t_s19_live)
    and (select count(distinct u) from unnest(v_all) u) = cardinality(v_all));
  perform tests.ok('S19 search_content termina o ORDER BY em c.id (desempate único)',
    pg_get_functiondef('public.search_content(text, public.pillar, public.content_type, uuid, public.access_level, int, int, text)'::regprocedure) ~ 'published_at desc, c\.id');
end $s19b$;

-- 5) semente diferente muda a ordem
select tests.ok('S19 semente diferente muda a ordem (10 primeiros com sementes 7 e 8)',
  (select string_agg(id::text, ',' order by ordinality) from public.explore_feed(null, null, null, null, 7, 10, 0) with ordinality)
  <> (select string_agg(id::text, ',' order by ordinality) from public.explore_feed(null, null, null, null, 8, 10, 0) with ordinality));

-- 6) filtros: contagem igual à direta na referência e só linhas que satisfazem o filtro
select tests.ok('S19 filtro p_pillar (training) bate com a contagem direta',
  (select count(*) from t_s19_live where pillar = 'training') > 0
  and (select count(*) from public.explore_feed('training', null, null, null, 7, 100, 0)) = (select count(*) from t_s19_live where pillar = 'training')
  and (select bool_and(pillar = 'training') from public.explore_feed('training', null, null, null, 7, 100, 0)));
select tests.ok('S19 filtro p_type (recipe) bate com a contagem direta',
  (select count(*) from t_s19_live where type = 'recipe') > 0
  and (select count(*) from public.explore_feed(null, 'recipe', null, null, 7, 100, 0)) = (select count(*) from t_s19_live where type = 'recipe')
  and (select bool_and(type = 'recipe') from public.explore_feed(null, 'recipe', null, null, 7, 100, 0)));
select tests.ok('S19 filtro p_access (premium) bate com a contagem direta',
  (select count(*) from t_s19_live where access_level = 'premium') > 0
  and (select count(*) from public.explore_feed(null, null, 'premium', null, 7, 100, 0)) = (select count(*) from t_s19_live where access_level = 'premium')
  and (select bool_and(access_level = 'premium') from public.explore_feed(null, null, 'premium', null, 7, 100, 0)));
select tests.ok('S19 filtro p_difficulty (intermediate) bate com a contagem direta',
  (select count(*) from t_s19_live where difficulty = 'intermediate') > 0
  and (select count(*) from public.explore_feed(null, null, null, 'intermediate', 7, 100, 0)) = (select count(*) from t_s19_live where difficulty = 'intermediate')
  and (select bool_and(difficulty = 'intermediate') from public.explore_feed(null, null, null, 'intermediate', 7, 100, 0)));
select tests.ok('S19 filtros combinados (training + premium + intermediate) batem com a contagem direta',
  (select count(*) from t_s19_live where pillar = 'training' and access_level = 'premium' and difficulty = 'intermediate') > 0
  and (select count(*) from public.explore_feed('training', null, 'premium', 'intermediate', 7, 100, 0))
    = (select count(*) from t_s19_live where pillar = 'training' and access_level = 'premium' and difficulty = 'intermediate')
  and (select bool_and(pillar = 'training' and access_level = 'premium' and difficulty = 'intermediate') from public.explore_feed('training', null, 'premium', 'intermediate', 7, 100, 0)));
select tests.ok('S19 filtro sem conteúdo correspondente devolve vazio (advanced)',
  (select count(*) from public.explore_feed(null, null, null, 'advanced', 7, 100, 0)) = (select count(*) from t_s19_live where difficulty = 'advanced'));

-- 7) limites de p_limit e p_offset
select tests.ok('S19 limites: p_limit 0 ou negativo devolve 1 linha; p_limit=1000 devolve no máximo 100; p_offset=-5 equivale a 0',
  (select count(*) from public.explore_feed(null, null, null, null, 7, 0, 0)) = 1
  and (select count(*) from public.explore_feed(null, null, null, null, 7, -3, 0)) = 1
  and (select count(*) from public.explore_feed(null, null, null, null, 7, 1000, 0)) = least((select count(*) from t_s19_live), 100)
  and (select string_agg(id::text, ',' order by ordinality) from public.explore_feed(null, null, null, null, 7, 15, -5) with ordinality)
    = (select string_agg(id::text, ',' order by ordinality) from public.explore_feed(null, null, null, null, 7, 15, 0) with ordinality));

-- 2) e 8) agendado e rascunho ficam fora do feed para visitante, herói dona e admin; a data chegando basta.
-- Ajustes feitos como sistema sobre o seed (t1 de Camila agendado; r5 de Lia, herói do creator1, em rascunho).
select tests.su();
update public.content set publish_at = now() + interval '1 day' where id = public.seed_uuid('content:t1');
update public.content set status = 'draft' where id = public.seed_uuid('content:r5');
select tests.anon();
select tests.ok('S19 visitante: agendado e rascunho fora do feed (catálogo cai em 2)',
  (select count(*) from public.explore_feed(null, null, null, null, 7, 100, 0)) = (select count(*) from t_s19_live) - 2
  and not exists (select 1 from public.explore_feed(null, null, null, null, 7, 100, 0) where id in (public.seed_uuid('content:t1'), public.seed_uuid('content:r5'))));
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
select tests.ok('S19 herói vê o próprio rascunho na tabela (RLS) mas não no feed',
  (select count(*) from public.content where id = public.seed_uuid('content:r5')) = 1
  and not exists (select 1 from public.explore_feed(null, null, null, null, 7, 100, 0) where id = public.seed_uuid('content:r5'))
  and (select count(*) from public.explore_feed(null, null, null, null, 7, 100, 0)) = (select count(*) from t_s19_live) - 2);
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select tests.ok('S19 admin vê rascunho e agendado na tabela (RLS) mas não no feed',
  (select count(*) from public.content where id in (public.seed_uuid('content:t1'), public.seed_uuid('content:r5'))) = 2
  and not exists (select 1 from public.explore_feed(null, null, null, null, 7, 100, 0) where id in (public.seed_uuid('content:t1'), public.seed_uuid('content:r5')))
  and (select count(*) from public.explore_feed(null, null, null, null, 7, 100, 0)) = (select count(*) from t_s19_live) - 2);
select tests.su();
update public.content set publish_at = now() - interval '1 minute' where id = public.seed_uuid('content:t1');
select tests.anon();
select tests.ok('S19 data chegou: o agendado entra no feed sem nova ação',
  exists (select 1 from public.explore_feed(null, null, null, null, 7, 100, 0) where id = public.seed_uuid('content:t1'))
  and (select count(*) from public.explore_feed(null, null, null, null, 7, 100, 0)) = (select count(*) from t_s19_live) - 1);
-- restaura o seed: S14 e S15 contam 40 no ar e S15 agenda outros conteúdos
select tests.su();
update public.content set publish_at = null where id = public.seed_uuid('content:t1');
update public.content set status = 'published' where id = public.seed_uuid('content:r5');
select tests.ok('S19 estado restaurado: catálogo no ar igual à referência',
  (select count(*) from public.content where public.content_is_live(status, publish_at)) = (select count(*) from t_s19_live)
  and not exists (select id from t_s19_live except select id from public.content where public.content_is_live(status, publish_at)));

-- ================================================================ S20 · creator_products: produtos do herói (0021)
-- Alocação direta produto↔herói. Público vê só validated; admin vê tudo; herói vê as próprias linhas em
-- qualquer status. Herói só insere sugestão para si (suggested, created_by = ele) e só exclui a própria
-- sugestão; não há grant de update para authenticated: status muda só pela RPC admin_set_creator_product.
-- A junção com products herda a RLS de products: produto fora do ar some mesmo com a alocação validada.
select tests.su();
-- 1) seed: 56 linhas validadas, 7 por herói, 8 heróis, ordem fixa da vitrine
select tests.ok('S20 seed: 56 alocações validadas, 7 por herói em 8 heróis, só produtos Ultra.e Life',
  (select count(*) from public.creator_products) = 56
  and (select count(*) from public.creator_products where status = 'validated' and validated_at is not null) = 56
  and (select count(distinct creator_id) from public.creator_products) = 8
  and not exists (select creator_id from public.creator_products group by creator_id having count(*) <> 7)
  and (select count(distinct product_id) from public.creator_products) = 7
  and not exists (select 1 from public.creator_products cp join public.products p on p.id = cp.product_id where p.seller_org_id <> public.seed_uuid('seller:ultrae')));
select tests.ok('S20 seed: sort_order 10..70 na ordem da vitrine (citrus, tangerina, gummy, pó, focus, daily, melatonina)',
  (select array_agg(p.slug order by cp.sort_order) from public.creator_products cp join public.products p on p.id = cp.product_id where cp.creator_id = public.seed_uuid('creator:lia'))
    = array['e-water-citrus', 'e-water-tangerina', 'e-creatina-gummy', 'e-creatina-po', 'e-focus', 'e-daily', 'e-melatonina']
  and (select array_agg(distinct sort_order order by sort_order) from public.creator_products) = array[10, 20, 30, 40, 50, 60, 70]);
select tests.anon();
select tests.ok('S20 visitante vê as 56 alocações e, na junção com products, os 7 produtos Ultra.e Life publicados com imagem e loja oficial',
  (select count(*) from public.creator_products) = 56
  and (select count(*) from public.creator_products cp join public.products p on p.id = cp.product_id) = 56
  and (select count(distinct p.id) from public.creator_products cp join public.products p on p.id = cp.product_id
       where p.status = 'published' and p.seller_org_id = public.seed_uuid('seller:ultrae')) = 7
  and (select bool_and(p.image_url like '/products/%.jpg' and p.attributes ->> 'external_url' like 'https://selvaje.lojavirtualnuvem.com.br/%' and p.price_cents_demo in (6990, 8990))
       from public.creator_products cp join public.products p on p.id = cp.product_id));

-- 2) linhas não validadas ficam invisíveis ao público (criadas como sistema para Lia e Rafael)
select tests.su();
insert into public.creator_products (creator_id, product_id, status, note) values
  (public.seed_uuid('creator:lia'), public.seed_uuid('product:m1'), 'suggested', 'sugestão pendente'),
  (public.seed_uuid('creator:lia'), public.seed_uuid('product:k1'), 'suspended', 'fora de linha'),
  (public.seed_uuid('creator:lia'), public.seed_uuid('product:a1'), 'rejected', 'não combina'),
  (public.seed_uuid('creator:rafael'), public.seed_uuid('product:k2'), 'suggested', null);
select tests.anon();
select tests.ok('S20 visitante não vê suggested/suspended/rejected (segue vendo 56, 7 de Lia)',
  (select count(*) from public.creator_products) = 56
  and not exists (select 1 from public.creator_products where status <> 'validated')
  and (select count(*) from public.creator_products where creator_id = public.seed_uuid('creator:lia')) = 7
  and (select count(*) from public.creator_products where product_id in (public.seed_uuid('product:m1'), public.seed_uuid('product:k1'), public.seed_uuid('product:a1'), public.seed_uuid('product:k2'))) = 0);
select tests.expect_error('S20 visitante não insere alocação (sem grant)', $q$insert into public.creator_products (creator_id, product_id) values (public.seed_uuid('creator:lia'), public.seed_uuid('product:l1'))$q$, 'permission denied');

-- 3) produto despublicado some da junção do visitante mesmo com a alocação validada
select tests.su();
update public.products set status = 'draft' where id = public.seed_uuid('product:ue-focus');
select tests.anon();
select tests.ok('S20 produto despublicado: a alocação segue visível, mas a junção com products não o traz (48 de 56)',
  (select count(*) from public.creator_products where product_id = public.seed_uuid('product:ue-focus')) = 8
  and (select count(*) from public.creator_products cp join public.products p on p.id = cp.product_id where cp.product_id = public.seed_uuid('product:ue-focus')) = 0
  and (select count(*) from public.creator_products cp join public.products p on p.id = cp.product_id) = 48
  and (select count(*) from public.creator_products cp left join public.products p on p.id = cp.product_id where p.id is null) = 8);
select tests.su();
update public.products set status = 'published' where id = public.seed_uuid('product:ue-focus');
select tests.anon();
select tests.ok('S20 republicado: a junção volta a 56',
  (select count(*) from public.creator_products cp join public.products p on p.id = cp.product_id) = 56
  and (select status from public.products where id = public.seed_uuid('product:ue-focus')) = 'published');

-- 4) herói (creator1 = Lia): sugere para si; não valida, não sugere para outro, não assina por terceiro
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
insert into public.creator_products (id, creator_id, product_id, status, created_by, note) values
  ('50000000-0000-4000-8000-000000000001', public.seed_uuid('creator:lia'), public.seed_uuid('product:l1'), 'suggested', '10000000-0000-4000-8000-000000000004', 'Caderno que uso na rotina');
insert into public.creator_products (id, creator_id, product_id, created_by) values
  ('50000000-0000-4000-8000-000000000002', public.seed_uuid('creator:lia'), public.seed_uuid('product:l2'), '10000000-0000-4000-8000-000000000004'); -- status pelo default
select tests.ok('S20 herói sugere produto para si (suggested, created_by = ele, sort_order padrão 100)',
  (select count(*) from public.creator_products where id in ('50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002')
     and status = 'suggested' and created_by = '10000000-0000-4000-8000-000000000004' and validated_by is null and validated_at is null and sort_order = 100) = 2);
select tests.expect_error('S20 herói não insere alocação já validada', $q$insert into public.creator_products (creator_id, product_id, status, created_by) values (public.seed_uuid('creator:lia'), public.seed_uuid('product:l3'), 'validated', '10000000-0000-4000-8000-000000000004')$q$, '42501');
select tests.expect_error('S20 herói não sugere para outro herói', $q$insert into public.creator_products (creator_id, product_id, status, created_by) values (public.seed_uuid('creator:rafael'), public.seed_uuid('product:l3'), 'suggested', '10000000-0000-4000-8000-000000000004')$q$, '42501');
select tests.expect_error('S20 herói não assina a sugestão com created_by de terceiro', $q$insert into public.creator_products (creator_id, product_id, status, created_by) values (public.seed_uuid('creator:lia'), public.seed_uuid('product:l3'), 'suggested', '10000000-0000-4000-8000-000000000002')$q$, '42501');
select tests.expect_error('S20 herói não insere sem created_by', $q$insert into public.creator_products (creator_id, product_id) values (public.seed_uuid('creator:lia'), public.seed_uuid('product:l3'))$q$, '42501');
select tests.ok('S20 herói vê as próprias linhas em qualquer status (12 de Lia) e só validated dos outros (61 no total)',
  (select count(*) from public.creator_products where creator_id = public.seed_uuid('creator:lia')) = 12
  and (select count(*) from public.creator_products where creator_id = public.seed_uuid('creator:lia') and status <> 'validated') = 5
  and (select count(*) from public.creator_products) = 61
  and not exists (select 1 from public.creator_products where creator_id <> public.seed_uuid('creator:lia') and status <> 'validated'));
do $s20$
declare n int;
begin
  delete from public.creator_products where creator_id = public.seed_uuid('creator:lia') and product_id = public.seed_uuid('product:ue-focus');
  get diagnostics n = row_count;
  perform tests.ok('S20 herói não exclui alocação validada (0 linhas)', n = 0);
  delete from public.creator_products where creator_id = public.seed_uuid('creator:rafael') and product_id = public.seed_uuid('product:k2');
  get diagnostics n = row_count;
  perform tests.ok('S20 herói não exclui sugestão de outro herói (0 linhas)', n = 0);
  delete from public.creator_products where id = '50000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  perform tests.ok('S20 herói exclui a própria sugestão (1 linha)', n = 1);
end $s20$;
select tests.ok('S20 após a exclusão a sugestão some e a validada permanece',
  not exists (select 1 from public.creator_products where id = '50000000-0000-4000-8000-000000000002')
  and exists (select 1 from public.creator_products where creator_id = public.seed_uuid('creator:lia') and product_id = public.seed_uuid('product:ue-focus') and status = 'validated'));
select tests.expect_error('S20 herói não altera alocação (sem grant de update)', $q$update public.creator_products set status = 'validated' where id = '50000000-0000-4000-8000-000000000001'$q$, '42501');
select tests.expect_error('S20 herói não executa a RPC de status', $q$select public.admin_set_creator_product(public.seed_uuid('creator:lia'), public.seed_uuid('product:l1'), 'validated')$q$, 'forbidden');

-- 5) consumidor: nada de inserir; vê só validated
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
select tests.expect_error('S20 consumidor não sugere alocação (não é herói)', $q$insert into public.creator_products (creator_id, product_id, status, created_by) values (public.seed_uuid('creator:lia'), public.seed_uuid('product:l3'), 'suggested', '10000000-0000-4000-8000-000000000002')$q$, '42501');
select tests.expect_error('S20 consumidor não insere nem fingindo created_by do herói', $q$insert into public.creator_products (creator_id, product_id, status, created_by) values (public.seed_uuid('creator:lia'), public.seed_uuid('product:l3'), 'suggested', '10000000-0000-4000-8000-000000000004')$q$, '42501');
select tests.ok('S20 consumidor vê só validated (56)', (select count(*) from public.creator_products) = 56 and not exists (select 1 from public.creator_products where status <> 'validated'));
select tests.expect_error('S20 consumidor não executa a RPC de status', $q$select public.admin_set_creator_product(public.seed_uuid('creator:lia'), public.seed_uuid('product:l1'), 'validated')$q$, 'forbidden');

-- 6) RPC admin_set_creator_product: valida, suspende, rejeita, cria, ordena; tudo auditado
select tests.anon();
select tests.expect_error('S20 visitante não executa a RPC de status', $q$select public.admin_set_creator_product(public.seed_uuid('creator:lia'), public.seed_uuid('product:l1'), 'validated')$q$, 'permission denied');
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select tests.ok('S20 admin vê tudo (61: 56 validadas + 4 de Lia + 1 de Rafael)', (select count(*) from public.creator_products) = 61);
create temporary table t_s20_v as select public.admin_set_creator_product(public.seed_uuid('creator:lia'), public.seed_uuid('product:l1'), 'validated', 'ok') as id;
select tests.ok('S20 admin valida a sugestão do herói: mesma linha, validated_by/validated_at preenchidos, created_by preservado, nota gravada',
  (select id from t_s20_v) = '50000000-0000-4000-8000-000000000001'
  and (select status = 'validated' and validated_by = '10000000-0000-4000-8000-000000000001' and validated_at is not null
         and created_by = '10000000-0000-4000-8000-000000000004' and note = 'ok' and sort_order = 100
       from public.creator_products where id = '50000000-0000-4000-8000-000000000001'));
select tests.anon();
select tests.ok('S20 validada pelo admin, a sugestão aparece ao público', (select count(*) from public.creator_products where id = '50000000-0000-4000-8000-000000000001') = 1);
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_set_creator_product(public.seed_uuid('creator:lia'), public.seed_uuid('product:l1'), 'suspended');
select tests.ok('S20 admin suspende: status suspended, validated_by/validated_at mantidos, nota mantida sem p_note',
  (select status = 'suspended' and validated_by = '10000000-0000-4000-8000-000000000001' and validated_at is not null and note = 'ok'
   from public.creator_products where id = '50000000-0000-4000-8000-000000000001'));
select tests.anon();
select tests.ok('S20 suspensa, some do público', (select count(*) from public.creator_products where id = '50000000-0000-4000-8000-000000000001') = 0);
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_set_creator_product(public.seed_uuid('creator:lia'), public.seed_uuid('product:l1'), 'rejected', 'Fora da linha editorial');
select tests.ok('S20 admin rejeita: status rejected e nota nova',
  (select status = 'rejected' and note = 'Fora da linha editorial' from public.creator_products where id = '50000000-0000-4000-8000-000000000001'));
select tests.expect_error('S20 RPC não aceita suggested', $q$select public.admin_set_creator_product(public.seed_uuid('creator:lia'), public.seed_uuid('product:l1'), 'suggested')$q$, 'invalid_status');
select tests.expect_error('S20 RPC recusa produto inexistente', $q$select public.admin_set_creator_product(public.seed_uuid('creator:lia'), gen_random_uuid(), 'validated')$q$, 'product_not_found');
select tests.expect_error('S20 RPC recusa herói inexistente', $q$select public.admin_set_creator_product(gen_random_uuid(), public.seed_uuid('product:l1'), 'validated')$q$, 'creator_not_found');
select public.admin_set_creator_product(public.seed_uuid('creator:lia'), public.seed_uuid('product:l1'), 'validated', null, 15);
select tests.ok('S20 p_sort altera sort_order (15) e revalida', (select status = 'validated' and sort_order = 15 from public.creator_products where id = '50000000-0000-4000-8000-000000000001'));
select public.admin_set_creator_product(public.seed_uuid('creator:lia'), public.seed_uuid('product:l1'), 'validated', '  ');
select tests.ok('S20 sem p_sort o sort_order fica (15); nota em branco não apaga a anterior',
  (select sort_order = 15 and note = 'Fora da linha editorial' from public.creator_products where id = '50000000-0000-4000-8000-000000000001'));
create temporary table t_s20_new as select public.admin_set_creator_product(public.seed_uuid('creator:rafael'), public.seed_uuid('product:k1'), 'validated', 'Kit da revisão semanal', 5) as id;
select tests.ok('S20 RPC cria e valida numa só chamada (created_by = admin, sort_order 5)',
  (select status = 'validated' and created_by = '10000000-0000-4000-8000-000000000001' and validated_by = '10000000-0000-4000-8000-000000000001' and sort_order = 5 and note = 'Kit da revisão semanal'
   from public.creator_products where id = (select id from t_s20_new) and creator_id = public.seed_uuid('creator:rafael') and product_id = public.seed_uuid('product:k1')));
select tests.ok('S20 cada chamada bem-sucedida da RPC gera auditoria creator_product.set_status (6), com ator admin e antes/depois',
  (select count(*) from public.admin_audit where action = 'creator_product.set_status') = 6
  and (select count(*) from public.admin_audit where action = 'creator_product.set_status' and resource_type = 'creator_product'
         and actor_id = '10000000-0000-4000-8000-000000000001' and actor_type = 'admin' and resource_id = '50000000-0000-4000-8000-000000000001') = 5
  and exists (select 1 from public.admin_audit where action = 'creator_product.set_status' and resource_id = '50000000-0000-4000-8000-000000000001'
              and before_data ->> 'status' = 'suggested' and after_data ->> 'status' = 'validated' and justification = 'ok')
  and exists (select 1 from public.admin_audit where action = 'creator_product.set_status' and resource_id = (select id::text from t_s20_new)
              and before_data is null and after_data ->> 'status' = 'validated' and (after_data ->> 'sort_order')::int = 5));
select tests.su();
select tests.ok('S20 RPC é security definer com search_path fixo, sem execute para anon e com execute para authenticated',
  (select p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%') from pg_proc p where p.oid = 'public.admin_set_creator_product(uuid, uuid, public.link_status, text, int)'::regprocedure)
  and not has_function_privilege('anon', 'public.admin_set_creator_product(uuid, uuid, public.link_status, text, int)', 'execute')
  and has_function_privilege('authenticated', 'public.admin_set_creator_product(uuid, uuid, public.link_status, text, int)', 'execute'));
select tests.ok('S20 políticas: 4 em creator_products, anon só no select, nenhuma avalia auth.uid()/is_admin()/my_creator_id() por linha',
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'creator_products') = 4
  and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'creator_products' and cmd <> 'SELECT' and 'anon' = any (roles))
  and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'creator_products'
         and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(^|[^T] )(auth\.uid|is_admin|my_creator_id)\(\)') = 0);
select tests.ok('S20 grants: anon só select; authenticated sem update (status muda só pela RPC)',
  has_table_privilege('anon', 'public.creator_products', 'select') and not has_table_privilege('anon', 'public.creator_products', 'insert')
  and has_table_privilege('authenticated', 'public.creator_products', 'insert') and has_table_privilege('authenticated', 'public.creator_products', 'delete')
  and not has_table_privilege('authenticated', 'public.creator_products', 'update'));
select tests.ok('S20 excluir o produto ou o herói leva a alocação junto (on delete cascade nas duas chaves)',
  (select count(*) from pg_constraint where conrelid = 'public.creator_products'::regclass and contype = 'f' and confdeltype = 'c') = 2);

-- ================================================================ S21 · rotina do dia: routine_items, routine_checks, routine_check, compute_streak (0022)
-- "Hoje" dentro do Perfil: itens de rotina só do dono (política única routine_items_own; até 20 ativos pelo
-- gatilho) e marcação diária lida pelo dono e escrita só pela RPC routine_check (security definer: exige item
-- próprio e ativo e calcula a data local pelo fuso). compute_streak conta um dia com conclusão de conteúdo OU
-- item de rotina marcado. consumer2 foi excluído no S11: a segunda pessoa aqui é s21 (…0021), criada neste
-- cenário sem nenhuma conclusão (isola a contagem da sequência) e apagada no fim (cascade, padrão do S17).
select tests.su();
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000021', 's21@test.local');

-- 1) consumer1 cria e edita itens; checks de título, nota e weekdays; limite de 20 ativos
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
insert into public.routine_items (id, user_id, title, note, time_of_day, weekdays, content_id, sort_order) values
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'Alongar ao acordar', 'Cinco minutos bastam', '07:00', array[1, 2, 3, 4, 5]::smallint[], null, 10),
  ('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Respiração antes de dormir', null, null, null, public.seed_uuid('content:r1'), 20),
  ('60000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'Caminhada longa', null, '18:30', array[0, 6]::smallint[], null, 30);
select tests.ok('S21 consumer1 cria itens com e sem horário, weekdays válidos e null (todos os dias), com e sem conteúdo vinculado',
  (select count(*) from public.routine_items) = 3
  and (select time_of_day = '07:00'::time and weekdays = array[1, 2, 3, 4, 5]::smallint[] and content_id is null and active and sort_order = 10 and note = 'Cinco minutos bastam'
       from public.routine_items where id = '60000000-0000-4000-8000-000000000001')
  and (select time_of_day is null and weekdays is null and content_id = public.seed_uuid('content:r1') and note is null and sort_order = 20
       from public.routine_items where id = '60000000-0000-4000-8000-000000000002')
  and (select time_of_day = '18:30'::time and weekdays = array[0, 6]::smallint[] from public.routine_items where id = '60000000-0000-4000-8000-000000000003'));
update public.routine_items set title = 'Alongar ao acordar (10 min)', time_of_day = '06:45', weekdays = array[1, 3, 5]::smallint[], sort_order = 5 where id = '60000000-0000-4000-8000-000000000001';
select tests.ok('S21 consumer1 edita o próprio item', (select title = 'Alongar ao acordar (10 min)' and time_of_day = '06:45'::time and weekdays = array[1, 3, 5]::smallint[] and sort_order = 5
  from public.routine_items where id = '60000000-0000-4000-8000-000000000001'));
select tests.expect_error('S21 consumer1 não transfere o item para outra pessoa', $q$update public.routine_items set user_id = '10000000-0000-4000-8000-000000000021' where id = '60000000-0000-4000-8000-000000000001'$q$, '42501');
-- checks do banco, pelo nome da constraint: assim 23514 aqui nunca se confunde com o routine_limit do gatilho
select tests.expect_error('S21 título vazio (só espaços) é recusado pelo check', $q$insert into public.routine_items (user_id, title) values ('10000000-0000-4000-8000-000000000002', '   ')$q$, 'violates check constraint "routine_items_title_check"');
select tests.expect_error('S21 título com 81 caracteres é recusado pelo check', $q$insert into public.routine_items (user_id, title) values ('10000000-0000-4000-8000-000000000002', repeat('a', 81))$q$, 'violates check constraint "routine_items_title_check"');
select tests.expect_error('S21 nota com 121 caracteres é recusada pelo check', $q$insert into public.routine_items (user_id, title, note) values ('10000000-0000-4000-8000-000000000002', 'Nota longa', repeat('n', 121))$q$, 'violates check constraint "routine_items_note_check"');
select tests.expect_error('S21 weekdays [7] é recusado pelo check', $q$insert into public.routine_items (user_id, title, weekdays) values ('10000000-0000-4000-8000-000000000002', 'Dia inválido', array[7]::smallint[])$q$, 'violates check constraint "routine_items_weekdays_check"');
select tests.expect_error('S21 weekdays [-1] é recusado pelo check', $q$insert into public.routine_items (user_id, title, weekdays) values ('10000000-0000-4000-8000-000000000002', 'Dia negativo', array[-1]::smallint[])$q$, 'violates check constraint "routine_items_weekdays_check"');
select tests.expect_error('S21 weekdays [] é recusado pelo check', $q$insert into public.routine_items (user_id, title, weekdays) values ('10000000-0000-4000-8000-000000000002', 'Sem dia', '{}'::smallint[])$q$, 'violates check constraint "routine_items_weekdays_check"');
-- weekdays repetido passa no check (subconjunto de 0..6 com cardinalidade 1..7): a normalização fica no app
insert into public.routine_items (id, user_id, title, weekdays, active) values ('60000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', 'Dia repetido', array[1, 1]::smallint[], false);
select tests.ok('S21 weekdays duplicado ([1,1]) é aceito pelo check (o app normaliza antes de gravar)', (select weekdays = array[1, 1]::smallint[] and not active from public.routine_items where id = '60000000-0000-4000-8000-000000000005'));
insert into public.routine_items (id, user_id, title, note) values ('60000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', repeat('t', 80), repeat('n', 120));
select tests.ok('S21 limites do check: título com 80 e nota com 120 caracteres são aceitos', exists (select 1 from public.routine_items where id = '60000000-0000-4000-8000-000000000006' and char_length(title) = 80 and char_length(note) = 120));
insert into public.routine_items (user_id, title, sort_order) select '10000000-0000-4000-8000-000000000002', 'Item de rotina ' || i, 100 + i from generate_series(1, 16) i;
select tests.ok('S21 20 itens ativos (o inativo não conta para o limite)', (select count(*) from public.routine_items where active) = 20 and (select count(*) from public.routine_items) = 21);
do $s21$
begin
  begin
    insert into public.routine_items (user_id, title) values ('10000000-0000-4000-8000-000000000002', 'Item 21');
    raise exception 'FAIL S21 o 21º item ativo foi aceito';
  exception when check_violation then
    perform tests.ok('S21 o 21º item ativo é recusado com routine_limit (23514)', sqlerrm = 'routine_limit');
  end;
end $s21$;
update public.routine_items set title = 'Item no limite, editado' where id = '60000000-0000-4000-8000-000000000006';
select tests.ok('S21 editar um item ativo no limite continua permitido (o próprio não conta contra si)', (select title from public.routine_items where id = '60000000-0000-4000-8000-000000000006') = 'Item no limite, editado');
update public.routine_items set active = false where id = '60000000-0000-4000-8000-000000000003';
insert into public.routine_items (id, user_id, title) values ('60000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'Entrou após desativar um');
select tests.ok('S21 desativar um item libera a vaga: o novo entra e seguem 20 ativos', (select count(*) from public.routine_items where active) = 20
  and exists (select 1 from public.routine_items where id = '60000000-0000-4000-8000-000000000004' and active));
select tests.expect_error('S21 reativar o item desativado com 20 ativos é recusado (routine_limit)', $q$update public.routine_items set active = true where id = '60000000-0000-4000-8000-000000000003'$q$, 'routine_limit');

-- 2) segunda pessoa e visitante: nada de ler, alterar ou apagar o que é de consumer1
select tests.login('10000000-0000-4000-8000-000000000021', 's21@test.local');
select tests.ok('S21 segunda pessoa não vê itens de consumer1 (0 linhas)', (select count(*) from public.routine_items) = 0);
do $s21$
declare n int;
begin
  update public.routine_items set title = 'invadido' where id = '60000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  perform tests.ok('S21 segunda pessoa não altera item de consumer1 (0 linhas)', n = 0);
  delete from public.routine_items where user_id = '10000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  perform tests.ok('S21 segunda pessoa não apaga itens de consumer1 (0 linhas)', n = 0);
end $s21$;
select tests.expect_error('S21 inserir item com user_id de outra pessoa é recusado', $q$insert into public.routine_items (user_id, title) values ('10000000-0000-4000-8000-000000000002', 'Falso')$q$, '42501');
select tests.anon();
select tests.expect_error('S21 visitante não lê routine_items (sem grant)', $q$select count(*) from public.routine_items$q$, 'permission denied');
select tests.expect_error('S21 visitante não lê routine_checks (sem grant)', $q$select count(*) from public.routine_checks$q$, 'permission denied');
select tests.expect_error('S21 visitante não grava routine_items (sem grant)', $q$insert into public.routine_items (user_id, title) values ('10000000-0000-4000-8000-000000000002', 'Falso')$q$, 'permission denied');
select tests.expect_error('S21 visitante não executa routine_check', $q$select public.routine_check('60000000-0000-4000-8000-000000000001', 'UTC')$q$, 'permission denied');
select tests.su();
select tests.ok('S21 itens de consumer1 intactos após as tentativas', (select count(*) from public.routine_items where user_id = '10000000-0000-4000-8000-000000000002') = 22
  and (select title from public.routine_items where id = '60000000-0000-4000-8000-000000000001') = 'Alongar ao acordar (10 min)');

-- 3) routine_checks: sem grant de escrita para authenticated (só a RPC grava)
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
select tests.expect_error('S21 consumer1 não insere marcação direto na tabela (sem grant)', $q$insert into public.routine_checks (user_id, item_id, local_date, timezone) values ('10000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000001', current_date, 'UTC')$q$, '42501');
select tests.expect_error('S21 consumer1 não altera marcação direto na tabela (sem grant)', $q$update public.routine_checks set done = false where user_id = '10000000-0000-4000-8000-000000000002'$q$, '42501');
select tests.expect_error('S21 consumer1 não apaga marcação direto na tabela (sem grant)', $q$delete from public.routine_checks where user_id = '10000000-0000-4000-8000-000000000002'$q$, '42501');

-- 4) RPC routine_check: posse e item ativo; data local pelo fuso; idempotente; desmarcar mantém a linha
select tests.login('10000000-0000-4000-8000-000000000021', 's21@test.local');
do $s21$
begin
  begin
    perform public.routine_check('60000000-0000-4000-8000-000000000001', 'America/Sao_Paulo');
    raise exception 'FAIL S21 segunda pessoa marcou item de consumer1';
  exception when insufficient_privilege then
    perform tests.ok('S21 segunda pessoa não marca item de consumer1 (routine_item_not_found, 42501)', sqlerrm = 'routine_item_not_found');
  end;
end $s21$;
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
select tests.expect_error('S21 item inativo não é marcado (routine_item_not_found)', $q$select public.routine_check('60000000-0000-4000-8000-000000000003', 'America/Sao_Paulo')$q$, 'routine_item_not_found');
select tests.expect_error('S21 item inexistente (routine_item_not_found)', $q$select public.routine_check(gen_random_uuid(), 'America/Sao_Paulo')$q$, 'routine_item_not_found');
select tests.expect_error('S21 fuso inválido é recusado (invalid_timezone)', $q$select public.routine_check('60000000-0000-4000-8000-000000000001', 'Marte/Olympus')$q$, 'invalid_timezone');
create temporary table t_s21_c1 as select public.routine_check('60000000-0000-4000-8000-000000000001', 'America/Sao_Paulo') as r;
select tests.ok('S21 consumer1 marca o item: done, local_date = local_date_for(fuso), fuso gravado e sequência igual a compute_streak',
  (select (r ->> 'done')::boolean and (r ->> 'local_date')::date = public.local_date_for('America/Sao_Paulo')
          and (r ->> 'streak')::int = public.compute_streak('10000000-0000-4000-8000-000000000002', 'America/Sao_Paulo') from t_s21_c1)
  and (select count(*) from public.routine_checks where item_id = '60000000-0000-4000-8000-000000000001') = 1
  and (select done and local_date = public.local_date_for('America/Sao_Paulo') and timezone = 'America/Sao_Paulo' and user_id = '10000000-0000-4000-8000-000000000002' and checked_at = now()
       from public.routine_checks where item_id = '60000000-0000-4000-8000-000000000001'));
select public.routine_check('60000000-0000-4000-8000-000000000001', 'America/Sao_Paulo');
select tests.ok('S21 marcar de novo não duplica (upsert na chave pessoa+item+dia)', (select count(*) from public.routine_checks where item_id = '60000000-0000-4000-8000-000000000001') = 1
  and (select count(*) from public.routine_checks) = 1);
create temporary table t_s21_c0 as select public.routine_check('60000000-0000-4000-8000-000000000001', 'America/Sao_Paulo', false) as r;
select tests.ok('S21 desmarcar (p_done=false) mantém a linha com done=false', (select not (r ->> 'done')::boolean from t_s21_c0)
  and (select count(*) = 1 and bool_and(not done) from public.routine_checks where item_id = '60000000-0000-4000-8000-000000000001'));
create temporary table t_s21_utc as select public.routine_check('60000000-0000-4000-8000-000000000002', '') as r;
select tests.ok('S21 fuso vazio cai em UTC (data local de UTC e timezone gravado = UTC)', (select (r ->> 'local_date')::date = public.local_date_for('UTC') from t_s21_utc)
  and (select done and local_date = public.local_date_for('UTC') and timezone = 'UTC' from public.routine_checks where item_id = '60000000-0000-4000-8000-000000000002'));
create temporary table t_s21_nul as select public.routine_check('60000000-0000-4000-8000-000000000004', null::text) as r;
select tests.ok('S21 fuso nulo também cai em UTC', (select (r ->> 'local_date')::date = public.local_date_for('UTC') from t_s21_nul)
  and (select timezone = 'UTC' from public.routine_checks where item_id = '60000000-0000-4000-8000-000000000004'));

-- 5) compute_streak: a segunda pessoa não tem conclusões, então a sequência vem só da rotina
select tests.login('10000000-0000-4000-8000-000000000021', 's21@test.local');
insert into public.routine_items (id, user_id, title) values ('60000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000021', 'Ler dez páginas');
select tests.ok('S21 segunda pessoa vê só o próprio item e começa com sequência 0', (select count(*) from public.routine_items) = 1
  and public.compute_streak('10000000-0000-4000-8000-000000000021', 'America/Sao_Paulo') = 0);
create temporary table t_s21_m1 as select public.routine_check('60000000-0000-4000-8000-000000000011', 'America/Sao_Paulo') as r;
select tests.ok('S21 item marcado hoje → sequência 1 (na RPC e em compute_streak)', (select (r ->> 'streak')::int from t_s21_m1) = 1
  and public.compute_streak('10000000-0000-4000-8000-000000000021', 'America/Sao_Paulo') = 1);
select tests.ok('S21 segunda pessoa lê só as próprias marcações', (select count(*) from public.routine_checks) = 1
  and not exists (select 1 from public.routine_checks where user_id <> '10000000-0000-4000-8000-000000000021'));
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
select tests.ok('S21 consumer1 lê só as próprias marcações (3) e não vê a da segunda pessoa', (select count(*) from public.routine_checks) = 3
  and not exists (select 1 from public.routine_checks where user_id <> '10000000-0000-4000-8000-000000000002'));
select tests.login('10000000-0000-4000-8000-000000000021', 's21@test.local');
create temporary table t_s21_m0 as select public.routine_check('60000000-0000-4000-8000-000000000011', 'America/Sao_Paulo', false) as r;
select tests.ok('S21 desmarcado → sequência 0', (select (r ->> 'streak')::int from t_s21_m0) = 0
  and public.compute_streak('10000000-0000-4000-8000-000000000021', 'America/Sao_Paulo') = 0);
select tests.su();
insert into public.routine_checks (user_id, item_id, local_date, done, timezone) values
  ('10000000-0000-4000-8000-000000000021', '60000000-0000-4000-8000-000000000011', public.local_date_for('America/Sao_Paulo') - 1, true, 'America/Sao_Paulo');
select tests.ok('S21 hoje ainda sem marcação não zera: conta a partir de ontem → 1', public.compute_streak('10000000-0000-4000-8000-000000000021', 'America/Sao_Paulo') = 1);
select tests.login('10000000-0000-4000-8000-000000000021', 's21@test.local');
create temporary table t_s21_m2 as select public.routine_check('60000000-0000-4000-8000-000000000011', 'America/Sao_Paulo') as r;
select tests.ok('S21 ontem (rotina) + hoje (rotina) → 2', (select (r ->> 'streak')::int from t_s21_m2) = 2);
select tests.su();
insert into public.streak_events (user_id, kind, ref_id, timezone, local_date) values
  ('10000000-0000-4000-8000-000000000021', 'completion', public.seed_uuid('content:r1'), 'America/Sao_Paulo', public.local_date_for('America/Sao_Paulo') - 2);
select tests.ok('S21 anteontem (conclusão de conteúdo) + ontem (rotina) + hoje (rotina) → 3', public.compute_streak('10000000-0000-4000-8000-000000000021', 'America/Sao_Paulo') = 3);
update public.routine_checks set done = false where user_id = '10000000-0000-4000-8000-000000000021' and local_date = public.local_date_for('America/Sao_Paulo') - 1;
select tests.ok('S21 dia sem nada no meio quebra a contagem (ontem desmarcado → só hoje = 1)', public.compute_streak('10000000-0000-4000-8000-000000000021', 'America/Sao_Paulo') = 1);

-- 6) cascata: apagar o item leva as marcações; apagar a conta leva itens, marcações e eventos (padrão do S17)
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
delete from public.routine_items where id = '60000000-0000-4000-8000-000000000001';
select tests.su();
select tests.ok('S21 apagar o item remove as marcações dele (cascade) e preserva as dos outros itens',
  not exists (select 1 from public.routine_items where id = '60000000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.routine_checks where item_id = '60000000-0000-4000-8000-000000000001')
  and (select count(*) from public.routine_checks where user_id = '10000000-0000-4000-8000-000000000002') = 2);
select tests.login('10000000-0000-4000-8000-000000000021', 's21@test.local');
select public.delete_my_account();
select tests.su();
select tests.ok('S21 excluir a conta remove itens, marcações e eventos de sequência (cascade de auth.users)',
  not exists (select 1 from auth.users where id = '10000000-0000-4000-8000-000000000021')
  and not exists (select 1 from public.routine_items where user_id = '10000000-0000-4000-8000-000000000021')
  and not exists (select 1 from public.routine_checks where user_id = '10000000-0000-4000-8000-000000000021')
  and not exists (select 1 from public.streak_events where user_id = '10000000-0000-4000-8000-000000000021')
  and (select count(*) from public.routine_items where user_id = '10000000-0000-4000-8000-000000000002') = 21);

-- 7) segurança: definer/search_path, grants, políticas initplan, RLS, gatilhos e chaves
select tests.ok('S21 routine_check é security definer com search_path fixo; routine_items_limit (gatilho) e compute_streak também com search_path fixo',
  (select p.prosecdef and p.proconfig @> array['search_path=public'] from pg_proc p where p.oid = 'public.routine_check(uuid, text, boolean)'::regprocedure)
  and (select not p.prosecdef and p.proconfig @> array['search_path=public'] from pg_proc p where p.oid = 'public.routine_items_limit()'::regprocedure)
  and (select p.prosecdef and p.provolatile = 's' and p.proconfig @> array['search_path=public'] from pg_proc p where p.oid = 'public.compute_streak(uuid, text)'::regprocedure));
select tests.ok('S21 grants: anon sem nada; authenticated com CRUD em routine_items e só select em routine_checks; RPCs sem anon',
  not has_table_privilege('anon', 'public.routine_items', 'select') and not has_table_privilege('anon', 'public.routine_checks', 'select')
  and has_table_privilege('authenticated', 'public.routine_items', 'select') and has_table_privilege('authenticated', 'public.routine_items', 'insert')
  and has_table_privilege('authenticated', 'public.routine_items', 'update') and has_table_privilege('authenticated', 'public.routine_items', 'delete')
  and has_table_privilege('authenticated', 'public.routine_checks', 'select') and not has_table_privilege('authenticated', 'public.routine_checks', 'insert')
  and not has_table_privilege('authenticated', 'public.routine_checks', 'update') and not has_table_privilege('authenticated', 'public.routine_checks', 'delete')
  and not has_function_privilege('anon', 'public.routine_check(uuid, text, boolean)', 'execute') and has_function_privilege('authenticated', 'public.routine_check(uuid, text, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.compute_streak(uuid, text)', 'execute') and has_function_privilege('authenticated', 'public.compute_streak(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.routine_items_limit()', 'execute'));
select tests.ok('S21 políticas: uma em routine_items (ALL) e uma em routine_checks (SELECT), só para authenticated, nenhuma avalia auth.uid() por linha (S14 segue verde)',
  (select count(*) = 1 and bool_and(cmd = 'ALL' and roles = '{authenticated}'::name[] and policyname = 'routine_items_own') from pg_policies where schemaname = 'public' and tablename = 'routine_items')
  and (select count(*) = 1 and bool_and(cmd = 'SELECT' and roles = '{authenticated}'::name[] and policyname = 'routine_checks_select_own') from pg_policies where schemaname = 'public' and tablename = 'routine_checks')
  and (select count(*) from pg_policies where schemaname = 'public' and tablename in ('routine_items', 'routine_checks')
         and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(^|[^T] )(auth\.uid|is_admin|my_creator_id)\(\)') = 0);
select tests.ok('S21 RLS ativa nas duas tabelas, gatilhos instalados e chaves: pessoa e item em cascade, conteúdo em set null',
  (select bool_and(c.relrowsecurity) from pg_class c where c.oid in ('public.routine_items'::regclass, 'public.routine_checks'::regclass))
  and exists (select 1 from pg_trigger where tgrelid = 'public.routine_items'::regclass and tgname = 'trg_routine_items_limit')
  and exists (select 1 from pg_trigger where tgrelid = 'public.routine_items'::regclass and tgname = 'trg_routine_items_updated')
  and (select confdeltype from pg_constraint where conrelid = 'public.routine_items'::regclass and contype = 'f' and confrelid = 'auth.users'::regclass) = 'c'
  and (select confdeltype from pg_constraint where conrelid = 'public.routine_items'::regclass and contype = 'f' and confrelid = 'public.content'::regclass) = 'n'
  and (select count(*) from pg_constraint where conrelid = 'public.routine_checks'::regclass and contype = 'f' and confdeltype = 'c') = 2
  and (select count(*) from pg_constraint where conrelid = 'public.routine_checks'::regclass and contype = 'p') = 1);

-- ================================================================ S22 · receitas por herói e etapa demonstrativa (0024)
-- creator_recipe_links: herói indica receitas assinadas por um chef. Público vê só validados; só o admin
-- escreve (RPC auditada), só receitas e nunca a receita do próprio herói. recipe_onboarding: uma linha por
-- pessoa, só do dono, listas fixas de restrições e alergias; some com a conta.
select tests.su();
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000022', 's22@test.local');

-- 1) seed: todo herói indica as receitas que não são dele, já validadas
select tests.ok('S22 seed: cada herói indica todas as receitas de outros chefs e nenhuma própria',
  (select count(*) from public.creator_recipe_links) =
    (select count(*) from public.creator_profiles cp join public.content c on c.type = 'recipe' and c.creator_id is not null and c.creator_id <> cp.id)
  and not exists (select 1 from public.creator_recipe_links l join public.content c on c.id = l.content_id where c.creator_id = l.creator_id or c.type <> 'recipe')
  and not exists (select 1 from public.creator_recipe_links where status <> 'validated'));

-- 2) visitante e consumidor leem só validados e não escrevem
select tests.su();
update public.creator_recipe_links set status = 'suspended' where creator_id = public.seed_uuid('creator:lia') and content_id = (select id from public.content where type = 'recipe' order by slug limit 1);
select tests.anon();
select tests.ok('S22 visitante vê vínculos validados e não vê o suspenso',
  (select count(*) from public.creator_recipe_links) > 0 and not exists (select 1 from public.creator_recipe_links where status <> 'validated'));
select tests.expect_error('S22 visitante não insere vínculo', $q$insert into public.creator_recipe_links (creator_id, content_id) values (public.seed_uuid('creator:lia'), (select id from public.content where type = 'recipe' limit 1))$q$, '42501');
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
select tests.expect_error('S22 consumidor não insere vínculo', $q$insert into public.creator_recipe_links (creator_id, content_id) values (public.seed_uuid('creator:lia'), (select id from public.content where type = 'recipe' limit 1))$q$, '42501');
select tests.expect_error('S22 consumidor não altera vínculos (sem grant)', $q$update public.creator_recipe_links set status = 'rejected'$q$, '42501');
select tests.expect_error('S22 consumidor não apaga vínculos (sem grant)', $q$delete from public.creator_recipe_links$q$, '42501');
select tests.expect_error('S22 consumidor não usa a RPC do admin', $q$select public.admin_set_creator_recipe(public.seed_uuid('creator:lia'), (select id from public.content where type = 'recipe' limit 1), 'validated')$q$, 'forbidden');
select tests.anon();
select tests.expect_error('S22 visitante não executa a RPC do admin', $q$select public.admin_set_creator_recipe(public.seed_uuid('creator:lia'), (select id from public.content where type = 'recipe' limit 1), 'validated')$q$, '42501');

-- 3) admin: RPC valida, recusa não-receita e receita própria, e audita
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select tests.ok('S22 admin vê também o vínculo suspenso', exists (select 1 from public.creator_recipe_links where status = 'suspended'));
select public.admin_set_creator_recipe(public.seed_uuid('creator:lia'), (select id from public.content where type = 'recipe' order by slug limit 1), 'validated', 5);
select tests.ok('S22 admin revalida o vínculo pela RPC (status, ordem, validated_by) e a ação fica auditada',
  (select status = 'validated' and sort_order = 5 and validated_by = '10000000-0000-4000-8000-000000000001' from public.creator_recipe_links
     where creator_id = public.seed_uuid('creator:lia') and content_id = (select id from public.content where type = 'recipe' order by slug limit 1))
  and exists (select 1 from public.admin_audit where action = 'creator_recipe.set_status'));
select tests.expect_error('S22 RPC recusa conteúdo que não é receita', $q$select public.admin_set_creator_recipe(public.seed_uuid('creator:lia'), (select id from public.content where type <> 'recipe' limit 1), 'validated')$q$, 'recipe_not_found');
select tests.expect_error('S22 RPC recusa ligar o herói à própria receita', $q$select public.admin_set_creator_recipe(c.creator_id, c.id, 'validated') from public.content c where c.type = 'recipe' and c.creator_id is not null limit 1$q$, 'own_recipe');
select tests.expect_error('S22 RPC recusa status inválido', $q$select public.admin_set_creator_recipe(public.seed_uuid('creator:lia'), (select id from public.content where type = 'recipe' limit 1), 'suggested')$q$, 'invalid_status');

-- 4) recipe_onboarding: só do dono, listas fixas, aviso obrigatório
select tests.login('10000000-0000-4000-8000-000000000022', 's22@test.local');
insert into public.recipe_onboarding (user_id, notice_accepted_at, restrictions, allergies) values ('10000000-0000-4000-8000-000000000022', now(), array['vegetarian'], array['peanut', 'egg']);
select tests.ok('S22 pessoa conclui a etapa com restrições e alergias das listas', (select restrictions = array['vegetarian'] and allergies = array['peanut', 'egg'] and completed_at is not null from public.recipe_onboarding));
update public.recipe_onboarding set allergies = '{}' where user_id = '10000000-0000-4000-8000-000000000022';
select tests.ok('S22 pessoa atualiza as próprias escolhas', (select allergies = '{}' from public.recipe_onboarding));
select tests.expect_error('S22 restrição fora da lista é recusada', $q$update public.recipe_onboarding set restrictions = array['carnivora'] where user_id = '10000000-0000-4000-8000-000000000022'$q$, 'violates check constraint');
select tests.expect_error('S22 alergia fora da lista é recusada', $q$update public.recipe_onboarding set allergies = array['texto livre'] where user_id = '10000000-0000-4000-8000-000000000022'$q$, 'violates check constraint');
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
select tests.ok('S22 outra pessoa não vê a etapa de ninguém', (select count(*) from public.recipe_onboarding) = 0);
select tests.expect_error('S22 outra pessoa não grava etapa em nome de outro', $q$insert into public.recipe_onboarding (user_id, notice_accepted_at) values ('10000000-0000-4000-8000-000000000022', now())$q$, '42501');
select tests.expect_error('S22 etapa sem aceite do aviso é recusada', $q$insert into public.recipe_onboarding (user_id, notice_accepted_at) values ('10000000-0000-4000-8000-000000000002', null)$q$, '23502');
do $s22$ declare n int; begin
  update public.recipe_onboarding set allergies = array['milk']; get diagnostics n = row_count;
  perform tests.ok('S22 outra pessoa não altera a etapa alheia (0 linhas)', n = 0);
  delete from public.recipe_onboarding; get diagnostics n = row_count;
  perform tests.ok('S22 outra pessoa não apaga a etapa alheia (0 linhas)', n = 0);
end $s22$;
select tests.anon();
select tests.expect_error('S22 visitante não lê a etapa', $q$select * from public.recipe_onboarding$q$, '42501');

-- 5) exclusão de conta leva a etapa junto (cascade)
select tests.login('10000000-0000-4000-8000-000000000022', 's22@test.local');
select public.delete_my_account();
select tests.su();
select tests.ok('S22 exclusão de conta apaga a etapa de receitas', not exists (select 1 from public.recipe_onboarding where user_id = '10000000-0000-4000-8000-000000000022'));

-- 6) segurança: RLS ativa, função do admin com search_path fixo e sem execute para anon
select tests.ok('S22 RLS ativa nas duas tabelas e RPC do admin security definer com search_path fixo, sem execute para anon',
  (select bool_and(relrowsecurity) from pg_class where oid in ('public.creator_recipe_links'::regclass, 'public.recipe_onboarding'::regclass))
  and (select prosecdef and proconfig is not null from pg_proc where oid = 'public.admin_set_creator_recipe(uuid, uuid, public.link_status, int)'::regprocedure)
  and not has_function_privilege('anon', 'public.admin_set_creator_recipe(uuid, uuid, public.link_status, int)', 'execute'));

-- ================================================================ S23 · publicação direta pelo herói (0025)
-- creator_publish_content: o dono publica o próprio rascunho sem fila do admin (vídeo do celular =
-- cloudflare_stream + licença 'own'); sem regra de acesso vira free, premium do admin é preservado.
-- creator_unpublish_content: volta a rascunho editável. O admin segue arquivando depois; o fluxo de
-- revisão antigo continua. Tudo que este cenário publica termina fora do ar (o S14 conta 40 no ar).
select tests.su();
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000023', 's23hero@test.local');
-- segundo herói: vincula o Rafael do seed a um usuário de teste (desfeito no fim do cenário)
update public.creator_profiles set user_id = '10000000-0000-4000-8000-000000000023' where id = public.seed_uuid('creator:rafael') and user_id is null;
select tests.ok('S23 licença own + cloudflare_stream é aceita (vídeo gravado pelo herói)',
  public.media_license_compatible('cloudflare_stream', 'own') and not public.media_license_compatible('cloudflare_stream', 'third_party_embed'));
select tests.ok('S23 RPCs security definer, search_path fixo, executáveis por authenticated e service_role e nunca por anon',
  (select bool_and(p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
                   and has_function_privilege('authenticated', p.oid, 'execute') and has_function_privilege('service_role', p.oid, 'execute')
                   and not has_function_privilege('anon', p.oid, 'execute'))
   from pg_proc p where p.oid in ('public.creator_publish_content(uuid)'::regprocedure, 'public.creator_unpublish_content(uuid)'::regprocedure)));

-- 1) rascunhos do herói (creator1 = Lia): vídeo do celular, vídeo que o admin marca premium,
--    guia sem corpo, vídeo sem mídia e guia com título em branco. Desde a 0026 o uid do Stream
--    precisa de vínculo em stream_uploads (gravado pelo servidor no ticket): o sistema registra antes.
insert into public.stream_uploads (uid, creator_id, expires_at)
select u, public.seed_uuid('creator:lia'), now() + interval '30 minutes'
from unnest(array['a2300000000000000000000000000001', 'a2300000000000000000000000000002', 'a2300000000000000000000000000004', 'a230000000000000000000000000001b']) as u;
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
insert into public.content (id, slug, creator_id, pillar, type, title, summary, media_license_kind) values
  ('23000000-0000-4000-8000-000000000001', 's23-video-celular', public.seed_uuid('creator:lia'), 'training', 'video', 'Treino relampago S23 gravado no celular', 'Vídeo curto do herói', 'own'),
  ('23000000-0000-4000-8000-000000000002', 's23-video-premium', public.seed_uuid('creator:lia'), 'training', 'video', 'Video premium S23', null, 'own'),
  ('23000000-0000-4000-8000-000000000003', 's23-guia-sem-corpo', public.seed_uuid('creator:lia'), 'routine', 'guide', 'Guia S23 sem corpo', null, 'platform_demo'),
  ('23000000-0000-4000-8000-000000000004', 's23-video-sem-midia', public.seed_uuid('creator:lia'), 'training', 'video', 'Video S23 sem midia', null, 'own'),
  ('23000000-0000-4000-8000-000000000005', 's23-titulo-branco', public.seed_uuid('creator:lia'), 'routine', 'guide', '   ', null, 'platform_demo');
insert into public.content_bodies (content_id, body, media_provider, media_ref) values
  ('23000000-0000-4000-8000-000000000001', '{"kind":"video","intro":""}', 'cloudflare_stream', 'a2300000000000000000000000000001'),
  ('23000000-0000-4000-8000-000000000002', '{"kind":"video","intro":"x"}', 'cloudflare_stream', 'a2300000000000000000000000000002'),
  ('23000000-0000-4000-8000-000000000004', '{}', 'none', null),
  ('23000000-0000-4000-8000-000000000005', '{"kind":"guide","sections":[{"heading":"a","text":"b"}]}', 'none', null);
select tests.ok('S23 rascunhos criados sem regra de acesso', (select count(*) from public.content where id::text like '23000000-%' and status = 'draft' and access_level is null) = 5);
select tests.anon();
select tests.ok('S23 visitante não vê o rascunho antes de publicar', (select count(*) from public.content where id = '23000000-0000-4000-8000-000000000001') = 0);

-- 2) quem não é dono não publica: visitante sem execute, consumidor e outro herói recebem forbidden
select tests.expect_error('S23 visitante não executa creator_publish_content', $q$select public.creator_publish_content('23000000-0000-4000-8000-000000000001')$q$, 'permission denied');
select tests.expect_error('S23 visitante não executa creator_unpublish_content', $q$select public.creator_unpublish_content('23000000-0000-4000-8000-000000000001')$q$, 'permission denied');
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
select tests.expect_error('S23 consumidor não publica conteúdo do herói', $q$select public.creator_publish_content('23000000-0000-4000-8000-000000000001')$q$, 'forbidden');
select tests.expect_error('S23 consumidor recebe forbidden também para id inexistente', $q$select public.creator_publish_content(gen_random_uuid())$q$, 'forbidden');
select tests.login('10000000-0000-4000-8000-000000000023', 's23hero@test.local');
select tests.ok('S23 segundo herói está vinculado ao Rafael', public.my_creator_id() = public.seed_uuid('creator:rafael'));
select tests.expect_error('S23 outro herói não publica rascunho alheio', $q$select public.creator_publish_content('23000000-0000-4000-8000-000000000001')$q$, '42501');
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select tests.expect_error('S23 admin sem perfil de herói também não usa a RPC do herói (tem as próprias)', $q$select public.creator_publish_content('23000000-0000-4000-8000-000000000001')$q$, 'forbidden');
select tests.su();
select tests.ok('S23 tentativas recusadas não mudaram nada nem auditaram', (select status = 'draft' and review_status = 'none' from public.content where id = '23000000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.admin_audit where action = 'content.creator_publish'));

-- 3) o dono publica o vídeo: no ar, free, autoaprovação registrada e auditada
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
create temporary table t_s23_pub as select public.creator_publish_content('23000000-0000-4000-8000-000000000001') as r;
select tests.ok('S23 retorno {id, slug, status}', (select r = jsonb_build_object('id', '23000000-0000-4000-8000-000000000001'::uuid, 'slug', 's23-video-celular', 'status', 'published') from t_s23_pub));
select tests.ok('S23 publicado, aprovado, free, published_at agora, sem agendamento e no ar',
  (select status = 'published' and review_status = 'approved' and access_level = 'free' and required_module_id is null
          and published_at = now() and publish_at is null and public.content_is_live(status, publish_at)
   from public.content where id = '23000000-0000-4000-8000-000000000001'));
select tests.ok('S23 rodada de autoaprovação registrada (dono decide, feedback padrão) e visível ao herói',
  (select count(*) = 1 and bool_and(decision = 'approved' and submitted_by = '10000000-0000-4000-8000-000000000004' and decided_by = '10000000-0000-4000-8000-000000000004'
                                    and decided_at is not null and feedback = 'Publicação direta pelo herói' and round = 1)
   from public.content_reviews where content_id = '23000000-0000-4000-8000-000000000001'));
select tests.expect_error('S23 publicar de novo: not_draft', $q$select public.creator_publish_content('23000000-0000-4000-8000-000000000001')$q$, 'not_draft');
select tests.expect_error('S23 publicado não é editável pelo herói (guarda segue ligada)', $q$update public.content set title = 'x' where id = '23000000-0000-4000-8000-000000000001'$q$, 'content_not_editable');
do $s23$ declare n int; begin
  update public.content_bodies set media_ref = 'outro' where content_id = '23000000-0000-4000-8000-000000000001'; get diagnostics n = row_count;
  perform tests.ok('S23 herói não altera o corpo publicado (RLS do corpo: 0 linhas)', n = 0
    and (select media_ref from public.content_bodies where content_id = '23000000-0000-4000-8000-000000000001') = 'a2300000000000000000000000000001');
end $s23$;
select tests.ok('S23 sinalizador de confiança desligado após a RPC', not public.is_trusted_call());
select tests.anon();
select tests.ok('S23 visitante vê o vídeo publicado (select)', (select count(*) from public.content where id = '23000000-0000-4000-8000-000000000001') = 1);
select tests.ok('S23 visitante encontra no explore_feed', exists (select 1 from public.explore_feed(null, 'video', null, null, 7, 100, 0) where id = '23000000-0000-4000-8000-000000000001'));
select tests.ok('S23 visitante encontra no search_content', exists (select 1 from public.search_content('relampago S23') where id = '23000000-0000-4000-8000-000000000001'));
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
select tests.ok('S23 consumidor logado consome o vídeo free e lê o corpo', public.can_access_content('23000000-0000-4000-8000-000000000001')
  and (select count(*) from public.content_bodies where content_id = '23000000-0000-4000-8000-000000000001') = 1);
select tests.su();
select tests.ok('S23 auditoria content.creator_publish com ator herói, antes e depois',
  exists (select 1 from public.admin_audit where action = 'content.creator_publish' and resource_type = 'content'
            and resource_id = '23000000-0000-4000-8000-000000000001' and actor_id = '10000000-0000-4000-8000-000000000004' and actor_type = 'creator'
            and before_data ->> 'status' = 'draft' and before_data -> 'access_level' = 'null'::jsonb
            and after_data ->> 'status' = 'published' and after_data ->> 'access_level' = 'free' and after_data ->> 'media_provider' = 'cloudflare_stream'));

-- 4) premium definido pelo admin é preservado
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
update public.content set access_level = 'premium', required_module_id = public.seed_uuid('module:training_full') where id = '23000000-0000-4000-8000-000000000002';
select tests.login('10000000-0000-4000-8000-000000000023', 's23hero@test.local');
select tests.expect_error('S23 outro herói não despublica nem publica o premium alheio', $q$select public.creator_publish_content('23000000-0000-4000-8000-000000000002')$q$, 'forbidden');
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
select public.creator_publish_content('23000000-0000-4000-8000-000000000002');
select tests.ok('S23 premium do admin preservado com o mesmo módulo', (select status = 'published' and access_level = 'premium' and required_module_id = public.seed_uuid('module:training_full')
  from public.content where id = '23000000-0000-4000-8000-000000000002'));
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
select tests.ok('S23 premium no ar não libera consumo sem o módulo', not public.can_access_content('23000000-0000-4000-8000-000000000002'));
select tests.login('10000000-0000-4000-8000-000000000023', 's23hero@test.local');
select tests.expect_error('S23 outro herói não despublica conteúdo alheio', $q$select public.creator_unpublish_content('23000000-0000-4000-8000-000000000002')$q$, 'forbidden');
-- o admin continua governando depois: arquiva o publicado pelo herói, que não volta ao ar por conta própria
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_set_content_status('23000000-0000-4000-8000-000000000002', 'archived', 'Teste S23: admin arquiva publicação direta');
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
select tests.expect_error('S23 arquivado pelo admin: herói não despublica (not_published)', $q$select public.creator_unpublish_content('23000000-0000-4000-8000-000000000002')$q$, 'not_published');
select tests.expect_error('S23 arquivado pelo admin: herói não republica (not_draft)', $q$select public.creator_publish_content('23000000-0000-4000-8000-000000000002')$q$, 'not_draft');

-- 5) pré-condições: corpo, mídia do vídeo, título e licença
select tests.expect_error('S23 sem content_bodies: missing_body', $q$select public.creator_publish_content('23000000-0000-4000-8000-000000000003')$q$, 'missing_body');
select tests.expect_error('S23 vídeo sem media_ref e sem corpo: missing_media', $q$select public.creator_publish_content('23000000-0000-4000-8000-000000000004')$q$, 'missing_media');
-- uid em branco não passa pelo gatilho da 0026 para o herói; o sistema grava para testar a RPC
select tests.su();
update public.content_bodies set body = '{"kind":"video","intro":"texto"}', media_provider = 'cloudflare_stream', media_ref = '  ' where content_id = '23000000-0000-4000-8000-000000000004';
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
select tests.expect_error('S23 vídeo com media_ref em branco (mesmo com corpo): missing_media', $q$select public.creator_publish_content('23000000-0000-4000-8000-000000000004')$q$, 'missing_media');
select tests.expect_error('S23 título em branco: missing_title', $q$select public.creator_publish_content('23000000-0000-4000-8000-000000000005')$q$, 'missing_title');
update public.content_bodies set media_ref = 'a2300000000000000000000000000004' where content_id = '23000000-0000-4000-8000-000000000004';
update public.content set media_license_kind = 'third_party_embed' where id = '23000000-0000-4000-8000-000000000004'; -- estado transitório: o corpo é a escrita final
select tests.expect_error('S23 licença incoerente com o provedor: checagem da aprovação barra', $q$select public.creator_publish_content('23000000-0000-4000-8000-000000000004')$q$, 'media_license_mismatch');
update public.content set media_license_kind = 'own' where id = '23000000-0000-4000-8000-000000000004'; -- o S16 exige licença coerente em todos os corpos
select tests.ok('S23 falhas de pré-condição deixam tudo em rascunho e sem rodada de revisão',
  (select count(*) from public.content where id in ('23000000-0000-4000-8000-000000000003', '23000000-0000-4000-8000-000000000004', '23000000-0000-4000-8000-000000000005') and status = 'draft' and access_level is null) = 3
  and not exists (select 1 from public.content_reviews where content_id in ('23000000-0000-4000-8000-000000000003', '23000000-0000-4000-8000-000000000004', '23000000-0000-4000-8000-000000000005')));

-- 6) fluxo antigo segue: enviado à revisão e depois publicado direto fecha a rodada aberta (sem duplicar)
insert into public.content_bodies (content_id, body) values ('23000000-0000-4000-8000-000000000003', '{"kind":"guide","sections":[{"heading":"a","text":"b"}]}');
select public.submit_content_for_review('23000000-0000-4000-8000-000000000003');
select tests.ok('S23 submit_content_for_review continua funcionando', (select review_status from public.content where id = '23000000-0000-4000-8000-000000000003') = 'in_review');
select public.creator_publish_content('23000000-0000-4000-8000-000000000003');
select tests.ok('S23 publicar direto um conteúdo em revisão fecha a rodada aberta como aprovada',
  (select status = 'published' and review_status = 'approved' from public.content where id = '23000000-0000-4000-8000-000000000003')
  and (select count(*) = 1 and bool_and(decision = 'approved' and decided_by = '10000000-0000-4000-8000-000000000004')
       from public.content_reviews where content_id = '23000000-0000-4000-8000-000000000003'));

-- 7) despublicar volta a rascunho editável e tira do ar
select tests.expect_error('S23 despublicar rascunho: not_published', $q$select public.creator_unpublish_content('23000000-0000-4000-8000-000000000005')$q$, 'not_published');
create temporary table t_s23_unpub as select public.creator_unpublish_content('23000000-0000-4000-8000-000000000001') as r;
select tests.ok('S23 despublicar devolve {id, slug, status=draft}', (select r = jsonb_build_object('id', '23000000-0000-4000-8000-000000000001'::uuid, 'slug', 's23-video-celular', 'status', 'draft') from t_s23_unpub));
select tests.ok('S23 despublicado: rascunho, review_status none, sem agendamento, regra de acesso mantida',
  (select status = 'draft' and review_status = 'none' and publish_at is null and access_level = 'free' from public.content where id = '23000000-0000-4000-8000-000000000001'));
update public.content set title = 'Treino relampago S23 editado' where id = '23000000-0000-4000-8000-000000000001';
update public.content_bodies set media_ref = 'a230000000000000000000000000001b' where content_id = '23000000-0000-4000-8000-000000000001';
select tests.ok('S23 dono edita título e mídia depois de despublicar', (select c.title = 'Treino relampago S23 editado' and b.media_ref = 'a230000000000000000000000000001b'
  from public.content c join public.content_bodies b on b.content_id = c.id where c.id = '23000000-0000-4000-8000-000000000001'));
select tests.expect_error('S23 despublicar de novo: not_published', $q$select public.creator_unpublish_content('23000000-0000-4000-8000-000000000001')$q$, 'not_published');
select tests.anon();
select tests.ok('S23 despublicado some do select, do explore_feed e da busca do visitante',
  (select count(*) from public.content where id = '23000000-0000-4000-8000-000000000001') = 0
  and not exists (select 1 from public.explore_feed(null, null, null, null, 7, 100, 0) where id = '23000000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.search_content('relampago S23') where id = '23000000-0000-4000-8000-000000000001'));
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
select public.creator_publish_content('23000000-0000-4000-8000-000000000001');
select tests.ok('S23 republicar depois de editar abre a 2ª rodada de autoaprovação', (select status from public.content where id = '23000000-0000-4000-8000-000000000001') = 'published'
  and (select array_agg(round order by round) from public.content_reviews where content_id = '23000000-0000-4000-8000-000000000001') = array[1, 2]);
select public.creator_unpublish_content('23000000-0000-4000-8000-000000000001');
select public.creator_unpublish_content('23000000-0000-4000-8000-000000000003');
select tests.su();
select tests.ok('S23 auditoria content.creator_unpublish com ator herói', (select count(*) from public.admin_audit where action = 'content.creator_unpublish'
  and actor_type = 'creator' and actor_id = '10000000-0000-4000-8000-000000000004' and before_data ->> 'status' = 'published' and after_data ->> 'status' = 'draft') = 3);

-- 8) limpeza: nada do S23 fica no ar e o Rafael volta sem usuário (S14/S15 contam o catálogo)
update public.creator_profiles set user_id = null where id = public.seed_uuid('creator:rafael') and user_id = '10000000-0000-4000-8000-000000000023';
select tests.ok('S23 nada do cenário ficou no ar', not exists (select 1 from public.content where id::text like '23000000-%' and status = 'published'));

-- ================================================================ S24 · dono do vídeo do Stream amarrado no banco (0026)
-- stream_uploads é gravada só pelo servidor (service role) no ticket; o herói lê os próprios.
-- Gatilho em content_bodies: cloudflare_stream exige vínculo do próprio herói (não descartado).
-- creator_publish_content recusa uid sem vínculo; creator_discard_video_draft apaga só rascunho de
-- vídeo próprio nunca publicado; creator_set_draft_slug troca o slug do rascunho nunca publicado.
-- Tudo termina fora do ar (o S14 conta 40 no ar) e o Rafael volta sem usuário.
select tests.su();
update public.creator_profiles set user_id = '10000000-0000-4000-8000-000000000023' where id = public.seed_uuid('creator:rafael') and user_id is null;
select tests.ok('S24 stream_uploads com RLS e uma única política (SELECT, só authenticated, initplan)',
  (select relrowsecurity from pg_class where oid = 'public.stream_uploads'::regclass)
  and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'stream_uploads') = 1
  and (select bool_and(cmd = 'SELECT' and roles = '{authenticated}') from pg_policies where schemaname = 'public' and tablename = 'stream_uploads'));
select tests.ok('S24 sem escrita para anon/authenticated; service_role escreve',
  not has_table_privilege('anon', 'public.stream_uploads', 'select') and not has_table_privilege('anon', 'public.stream_uploads', 'insert')
  and not has_table_privilege('authenticated', 'public.stream_uploads', 'insert') and not has_table_privilege('authenticated', 'public.stream_uploads', 'update')
  and not has_table_privilege('authenticated', 'public.stream_uploads', 'delete') and has_table_privilege('authenticated', 'public.stream_uploads', 'select')
  and has_table_privilege('service_role', 'public.stream_uploads', 'insert') and has_table_privilege('service_role', 'public.stream_uploads', 'update'));
select tests.ok('S24 RPCs novas security definer, search_path fixo, executáveis por authenticated e service_role e nunca por anon',
  (select bool_and(p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
                   and has_function_privilege('authenticated', p.oid, 'execute') and has_function_privilege('service_role', p.oid, 'execute')
                   and not has_function_privilege('anon', p.oid, 'execute'))
   from pg_proc p where p.oid in ('public.creator_discard_video_draft(uuid)'::regprocedure, 'public.creator_set_draft_slug(uuid, text)'::regprocedure,
                                  'public.creator_publish_content(uuid)'::regprocedure)));
select tests.ok('S24 gatilhos ligados (limite por hora e guarda do corpo)',
  exists (select 1 from pg_trigger where tgname = 'trg_a_stream_uploads_rate_limit' and tgrelid = 'public.stream_uploads'::regclass)
  and exists (select 1 from pg_trigger where tgname = 'trg_a_content_bodies_stream' and tgrelid = 'public.content_bodies'::regclass));

-- envios registrados pelo sistema: três da Lia e um do Rafael
insert into public.stream_uploads (uid, creator_id, expires_at) values
  ('a2400000000000000000000000000001', public.seed_uuid('creator:lia'), now() + interval '30 minutes'),
  ('a2400000000000000000000000000002', public.seed_uuid('creator:lia'), now() + interval '30 minutes'),
  ('a2400000000000000000000000000003', public.seed_uuid('creator:lia'), now() + interval '30 minutes'),
  ('a24000000000000000000000000000f1', public.seed_uuid('creator:rafael'), now() + interval '30 minutes');
select tests.expect_error('S24 uid fora do formato do Stream é recusado', $q$insert into public.stream_uploads (uid, creator_id, expires_at) values ('../x', public.seed_uuid('creator:lia'), now())$q$, '23514');

-- 1) herói lê só os próprios envios e não escreve na tabela
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
select tests.ok('S24 herói vê só os próprios envios', (select count(*) from public.stream_uploads where uid like 'a24%') = 3
  and not exists (select 1 from public.stream_uploads where uid = 'a24000000000000000000000000000f1'));
select tests.expect_error('S24 herói não insere em stream_uploads', $q$insert into public.stream_uploads (uid, creator_id, expires_at) values ('a24000000000000000000000000000aa', public.seed_uuid('creator:lia'), now() + interval '1 hour')$q$, 'permission denied');
select tests.expect_error('S24 herói não reabre envio (update)', $q$update public.stream_uploads set discarded_at = null where uid = 'a2400000000000000000000000000001'$q$, 'permission denied');
select tests.expect_error('S24 herói não apaga envio', $q$delete from public.stream_uploads where uid = 'a2400000000000000000000000000001'$q$, 'permission denied');
select tests.anon();
select tests.expect_error('S24 visitante não lê stream_uploads', $q$select count(*) from public.stream_uploads$q$, 'permission denied');
select tests.expect_error('S24 visitante não executa creator_discard_video_draft', $q$select public.creator_discard_video_draft('24000000-0000-4000-8000-000000000001')$q$, 'permission denied');
select tests.expect_error('S24 visitante não executa creator_set_draft_slug', $q$select public.creator_set_draft_slug('24000000-0000-4000-8000-000000000001', 'x')$q$, 'permission denied');

-- 2) rascunhos da Lia: gravar cloudflare_stream exige vínculo próprio
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
insert into public.content (id, slug, creator_id, pillar, type, title, media_license_kind) values
  ('24000000-0000-4000-8000-000000000001', 'post-em-video-s24a', public.seed_uuid('creator:lia'), 'training', 'video', 'Video S24 publicado', 'own'),
  ('24000000-0000-4000-8000-000000000002', 'post-em-video-s24b', public.seed_uuid('creator:lia'), 'training', 'video', 'Video S24 descartado', 'own'),
  ('24000000-0000-4000-8000-000000000003', 'post-em-video-s24c', public.seed_uuid('creator:lia'), 'training', 'video', 'Video S24 slug', 'own'),
  ('24000000-0000-4000-8000-000000000004', 's24-guia', public.seed_uuid('creator:lia'), 'routine', 'guide', 'Guia S24', 'platform_demo');
select tests.expect_error('S24 herói não grava cloudflare_stream sem vínculo', $q$insert into public.content_bodies (content_id, body, media_provider, media_ref) values ('24000000-0000-4000-8000-000000000001', '{"kind":"video"}', 'cloudflare_stream', 'a24000000000000000000000000000ee')$q$, 'stream_media_forbidden');
select tests.expect_error('S24 herói não grava o uid de outro herói (público no cover_url)', $q$insert into public.content_bodies (content_id, body, media_provider, media_ref) values ('24000000-0000-4000-8000-000000000001', '{"kind":"video"}', 'cloudflare_stream', 'a24000000000000000000000000000f1')$q$, 'stream_media_forbidden');
insert into public.content_bodies (content_id, body, media_provider, media_ref) values
  ('24000000-0000-4000-8000-000000000001', '{"kind":"video","intro":""}', 'cloudflare_stream', 'a2400000000000000000000000000001'),
  ('24000000-0000-4000-8000-000000000002', '{"kind":"video","intro":""}', 'cloudflare_stream', 'a2400000000000000000000000000002'),
  ('24000000-0000-4000-8000-000000000003', '{"kind":"video","intro":""}', 'cloudflare_stream', 'a2400000000000000000000000000003');
select tests.ok('S24 com vínculo próprio grava', (select count(*) from public.content_bodies where content_id::text like '24000000-%' and media_provider = 'cloudflare_stream') = 3);
select tests.expect_error('S24 herói não troca o uid por um de outro herói (update)', $q$update public.content_bodies set media_ref = 'a24000000000000000000000000000f1' where content_id = '24000000-0000-4000-8000-000000000001'$q$, 'stream_media_forbidden');
update public.content_bodies set body = '{"kind":"video","intro":"texto novo"}' where content_id = '24000000-0000-4000-8000-000000000001';
select tests.ok('S24 editar o texto do corpo sem mexer na mídia continua livre', (select body ->> 'intro' from public.content_bodies where content_id = '24000000-0000-4000-8000-000000000001') = 'texto novo');
select tests.login('10000000-0000-4000-8000-000000000023', 's23hero@test.local');
insert into public.content (id, slug, creator_id, pillar, type, title, media_license_kind) values
  ('24000000-0000-4000-8000-000000000005', 's24-rafael', public.seed_uuid('creator:rafael'), 'training', 'video', 'Video S24 Rafael', 'own');
select tests.expect_error('S24 outro herói não grava o uid da Lia no próprio rascunho', $q$insert into public.content_bodies (content_id, body, media_provider, media_ref) values ('24000000-0000-4000-8000-000000000005', '{"kind":"video"}', 'cloudflare_stream', 'a2400000000000000000000000000001')$q$, 'stream_media_forbidden');
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
insert into public.content_bodies (content_id, body, media_provider, media_ref) values ('24000000-0000-4000-8000-000000000005', '{"kind":"video"}', 'cloudflare_stream', 'a24000000000000000000000000000ee');
select tests.ok('S24 admin grava sem vínculo (governa o catálogo)', exists (select 1 from public.content_bodies where content_id = '24000000-0000-4000-8000-000000000005'));

-- 3) publicar recusa uid sem vínculo do próprio herói (corpo gravado por caminho de sistema ou antigo)
select tests.login('10000000-0000-4000-8000-000000000023', 's23hero@test.local');
select tests.expect_error('S24 publicar com uid sem vínculo do herói: forbidden', $q$select public.creator_publish_content('24000000-0000-4000-8000-000000000005')$q$, 'forbidden');
select tests.su();
update public.content_bodies set media_ref = 'a24000000000000000000000000000ff' where content_id = '24000000-0000-4000-8000-000000000003';
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
select tests.expect_error('S24 publicar com uid trocado fora do gatilho: forbidden', $q$select public.creator_publish_content('24000000-0000-4000-8000-000000000003')$q$, 'forbidden');
select tests.su();
update public.content_bodies set media_ref = 'a2400000000000000000000000000003' where content_id = '24000000-0000-4000-8000-000000000003';
update public.stream_uploads set discarded_at = now() where uid = 'a2400000000000000000000000000003';
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
select tests.expect_error('S24 publicar com envio descartado: forbidden', $q$select public.creator_publish_content('24000000-0000-4000-8000-000000000003')$q$, 'forbidden');
select tests.su();
select tests.ok('S24 publicações recusadas deixam rascunho', (select count(*) from public.content where id in ('24000000-0000-4000-8000-000000000003', '24000000-0000-4000-8000-000000000005') and status = 'draft') = 2);

-- 4) limite: mais de 10 envios do mesmo herói na última hora é recusado; envios antigos não contam
select tests.su();
insert into public.stream_uploads (uid, creator_id, expires_at)
select md5('s24-rate-' || g), public.seed_uuid('creator:davi'), now() + interval '30 minutes' from generate_series(1, 10) g;
select tests.expect_error('S24 11º envio na mesma hora: too_many_uploads', $q$insert into public.stream_uploads (uid, creator_id, expires_at) values (md5('s24-rate-11'), public.seed_uuid('creator:davi'), now() + interval '30 minutes')$q$, 'too_many_uploads');
insert into public.stream_uploads (uid, creator_id, created_at, expires_at)
select md5('s24-old-' || g), public.seed_uuid('creator:bruna'), now() - interval '2 hours', now() - interval '90 minutes' from generate_series(1, 12) g;
insert into public.stream_uploads (uid, creator_id, expires_at) values (md5('s24-old-new'), public.seed_uuid('creator:bruna'), now() + interval '30 minutes');
select tests.ok('S24 limite conta só a última hora (12 antigos + 1 novo aceitos) e é por herói',
  (select count(*) from public.stream_uploads where creator_id = public.seed_uuid('creator:bruna')) = 13
  and (select count(*) from public.stream_uploads where creator_id = public.seed_uuid('creator:davi')) = 10);

-- 5) descartar: só rascunho de vídeo próprio nunca publicado
select tests.login('10000000-0000-4000-8000-000000000023', 's23hero@test.local');
select tests.expect_error('S24 outro herói não descarta rascunho alheio', $q$select public.creator_discard_video_draft('24000000-0000-4000-8000-000000000002')$q$, 'forbidden');
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
select tests.expect_error('S24 consumidor não descarta', $q$select public.creator_discard_video_draft('24000000-0000-4000-8000-000000000002')$q$, 'forbidden');
select tests.expect_error('S24 id inexistente também responde forbidden', $q$select public.creator_discard_video_draft(gen_random_uuid())$q$, 'forbidden');
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
select tests.expect_error('S24 rascunho sem vídeo do Stream: not_stream', $q$select public.creator_discard_video_draft('24000000-0000-4000-8000-000000000004')$q$, 'not_stream');
create temporary table t_s24_discard as select public.creator_discard_video_draft('24000000-0000-4000-8000-000000000002') as r;
select tests.ok('S24 descartar devolve {id, uid}', (select r = jsonb_build_object('id', '24000000-0000-4000-8000-000000000002'::uuid, 'uid', 'a2400000000000000000000000000002') from t_s24_discard));
select tests.su();
select tests.ok('S24 descarte apaga conteúdo e corpo e marca o envio (content_id nulo pelo FK)',
  not exists (select 1 from public.content where id = '24000000-0000-4000-8000-000000000002')
  and not exists (select 1 from public.content_bodies where content_id = '24000000-0000-4000-8000-000000000002')
  and (select discarded_at = now() and content_id is null and provider_deleted_at is null from public.stream_uploads where uid = 'a2400000000000000000000000000002'));
select tests.ok('S24 descarte auditado como content.creator_discard (ator herói)',
  exists (select 1 from public.admin_audit where action = 'content.creator_discard' and resource_id = '24000000-0000-4000-8000-000000000002'
            and actor_type = 'creator' and actor_id = '10000000-0000-4000-8000-000000000004' and before_data ->> 'media_ref' = 'a2400000000000000000000000000002'));
select tests.ok('S24 sinalizador de confiança desligado', not public.is_trusted_call());
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
insert into public.content (id, slug, creator_id, pillar, type, title, media_license_kind) values
  ('24000000-0000-4000-8000-000000000006', 's24-reuso', public.seed_uuid('creator:lia'), 'training', 'video', 'Video S24 reuso', 'own');
select tests.expect_error('S24 uid descartado não volta a ser usado', $q$insert into public.content_bodies (content_id, body, media_provider, media_ref) values ('24000000-0000-4000-8000-000000000006', '{"kind":"video"}', 'cloudflare_stream', 'a2400000000000000000000000000002')$q$, 'stream_media_forbidden');
select public.creator_publish_content('24000000-0000-4000-8000-000000000001');
select tests.ok('S24 com vínculo próprio publica', (select status from public.content where id = '24000000-0000-4000-8000-000000000001') = 'published');
select tests.expect_error('S24 publicado não é descartado: not_draft', $q$select public.creator_discard_video_draft('24000000-0000-4000-8000-000000000001')$q$, 'not_draft');
select tests.expect_error('S24 publicado não troca slug: not_draft', $q$select public.creator_set_draft_slug('24000000-0000-4000-8000-000000000001', 'novo-slug-s24')$q$, 'not_draft');
select public.creator_unpublish_content('24000000-0000-4000-8000-000000000001');
select tests.expect_error('S24 despublicado (já esteve no ar) não é descartado: already_published', $q$select public.creator_discard_video_draft('24000000-0000-4000-8000-000000000001')$q$, 'already_published');
select tests.expect_error('S24 despublicado mantém o slug: already_published', $q$select public.creator_set_draft_slug('24000000-0000-4000-8000-000000000001', 'novo-slug-s24')$q$, 'already_published');
select tests.ok('S24 recusas não apagaram nada', exists (select 1 from public.content where id = '24000000-0000-4000-8000-000000000001'));

-- 5b) um uid serve a um conteúdo só; descarte só devolve o envio DESTE rascunho
select tests.su();
insert into public.stream_uploads (uid, creator_id, expires_at) values
  ('a2400000000000000000000000000004', public.seed_uuid('creator:lia'), now() + interval '30 minutes'),
  ('a2400000000000000000000000000005', public.seed_uuid('creator:lia'), now() + interval '30 minutes');
update public.stream_uploads set content_id = '24000000-0000-4000-8000-000000000001' where uid = 'a2400000000000000000000000000001';
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
insert into public.content (id, slug, creator_id, pillar, type, title, media_license_kind) values
  ('24000000-0000-4000-8000-000000000007', 's24-clone', public.seed_uuid('creator:lia'), 'training', 'video', 'Video S24 clone', 'own');
select tests.expect_error('S24 herói não clona no rascunho o uid de post que já esteve no ar', $q$insert into public.content_bodies (content_id, body, media_provider, media_ref) values ('24000000-0000-4000-8000-000000000007', '{"kind":"video"}', 'cloudflare_stream', 'a2400000000000000000000000000001')$q$, 'stream_media_forbidden');
insert into public.content_bodies (content_id, body, media_provider, media_ref) values ('24000000-0000-4000-8000-000000000006', '{"kind":"video"}', 'cloudflare_stream', 'a2400000000000000000000000000005');
select tests.expect_error('S24 envio livre já usado por outro corpo não serve a um segundo rascunho', $q$insert into public.content_bodies (content_id, body, media_provider, media_ref) values ('24000000-0000-4000-8000-000000000007', '{"kind":"video"}', 'cloudflare_stream', 'a2400000000000000000000000000005')$q$, 'stream_media_forbidden');
-- (A) corpo clonado gravado por caminho de sistema (ou antes da 0026): o descarte apaga só o rascunho
select tests.su();
insert into public.content_bodies (content_id, body, media_provider, media_ref) values ('24000000-0000-4000-8000-000000000007', '{"kind":"video"}', 'cloudflare_stream', 'a2400000000000000000000000000001');
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
create temporary table t_s24_clone as select public.creator_discard_video_draft('24000000-0000-4000-8000-000000000007') as r;
select tests.su();
select tests.ok('S24 descartar rascunho com uid clonado de post já no ar: uid nulo, envio e post intactos',
  (select r ->> 'uid' is null from t_s24_clone)
  and not exists (select 1 from public.content where id = '24000000-0000-4000-8000-000000000007')
  and (select discarded_at is null and content_id = '24000000-0000-4000-8000-000000000001' from public.stream_uploads where uid = 'a2400000000000000000000000000001')
  and exists (select 1 from public.content_bodies where content_id = '24000000-0000-4000-8000-000000000001' and media_ref = 'a2400000000000000000000000000001'));
-- (B) corpo sem vínculo do herói (uid da Lia no rascunho do Rafael, gravado por caminho de sistema)
update public.content_bodies set media_ref = 'a2400000000000000000000000000004' where content_id = '24000000-0000-4000-8000-000000000005';
select tests.login('10000000-0000-4000-8000-000000000023', 's23hero@test.local');
create temporary table t_s24_foreign as select public.creator_discard_video_draft('24000000-0000-4000-8000-000000000005') as r;
select tests.su();
select tests.ok('S24 descartar rascunho com uid sem vínculo do herói: uid nulo e envio da Lia intacto',
  (select r ->> 'uid' is null from t_s24_foreign)
  and not exists (select 1 from public.content where id = '24000000-0000-4000-8000-000000000005')
  and (select discarded_at is null from public.stream_uploads where uid = 'a2400000000000000000000000000004'));
-- trocar a mídia do rascunho nunca publicado descarta o envio (a limpeza apaga o vídeo)
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
update public.content_bodies set media_provider = 'none', media_ref = null where content_id = '24000000-0000-4000-8000-000000000006';
select tests.su();
select tests.ok('S24 rascunho que sai do Stream descarta o próprio envio',
  (select discarded_at is not null and provider_deleted_at is null from public.stream_uploads where uid = 'a2400000000000000000000000000005'));

-- 5c) fila da limpeza diária: só o service role; filtra no banco publicados/já no ar e anda por checked_at
select tests.ok('S24 stream_cleanup_candidates: security invoker, search_path fixo, só service_role executa',
  (select not p.prosecdef and p.proconfig @> array['search_path=public'] from pg_proc p where p.oid = 'public.stream_cleanup_candidates(timestamptz, integer)'::regprocedure)
  and has_function_privilege('service_role', 'public.stream_cleanup_candidates(timestamptz, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.stream_cleanup_candidates(timestamptz, integer)', 'execute')
  and not has_function_privilege('anon', 'public.stream_cleanup_candidates(timestamptz, integer)', 'execute'));
insert into public.content (id, slug, creator_id, pillar, type, title, media_license_kind) values
  ('24000000-0000-4000-8000-000000000009', 's24-fila', public.seed_uuid('creator:lia'), 'training', 'video', 'Video S24 fila', 'own');
insert into public.stream_uploads (uid, creator_id, content_id, created_at, expires_at) values
  ('a2400000000000000000000000000006', public.seed_uuid('creator:lia'), '24000000-0000-4000-8000-000000000009', now() - interval '9 hours', now() - interval '3 hours'),
  ('a2400000000000000000000000000007', public.seed_uuid('creator:lia'), null, now() - interval '8 hours', now() - interval '2 hours');
insert into public.content_bodies (content_id, body, media_provider, media_ref) values ('24000000-0000-4000-8000-000000000009', '{"kind":"video"}', 'cloudflare_stream', 'a2400000000000000000000000000006');
update public.stream_uploads set expires_at = now() - interval '4 hours' where uid = 'a2400000000000000000000000000001';
create temporary table t_s24_queue as select * from public.stream_cleanup_candidates(now() - interval '1 hour', 100) where uid like 'a24%';
select tests.ok('S24 fila: envio de post que já esteve no ar fica fora; rascunho e envio órfão entram com draft_id/referenced',
  not exists (select 1 from t_s24_queue where uid = 'a2400000000000000000000000000001')
  and exists (select 1 from t_s24_queue where uid = 'a2400000000000000000000000000006' and draft_id = '24000000-0000-4000-8000-000000000009' and referenced)
  and exists (select 1 from t_s24_queue where uid = 'a2400000000000000000000000000007' and draft_id is null and not referenced)
  and not exists (select 1 from t_s24_queue where uid in ('a2400000000000000000000000000004', 'a2400000000000000000000000000005')));
update public.stream_uploads set checked_at = now() where uid = 'a2400000000000000000000000000006';
select tests.ok('S24 fila: envio conferido (vídeo pronto) vai para o fim',
  (select array_agg(q.uid order by q.ord) from public.stream_cleanup_candidates(now() - interval '1 hour', 100) with ordinality as q(uid, draft_id, referenced, ord)
   where q.uid in ('a2400000000000000000000000000006', 'a2400000000000000000000000000007'))
  = array['a2400000000000000000000000000007', 'a2400000000000000000000000000006']);

-- 5d) post que já esteve no ar e trocou a mídia: o envio dele nunca entra na fila nem é descartado
select tests.ok('S24 stream_cleanup_discard: security invoker, search_path fixo, só service_role executa',
  (select not p.prosecdef and p.proconfig @> array['search_path=public'] from pg_proc p where p.oid = 'public.stream_cleanup_discard(text, uuid)'::regprocedure)
  and has_function_privilege('service_role', 'public.stream_cleanup_discard(text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.stream_cleanup_discard(text, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.stream_cleanup_discard(text, uuid)', 'execute'));
update public.content_bodies set media_provider = 'none', media_ref = null where content_id = '24000000-0000-4000-8000-000000000001';
select tests.ok('S24 despublicado que trocou a mídia: envio fora da fila e não descartável (vídeo é histórico do post)',
  not exists (select 1 from public.stream_cleanup_candidates(now() - interval '1 hour', 500) q where q.uid = 'a2400000000000000000000000000001')
  and public.stream_cleanup_discard('a2400000000000000000000000000001', null) = false
  and (select discarded_at is null from public.stream_uploads where uid = 'a2400000000000000000000000000001'));
update public.content_bodies set media_provider = 'cloudflare_stream', media_ref = 'a2400000000000000000000000000001' where content_id = '24000000-0000-4000-8000-000000000001';

-- 5e) descarte da limpeza confere de novo, com as linhas travadas, antes de apagar
select tests.ok('S24 stream_cleanup_discard recusa rascunho que não é o do envio',
  public.stream_cleanup_discard('a2400000000000000000000000000006', '24000000-0000-4000-8000-000000000003') = false
  and exists (select 1 from public.content where id = '24000000-0000-4000-8000-000000000003'));
update public.content set status = 'published', published_at = now() where id = '24000000-0000-4000-8000-000000000009';
select tests.ok('S24 stream_cleanup_discard não apaga rascunho que foi publicado depois da leitura da fila',
  public.stream_cleanup_discard('a2400000000000000000000000000006', '24000000-0000-4000-8000-000000000009') = false
  and exists (select 1 from public.content where id = '24000000-0000-4000-8000-000000000009')
  and (select discarded_at is null from public.stream_uploads where uid = 'a2400000000000000000000000000006'));
update public.content set status = 'draft', published_at = null where id = '24000000-0000-4000-8000-000000000009';
select tests.ok('S24 stream_cleanup_discard recusa uid órfão que algum corpo passou a usar',
  public.stream_cleanup_discard('a2400000000000000000000000000006', null) = false);
-- a chamada fica num comando à parte: no mesmo comando as subconsultas ainda veriam o estado anterior
create temporary table t_s24_cleanup as select public.stream_cleanup_discard('a2400000000000000000000000000006', '24000000-0000-4000-8000-000000000009') as r;
select tests.ok('S24 stream_cleanup_discard apaga o rascunho abandonado, marca o envio e audita como sistema',
  (select r from t_s24_cleanup) = true
  and not exists (select 1 from public.content where id = '24000000-0000-4000-8000-000000000009')
  and (select discarded_at is not null and content_id is null from public.stream_uploads where uid = 'a2400000000000000000000000000006')
  and exists (select 1 from public.admin_audit where action = 'content.cleanup_discard' and resource_id = '24000000-0000-4000-8000-000000000009' and actor_type = 'system'));
create temporary table t_s24_orphan as select public.stream_cleanup_discard('a2400000000000000000000000000007', null) as r;
select tests.ok('S24 stream_cleanup_discard marca o órfão sem corpo e é idempotente',
  (select r from t_s24_orphan) = true
  and (select discarded_at is not null from public.stream_uploads where uid = 'a2400000000000000000000000000007'));
select tests.ok('S24 stream_cleanup_discard repetido não faz nada',
  public.stream_cleanup_discard('a2400000000000000000000000000007', null) = false
  and public.stream_cleanup_discard('a2400000000000000000000000000006', '24000000-0000-4000-8000-000000000009') = false);

-- 6) slug do rascunho: dono, formato, duplicado
select tests.login('10000000-0000-4000-8000-000000000023', 's23hero@test.local');
select tests.expect_error('S24 outro herói não troca slug alheio', $q$select public.creator_set_draft_slug('24000000-0000-4000-8000-000000000003', 'treino-s24-roubado')$q$, 'forbidden');
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
select tests.expect_error('S24 slug com maiúscula: invalid_slug', $q$select public.creator_set_draft_slug('24000000-0000-4000-8000-000000000003', 'Treino-S24')$q$, 'invalid_slug');
select tests.expect_error('S24 slug com hífen duplo: invalid_slug', $q$select public.creator_set_draft_slug('24000000-0000-4000-8000-000000000003', 'treino--s24')$q$, 'invalid_slug');
select tests.expect_error('S24 slug com hífen na ponta: invalid_slug', $q$select public.creator_set_draft_slug('24000000-0000-4000-8000-000000000003', '-treino')$q$, 'invalid_slug');
select tests.expect_error('S24 slug acima de 120: invalid_slug', $q$select public.creator_set_draft_slug('24000000-0000-4000-8000-000000000003', repeat('a', 121))$q$, 'invalid_slug');
select tests.expect_error('S24 slug de outro conteúdo: slug_taken', $q$select public.creator_set_draft_slug('24000000-0000-4000-8000-000000000003', 's23-video-celular')$q$, 'slug_taken');
select tests.ok('S24 sinalizador desligado depois do slug_taken', not public.is_trusted_call());
select tests.expect_error('S24 herói segue sem mudar slug direto (coluna protegida)', $q$update public.content set slug = 'treino-s24-direto' where id = '24000000-0000-4000-8000-000000000003'$q$, 'protected_column');
create temporary table t_s24_slug as select public.creator_set_draft_slug('24000000-0000-4000-8000-000000000003', 'treino-de-perna-s24-x1y2z3') as r;
select tests.ok('S24 dono troca o slug do rascunho e recebe {id, slug}',
  (select r = jsonb_build_object('id', '24000000-0000-4000-8000-000000000003'::uuid, 'slug', 'treino-de-perna-s24-x1y2z3') from t_s24_slug)
  and (select slug from public.content where id = '24000000-0000-4000-8000-000000000003') = 'treino-de-perna-s24-x1y2z3'
  and not public.is_trusted_call());

-- 7) limpeza: nada do S24 no ar e o Rafael volta sem usuário
select tests.su();
update public.creator_profiles set user_id = null where id = public.seed_uuid('creator:rafael') and user_id = '10000000-0000-4000-8000-000000000023';
select tests.ok('S24 nada do cenário ficou no ar', not exists (select 1 from public.content where id::text like '24000000-%' and status = 'published'));

-- ================================================================ S25 · Estrutura e backfill das receitas (0027 e 0029)
-- Os cenários S25–S32 criam os próprios usuários (…0025–…0032): Helena e Marcos (chefs do seed)
-- ganham usuários de teste, desvinculados no fim do S32; nada do que estes cenários publicam fica no ar.
-- Ajudantes de payload de recipe_save (formato de src/lib/recipes/codes.ts e da seção 3.6 do desenho).
create or replace function tests.rp(p_title text, p_ing jsonb, p_steps jsonb, p_cats jsonb default '["almoco"]', p_over jsonb default '{}')
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'content', jsonb_build_object('title', p_title, 'summary', 'Resumo de teste da receita', 'tags', jsonb_build_array('teste'),
                                  'difficulty', 'beginner', 'pillar', 'gastronomy', 'disclaimer_kind', 'nutrition'),
    'details', jsonb_build_object('servings', 2, 'prep_minutes', 10, 'cook_minutes', 15, 'total_minutes', 30,
                                  'allergens', jsonb_build_array('egg'), 'allergens_declared', true),
    'extras', jsonb_build_object('chef_note', 'Nota do chef de teste'),
    'categories', p_cats, 'ingredients', p_ing, 'steps', p_steps) || p_over
$$;
create or replace function tests.ing(p_id text, p_name text, p_qty numeric default 1, p_unit text default null)
returns jsonb language sql immutable as $$ select jsonb_build_object('id', p_id, 'name', p_name, 'quantity', p_qty, 'unit', p_unit) $$;
create or replace function tests.step(p_id text, p_text text, p_ings jsonb default '[]')
returns jsonb language sql immutable as $$ select jsonb_build_object('id', p_id, 'instruction', p_text, 'ingredient_ids', p_ings) $$;
-- updated_at atual do conteúdo, lido com a RLS de quem chama (o herói vê o próprio rascunho)
create or replace function tests.upd(p_content uuid) returns timestamptz language sql stable as $$ select updated_at from public.content where id = p_content $$;
grant execute on all functions in schema tests to anon, authenticated;

select tests.su();
insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000025', 's25@test.local'),
  ('10000000-0000-4000-8000-000000000026', 's26helena@test.local'),
  ('10000000-0000-4000-8000-000000000027', 's27marcos@test.local'),
  ('10000000-0000-4000-8000-000000000028', 's28prem@test.local'),
  ('10000000-0000-4000-8000-000000000029', 's29free@test.local'),
  ('10000000-0000-4000-8000-000000000030', 's30demo@test.local'),
  ('10000000-0000-4000-8000-000000000031', 's31comm@test.local'),
  ('10000000-0000-4000-8000-000000000032', 's32admin@test.local');
-- contas demo (P3: seguem só a cota diária de envio); a avaliação de demo não entra no agregado
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"ultra_hero_demo": true}'::jsonb
where id in ('10000000-0000-4000-8000-000000000027', '10000000-0000-4000-8000-000000000030');
update public.creator_profiles set user_id = '10000000-0000-4000-8000-000000000026' where id = public.seed_uuid('creator:helena') and user_id is null;
update public.creator_profiles set user_id = '10000000-0000-4000-8000-000000000027' where id = public.seed_uuid('creator:marcos') and user_id is null;
insert into public.recipe_onboarding (user_id, notice_accepted_at) values
  ('10000000-0000-4000-8000-000000000028', now()), ('10000000-0000-4000-8000-000000000029', now()),
  ('10000000-0000-4000-8000-000000000030', now()), ('10000000-0000-4000-8000-000000000031', now());

-- 1) as 8 receitas do seed passaram para o modelo estruturado
select tests.ok('S25 as 8 receitas do seed têm detalhes; 41 ingredientes (34 numéricos, 3 em texto, 4 a gosto) e 28 etapas',
  (select count(*) from public.recipe_details d join public.content c on c.id = d.content_id where c.type = 'recipe') = 8
  and (select count(*) from public.recipe_ingredients) = 41
  and (select count(*) from public.recipe_ingredients where quantity is not null) = 34
  and (select count(*) from public.recipe_ingredients where quantity_text is not null) = 3
  and (select count(*) from public.recipe_ingredients where to_taste) = 4
  and (select count(*) from public.recipe_steps) = 28);
select tests.ok('S25 ingredientes/etapas por receita: g1 6/3, g2 5/4, g3 6/3, g4 5/4, g5 5/3, g6 5/4, g8 5/4, g9 4/3',
  (select string_agg(k || ':' || (select count(*) from public.recipe_ingredients i where i.content_id = public.seed_uuid('content:' || k))
                       || '/' || (select count(*) from public.recipe_steps s where s.content_id = public.seed_uuid('content:' || k)), ',' order by k)
   from unnest(array['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g8', 'g9']) as k) = 'g1:6/3,g2:5/4,g3:6/3,g4:5/4,g5:5/3,g6:5/4,g8:5/4,g9:4/3');
select tests.ok('S25 cada receita tem a v1 restore_point com o corpo atual, e o corpo continua v1 (não virou marcador)',
  (select count(*) from public.recipe_versions v join public.content_bodies b on b.content_id = v.content_id
    where v.reason = 'restore_point' and v.version_no = 1 and v.snapshot = jsonb_build_object('legacy_body', b.body)
      and b.body ->> 'kind' = 'recipe' and jsonb_typeof(b.body -> 'ingredients') = 'array' and not (b.body ? 'schema')) = 8
  and (select count(*) from public.recipe_versions) = 8);
select tests.ok('S25 cada ingrediente guarda o nome e o texto original do corpo v1 (source_qty), na mesma posição',
  (select count(*) from public.content c join public.content_bodies b on b.content_id = c.id
     cross join lateral jsonb_array_elements(b.body -> 'ingredients') with ordinality as t(e, o)
     join public.recipe_ingredients i on i.content_id = c.id and i.position = t.o
   where c.type = 'recipe' and i.name = t.e ->> 'item' and i.source_qty = t.e ->> 'qty') = 41);
select tests.ok('S25 etapas com o texto do corpo v1, na mesma posição',
  (select count(*) from public.content c join public.content_bodies b on b.content_id = c.id
     cross join lateral jsonb_array_elements_text(b.body -> 'steps') with ordinality as t(e, o)
     join public.recipe_steps s on s.content_id = c.id and s.position = t.o
   where c.type = 'recipe' and s.instruction = t.e) = 28);
select tests.ok('S25 duration_minutes inalterado e copiado para total_minutes (g1 35, g2 30, g3 5, g4 40, g5 35, g6 45, g8 40, g9 15)',
  (select string_agg(k || ':' || c.duration_minutes || '/' || d.total_minutes, ',' order by k)
   from unnest(array['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g8', 'g9']) as k
   join public.content c on c.id = public.seed_uuid('content:' || k) join public.recipe_details d on d.content_id = c.id)
  = 'g1:35/35,g2:30/30,g3:5/5,g4:40/40,g5:35/35,g6:45/45,g8:40/40,g9:15/15');
select tests.ok('S25 tempos copiados sem correção (P5): g4 5+45 contra 40, g2 15+20 contra 30; porções do corpo',
  (select prep_minutes = 5 and cook_minutes = 45 and total_minutes = 40 and servings = 4 from public.recipe_details where content_id = public.seed_uuid('content:g4'))
  and (select prep_minutes = 15 and cook_minutes = 20 and total_minutes = 30 and servings = 8 from public.recipe_details where content_id = public.seed_uuid('content:g2'))
  and (select prep_minutes = 10 and cook_minutes = 25 and servings = 2 and rest_minutes is null from public.recipe_details where content_id = public.seed_uuid('content:g1')));
select tests.ok('S25 alérgenos declarados só em g2 {egg,milk}, g5 {fish} e g9 {egg} com a nota do seed; as outras 5 "não informados"; dieta nunca inferida',
  (select string_agg(k || '=' || d.allergens::text || coalesce('|' || d.allergen_notes, ''), ',' order by k)
   from unnest(array['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g8', 'g9']) as k join public.recipe_details d on d.content_id = public.seed_uuid('content:' || k)
   where d.allergens_declared) = 'g2={egg,milk},g5={fish},g9={egg}|glúten (aveia pode conter)'
  and (select count(*) from public.recipe_details where not allergens_declared and allergens = '{}') = 5
  and (select count(*) from public.recipe_details where diets <> '{}') = 0);
select tests.ok('S25 literais: g4 água 2,5 xícaras; g1 batata-doce 1 + "média"; g5 batata-doce 2 + "médias"; g6 caldo 1,5 L; g8 "1 e 2 dentes" em texto; g3 sal a gosto',
  (select quantity = 2.5 and unit = 'cup' and note is null from public.recipe_ingredients where content_id = public.seed_uuid('content:g4') and position = 2)
  and (select quantity = 1 and unit is null and note = 'média' from public.recipe_ingredients where content_id = public.seed_uuid('content:g1') and position = 4)
  and (select quantity = 2 and unit is null and note = 'médias' from public.recipe_ingredients where content_id = public.seed_uuid('content:g5') and position = 2)
  and (select quantity = 1.5 and unit = 'l' from public.recipe_ingredients where content_id = public.seed_uuid('content:g6') and position = 4)
  and (select quantity is null and quantity_text = '1 e 2 dentes' from public.recipe_ingredients where content_id = public.seed_uuid('content:g8') and position = 3)
  and (select to_taste and quantity is null and quantity_text is null from public.recipe_ingredients where content_id = public.seed_uuid('content:g3') and position = 6));
select tests.ok('S25 etapas: g1.1 25 min a 200 °C, g4.3 35 min, g2.4 2 min; "de cada lado" (g1.2, g9.3) e "por até 5 dias" sem duração',
  (select duration_seconds = 1500 and temperature_c = 200 from public.recipe_steps where content_id = public.seed_uuid('content:g1') and position = 1)
  and (select duration_seconds = 2100 and temperature_c is null from public.recipe_steps where content_id = public.seed_uuid('content:g4') and position = 3)
  and (select duration_seconds = 120 from public.recipe_steps where content_id = public.seed_uuid('content:g2') and position = 4)
  and (select duration_seconds is null from public.recipe_steps where content_id = public.seed_uuid('content:g1') and position = 2)
  and (select duration_seconds is null from public.recipe_steps where content_id = public.seed_uuid('content:g9') and position = 3)
  and (select duration_seconds is null from public.recipe_steps where content_id = public.seed_uuid('content:g3') and position = 3)
  and (select count(*) from public.recipe_steps where duration_seconds is not null) = 11);
select tests.ok('S25 nutrição: g1 e g5 validadas (responsável, data e nota mantidos), g9 com números sem validação, origem chef',
  (select count(*) from public.recipe_nutrition n where n.content_id in (public.seed_uuid('content:g1'), public.seed_uuid('content:g5'))
     and n.validated and n.validated_by = 'Equipe de nutrição (demonstração)' and n.validated_at = '2026-10-20' and n.validation_note is not null and n.source = 'chef') = 2
  and (select kcal = 520 and protein_g = 42 and sodium_mg = 480 from public.recipe_nutrition where content_id = public.seed_uuid('content:g1'))
  and (select not validated and validated_by is null and kcal = 260 from public.recipe_nutrition where content_id = public.seed_uuid('content:g9'))
  and (select count(*) from public.recipe_nutrition) = 3);
select tests.ok('S25 categorias aprovadas (P5); marmitas = as receitas com a etiqueta marmita',
  (select string_agg(k || '=' || (select string_agg(l.category_code, '+' order by l.category_code) from public.recipe_category_links l
                                   where l.content_id = public.seed_uuid('content:' || k)), ',' order by k)
   from unnest(array['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g8', 'g9']) as k)
  = 'g1=almoco,g2=cafe-da-manha+marmitas,g3=molhos-e-bases,g4=almoco,g5=almoco,g6=sopas,g8=almoco+marmitas,g9=cafe-da-manha'
  and (select array_agg(l.content_id order by l.content_id) from public.recipe_category_links l where l.category_code = 'marmitas')
    = (select array_agg(c.id order by c.id) from public.content c where c.type = 'recipe' and 'marmita' = any (c.tags)));
select tests.ok('S25 nota do chef e termos de busca dos ingredientes (extras); nenhuma mídia nem vínculo ingrediente↔produto semeado',
  (select count(*) from public.recipe_extras where chef_note = 'Receita demonstrativa. Quantidades ilustrativas.') = 8
  and (select ingredient_terms @@ plainto_tsquery('simple', public.f_unaccent('cabotiá')) from public.recipe_extras where content_id = public.seed_uuid('content:g8'))
  and not (select ingredient_terms @@ plainto_tsquery('simple', 'cabotia') from public.recipe_extras where content_id = public.seed_uuid('content:g1'))
  and (select count(*) from public.recipe_media) = 0 and (select count(*) from public.recipe_ingredient_products) = 0);

-- 2) backfill de uma receita v1 fora da tabela (formato desconhecido) e de uma receita com corpo inválido
insert into public.content (id, slug, creator_id, pillar, type, title, summary, duration_minutes, status, review_status) values
  ('25000000-0000-4000-8000-000000000001', 's25-legada', public.seed_uuid('creator:helena'), 'gastronomy', 'recipe', 'Receita legada S25', 'Resumo', 20, 'draft', 'none'),
  ('25000000-0000-4000-8000-000000000002', 's25-legada-quebrada', public.seed_uuid('creator:helena'), 'gastronomy', 'recipe', 'Receita quebrada S25', null, 20, 'draft', 'none');
insert into public.content_bodies (content_id, body) values
  ('25000000-0000-4000-8000-000000000001', '{"kind":"recipe","servings":2,"prep_minutes":"dez","cook_minutes":15,"ingredients":[{"item":"Farinha","qty":"1 punhado"},{"item":"Sal","qty":"a gosto"},{"item":"Leite","qty":"200 ml"}],"steps":["Misture tudo por 3 minutos."],"allergens":["leite","glúten (pode conter)"],"note":"Nota antiga"}'),
  ('25000000-0000-4000-8000-000000000002', '[]');
-- mesmo laço do fim da 0029: cada receita no próprio bloco; a quebrada falha sozinha
do $s25$ declare r record; v_done int := 0; v_fail int := 0;
begin
  for r in select c.id from public.content c where c.type = 'recipe' and not exists (select 1 from public.recipe_details d where d.content_id = c.id)
           order by c.created_at, c.id loop
    begin
      perform public.recipe_backfill_legacy(r.id);
      v_done := v_done + 1;
    exception when others then
      v_fail := v_fail + 1;
    end;
  end loop;
  perform tests.ok('S25 laço do backfill: só as 2 receitas novas entram; a de corpo inválido falha sozinha e a outra segue', v_done = 1 and v_fail = 1);
end $s25$;
select tests.ok('S25 fora da tabela: "1 punhado" e "200 ml" ficam em texto (não recalcula), "a gosto" vira marca, original em source_qty',
  (select string_agg(name || '=' || coalesce(quantity::text, '-') || '/' || coalesce(quantity_text, '-') || '/' || to_taste || '/' || coalesce(source_qty, '-'), ',' order by position)
   from public.recipe_ingredients where content_id = '25000000-0000-4000-8000-000000000001')
  = 'Farinha=-/1 punhado/false/1 punhado,Sal=-/-/true/a gosto,Leite=-/200 ml/false/200 ml');
select tests.ok('S25 fora da tabela: etapa sem duração, preparo inválido vira nulo, alérgenos pelo mapa (rótulo com qualificador vai para a nota), nota do chef e restore_point',
  (select duration_seconds is null and instruction = 'Misture tudo por 3 minutos.' from public.recipe_steps where content_id = '25000000-0000-4000-8000-000000000001')
  and (select servings = 2 and prep_minutes is null and cook_minutes = 15 and total_minutes = 20 and allergens = '{milk}' and allergens_declared
              and allergen_notes = 'glúten (pode conter)' from public.recipe_details where content_id = '25000000-0000-4000-8000-000000000001')
  and (select chef_note = 'Nota antiga' from public.recipe_extras where content_id = '25000000-0000-4000-8000-000000000001')
  and exists (select 1 from public.recipe_versions where content_id = '25000000-0000-4000-8000-000000000001' and reason = 'restore_point' and version_no = 1)
  and not exists (select 1 from public.recipe_category_links where content_id = '25000000-0000-4000-8000-000000000001'));
select tests.ok('S25 corpo inválido: a receita fica só com o corpo antigo (sem detalhes, filhos nem versão)',
  not exists (select 1 from public.recipe_details where content_id = '25000000-0000-4000-8000-000000000002')
  and not exists (select 1 from public.recipe_versions where content_id = '25000000-0000-4000-8000-000000000002'));
create temporary table t_s25_again as select public.recipe_backfill_legacy(public.seed_uuid('content:g1')) as r;
select tests.ok('S25 reaplicar não duplica: receita com detalhes é pulada e as contagens não mudam',
  (select r from t_s25_again) = 'skipped' and (select count(*) from public.recipe_ingredients) = 44 and (select count(*) from public.recipe_steps) = 29
  and (select count(*) from public.recipe_versions) = 9);
select tests.ok('S25 backfill auditado como sistema (recipe.backfill)',
  exists (select 1 from public.admin_audit where action = 'recipe.backfill' and resource_id = '25000000-0000-4000-8000-000000000001' and actor_type = 'system'));
select tests.ok('S25 dry-run: só a receita de corpo inválido segue sem detalhes, fora das 8 do seed',
  (select count(*) from public.recipe_backfill_dry_run()) = 1
  and (select outcome from public.recipe_backfill_dry_run()) = 'outside_seed');
-- receita sem linha em content_bodies (createContent antigo que falhou na 2ª escrita): o dry-run a
-- mostra como no_body e a falha do bloco final fica em admin_audit (o WARNING não volta pela API)
insert into public.content (id, slug, creator_id, pillar, type, title, summary, status, review_status) values
  ('25000000-0000-4000-8000-000000000003', 's25-sem-corpo', public.seed_uuid('creator:helena'), 'gastronomy', 'recipe', 'Receita sem corpo S25', 'Resumo', 'draft', 'none');
select tests.ok('S25 dry-run: receita sem corpo aparece como no_body',
  (select outcome from public.recipe_backfill_dry_run() where content_id = '25000000-0000-4000-8000-000000000003' and kind = 'recipe') = 'no_body');
do $s25b$ declare r record; begin
  for r in select c.id from public.content c where c.id = '25000000-0000-4000-8000-000000000003' loop
    begin
      perform public.recipe_backfill_legacy(r.id);
    exception when others then
      perform public.audit_log('recipe.backfill_failed', 'content', r.id::text, null, jsonb_build_object('error', sqlerrm), null, 'system');
    end;
  end loop;
end $s25b$;
select tests.ok('S25 receita sem corpo: o backfill falha (no_legacy_body) e a falha fica em admin_audit, como no bloco final da 0029',
  exists (select 1 from public.admin_audit where action = 'recipe.backfill_failed' and resource_id = '25000000-0000-4000-8000-000000000003'
          and actor_type = 'system' and after_data ->> 'error' like '%no_legacy_body%')
  and not exists (select 1 from public.recipe_details where content_id = '25000000-0000-4000-8000-000000000003'));
delete from public.content where id = '25000000-0000-4000-8000-000000000003';
-- apagar o conteúdo leva detalhes, filhos e versões (a guarda das versões aceita a cascata)
delete from public.content where id in ('25000000-0000-4000-8000-000000000001', '25000000-0000-4000-8000-000000000002');
select tests.ok('S25 apagar o conteúdo leva tabelas filhas e versões em cascata',
  not exists (select 1 from public.recipe_versions where content_id = '25000000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.recipe_ingredients where content_id = '25000000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.recipe_details where content_id = '25000000-0000-4000-8000-000000000001'));

-- 3) segurança do modelo: RLS, grants, funções internas
select tests.ok('S25 RLS ligada nas 16 tabelas novas e nada para anon além das 4 de leitura pública',
  (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relrowsecurity
     and relname in ('recipe_categories', 'recipe_media', 'recipe_details', 'recipe_extras', 'recipe_category_links', 'recipe_ingredients', 'recipe_steps',
                     'recipe_step_ingredients', 'recipe_nutrition', 'recipe_versions', 'recipe_ratings', 'recipe_comments', 'recipe_ingredient_products',
                     'shopping_list_items', 'user_recipe_prefs', 'recipe_view_history')) = 16
  and (select string_agg(relname, ',' order by relname) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
         and relname like any (array['recipe\_%', 'shopping\_%', 'user\_recipe\_%']) and has_table_privilege('anon', oid, 'select'))
      = 'recipe_categories,recipe_category_links,recipe_details,recipe_media'
  and not has_table_privilege('authenticated', 'public.recipe_details', 'insert')
  and not has_table_privilege('authenticated', 'public.recipe_ingredients', 'update')
  and not has_table_privilege('authenticated', 'public.recipe_versions', 'delete'));
select tests.ok('S25 backfill, literais e dry-run só para o service role',
  (select bool_and(not has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute')
                   and has_function_privilege('service_role', p.oid, 'execute'))
   from pg_proc p where p.pronamespace = 'public'::regnamespace
     and p.proname in ('recipe_backfill_legacy', 'recipe_backfill_dry_run', 'recipe_legacy_ingredient_literals', 'recipe_legacy_step_literals',
                       'recipe_legacy_category_literals', 'recipe_legacy_allergen_code', 'recipe_legacy_seed_key', 'recipe_snapshot',
                       'recipe_assert_publishable', 'recipe_publishable_missing', 'recipe_orphan_media')));

-- ================================================================ S26 · Permissões da receita (0027)
-- Visitante lê o público (detalhes, categorias, galeria) e nunca o protegido (extras, ingredientes,
-- etapas, nutrição); consumidor só abre com a etapa e o plano; herói escreve só pela RPC.
select tests.anon();
select tests.ok('S26 visitante lê detalhes, categorias e vínculos de categoria de receita no ar',
  (select count(*) from public.recipe_details where content_id = public.seed_uuid('content:g1')) = 1
  and (select count(*) from public.recipe_categories) = 10
  and (select count(*) from public.recipe_category_links where content_id = public.seed_uuid('content:g1')) = 1);
select tests.expect_error('S26 visitante: permission denied em recipe_extras', $q$select count(*) from public.recipe_extras$q$, 'permission denied');
select tests.expect_error('S26 visitante: permission denied em recipe_ingredients', $q$select count(*) from public.recipe_ingredients$q$, 'permission denied');
select tests.expect_error('S26 visitante: permission denied em recipe_steps', $q$select count(*) from public.recipe_steps$q$, 'permission denied');
select tests.expect_error('S26 visitante: permission denied em recipe_nutrition', $q$select count(*) from public.recipe_nutrition$q$, 'permission denied');
select tests.ok('S26 visitante: can_access_content(g1) falso', not public.can_access_content(public.seed_uuid('content:g1')));

-- consumidor sem a etapa demonstrativa: o banco bloqueia (antes só a interface bloqueava)
select tests.login('10000000-0000-4000-8000-000000000025', 's25@test.local');
select tests.ok('S26 consumidor sem a etapa: can_access_content(g1) falso, 0 ingredientes, 0 corpo e 0 extras',
  not public.can_access_content(public.seed_uuid('content:g1'))
  and (select count(*) from public.recipe_ingredients where content_id = public.seed_uuid('content:g1')) = 0
  and (select count(*) from public.content_bodies where content_id = public.seed_uuid('content:g1')) = 0
  and (select count(*) from public.recipe_extras where content_id = public.seed_uuid('content:g1')) = 0
  and (select count(*) from public.recipe_details where content_id = public.seed_uuid('content:g1')) = 1);
insert into public.recipe_onboarding (user_id, notice_accepted_at) values ('10000000-0000-4000-8000-000000000025', now());
select tests.ok('S26 com a etapa: 6 ingredientes de g1 (gratuita) e 0 de g5 (premium sem módulo)',
  public.can_access_content(public.seed_uuid('content:g1'))
  and (select count(*) from public.recipe_ingredients where content_id = public.seed_uuid('content:g1')) = 6
  and (select count(*) from public.recipe_ingredients where content_id = public.seed_uuid('content:g5')) = 0
  and (select count(*) from public.recipe_steps where content_id = public.seed_uuid('content:g1')) = 3
  and (select count(*) from public.recipe_extras where content_id = public.seed_uuid('content:g1')) = 1);
select tests.ok('S26 receita que não é do consumidor: versões invisíveis', (select count(*) from public.recipe_versions) = 0);

-- herói (Helena): rascunho próprio, escrita só pela RPC
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select tests.ok('S26 Helena vinculada ao usuário de teste', public.my_creator_id() = public.seed_uuid('creator:helena'));
insert into public.content (id, slug, creator_id, pillar, type, title, summary) values
  ('26000000-0000-4000-8000-000000000001', 's26-receita', public.seed_uuid('creator:helena'), 'gastronomy', 'recipe', 'Receita S26', 'Resumo S26');
select tests.ok('S26 dono vê as versões só das próprias receitas (8 do seed da Helena e do Marcos: só as 4 dela)',
  (select count(*) from public.recipe_versions) = 4);
select tests.expect_error('S26 insert direto em recipe_ingredients: permission denied',
  $q$insert into public.recipe_ingredients (content_id, position, name) values ('26000000-0000-4000-8000-000000000001', 1, 'X')$q$, 'permission denied');
select tests.expect_error('S26 insert direto em recipe_details: permission denied',
  $q$insert into public.recipe_details (content_id, servings) values ('26000000-0000-4000-8000-000000000001', 2)$q$, 'permission denied');
select tests.expect_error('S26 receita não muda de tipo: type_locked',
  $q$update public.content set type = 'article' where id = '26000000-0000-4000-8000-000000000001'$q$, 'type_locked');
select tests.su();
select tests.expect_error('S26 outro tipo não vira receita, nem como sistema: type_locked',
  $q$update public.content set type = 'recipe' where id = public.seed_uuid('content:g7')$q$, 'type_locked');
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select tests.expect_error('S26 avatar do perfil não aponta para foto de receita (check)',
  $q$update public.creator_profiles set avatar_url = '/media/recipe/26000000-0000-4000-8000-0000000000aa' where id = public.seed_uuid('creator:helena')$q$, '23514');
select tests.su();
insert into public.recipe_media (id, content_id, creator_id, role, position, storage_path, mime, bytes, alt_text, rights_confirmed_at) values
  ('a2600000-0000-4000-8000-0000000000f1', public.seed_uuid('content:g1'), public.seed_uuid('creator:helena'), 'gallery', 1,
   public.seed_uuid('creator:helena') || '/' || public.seed_uuid('content:g1') || '/a2600000-0000-4000-8000-0000000000f1.webp', 'image/webp', 1000, 'Foto de g1', now());
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select tests.expect_error('S26 artigo não usa como capa a foto de outra receita: cover_not_owned',
  $q$insert into public.content (id, slug, creator_id, pillar, type, title, cover_url) values ('26000000-0000-4000-8000-000000000002', 's26-artigo', public.seed_uuid('creator:helena'), 'gastronomy', 'article', 'Artigo S26', '/media/recipe/a2600000-0000-4000-8000-0000000000f1')$q$, 'cover_not_owned');

-- recipe_save do próprio rascunho
create temporary table t_s26_save1 as select public.recipe_save('26000000-0000-4000-8000-000000000001',
  tests.rp('Receita S26', jsonb_build_array(tests.ing('a2600000-0000-4000-8000-000000000001', 'Ovo', 2), tests.ing('a2600000-0000-4000-8000-000000000002', 'Farinha', 200, 'g')),
           jsonb_build_array(tests.step('a2600000-0000-4000-8000-000000000011', 'Misture.', '["a2600000-0000-4000-8000-000000000001"]'),
                             tests.step('a2600000-0000-4000-8000-000000000012', 'Asse por 20 minutos.'))),
  tests.upd('26000000-0000-4000-8000-000000000001')) as r;
select tests.ok('S26 recipe_save grava a receita inteira e devolve updated_at; o corpo vira o marcador',
  (select (r ->> 'updated_at') is not null from t_s26_save1)
  and (select string_agg(name || '@' || position, ',' order by position) from public.recipe_ingredients where content_id = '26000000-0000-4000-8000-000000000001') = 'Ovo@1,Farinha@2'
  and (select count(*) from public.recipe_steps where content_id = '26000000-0000-4000-8000-000000000001') = 2
  and (select count(*) from public.recipe_step_ingredients where content_id = '26000000-0000-4000-8000-000000000001') = 1
  and (select servings = 2 and total_minutes = 30 and allergens = '{egg}' and allergens_declared from public.recipe_details where content_id = '26000000-0000-4000-8000-000000000001')
  and (select duration_minutes = 30 from public.content where id = '26000000-0000-4000-8000-000000000001')
  and (select body = '{"kind": "recipe", "schema": 2}'::jsonb from public.content_bodies where content_id = '26000000-0000-4000-8000-000000000001')
  and (select ingredient_terms @@ plainto_tsquery('simple', 'farinha') from public.recipe_extras where content_id = '26000000-0000-4000-8000-000000000001'));
select public.recipe_save('26000000-0000-4000-8000-000000000001',
  tests.rp('Receita S26', jsonb_build_array(tests.ing('a2600000-0000-4000-8000-000000000002', 'Farinha', 200, 'g'), tests.ing('a2600000-0000-4000-8000-000000000001', 'Ovo', 2)),
           jsonb_build_array(tests.step('a2600000-0000-4000-8000-000000000011', 'Misture.'))),
  tests.upd('26000000-0000-4000-8000-000000000001'));
select tests.ok('S26 reordenar preserva os ids e apaga a etapa ausente',
  (select string_agg(id::text || '@' || position, ',' order by position) from public.recipe_ingredients where content_id = '26000000-0000-4000-8000-000000000001')
    = 'a2600000-0000-4000-8000-000000000002@1,a2600000-0000-4000-8000-000000000001@2'
  and (select count(*) from public.recipe_steps where content_id = '26000000-0000-4000-8000-000000000001') = 1);
select public.recipe_save('26000000-0000-4000-8000-000000000001',
  tests.rp('Receita S26', jsonb_build_array(tests.ing('a2600000-0000-4000-8000-000000000002', 'Farinha', 200, 'g')),
           jsonb_build_array(tests.step('a2600000-0000-4000-8000-000000000011', 'Misture.'))),
  tests.upd('26000000-0000-4000-8000-000000000001'));
select tests.ok('S26 ingrediente ausente do payload é apagado',
  (select array_agg(id) from public.recipe_ingredients where content_id = '26000000-0000-4000-8000-000000000001') = array['a2600000-0000-4000-8000-000000000002'::uuid]);
select tests.expect_error('S26 updated_at antigo: stale_draft',
  $q$select public.recipe_save('26000000-0000-4000-8000-000000000001', tests.rp('X', '[]', '[]'), '2000-01-01')$q$, 'stale_draft');
select tests.expect_error('S26 unidade fora da lista: invalid_payload: ingredients.0.unit',
  $q$select public.recipe_save('26000000-0000-4000-8000-000000000001', tests.rp('X', jsonb_build_array(tests.ing('a2600000-0000-4000-8000-000000000002', 'Farinha', 1, 'xicara')), '[]'), tests.upd('26000000-0000-4000-8000-000000000001'))$q$, 'invalid_payload: ingredients.0.unit');
select tests.expect_error('S26 a gosto com quantidade: invalid_payload: ingredients.0.to_taste',
  $q$select public.recipe_save('26000000-0000-4000-8000-000000000001', tests.rp('X', jsonb_build_array(tests.ing('a2600000-0000-4000-8000-000000000002', 'Sal', 1) || '{"to_taste": true}'), '[]'), tests.upd('26000000-0000-4000-8000-000000000001'))$q$, 'invalid_payload: ingredients.0.to_taste');
select tests.expect_error('S26 61 ingredientes: too_many_ingredients',
  $q$select public.recipe_save('26000000-0000-4000-8000-000000000001', tests.rp('X', (select jsonb_agg(tests.ing(gen_random_uuid()::text, 'Item ' || g)) from generate_series(1, 61) g), '[]'), tests.upd('26000000-0000-4000-8000-000000000001'))$q$, 'too_many_ingredients');
select tests.expect_error('S26 4 categorias: too_many_categories',
  $q$select public.recipe_save('26000000-0000-4000-8000-000000000001', tests.rp('X', '[]', '[]', '["almoco","jantar","lanche","sopas"]'), tests.upd('26000000-0000-4000-8000-000000000001'))$q$, 'too_many_categories');
select tests.expect_error('S26 categoria inexistente: invalid_category',
  $q$select public.recipe_save('26000000-0000-4000-8000-000000000001', tests.rp('X', '[]', '[]', '["churrasco"]'), tests.upd('26000000-0000-4000-8000-000000000001'))$q$, 'invalid_category');
select tests.expect_error('S26 metadado de foto de outra receita: media_not_owned',
  $q$select public.recipe_save('26000000-0000-4000-8000-000000000001', tests.rp('X', '[]', '[]', '["almoco"]', '{"media":[{"id":"a2600000-0000-4000-8000-0000000000f1","position":1,"alt_text":"x"}]}'), tests.upd('26000000-0000-4000-8000-000000000001'))$q$, 'media_not_owned');
select tests.expect_error('S26 capa com foto de outra receita viola a FK composta',
  $q$select public.recipe_save('26000000-0000-4000-8000-000000000001', tests.rp('X', '[]', '[]', '["almoco"]', '{"details":{"servings":2,"cover_media_id":"a2600000-0000-4000-8000-0000000000f1"}}'), tests.upd('26000000-0000-4000-8000-000000000001'))$q$, '23503');
select tests.expect_error('S26 foto de etapa de outra receita viola a FK composta',
  $q$select public.recipe_save('26000000-0000-4000-8000-000000000001', tests.rp('X', '[]', jsonb_build_array(tests.step('a2600000-0000-4000-8000-000000000011', 'Misture.') || '{"image_media_id":"a2600000-0000-4000-8000-0000000000f1"}')), tests.upd('26000000-0000-4000-8000-000000000001'))$q$, '23503');
select tests.expect_error('S26 ingrediente de outra receita na etapa: invalid_payload: steps.0.ingredient_ids',
  $q$select public.recipe_save('26000000-0000-4000-8000-000000000001', tests.rp('X', '[]', jsonb_build_array(tests.step('a2600000-0000-4000-8000-000000000011', 'Misture.', '["a2600000-0000-4000-8000-000000000001"]'))), tests.upd('26000000-0000-4000-8000-000000000001'))$q$, 'invalid_payload: steps.0.ingredient_ids');
select tests.expect_error('S26 id de ingrediente de outra receita: forbidden',
  $q$select public.recipe_save('26000000-0000-4000-8000-000000000001', tests.rp('X', jsonb_build_array(tests.ing((select id::text from public.recipe_ingredients where content_id = public.seed_uuid('content:g1') limit 1), 'Roubado')), '[]'), tests.upd('26000000-0000-4000-8000-000000000001'))$q$, 'forbidden');
select tests.ok('S26 recusas não mudaram a receita', (select count(*) from public.recipe_ingredients where content_id = '26000000-0000-4000-8000-000000000001') = 1
  and (select count(*) from public.recipe_ingredients where content_id = public.seed_uuid('content:g1')) = 6);
select tests.ok('S26 sinalizador de confiança desligado depois da gravação', not public.is_trusted_call());
-- corpo: o body estruturado só muda pela RPC; trocar só o vídeo passa pela guarda do Stream (0026)
select tests.expect_error('S26 gravar body de receita estruturada: recipe_body_managed',
  $q$update public.content_bodies set body = '{"kind":"recipe","ingredients":[]}' where content_id = '26000000-0000-4000-8000-000000000001'$q$, 'recipe_body_managed');
select tests.expect_error('S26 vídeo do Stream sem envio do herói: stream_media_forbidden (guarda da 0026)',
  $q$update public.content_bodies set media_provider = 'cloudflare_stream', media_ref = 'b2600000000000000000000000000001' where content_id = '26000000-0000-4000-8000-000000000001'$q$, 'stream_media_forbidden');
select tests.su();
insert into public.stream_uploads (uid, creator_id, expires_at) values ('b2600000000000000000000000000002', public.seed_uuid('creator:helena'), now() + interval '30 minutes');
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
update public.content_bodies set media_provider = 'cloudflare_stream', media_ref = 'b2600000000000000000000000000002' where content_id = '26000000-0000-4000-8000-000000000001';
select tests.ok('S26 trocar só o vídeo (envio próprio) passa, sem tocar no marcador',
  (select media_provider = 'cloudflare_stream' and body = '{"kind": "recipe", "schema": 2}'::jsonb from public.content_bodies where content_id = '26000000-0000-4000-8000-000000000001'));
update public.content_bodies set media_provider = 'none', media_ref = null where content_id = '26000000-0000-4000-8000-000000000001';
-- RPC alheia
select tests.login('10000000-0000-4000-8000-000000000027', 's27marcos@test.local');
select tests.expect_error('S26 outro herói: recipe_save alheia dá forbidden',
  $q$select public.recipe_save('26000000-0000-4000-8000-000000000001', tests.rp('X', '[]', '[]'), now())$q$, 'forbidden');
select tests.expect_error('S26 recipe_save de conteúdo que não é receita: not_recipe (o dono) / forbidden (outro)',
  $q$select public.recipe_save('20000000-0000-4000-8000-000000000001', tests.rp('X', '[]', '[]'), now())$q$, 'forbidden');
select tests.anon();
select tests.expect_error('S26 visitante não executa recipe_save', $q$select public.recipe_save('26000000-0000-4000-8000-000000000001', '{}', now())$q$, 'permission denied');
select tests.ok('S26 visitante não vê os detalhes do rascunho', (select count(*) from public.recipe_details where content_id = '26000000-0000-4000-8000-000000000001') = 0);
select tests.su();
update public.content set review_status = 'in_review' where id = '26000000-0000-4000-8000-000000000001';
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select tests.expect_error('S26 rascunho em revisão: content_not_editable',
  $q$select public.recipe_save('26000000-0000-4000-8000-000000000001', tests.rp('X', '[]', '[]'), tests.upd('26000000-0000-4000-8000-000000000001'))$q$, 'content_not_editable');
select tests.su();
update public.content set review_status = 'none' where id = '26000000-0000-4000-8000-000000000001';

-- nutrição: só o admin valida; número muda → validação cai; nota da receita não derruba
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select public.recipe_save('26000000-0000-4000-8000-000000000001',
  tests.rp('Receita S26', jsonb_build_array(tests.ing('a2600000-0000-4000-8000-000000000002', 'Farinha', 200, 'g')),
           jsonb_build_array(tests.step('a2600000-0000-4000-8000-000000000011', 'Misture.')), '["almoco"]',
           '{"nutrition":{"kcal":300,"protein_g":10,"source":"chef"}}'),
  tests.upd('26000000-0000-4000-8000-000000000001'));
select tests.expect_error('S26 herói não se valida: nutrition_validation_forbidden',
  $q$select public.recipe_save('26000000-0000-4000-8000-000000000001', tests.rp('Receita S26', '[]', '[]', '["almoco"]', '{"nutrition":{"kcal":300,"validated":true,"validated_by":"Eu"}}'), tests.upd('26000000-0000-4000-8000-000000000001'))$q$, 'nutrition_validation_forbidden');
select tests.expect_error('S26 herói não executa a validação do admin',
  $q$select public.admin_validate_recipe_nutrition('26000000-0000-4000-8000-000000000001', true, 'Eu', current_date, null)$q$, 'forbidden');
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select tests.expect_error('S26 validar sem responsável: nutrition_validation_incomplete',
  $q$select public.admin_validate_recipe_nutrition('26000000-0000-4000-8000-000000000001', true, ' ', current_date, null)$q$, 'nutrition_validation_incomplete');
select public.admin_validate_recipe_nutrition('26000000-0000-4000-8000-000000000001', true, 'Nutricionista CRN 0000', current_date, 'Conferido');
select tests.ok('S26 admin valida a nutrição (responsável, data, usuário) e audita',
  (select validated and validated_by = 'Nutricionista CRN 0000' and validated_at = current_date and validated_by_user = '10000000-0000-4000-8000-000000000001'
   from public.recipe_nutrition where content_id = '26000000-0000-4000-8000-000000000001')
  and exists (select 1 from public.admin_audit where action = 'recipe_nutrition.validate' and resource_id = '26000000-0000-4000-8000-000000000001'));
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select public.recipe_save('26000000-0000-4000-8000-000000000001',
  tests.rp('Receita S26', jsonb_build_array(tests.ing('a2600000-0000-4000-8000-000000000002', 'Farinha', 200, 'g')),
           jsonb_build_array(tests.step('a2600000-0000-4000-8000-000000000011', 'Misture.')), '["almoco"]',
           '{"nutrition":{"kcal":300,"protein_g":10,"source":"chef"},"extras":{"chef_note":"Outra nota"}}'),
  tests.upd('26000000-0000-4000-8000-000000000001'));
select tests.ok('S26 gravar sem mudar números (só a nota da receita) mantém a validação',
  (select validated from public.recipe_nutrition where content_id = '26000000-0000-4000-8000-000000000001'));
select public.recipe_save('26000000-0000-4000-8000-000000000001',
  tests.rp('Receita S26', jsonb_build_array(tests.ing('a2600000-0000-4000-8000-000000000002', 'Farinha', 200, 'g')),
           jsonb_build_array(tests.step('a2600000-0000-4000-8000-000000000011', 'Misture.')), '["almoco"]',
           '{"nutrition":{"kcal":350,"protein_g":10,"source":"chef"}}'),
  tests.upd('26000000-0000-4000-8000-000000000001'));
select tests.ok('S26 mudar kcal derruba a validação (responsável, data e usuário limpos)',
  (select not validated and validated_by is null and validated_at is null and validated_by_user is null and kcal = 350
   from public.recipe_nutrition where content_id = '26000000-0000-4000-8000-000000000001'));

-- tradução publicada: título e resumo públicos; o corpo só pela RPC com acesso
select tests.su();
insert into public.content_localizations (content_id, locale, title, summary, body, status) values
  (public.seed_uuid('content:r1'), 'en', 'Morning ritual (en)', 'Summary (en)', '{"kind":"video","intro":"secret body"}', 'published')
on conflict (content_id, locale) do update set title = excluded.title, body = excluded.body, status = 'published';
select tests.anon();
select tests.ok('S26 visitante lê título e resumo da tradução publicada', (select title from public.content_localizations where content_id = public.seed_uuid('content:r1') and locale = 'en') = 'Morning ritual (en)');
select tests.expect_error('S26 visitante não lê o corpo da tradução (permission denied)', $q$select body from public.content_localizations$q$, 'permission denied');
select tests.expect_error('S26 visitante não executa content_localized_body', $q$select public.content_localized_body(public.seed_uuid('content:r1'), 'en')$q$, 'permission denied');
select tests.login('10000000-0000-4000-8000-000000000025', 's25@test.local');
select tests.expect_error('S26 consumidor também não seleciona body direto', $q$select body from public.content_localizations$q$, 'permission denied');
select tests.ok('S26 consumidor com acesso lê o corpo traduzido pela RPC; sem acesso (g5 premium) recebe nulo',
  (public.content_localized_body(public.seed_uuid('content:r1'), 'en') ->> 'intro') = 'secret body'
  and public.content_localized_body(public.seed_uuid('content:g5'), 'en') is null);
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
-- o upsert (on conflict … do update set body = excluded.body) exigiria select em body: o painel de
-- traduções passa a gravar com update e, se não houver linha, insert (nenhum dos dois lê body)
select tests.expect_error('S26 upsert com excluded.body exige ler body: recusado',
  $q$insert into public.content_localizations (content_id, locale, title, body, status) values (public.seed_uuid('content:r1'), 'en', 'x', '{}', 'draft') on conflict (content_id, locale) do update set body = excluded.body$q$, 'permission denied');
update public.content_localizations set title = 'Ritual (en, revisado)', body = '{"kind":"video","intro":"en 2"}', updated_by = auth.uid(), updated_at = now()
where content_id = public.seed_uuid('content:r1') and locale = 'en';
insert into public.content_localizations (content_id, locale, title, summary, body, status, updated_by, updated_at)
values (public.seed_uuid('content:r1'), 'es', 'Ritual (es)', null, '{"kind":"video","intro":"es"}', 'draft', auth.uid(), now());
select tests.ok('S26 admin segue gravando traduções (update e insert) e lê o rascunho pela RPC',
  (public.content_localized_body(public.seed_uuid('content:r1'), 'es') ->> 'intro') = 'es'
  and (public.content_localized_body(public.seed_uuid('content:r1'), 'en') ->> 'intro') = 'en 2');

-- especialidades e credenciais (P7): o herói pede fora da linha pública; só o texto aprovado aparece
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
update public.creator_profiles set specialties = '{cozinha de base,molhos}' where id = public.seed_uuid('creator:helena');
insert into public.creator_credentials_requests (creator_id, text) values (public.seed_uuid('creator:helena'), 'Formada em gastronomia (informado pela heroína)');
select tests.ok('S26 herói grava especialidades e pede credenciais; o perfil público segue sem texto e sem aprovação',
  (select specialties = '{cozinha de base,molhos}' and credentials is null and credentials_approved_at is null from public.creator_profiles where id = public.seed_uuid('creator:helena'))
  and (select count(*) from public.creator_credentials_requests) = 1);
select tests.expect_error('S26 herói não grava credentials direto no perfil público (coluna protegida)',
  $q$update public.creator_profiles set credentials = 'Nutricionista CRN-3 99999 (falso)' where id = public.seed_uuid('creator:helena')$q$, 'protected_column');
select tests.expect_error('S26 herói não aprova as próprias credenciais (coluna protegida)',
  $q$update public.creator_profiles set credentials_approved_at = now() where id = public.seed_uuid('creator:helena')$q$, 'protected_column');
select tests.expect_error('S26 herói não pede credenciais em nome de outro herói (RLS)',
  $q$insert into public.creator_credentials_requests (creator_id, text) values (public.seed_uuid('creator:marcos'), 'falso')$q$, '42501');
select tests.expect_error('S26 mais de 6 especialidades: check',
  $q$update public.creator_profiles set specialties = '{a,b,c,d,e,f,g}' where id = public.seed_uuid('creator:helena')$q$, '23514');
select tests.expect_error('S26 herói não executa a RPC de credenciais', $q$select public.admin_set_creator_credentials(public.seed_uuid('creator:helena'), true, 'x')$q$, 'forbidden');
select tests.login('10000000-0000-4000-8000-000000000027', 's27marcos@test.local');
select tests.ok('S26 outro herói não lê o pedido alheio', (select count(*) from public.creator_credentials_requests) = 0);
select tests.anon();
select tests.ok('S26 visitante não lê pedido nem texto pendente (API do perfil volta credentials nulo)',
  not has_table_privilege('anon', 'public.creator_credentials_requests', 'select')
  and (select credentials is null from public.creator_profiles where id = public.seed_uuid('creator:helena')));
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_set_creator_credentials(public.seed_uuid('creator:helena'), true, 'Conferido');
select tests.ok('S26 admin aprova: o texto do pedido vai para o perfil com a data (auditado)',
  (select credentials = 'Formada em gastronomia (informado pela heroína)' and credentials_approved_at is not null from public.creator_profiles where id = public.seed_uuid('creator:helena'))
  and exists (select 1 from public.admin_audit where action = 'creator.credentials' and resource_id = public.seed_uuid('creator:helena')::text));
select tests.expect_error('S26 aprovar sem pedido: credentials_empty', $q$select public.admin_set_creator_credentials(public.seed_uuid('creator:marcos'), true, 'x')$q$, 'credentials_empty');
select tests.anon();
select tests.ok('S26 visitante vê só o texto aprovado', (select credentials = 'Formada em gastronomia (informado pela heroína)' and credentials_approved_at is not null
  from public.creator_profiles where id = public.seed_uuid('creator:helena')));
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
update public.creator_credentials_requests set text = 'Nutricionista CRN-3 99999 (falso)' where creator_id = public.seed_uuid('creator:helena');
select tests.anon();
select tests.ok('S26 herói edita o pedido: texto e aprovação saem do perfil público até nova aprovação',
  (select credentials is null and credentials_approved_at is null from public.creator_profiles where id = public.seed_uuid('creator:helena')));
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_set_creator_credentials(public.seed_uuid('creator:helena'), true, 'Conferido de novo');
select public.admin_set_creator_credentials(public.seed_uuid('creator:helena'), false, 'Registro não confere');
select tests.ok('S26 admin reprova: texto e data limpos no perfil; o pedido fica para o herói corrigir',
  (select credentials is null and credentials_approved_at is null from public.creator_profiles where id = public.seed_uuid('creator:helena'))
  and exists (select 1 from public.creator_credentials_requests where creator_id = public.seed_uuid('creator:helena')));
select tests.su();
delete from public.creator_credentials_requests where creator_id = public.seed_uuid('creator:helena');
update public.creator_profiles set specialties = '{}', credentials = null where id = public.seed_uuid('creator:helena');
delete from public.recipe_media where id = 'a2600000-0000-4000-8000-0000000000f1';

-- ================================================================ S27 · Fotos de receita no Storage (0028, shim local)
-- Bucket privado; envio só na pasta do herói, em rascunho próprio de receita, com uploads ligados e
-- dentro da cota diária; mime e bytes vêm da metadata do objeto; a visibilidade segue recipe_media.
select tests.su();
select tests.ok('S27 bucket recipe-media privado, 5 MB e 3 tipos de imagem',
  (select not public and file_size_limit = 5242880 and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'] from storage.buckets where id = 'recipe-media'));
select tests.ok('S27 políticas do Storage: insert, select e delete (sem update: objeto imutável)',
  (select string_agg(cmd, ',' order by cmd) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'recipe\_media\_%') = 'DELETE,INSERT,SELECT');
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
insert into public.content (id, slug, creator_id, pillar, type, title, summary) values
  ('27000000-0000-4000-8000-000000000001', 's27-receita', public.seed_uuid('creator:helena'), 'gastronomy', 'recipe', 'Receita S27 com fotos', 'Resumo S27');
insert into storage.objects (bucket_id, name, owner_id, metadata) values
  ('recipe-media', public.seed_uuid('creator:helena') || '/27000000-0000-4000-8000-000000000001/a2700000-0000-4000-8000-000000000001.webp',
   '10000000-0000-4000-8000-000000000026', '{"mimetype":"image/webp","size":120000}'),
  ('recipe-media', public.seed_uuid('creator:helena') || '/27000000-0000-4000-8000-000000000001/a2700000-0000-4000-8000-000000000002.jpg',
   '10000000-0000-4000-8000-000000000026', '{"mimetype":"image/jpeg","size":90000}');
select tests.ok('S27 herói envia na própria pasta, em rascunho próprio, e vê os próprios objetos',
  (select count(*) from storage.objects where bucket_id = 'recipe-media' and name like public.seed_uuid('creator:helena') || '/27000000-%') = 2);
select tests.expect_error('S27 pasta de outro herói é recusada',
  $q$insert into storage.objects (bucket_id, name, owner_id, metadata) values ('recipe-media', public.seed_uuid('creator:marcos') || '/27000000-0000-4000-8000-000000000001/a2700000-0000-4000-8000-000000000009.webp', auth.uid()::text, '{"mimetype":"image/webp","size":1}')$q$, '42501');
select tests.expect_error('S27 receita publicada (g1) não recebe envio',
  $q$insert into storage.objects (bucket_id, name, owner_id, metadata) values ('recipe-media', public.seed_uuid('creator:helena') || '/' || public.seed_uuid('content:g1') || '/a2700000-0000-4000-8000-000000000009.webp', auth.uid()::text, '{"mimetype":"image/webp","size":1}')$q$, '42501');
select tests.expect_error('S27 pasta que não é uuid: recusada pela política, sem erro de conversão (22P02)',
  $q$insert into storage.objects (bucket_id, name, owner_id, metadata) values ('recipe-media', 'fotos/minhas/prato.jpg', auth.uid()::text, '{"mimetype":"image/jpeg","size":1}')$q$, '42501');
select tests.su();
update public.app_settings set value = 'false'::jsonb where key = 'recipes.uploads_enabled';
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select tests.expect_error('S27 uploads desligados (kill switch) recusam o envio',
  $q$insert into storage.objects (bucket_id, name, owner_id, metadata) values ('recipe-media', public.seed_uuid('creator:helena') || '/27000000-0000-4000-8000-000000000001/a2700000-0000-4000-8000-000000000008.webp', auth.uid()::text, '{"mimetype":"image/webp","size":1}')$q$, '42501');
select tests.expect_error('S27 uploads desligados: recipe_register_media dá uploads_disabled',
  $q$select public.recipe_register_media('27000000-0000-4000-8000-000000000001', public.seed_uuid('creator:helena') || '/27000000-0000-4000-8000-000000000001/a2700000-0000-4000-8000-000000000001.webp', 'gallery', 'x', true, null, null)$q$, 'uploads_disabled');
select tests.su();
update public.app_settings set value = 'true'::jsonb where key = 'recipes.uploads_enabled';
-- cota diária: 50 objetos nas últimas 24 h (de outros envios do mesmo usuário)
insert into storage.objects (bucket_id, name, owner_id, metadata)
select 'recipe-media', public.seed_uuid('creator:helena') || '/27000000-0000-4000-8000-000000000001/' || gen_random_uuid() || '.webp',
       '10000000-0000-4000-8000-000000000026', '{"mimetype":"image/webp","size":1000}'
from generate_series(1, 48);
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select tests.expect_error('S27 acima da cota diária (50 objetos) o envio é recusado',
  $q$insert into storage.objects (bucket_id, name, owner_id, metadata) values ('recipe-media', public.seed_uuid('creator:helena') || '/27000000-0000-4000-8000-000000000001/a2700000-0000-4000-8000-000000000007.webp', auth.uid()::text, '{"mimetype":"image/webp","size":1}')$q$, '42501');
select tests.su();
delete from storage.objects where owner_id = '10000000-0000-4000-8000-000000000026' and metadata ->> 'size' = '1000';
insert into storage.objects (bucket_id, name, owner_id, metadata) values
  ('recipe-media', public.seed_uuid('creator:helena') || '/27000000-0000-4000-8000-000000000001/a2700000-0000-4000-8000-0000000000b0.webp',
   '10000000-0000-4000-8000-000000000026', '{"mimetype":"image/webp","size":104857600}');
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select tests.expect_error('S27 acima de 100 MB no dia o envio é recusado',
  $q$insert into storage.objects (bucket_id, name, owner_id, metadata) values ('recipe-media', public.seed_uuid('creator:helena') || '/27000000-0000-4000-8000-000000000001/a2700000-0000-4000-8000-000000000007.webp', auth.uid()::text, '{"mimetype":"image/webp","size":1}')$q$, '42501');
select tests.su();
delete from storage.objects where name like '%a2700000-0000-4000-8000-0000000000b0.webp';
-- P3: conta demo do herói segue só a cota (o Marcos de teste é demo)
select tests.login('10000000-0000-4000-8000-000000000027', 's27marcos@test.local');
insert into public.content (id, slug, creator_id, pillar, type, title, summary) values
  ('27000000-0000-4000-8000-000000000002', 's27-receita-marcos', public.seed_uuid('creator:marcos'), 'gastronomy', 'recipe', 'Receita S27 do Marcos', 'Resumo');
insert into storage.objects (bucket_id, name, owner_id, metadata) values
  ('recipe-media', public.seed_uuid('creator:marcos') || '/27000000-0000-4000-8000-000000000002/a2700000-0000-4000-8000-000000000021.png',
   '10000000-0000-4000-8000-000000000027', '{"mimetype":"image/png","size":5000}');
select tests.ok('S27 conta demo do herói envia no próprio rascunho (P3: só a cota diária)',
  (select count(*) from storage.objects where owner_id = '10000000-0000-4000-8000-000000000027') = 1);

-- registrar: mime e tamanho do Storage, direitos de uso, limites
select tests.su();
insert into storage.objects (bucket_id, name, owner_id, metadata) values
  ('recipe-media', public.seed_uuid('creator:helena') || '/27000000-0000-4000-8000-000000000001/a2700000-0000-4000-8000-000000000003.png',
   '10000000-0000-4000-8000-000000000026', '{"mimetype":"text/html","size":100}'),
  ('recipe-media', public.seed_uuid('creator:helena') || '/27000000-0000-4000-8000-000000000001/a2700000-0000-4000-8000-000000000004.webp',
   '10000000-0000-4000-8000-000000000026', '{"mimetype":"image/webp","size":6000000}');
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select tests.expect_error('S27 registrar objeto que não existe: object_not_found',
  $q$select public.recipe_register_media('27000000-0000-4000-8000-000000000001', public.seed_uuid('creator:helena') || '/27000000-0000-4000-8000-000000000001/a2700000-0000-4000-8000-000000000005.webp', 'gallery', 'x', true, null, null)$q$, 'object_not_found');
select tests.expect_error('S27 registrar sem confirmar o direito de uso: rights_required',
  $q$select public.recipe_register_media('27000000-0000-4000-8000-000000000001', public.seed_uuid('creator:helena') || '/27000000-0000-4000-8000-000000000001/a2700000-0000-4000-8000-000000000001.webp', 'gallery', 'x', false, null, null)$q$, 'rights_required');
select tests.expect_error('S27 metadata text/html com extensão .png: invalid_mime (o cliente não decide o tipo)',
  $q$select public.recipe_register_media('27000000-0000-4000-8000-000000000001', public.seed_uuid('creator:helena') || '/27000000-0000-4000-8000-000000000001/a2700000-0000-4000-8000-000000000003.png', 'gallery', 'x', true, null, null)$q$, 'invalid_mime');
select tests.expect_error('S27 metadata acima de 5 MB: too_large',
  $q$select public.recipe_register_media('27000000-0000-4000-8000-000000000001', public.seed_uuid('creator:helena') || '/27000000-0000-4000-8000-000000000001/a2700000-0000-4000-8000-000000000004.webp', 'gallery', 'x', true, null, null)$q$, 'too_large');
select tests.expect_error('S27 caminho de outra pasta: invalid_path',
  $q$select public.recipe_register_media('27000000-0000-4000-8000-000000000001', public.seed_uuid('creator:marcos') || '/27000000-0000-4000-8000-000000000002/a2700000-0000-4000-8000-000000000021.png', 'gallery', 'x', true, null, null)$q$, 'invalid_path');
create temporary table t_s27_m1 as select public.recipe_register_media('27000000-0000-4000-8000-000000000001',
  public.seed_uuid('creator:helena') || '/27000000-0000-4000-8000-000000000001/a2700000-0000-4000-8000-000000000001.webp', 'gallery', 'Prato servido', true, 1200, 1500) as id;
create temporary table t_s27_m2 as select public.recipe_register_media('27000000-0000-4000-8000-000000000001',
  public.seed_uuid('creator:helena') || '/27000000-0000-4000-8000-000000000001/a2700000-0000-4000-8000-000000000002.jpg', 'step', 'Etapa 1', true, null, null) as id;
select tests.ok('S27 registro guarda tipo e tamanho lidos do Storage, direitos e autor',
  (select mime = 'image/webp' and bytes = 120000 and role = 'gallery' and position = 1 and alt_text = 'Prato servido' and rights_confirmed_at is not null
          and created_by = '10000000-0000-4000-8000-000000000026' and width = 1200
   from public.recipe_media where id = (select id from t_s27_m1))
  and (select mime = 'image/jpeg' and role = 'step' from public.recipe_media where id = (select id from t_s27_m2)));
select tests.expect_error('S27 registrar o mesmo objeto de novo: already_registered',
  $q$select public.recipe_register_media('27000000-0000-4000-8000-000000000001', public.seed_uuid('creator:helena') || '/27000000-0000-4000-8000-000000000001/a2700000-0000-4000-8000-000000000001.webp', 'gallery', 'x', true, null, null)$q$, 'already_registered');
select tests.su();
insert into public.recipe_media (content_id, creator_id, role, position, storage_path, mime, bytes, alt_text, rights_confirmed_at)
select '27000000-0000-4000-8000-000000000001', public.seed_uuid('creator:helena'), 'gallery', 2,
       public.seed_uuid('creator:helena') || '/27000000-0000-4000-8000-000000000001/' || gen_random_uuid() || '.webp', 'image/webp', 10, 'x', now()
from generate_series(1, 11);
insert into storage.objects (bucket_id, name, owner_id, metadata) values
  ('recipe-media', public.seed_uuid('creator:helena') || '/27000000-0000-4000-8000-000000000001/a2700000-0000-4000-8000-000000000006.webp',
   '10000000-0000-4000-8000-000000000026', '{"mimetype":"image/webp","size":100}');
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select tests.expect_error('S27 13ª foto de galeria: too_many_media',
  $q$select public.recipe_register_media('27000000-0000-4000-8000-000000000001', public.seed_uuid('creator:helena') || '/27000000-0000-4000-8000-000000000001/a2700000-0000-4000-8000-000000000006.webp', 'gallery', 'x', true, null, null)$q$, 'too_many_media');
select tests.su();
delete from public.recipe_media where content_id = '27000000-0000-4000-8000-000000000001' and bytes = 10;

-- visibilidade: rascunho (só o dono), no ar (galeria pública; etapa só com acesso), agendada, despublicada
select tests.anon();
select tests.ok('S27 visitante não vê objeto nem linha de rascunho',
  (select count(*) from storage.objects where name like '%/27000000-0000-4000-8000-000000000001/%') = 0
  and (select count(*) from public.recipe_media where content_id = '27000000-0000-4000-8000-000000000001') = 0);
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select public.recipe_save('27000000-0000-4000-8000-000000000001',
  tests.rp('Receita S27 com fotos', jsonb_build_array(tests.ing('a2700000-0000-4000-8000-0000000000c1', 'Ovo', 2)),
           jsonb_build_array(tests.step('a2700000-0000-4000-8000-0000000000d1', 'Misture.') || jsonb_build_object('image_media_id', (select id from t_s27_m2))), '["almoco"]',
           jsonb_build_object('details', jsonb_build_object('servings', 2, 'total_minutes', 20, 'allergens', jsonb_build_array('egg'), 'allergens_declared', true,
                                                            'cover_media_id', (select id from t_s27_m1)),
                              'media', jsonb_build_array(jsonb_build_object('id', (select id from t_s27_m1), 'position', 1, 'alt_text', 'Prato servido no prato fundo', 'caption', null)))),
  tests.upd('27000000-0000-4000-8000-000000000001'));
select tests.ok('S27 capa escolhida vira cover_url do proxy e o texto alternativo é gravado',
  (select cover_url = '/media/recipe/' || (select id from t_s27_m1) from public.content where id = '27000000-0000-4000-8000-000000000001')
  and (select alt_text = 'Prato servido no prato fundo' from public.recipe_media where id = (select id from t_s27_m1)));
select public.creator_publish_content('27000000-0000-4000-8000-000000000001');
select tests.anon();
select tests.ok('S27 publicada: visitante vê a galeria (linha e objeto) e não a foto de etapa',
  (select count(*) from public.recipe_media where content_id = '27000000-0000-4000-8000-000000000001') = 1
  and (select count(*) from storage.objects where name like '%a2700000-0000-4000-8000-000000000001.webp') = 1
  and (select count(*) from storage.objects where name like '%a2700000-0000-4000-8000-000000000002.jpg') = 0);
select tests.login('10000000-0000-4000-8000-000000000025', 's25@test.local');
select tests.ok('S27 consumidor com a etapa e acesso vê também a foto de etapa',
  (select count(*) from storage.objects where name like '%a2700000-0000-4000-8000-000000000002.jpg') = 1);
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select public.creator_unpublish_content('27000000-0000-4000-8000-000000000001');
select public.creator_publish_content('27000000-0000-4000-8000-000000000001', now() + interval '1 day');
select tests.anon();
select tests.ok('S27 agendada: ninguém de fora vê a foto até a data', (select count(*) from storage.objects where name like '%/27000000-0000-4000-8000-000000000001/%') = 0);
select tests.login('10000000-0000-4000-8000-000000000025', 's25@test.local');
select tests.ok('S27 agendada: consumidor também não vê', (select count(*) from storage.objects where name like '%/27000000-0000-4000-8000-000000000001/%') = 0);
select tests.su();
update public.content set publish_at = now() - interval '1 minute' where id = '27000000-0000-4000-8000-000000000001';
select tests.anon();
select tests.ok('S27 a data chegou: a galeria aparece sem nova ação', (select count(*) from storage.objects where name like '%a2700000-0000-4000-8000-000000000001.webp') = 1);
-- herói suspenso não enxerga a linha da foto de etapa (RLS), mas o registro é conferido sem a RLS
select tests.su();
update public.creator_profiles set status = 'suspended' where id = public.seed_uuid('creator:helena');
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
do $s27s$ declare n int; begin
  delete from storage.objects where bucket_id = 'recipe-media'
    and (name like '%a2700000-0000-4000-8000-000000000001.webp' or name like '%a2700000-0000-4000-8000-000000000002.jpg'); get diagnostics n = row_count;
  perform tests.ok('S27 herói suspenso não apaga foto registrada (galeria e etapa) de receita no ar', n = 0);
end $s27s$;
select tests.su();
update public.creator_profiles set status = 'active' where id = public.seed_uuid('creator:helena');
select tests.ok('S27 as duas fotos registradas continuam no Storage',
  (select count(*) from storage.objects where name like '%a2700000-0000-4000-8000-000000000001.webp' or name like '%a2700000-0000-4000-8000-000000000002.jpg') = 2);
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select public.creator_unpublish_content('27000000-0000-4000-8000-000000000001');
select tests.anon();
select tests.ok('S27 despublicada: a foto some', (select count(*) from storage.objects where name like '%/27000000-0000-4000-8000-000000000001/%') = 0);
-- excluir a foto: capa zera; objeto sem linha pode ser apagado pelo dono
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
create temporary table t_s27_del as select public.recipe_delete_media((select id from t_s27_m1)) as r;
select tests.ok('S27 recipe_delete_media devolve o caminho e zera a capa (detalhes e cover_url)',
  (select r ->> 'path' like '%a2700000-0000-4000-8000-000000000001.webp' from t_s27_del)
  and (select cover_media_id is null from public.recipe_details where content_id = '27000000-0000-4000-8000-000000000001')
  and (select cover_url is null from public.content where id = '27000000-0000-4000-8000-000000000001'));
select tests.login('10000000-0000-4000-8000-000000000027', 's27marcos@test.local');
select tests.expect_error('S27 outro herói não apaga a foto alheia', $q$select public.recipe_delete_media((select id from t_s27_m2))$q$, 'forbidden');
do $s27$ declare n int; begin
  delete from storage.objects where name like '%a2700000-0000-4000-8000-000000000001.webp'; get diagnostics n = row_count;
  perform tests.ok('S27 outro herói não apaga objeto alheio no Storage (0 linhas)', n = 0);
end $s27$;
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
do $s27b$ declare n int; begin
  delete from storage.objects where name like '%a2700000-0000-4000-8000-000000000001.webp'; get diagnostics n = row_count;
  perform tests.ok('S27 dono apaga o objeto que ficou sem linha', n = 1);
end $s27b$;
-- órfãos: só o service role lista
select tests.su();
insert into storage.objects (bucket_id, name, owner_id, metadata, created_at) values
  ('recipe-media', public.seed_uuid('creator:helena') || '/27000000-0000-4000-8000-000000000001/a2700000-0000-4000-8000-0000000000e1.webp',
   '10000000-0000-4000-8000-000000000026', '{"mimetype":"image/webp","size":10}', now() - interval '2 days');
select tests.ok('S27 recipe_orphan_media: só o service role; lista o objeto sem linha com mais de 24 h e não o registrado',
  has_function_privilege('service_role', 'public.recipe_orphan_media(int)', 'execute')
  and not has_function_privilege('authenticated', 'public.recipe_orphan_media(int)', 'execute')
  and not has_function_privilege('anon', 'public.recipe_orphan_media(int)', 'execute')
  and exists (select 1 from public.recipe_orphan_media(100) p where p like '%a2700000-0000-4000-8000-0000000000e1.webp')
  and not exists (select 1 from public.recipe_orphan_media(100) p where p like '%a2700000-0000-4000-8000-000000000002.jpg'));
delete from storage.objects where bucket_id = 'recipe-media' and name not like '%a2700000-0000-4000-8000-000000000002.jpg' and name not like '%a2700000-0000-4000-8000-000000000021.png';

-- ================================================================ S28 · Publicação, revisão configurável, agendamento, versões e vídeo
select tests.su();
select tests.ok('S28 regra de revisão começa desligada em todos os tipos (P1)', (select bool_and(not review_required) and count(*) = 5 from public.content_type_settings));
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select tests.expect_error('S28 nem o admin muda review_required direto', $q$update public.content_type_settings set review_required = true where type = 'recipe'$q$, 'review_required_protected');
select tests.expect_error('S28 justificativa curta: justification_required', $q$select public.admin_set_review_required('recipe', true, 'abc')$q$, 'justification_required');
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select tests.expect_error('S28 herói não executa admin_set_review_required', $q$select public.admin_set_review_required('recipe', true, 'quero ligar')$q$, 'forbidden');
insert into public.content (id, slug, creator_id, pillar, type, title, summary, cover_url) values
  ('28000000-0000-4000-8000-000000000001', 's28-completa', public.seed_uuid('creator:helena'), 'gastronomy', 'recipe', 'Receita S28 completa', 'Resumo', '/placeholders/cover-gastronomy-1.svg'),
  ('28000000-0000-4000-8000-000000000002', 's28-incompleta', public.seed_uuid('creator:helena'), 'gastronomy', 'recipe', 'Receita S28 incompleta', 'Resumo', null),
  ('28000000-0000-4000-8000-000000000003', 's28-stream', public.seed_uuid('creator:helena'), 'gastronomy', 'recipe', 'Receita S28 com vídeo', 'Resumo', '/placeholders/cover-gastronomy-2.svg'),
  ('28000000-0000-4000-8000-000000000004', 's28-arquivada', public.seed_uuid('creator:helena'), 'gastronomy', 'recipe', 'Receita S28 arquivada', 'Resumo', '/placeholders/cover-gastronomy-3.svg');
select public.recipe_save('28000000-0000-4000-8000-000000000001',
  tests.rp('Receita S28 completa', jsonb_build_array(tests.ing('a2800000-0000-4000-8000-000000000001', 'Ovo', 2), tests.ing('a2800000-0000-4000-8000-000000000002', 'Sal', null) || '{"to_taste": true}'),
           jsonb_build_array(tests.step('a2800000-0000-4000-8000-000000000011', 'Bata os ovos.', '["a2800000-0000-4000-8000-000000000001"]')), '["cafe-da-manha"]',
           '{"nutrition":{"kcal":400,"protein_g":20}}'),
  tests.upd('28000000-0000-4000-8000-000000000001'));
select public.recipe_save('28000000-0000-4000-8000-000000000002',
  tests.rp('Receita S28 incompleta', '[]', jsonb_build_array(tests.step('a2800000-0000-4000-8000-000000000021', 'Misture.')), '[]',
           '{"details":{"servings":2,"total_minutes":10}}'),
  tests.upd('28000000-0000-4000-8000-000000000002'));
select public.recipe_save('28000000-0000-4000-8000-000000000004',
  tests.rp('Receita S28 arquivada', jsonb_build_array(tests.ing('a2800000-0000-4000-8000-000000000041', 'Arroz', 1, 'cup')),
           jsonb_build_array(tests.step('a2800000-0000-4000-8000-000000000042', 'Cozinhe.'))),
  tests.upd('28000000-0000-4000-8000-000000000004'));
-- modo desligado: publica, agenda e recusa datas fora da janela e receita incompleta
create temporary table t_s28_pub as select public.creator_publish_content('28000000-0000-4000-8000-000000000001') as r;
select tests.ok('S28 revisão desligada: o herói publica a receita completa e vira a versão 1 (publish)',
  (select r ->> 'status' = 'published' and not (r ? 'publish_at') from t_s28_pub)
  and (select status = 'published' and publish_at is null and access_level = 'free' from public.content where id = '28000000-0000-4000-8000-000000000001')
  and (select count(*) = 1 and bool_and(version_no = 1 and reason = 'publish' and created_by = '10000000-0000-4000-8000-000000000026')
       from public.recipe_versions where content_id = '28000000-0000-4000-8000-000000000001'));
select public.creator_unpublish_content('28000000-0000-4000-8000-000000000001');
select public.creator_publish_content('28000000-0000-4000-8000-000000000001');
select tests.ok('S28 publicar de novo sem mudanças não duplica a versão (mesmo hash)',
  (select count(*) from public.recipe_versions where content_id = '28000000-0000-4000-8000-000000000001') = 1);
select public.creator_unpublish_content('28000000-0000-4000-8000-000000000001');
create temporary table t_s28_sched as select public.creator_publish_content('28000000-0000-4000-8000-000000000001', now() + interval '1 day') as r;
select tests.ok('S28 data futura agenda: a RPC devolve a data', (select (r ->> 'publish_at')::timestamptz = now() + interval '1 day' from t_s28_sched));
select tests.ok('S28 data futura agenda: publicada com publish_at no futuro e published_at = publish_at',
  (select status = 'published' and publish_at = now() + interval '1 day' and published_at = publish_at from public.content where id = '28000000-0000-4000-8000-000000000001'));
select tests.su();
select tests.ok('S28 data futura agenda: auditoria com a data',
  exists (select 1 from public.admin_audit where action = 'content.creator_publish' and resource_id = '28000000-0000-4000-8000-000000000001'
            and (after_data ->> 'publish_at')::timestamptz > now()));
select tests.anon();
select tests.ok('S28 agendada fica fora para o visitante', (select count(*) from public.content where id = '28000000-0000-4000-8000-000000000001') = 0
  and (select count(*) from public.recipe_details where content_id = '28000000-0000-4000-8000-000000000001') = 0);
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select public.creator_unpublish_content('28000000-0000-4000-8000-000000000001');
select tests.expect_error('S28 data no passado: invalid_publish_at', $q$select public.creator_publish_content('28000000-0000-4000-8000-000000000001', now() - interval '1 hour')$q$, 'invalid_publish_at');
select tests.expect_error('S28 data além de 365 dias: invalid_publish_at', $q$select public.creator_publish_content('28000000-0000-4000-8000-000000000001', now() + interval '400 days')$q$, 'invalid_publish_at');
select tests.expect_error('S28 receita incompleta: recipe_incomplete: cover,ingredients,category,allergens',
  $q$select public.creator_publish_content('28000000-0000-4000-8000-000000000002')$q$, 'recipe_incomplete: cover,ingredients,category,allergens');
select tests.ok('S28 sinalizador desligado depois da recusa', not public.is_trusted_call());

-- modo ligado: o próprio cenário liga e depois desliga
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_set_review_required('recipe', true, 'Teste S28: revisão de receitas ligada');
select tests.ok('S28 admin liga a revisão de receitas (auditado com a justificativa)',
  (select review_required from public.content_type_settings where type = 'recipe')
  and exists (select 1 from public.admin_audit where action = 'content_type.review_required' and resource_id = 'recipe'
                and after_data ->> 'review_required' = 'true' and justification like 'Teste S28%'));
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select tests.expect_error('S28 revisão ligada: creator_publish_content dá review_required', $q$select public.creator_publish_content('28000000-0000-4000-8000-000000000001')$q$, 'review_required');
select tests.ok('S28 revisão ligada só para receita: outros tipos seguem a regra (desligada)', not public.content_review_required('video'));
select public.submit_content_for_review('28000000-0000-4000-8000-000000000001', now() + interval '2 days');
select tests.ok('S28 envio com data sugerida grava requested_publish_at e version_id da rodada',
  (select review_status = 'in_review' from public.content where id = '28000000-0000-4000-8000-000000000001')
  and (select requested_publish_at = now() + interval '2 days' and version_id is not null and decision = 'in_review'
       from public.content_reviews where content_id = '28000000-0000-4000-8000-000000000001' order by round desc limit 1));
select tests.su();
select tests.ok('S28 envio auditado (content.submit, ator herói)',
  exists (select 1 from public.admin_audit where action = 'content.submit' and resource_id = '28000000-0000-4000-8000-000000000001' and actor_type = 'creator'));
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select tests.expect_error('S28 a versão de 1 parâmetro também roda o checklist',
  $q$select public.submit_content_for_review('28000000-0000-4000-8000-000000000002')$q$, 'recipe_incomplete');
select tests.expect_error('S28 data sugerida fora da janela: invalid_publish_at',
  $q$select public.submit_content_for_review('28000000-0000-4000-8000-000000000004', now() - interval '1 day')$q$, 'invalid_publish_at');
create temporary table t_s28_wd as select public.creator_withdraw_review('28000000-0000-4000-8000-000000000001') as r;
select tests.ok('S28 retirar da revisão fecha a rodada como devolvida e volta a rascunho editável',
  (select review_status = 'none' from public.content where id = '28000000-0000-4000-8000-000000000001')
  and (select decision = 'returned' and feedback = 'Retirado pelo herói' from public.content_reviews where content_id = '28000000-0000-4000-8000-000000000001' order by round desc limit 1));
select tests.expect_error('S28 retirar o que não está em revisão: not_in_review', $q$select public.creator_withdraw_review('28000000-0000-4000-8000-000000000001')$q$, 'not_in_review');
select public.submit_content_for_review('28000000-0000-4000-8000-000000000001');
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_review_content('28000000-0000-4000-8000-000000000001', 'approved', 'ok', now() + interval '3 days');
select tests.ok('S28 admin aprova com data: a receita fica agendada',
  (select status = 'published' and review_status = 'approved' and publish_at = now() + interval '3 days' from public.content where id = '28000000-0000-4000-8000-000000000001'));
update public.content set access_level = 'free' where id = '28000000-0000-4000-8000-000000000002';
select tests.su();
update public.content set review_status = 'in_review' where id = '28000000-0000-4000-8000-000000000002';
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select tests.expect_error('S28 aprovar receita incompleta é recusado pelo gatilho do checklist',
  $q$select public.admin_review_content('28000000-0000-4000-8000-000000000002', 'approved', 'ok')$q$, 'recipe_incomplete');
select tests.expect_error('S28 admin_set_content_status(published) em receita incompleta também é recusado',
  $q$select public.admin_set_content_status('28000000-0000-4000-8000-000000000002', 'published', 'teste')$q$, 'recipe_incomplete');
select public.admin_set_content_status('28000000-0000-4000-8000-000000000001', 'draft', 'Fim do teste de revisão');
select public.admin_set_review_required('recipe', false, 'Teste S28: volta ao padrão desligado');
select tests.su();
update public.content set review_status = 'none' where id = '28000000-0000-4000-8000-000000000002';
select tests.ok('S28 revisão volta a desligada em todos os tipos', (select bool_and(not review_required) from public.content_type_settings));

-- vídeo: guarda do Stream na gravação e conferência do uid na entrada no ar
insert into public.stream_uploads (uid, creator_id, expires_at) values
  ('b2800000000000000000000000000001', public.seed_uuid('creator:marcos'), now() + interval '30 minutes'),
  ('b2800000000000000000000000000002', public.seed_uuid('creator:helena'), now() + interval '30 minutes');
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select tests.expect_error('S28 recipe_save com o uid do Stream de outro herói: stream_media_forbidden',
  $q$select public.recipe_save('28000000-0000-4000-8000-000000000003', tests.rp('Receita S28 com vídeo', '[]', '[]', '[]', '{"video":{"provider":"cloudflare_stream","ref":"b2800000000000000000000000000001"}}'), tests.upd('28000000-0000-4000-8000-000000000003'))$q$, 'stream_media_forbidden');
select public.recipe_save('28000000-0000-4000-8000-000000000003',
  tests.rp('Receita S28 com vídeo', jsonb_build_array(tests.ing('a2800000-0000-4000-8000-000000000031', 'Arroz', 1, 'cup')),
           jsonb_build_array(tests.step('a2800000-0000-4000-8000-000000000032', 'Cozinhe.')), '["almoco"]',
           '{"video":{"provider":"cloudflare_stream","ref":"b2800000000000000000000000000002"}}'),
  tests.upd('28000000-0000-4000-8000-000000000003'));
select tests.ok('S28 recipe_save com o próprio envio grava o vídeo e mantém o marcador',
  (select media_provider = 'cloudflare_stream' and media_ref = 'b2800000000000000000000000000002' and body = '{"kind": "recipe", "schema": 2}'::jsonb
   from public.content_bodies where content_id = '28000000-0000-4000-8000-000000000003'));
select tests.su();
update public.content_bodies set media_provider = 'cloudflare_stream', media_ref = 'b2800000000000000000000000000001' where content_id = '28000000-0000-4000-8000-000000000001';
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select tests.expect_error('S28 uid alheio gravado como sistema: entrar no ar dá recipe_incomplete: stream',
  $q$select public.admin_set_content_status('28000000-0000-4000-8000-000000000001', 'published', 'teste')$q$, 'recipe_incomplete: stream');
select tests.su();
update public.content_bodies set media_provider = 'none', media_ref = null where content_id = '28000000-0000-4000-8000-000000000001';

-- limpeza diária do Stream: rascunho de receita com envio vencido perde só o vídeo
update public.stream_uploads set content_id = '28000000-0000-4000-8000-000000000003', created_at = now() - interval '9 hours', expires_at = now() - interval '3 hours'
where uid = 'b2800000000000000000000000000002';
create temporary table t_s28_q as select * from public.stream_cleanup_candidates(now() - interval '1 hour', 500) where uid = 'b2800000000000000000000000000002';
select tests.ok('S28 fila da limpeza: receita com vídeo vencido entra sem draft_id (nunca é apagada) e referenciada',
  (select count(*) = 1 and bool_and(draft_id is null and referenced) from t_s28_q));
select tests.ok('S28 descarte com id de receita recusa (a limpeza nunca apaga receita)',
  public.stream_cleanup_discard('b2800000000000000000000000000002', '28000000-0000-4000-8000-000000000003') = false);
create temporary table t_s28_disc as select public.stream_cleanup_discard('b2800000000000000000000000000002', null) as r;
select tests.ok('S28 descarte sem rascunho: a receita continua, fica sem vídeo e o envio sai como descartado',
  (select r from t_s28_disc)
  and exists (select 1 from public.content where id = '28000000-0000-4000-8000-000000000003')
  and (select media_provider = 'none' and media_ref is null and body = '{"kind": "recipe", "schema": 2}'::jsonb from public.content_bodies where content_id = '28000000-0000-4000-8000-000000000003')
  and (select discarded_at is not null from public.stream_uploads where uid = 'b2800000000000000000000000000002')
  and exists (select 1 from public.admin_audit where action = 'content.cleanup_media' and resource_id = '28000000-0000-4000-8000-000000000003' and actor_type = 'system'));

-- versões: imutáveis, lidas pelo dono, restauráveis
select tests.expect_error('S28 versão não muda (update)', $q$update public.recipe_versions set reason = 'admin_edit' where content_id = '28000000-0000-4000-8000-000000000001'$q$, 'version_immutable');
select tests.expect_error('S28 versão não sai (delete) enquanto o conteúdo existe', $q$delete from public.recipe_versions where content_id = '28000000-0000-4000-8000-000000000001'$q$, 'version_immutable');
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select tests.ok('S28 dono lê as próprias versões', (select count(*) from public.recipe_versions where content_id = '28000000-0000-4000-8000-000000000001') >= 1);
select public.recipe_save('28000000-0000-4000-8000-000000000001',
  tests.rp('Receita S28 completa', jsonb_build_array(tests.ing('a2800000-0000-4000-8000-000000000001', 'Ovo caipira', 3)),
           jsonb_build_array(tests.step('a2800000-0000-4000-8000-000000000011', 'Bata bem os ovos.')), '["cafe-da-manha"]',
           '{"nutrition":{"kcal":400,"protein_g":20}}'),
  tests.upd('28000000-0000-4000-8000-000000000001'));
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_validate_recipe_nutrition('28000000-0000-4000-8000-000000000001', true, 'Nutricionista CRN 1111', current_date, null);
select tests.login('10000000-0000-4000-8000-000000000027', 's27marcos@test.local');
select tests.ok('S28 outro herói lê 0 versões da receita alheia', (select count(*) from public.recipe_versions where content_id = '28000000-0000-4000-8000-000000000001') = 0);
select tests.expect_error('S28 outro herói não restaura versão alheia: version_not_found',
  $q$select public.creator_restore_recipe_version((select id from public.recipe_versions where content_id = '28000000-0000-4000-8000-000000000001' limit 1))$q$, 'version_not_found');
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
create temporary table t_s28_rest as select public.creator_restore_recipe_version(
  (select id from public.recipe_versions where content_id = '28000000-0000-4000-8000-000000000001' and version_no = 1)) as r;
select tests.ok('S28 restaurar a versão 1 volta ingredientes e etapas; a nutrição volta sem validação',
  (select string_agg(name || ':' || coalesce(quantity::text, '-') || ':' || to_taste, ',' order by position) from public.recipe_ingredients where content_id = '28000000-0000-4000-8000-000000000001')
    = 'Ovo:2.000:false,Sal:-:true'
  and (select instruction from public.recipe_steps where content_id = '28000000-0000-4000-8000-000000000001') = 'Bata os ovos.'
  and (select count(*) from public.recipe_step_ingredients where content_id = '28000000-0000-4000-8000-000000000001') = 1
  and (select not validated and validated_by is null and kcal = 400 from public.recipe_nutrition where content_id = '28000000-0000-4000-8000-000000000001'));
select tests.su();
select tests.ok('S28 restauração auditada (recipe.version_restore)',
  exists (select 1 from public.admin_audit where action = 'recipe.version_restore' and resource_id = '28000000-0000-4000-8000-000000000001'));
insert into public.recipe_versions (content_id, version_no, reason, snapshot, snapshot_hash)
values ('28000000-0000-4000-8000-000000000002', 1, 'restore_point', '{"legacy_body":{"kind":"recipe"}}', 'x');
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select tests.expect_error('S28 restore_point (corpo v1) não é reconstruível: version_not_restorable',
  $q$select public.creator_restore_recipe_version((select id from public.recipe_versions where content_id = '28000000-0000-4000-8000-000000000002' and reason = 'restore_point'))$q$, 'version_not_restorable');

-- ciclo de vida: arquivar, restaurar, excluir rascunho nunca publicado e duplicar
select public.submit_content_for_review('28000000-0000-4000-8000-000000000004');
create temporary table t_s28_arch as select public.creator_archive_content('28000000-0000-4000-8000-000000000004', 'Pausa') as r;
select tests.ok('S28 arquivar receita em revisão fecha a rodada ("Arquivada pelo herói") e grava archived_by=creator',
  (select status = 'archived' and archived_by = 'creator' and review_status = 'none' and archived_at is not null from public.content where id = '28000000-0000-4000-8000-000000000004')
  and (select decision = 'returned' and feedback = 'Arquivada pelo herói' from public.content_reviews where content_id = '28000000-0000-4000-8000-000000000004' order by round desc limit 1));
select tests.expect_error('S28 arquivar de novo: already_archived', $q$select public.creator_archive_content('28000000-0000-4000-8000-000000000004', null)$q$, 'already_archived');
select public.creator_restore_content('28000000-0000-4000-8000-000000000004');
select tests.ok('S28 herói restaura o que ele arquivou (volta a rascunho)', (select status = 'draft' and archived_by is null and review_status = 'none' from public.content where id = '28000000-0000-4000-8000-000000000004'));
select tests.expect_error('S28 restaurar o que não está arquivado: not_archived', $q$select public.creator_restore_content('28000000-0000-4000-8000-000000000004')$q$, 'not_archived');
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_set_content_status('28000000-0000-4000-8000-000000000004', 'archived', 'Teste S28: trava do admin');
select tests.ok('S28 arquivar pelo admin grava archived_by=admin', (select archived_by = 'admin' from public.content where id = '28000000-0000-4000-8000-000000000004'));
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select tests.expect_error('S28 restaurar o que o admin arquivou: archived_by_admin', $q$select public.creator_restore_content('28000000-0000-4000-8000-000000000004')$q$, 'archived_by_admin');
select tests.expect_error('S28 excluir receita que já esteve no ar: already_published', $q$select public.creator_delete_recipe_draft('28000000-0000-4000-8000-000000000001')$q$, 'already_published');
select tests.expect_error('S28 excluir conteúdo que não é receita: forbidden para quem não é dono', $q$select public.creator_delete_recipe_draft('20000000-0000-4000-8000-000000000001')$q$, 'forbidden');
create temporary table t_s28_drop as select public.creator_delete_recipe_draft('28000000-0000-4000-8000-000000000002') as r;
select tests.ok('S28 excluir rascunho nunca publicado apaga a receita (e a versão, em cascata) e devolve os caminhos',
  (select r -> 'paths' = '[]'::jsonb from t_s28_drop)
  and not exists (select 1 from public.content where id = '28000000-0000-4000-8000-000000000002')
  and not exists (select 1 from public.recipe_versions where content_id = '28000000-0000-4000-8000-000000000002'));
select tests.expect_error('S28 duplicar origem arquivada pelo admin: source_locked',
  $q$select public.creator_duplicate_recipe('28000000-0000-4000-8000-000000000004', 'Cópia', 's28-copia-arquivada')$q$, 'source_locked');
select tests.su();
update public.content set review_status = 'rejected' where id = '28000000-0000-4000-8000-000000000003';
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select tests.expect_error('S28 duplicar origem rejeitada: source_locked',
  $q$select public.creator_duplicate_recipe('28000000-0000-4000-8000-000000000003', 'Cópia', 's28-copia-rejeitada')$q$, 'source_locked');
select tests.su();
update public.content set review_status = 'none' where id = '28000000-0000-4000-8000-000000000003';
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
create temporary table t_s28_dup as select public.creator_duplicate_recipe('28000000-0000-4000-8000-000000000001', 'Receita S28 (cópia)', 's28-copia') as id;
select tests.ok('S28 duplicar cria rascunho com ids novos (ingredientes, etapas, ligação etapa↔ingrediente), sem mídia, vídeo nem versões',
  (select status = 'draft' and review_status = 'none' and type = 'recipe' and published_at is null and title = 'Receita S28 (cópia)' from public.content where id = (select id from t_s28_dup))
  and (select count(*) from public.recipe_ingredients where content_id = (select id from t_s28_dup)) = 2
  and not exists (select 1 from public.recipe_ingredients a join public.recipe_ingredients b on a.id = b.id
                  where a.content_id = (select id from t_s28_dup) and b.content_id = '28000000-0000-4000-8000-000000000001')
  and (select count(*) from public.recipe_step_ingredients si join public.recipe_ingredients i on i.id = si.ingredient_id and i.content_id = si.content_id
       where si.content_id = (select id from t_s28_dup)) = 1
  and (select not validated from public.recipe_nutrition where content_id = (select id from t_s28_dup))
  and (select count(*) from public.recipe_media where content_id = (select id from t_s28_dup)) = 0
  and (select count(*) from public.recipe_versions where content_id = (select id from t_s28_dup)) = 0
  and (select media_provider = 'none' from public.content_bodies where content_id = (select id from t_s28_dup)));
select tests.expect_error('S28 duplicar com slug em uso: slug_taken', $q$select public.creator_duplicate_recipe('28000000-0000-4000-8000-000000000001', 'Outra cópia', 's28-copia')$q$, 'slug_taken');
select tests.su();
select tests.ok('S28 auditoria de cada ação do ciclo de vida',
  (select count(distinct action) from public.admin_audit where action in ('content.submit', 'content.creator_withdraw', 'content.creator_archive', 'content.creator_restore',
     'content.creator_delete', 'content.creator_duplicate', 'content_type.review_required', 'recipe.version', 'recipe_nutrition.validate', 'content.creator_publish')) = 10);
select tests.ok('S28 nada do cenário ficou no ar', not exists (select 1 from public.content where (id::text like '28000000-%' or slug like 's28-%') and status = 'published'));

-- ================================================================ S29 · Avaliações e comentários (0027)
select tests.login('10000000-0000-4000-8000-000000000029', 's29free@test.local');
select tests.expect_error('S29 sem ter concluído a receita a avaliação é recusada',
  $q$insert into public.recipe_ratings (content_id, stars) values (public.seed_uuid('content:g3'), 4)$q$, '42501');
select public.complete_content(public.seed_uuid('content:g1'), 'America/Sao_Paulo');
select tests.expect_error('S29 0 estrelas é recusado', $q$insert into public.recipe_ratings (content_id, stars) values (public.seed_uuid('content:g1'), 0)$q$, '23514');
select tests.expect_error('S29 6 estrelas é recusado', $q$insert into public.recipe_ratings (content_id, stars) values (public.seed_uuid('content:g1'), 6)$q$, '23514');
select tests.expect_error('S29 avaliar conteúdo que não é receita: not_recipe', $q$insert into public.recipe_ratings (content_id, stars) values (public.seed_uuid('content:r1'), 4)$q$, 'not_recipe');
insert into public.recipe_ratings (content_id, stars) values (public.seed_uuid('content:g1'), 4);
select tests.ok('S29 quem concluiu avalia; o agregado público acompanha (1 avaliação, soma 4); is_demo falso',
  (select rating_count = 1 and rating_sum = 4 from public.recipe_details where content_id = public.seed_uuid('content:g1'))
  and (select not is_demo and user_id = auth.uid() from public.recipe_ratings where content_id = public.seed_uuid('content:g1')));
select tests.expect_error('S29 segunda avaliação não é outra linha (é update)', $q$insert into public.recipe_ratings (content_id, stars) values (public.seed_uuid('content:g1'), 5)$q$, '23505');
update public.recipe_ratings set stars = 5 where content_id = public.seed_uuid('content:g1');
select tests.ok('S29 update das estrelas ajusta o agregado (1, soma 5)', (select rating_count = 1 and rating_sum = 5 from public.recipe_details where content_id = public.seed_uuid('content:g1')));
select tests.expect_error('S29 mudar content_id da avaliação: permission denied', $q$update public.recipe_ratings set content_id = public.seed_uuid('content:g3')$q$, 'permission denied');
select tests.expect_error('S29 gravar is_demo pelo cliente: permission denied', $q$update public.recipe_ratings set is_demo = true$q$, 'permission denied');
select tests.su();
update public.app_settings set value = 'false'::jsonb where key = 'recipes.ratings_enabled';
select tests.login('10000000-0000-4000-8000-000000000029', 's29free@test.local');
select public.complete_content(public.seed_uuid('content:g3'), 'America/Sao_Paulo');
select tests.expect_error('S29 avaliações desligadas: recusa', $q$insert into public.recipe_ratings (content_id, stars) values (public.seed_uuid('content:g3'), 3)$q$, '42501');
select tests.su();
update public.app_settings set value = 'true'::jsonb where key = 'recipes.ratings_enabled';
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select public.complete_content(public.seed_uuid('content:g1'), 'America/Sao_Paulo');
select tests.expect_error('S29 o chef não avalia a própria receita', $q$insert into public.recipe_ratings (content_id, stars) values (public.seed_uuid('content:g1'), 5)$q$, '42501');
select tests.login('10000000-0000-4000-8000-000000000030', 's30demo@test.local');
select public.complete_content(public.seed_uuid('content:g1'), 'America/Sao_Paulo');
insert into public.recipe_ratings (content_id, stars) values (public.seed_uuid('content:g1'), 1);
select tests.ok('S29 conta demo avalia, mas fica marcada e fora do agregado (segue 1, soma 5)',
  (select is_demo from public.recipe_ratings where content_id = public.seed_uuid('content:g1'))
  and (select rating_count = 1 and rating_sum = 5 from public.recipe_details where content_id = public.seed_uuid('content:g1')));
select tests.login('10000000-0000-4000-8000-000000000029', 's29free@test.local');
select tests.ok('S29 a pessoa só lê as próprias avaliações', (select count(*) from public.recipe_ratings) = 1);
delete from public.recipe_ratings where content_id = public.seed_uuid('content:g1');
select tests.ok('S29 apagar a avaliação desconta do agregado (0, soma 0; a de demo não conta)',
  (select rating_count = 0 and rating_sum = 0 from public.recipe_details where content_id = public.seed_uuid('content:g1')));
select tests.anon();
select tests.expect_error('S29 visitante não lê avaliações (só o agregado)', $q$select count(*) from public.recipe_ratings$q$, 'permission denied');
-- comentários: modelados e desligados; ligados só entram pendentes; admin modera
select tests.login('10000000-0000-4000-8000-000000000029', 's29free@test.local');
select tests.expect_error('S29 comentários desligados: recusa', $q$insert into public.recipe_comments (content_id, body) values (public.seed_uuid('content:g1'), 'Ótima receita')$q$, '42501');
select tests.su();
update public.app_settings set value = 'true'::jsonb where key = 'recipes.comments_enabled';
select tests.login('10000000-0000-4000-8000-000000000029', 's29free@test.local');
insert into public.recipe_comments (content_id, body) values (public.seed_uuid('content:g1'), 'Ótima receita, ficou leve.');
select tests.expect_error('S29 comentário não nasce aprovado (status fora do grant)', $q$insert into public.recipe_comments (content_id, body, status) values (public.seed_uuid('content:g1'), 'Aprovado por mim', 'approved')$q$, 'permission denied');
create temporary table t_s29_c as select id from public.recipe_comments where status = 'pending';
select tests.ok('S29 comentário entra como pendente e o autor o vê', (select count(*) from t_s29_c) = 1);
select tests.anon();
select tests.ok('S29 visitante não vê o pendente', (select count(*) from public.recipe_comments) = 0);
select tests.expect_error('S29 visitante não seleciona o autor (user_id fora do grant)', $q$select user_id from public.recipe_comments$q$, 'permission denied');
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select tests.expect_error('S29 rejeitar sem motivo: reason_required', $q$select public.admin_moderate_recipe_comment((select id from t_s29_c), 'rejected', null)$q$, 'reason_required');
select public.admin_moderate_recipe_comment((select id from t_s29_c), 'approved', null);
select tests.anon();
select tests.ok('S29 aprovado pelo admin, o visitante vê (texto e data, sem autor)', (select count(*) from public.recipe_comments where content_id = public.seed_uuid('content:g1')) = 1);
select tests.login('10000000-0000-4000-8000-000000000029', 's29free@test.local');
select tests.expect_error('S29 autor não edita o comentário', $q$update public.recipe_comments set body = 'Editado'$q$, 'permission denied');
delete from public.recipe_comments where id = (select id from t_s29_c);
select tests.anon();
select tests.ok('S29 autor exclui o próprio comentário', (select count(*) from public.recipe_comments) = 0);
select tests.su();
update public.app_settings set value = 'false'::jsonb where key = 'recipes.comments_enabled';
select tests.ok('S29 moderação auditada', exists (select 1 from public.admin_audit where action = 'recipe_comment.moderate'));

-- ================================================================ S30 · Ingrediente ↔ produto e lista de compras (0027)
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
create temporary table t_s30_l1 as select public.creator_suggest_ingredient_product(
  (select id from public.recipe_ingredients where content_id = public.seed_uuid('content:g1') and position = 1), public.seed_uuid('product:m1'), 'Bowl pronto') as id;
select tests.ok('S30 herói sugere produto para o ingrediente da própria receita', (select status from public.recipe_ingredient_products where id = (select id from t_s30_l1)) = 'suggested');
select tests.login('10000000-0000-4000-8000-000000000027', 's27marcos@test.local');
select tests.expect_error('S30 outro herói não sugere para receita alheia',
  $q$select public.creator_suggest_ingredient_product((select id from public.recipe_ingredients where content_id = public.seed_uuid('content:g1') and position = 1), public.seed_uuid('product:m2'), null)$q$, 'forbidden');
select tests.expect_error('S30 outro herói não retira sugestão alheia', $q$select public.creator_withdraw_ingredient_product((select id from t_s30_l1))$q$, 'forbidden');
select tests.login('10000000-0000-4000-8000-000000000029', 's29free@test.local');
select tests.ok('S30 consumidor não vê sugestão', (select count(*) from public.recipe_ingredient_products) = 0);
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_set_ingredient_product((select id from t_s30_l1), 'validated', 'Confere');
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
create temporary table t_s30_l2 as select public.creator_suggest_ingredient_product(
  (select id from public.recipe_ingredients where content_id = public.seed_uuid('content:g1') and position = 1), public.seed_uuid('product:m2'), null) as id;
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_set_ingredient_product((select id from t_s30_l2), 'validated', null);
select tests.ok('S30 admin valida (auditado) e só um vínculo fica validado por ingrediente (o anterior é suspenso)',
  (select status = 'suspended' and suspended_reason = 'replaced' from public.recipe_ingredient_products where id = (select id from t_s30_l1))
  and (select status = 'validated' and validated_by = auth.uid() and product_version_at_validation is not null from public.recipe_ingredient_products where id = (select id from t_s30_l2))
  and exists (select 1 from public.admin_audit where action = 'recipe_ingredient_product.set_status'));
select tests.login('10000000-0000-4000-8000-000000000029', 's29free@test.local');
select tests.ok('S30 consumidor com acesso vê só o validado', (select count(*) from public.recipe_ingredient_products) = 1);
select tests.su();
update public.products set title = title || ' (versão nova)' where id = public.seed_uuid('product:m2');
select tests.ok('S30 mudança relevante no produto suspende o vínculo', (select status from public.recipe_ingredient_products where id = (select id from t_s30_l2)) = 'suspended');
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_set_ingredient_product((select id from t_s30_l1), 'validated', 'De volta');
select tests.su();
update public.products set price_cents_demo = price_cents_demo + 100 where id = public.seed_uuid('product:m1');
select tests.ok('S30 mudança de preço não suspende', (select status from public.recipe_ingredient_products where id = (select id from t_s30_l1)) = 'validated');
-- restaura o seed: o vínculo de conteúdo g8→m2 também foi suspenso pela mudança de título
update public.products set title = replace(title, ' (versão nova)', '') where id = public.seed_uuid('product:m2');
update public.content_product_links set status = 'validated', suspended_reason = null where id = public.seed_uuid('link:g8:m2');
-- lista de compras
select tests.login('10000000-0000-4000-8000-000000000029', 's29free@test.local');
select tests.expect_error('S30 cliente não grava product_id (fora do grant)',
  $q$insert into public.shopping_list_items (name, product_id) values ('Peito de frango', public.seed_uuid('product:m3'))$q$, 'permission denied');
insert into public.shopping_list_items (ingredient_id, name, quantity, unit)
values ((select id from public.recipe_ingredients where content_id = public.seed_uuid('content:g1') and position = 1), 'Peito de frango', 300, 'g'),
       ((select id from public.recipe_ingredients where content_id = public.seed_uuid('content:g1') and position = 2), 'Abobrinha', 1, null);
select tests.ok('S30 o produto vem do vínculo validado (ou nulo) e o item fica preso à receita',
  (select product_id = public.seed_uuid('product:m1') and content_id = public.seed_uuid('content:g1') from public.shopping_list_items where name = 'Peito de frango')
  and (select product_id is null from public.shopping_list_items where name = 'Abobrinha'));
insert into public.shopping_list_items (ingredient_id, name, quantity, unit)
values ((select id from public.recipe_ingredients where content_id = public.seed_uuid('content:g1') and position = 1), 'Peito de frango', 600, 'g')
on conflict (user_id, ingredient_id) do update set quantity = excluded.quantity;
select tests.ok('S30 adicionar o mesmo ingrediente de novo atualiza a linha', (select count(*) from public.shopping_list_items) = 2
  and (select quantity = 600 from public.shopping_list_items where name = 'Peito de frango'));
select tests.expect_error('S30 ingrediente de outra receita: ingredient_mismatch',
  $q$insert into public.shopping_list_items (content_id, ingredient_id, name) values (public.seed_uuid('content:g3'), (select id from public.recipe_ingredients where content_id = public.seed_uuid('content:g1') and position = 3), 'x')$q$, 'ingredient_mismatch');
select tests.expect_error('S30 item de receita sem acesso (g5 premium) é recusado',
  $q$insert into public.shopping_list_items (content_id, name) values (public.seed_uuid('content:g5'), 'Salmão')$q$, '42501');
insert into public.shopping_list_items (name) select 'Item ' || g from generate_series(1, 298) as g;
select tests.expect_error('S30 o 301º item: shopping_list_full', $q$insert into public.shopping_list_items (name) values ('Item 301')$q$, 'shopping_list_full');
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select tests.ok('S30 admin não lê a lista de ninguém (dado pessoal)', (select count(*) from public.shopping_list_items) = 0);
select tests.login('10000000-0000-4000-8000-000000000029', 's29free@test.local');
delete from public.shopping_list_items where name like 'Item %';
select tests.su();
delete from public.recipe_ingredient_products;

-- ================================================================ S31 · Histórico, retenção, estatísticas e catálogo (0027)
select tests.login('10000000-0000-4000-8000-000000000029', 's29free@test.local');
select tests.expect_error('S31 sem a preferência ligada o histórico recusa', $q$insert into public.recipe_view_history (content_id) values (public.seed_uuid('content:g1'))$q$, '42501');
insert into public.user_recipe_prefs (history_enabled) values (true);
select tests.ok('S31 ligar o histórico registra a data', (select history_enabled and history_enabled_at is not null from public.user_recipe_prefs));
-- datas são do banco: o titular não reescreve a do consentimento nem manda acesso no futuro
update public.user_recipe_prefs set history_enabled_at = '2020-01-01';
select tests.ok('S31 history_enabled_at não é editável pelo titular (fica a data gravada pelo banco)',
  (select history_enabled_at = now() from public.user_recipe_prefs));
insert into public.recipe_view_history (content_id, viewed_at) values (public.seed_uuid('content:g1'), '2999-01-01');
select tests.ok('S31 viewed_at enviado pelo cliente é trocado por now() (não escapa da retenção de 90 dias)',
  (select viewed_at = now() from public.recipe_view_history));
update public.recipe_view_history set viewed_at = '2999-01-01';
select tests.ok('S31 update de viewed_at pelo cliente também vira now()', (select viewed_at = now() from public.recipe_view_history));
insert into public.recipe_view_history (content_id, viewed_at) values (public.seed_uuid('content:g1'), now())
on conflict (user_id, content_id) do update set viewed_at = excluded.viewed_at;
select tests.ok('S31 ligado: o upsert só atualiza viewed_at (uma linha por receita)', (select count(*) from public.recipe_view_history) = 1);
select tests.expect_error('S31 histórico só de receita visível (rascunho alheio não)', $q$insert into public.recipe_view_history (content_id) values ('28000000-0000-4000-8000-000000000001')$q$, '42501');
update public.user_recipe_prefs set history_enabled = false;
select tests.ok('S31 desligar apaga o histórico na mesma transação', (select count(*) from public.recipe_view_history) = 0
  and (select history_enabled_at is null from public.user_recipe_prefs));
update public.user_recipe_prefs set history_enabled = true;
insert into public.recipe_view_history (content_id) values (public.seed_uuid('content:g3'));
select tests.su();
update public.recipe_view_history set viewed_at = now() - interval '91 days' where user_id = '10000000-0000-4000-8000-000000000029';
create temporary table t_s31_ret as select public.run_retention() as r;
select tests.ok('S31 run_retention apaga o histórico com mais de 90 dias',
  ((select r from t_s31_ret) ->> 'recipe_history_deleted')::int >= 1
  and not exists (select 1 from public.recipe_view_history where user_id = '10000000-0000-4000-8000-000000000029'));
-- estatísticas do herói: visitantes distintos por dia, sem o próprio chef nem evento sem pessoa
insert into public.analytics_events (user_id, anon_id, event_name, properties, created_at) values
  ('10000000-0000-4000-8000-000000000029', null, 'content.view', jsonb_build_object('content_id', public.seed_uuid('content:g1')), now()),
  ('10000000-0000-4000-8000-000000000029', null, 'content.view', jsonb_build_object('content_id', public.seed_uuid('content:g1')), now()),
  ('10000000-0000-4000-8000-000000000029', null, 'content.view', jsonb_build_object('content_id', public.seed_uuid('content:g1')), now() - interval '1 day'),
  (null, 'anon-s31', 'content.view', jsonb_build_object('content_id', public.seed_uuid('content:g1')), now()),
  ('10000000-0000-4000-8000-000000000026', null, 'content.view', jsonb_build_object('content_id', public.seed_uuid('content:g1')), now()),
  (null, null, 'content.view', jsonb_build_object('content_id', public.seed_uuid('content:g1')), now());
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
create temporary table t_s31_stats as select * from public.creator_recipe_stats(30);
select tests.ok('S31 estatísticas: 3 visitantes distintos por dia em g1 (sem o chef e sem evento sem pessoa), só receitas da Helena',
  (select visitors = 3 and rating_count = 0 and rating_avg is null from t_s31_stats where content_id = public.seed_uuid('content:g1'))
  and not exists (select 1 from t_s31_stats s join public.content c on c.id = s.content_id where c.creator_id is distinct from public.seed_uuid('creator:helena'))
  and (select count(*) from t_s31_stats where content_id in (public.seed_uuid('content:g1'), public.seed_uuid('content:g3'), public.seed_uuid('content:g5'), public.seed_uuid('content:g9'))) = 4);
select tests.login('10000000-0000-4000-8000-000000000029', 's29free@test.local');
select tests.expect_error('S31 consumidor não lê estatísticas de herói', $q$select * from public.creator_recipe_stats(30)$q$, 'forbidden');
select tests.anon();
select tests.expect_error('S31 visitante não executa creator_recipe_stats', $q$select * from public.creator_recipe_stats(30)$q$, 'permission denied');
-- catálogo: só o que está no ar, para visitante, herói dono de rascunho e agendada, e admin
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select public.creator_publish_content('28000000-0000-4000-8000-000000000001', now() + interval '1 day');
select tests.anon();
create temporary table t_s31_anon as select * from public.recipe_catalog(null, null, null, null, null, null, null, 'recent', null, 48);
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
create temporary table t_s31_hero as select * from public.recipe_catalog(null, null, null, null, null, null, null, 'recent', null, 48);
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
create temporary table t_s31_admin as select * from public.recipe_catalog(null, null, null, null, null, null, null, 'recent', null, 48);
select tests.su();
select tests.ok('S31 catálogo: visitante, herói (com rascunhos e agendada) e admin recebem só as 8 receitas no ar',
  (select count(*) from t_s31_anon) = 8 and (select count(*) from t_s31_hero) = 8 and (select count(*) from t_s31_admin) = 8
  and not exists (select 1 from (select content_id from t_s31_anon union all select content_id from t_s31_hero union all select content_id from t_s31_admin) x
                  join public.content c on c.id = x.content_id where not public.content_is_live(c.status, c.publish_at))
  and not exists (select 1 from t_s31_hero where content_id = '28000000-0000-4000-8000-000000000001'));
select tests.anon();
select tests.ok('S31 "cabotiá" como visitante não encontra nada (ingrediente é protegido)',
  (select count(*) from public.recipe_catalog('cabotiá', null, null, null, null, null, null, 'relevance', null, 24)) = 0);
select tests.ok('S31 nome do chef encontra as receitas dele (Helena: g1, g3, g5, g9)',
  (select array_agg(content_id order by content_id) from public.recipe_catalog('Helena', null, null, null, null, null, null, 'relevance', null, 24))
  = (select array_agg(id order by id) from public.content where id in (public.seed_uuid('content:g1'), public.seed_uuid('content:g3'), public.seed_uuid('content:g5'), public.seed_uuid('content:g9'))));
select tests.ok('S31 até 15 minutos traz g3 e g9',
  (select array_agg(content_id order by content_id) from public.recipe_catalog(null, null, 15, null, null, null, null, 'quick', null, 24))
  = (select array_agg(id order by id) from public.content where id in (public.seed_uuid('content:g3'), public.seed_uuid('content:g9'))));
select tests.ok('S31 sem ovo traz só as declaradas sem ovo (g5); "não informado" não passa',
  (select array_agg(content_id) from public.recipe_catalog(null, null, null, null, null, array['egg'], null, 'recent', null, 24)) = array[public.seed_uuid('content:g5')]);
select tests.ok('S31 filtro de categoria e de dieta (nenhuma dieta declarada no seed)',
  (select count(*) from public.recipe_catalog(null, array['marmitas'], null, null, null, null, null, 'recent', null, 24)) = 2
  and (select count(*) from public.recipe_catalog(null, null, null, null, array['vegan'], null, null, 'recent', null, 24)) = 0);
do $s31$ declare v_sort text; v_cursor text; v_seen uuid[]; v_page int; r record; n int;
begin
  foreach v_sort in array array['recent', 'quick', 'relevance'] loop
    v_cursor := null; v_seen := '{}'; v_page := 0;
    loop
      n := 0;
      for r in select * from public.recipe_catalog(null, null, null, null, null, null, null, v_sort, v_cursor, 3) loop
        if r.content_id = any (v_seen) then raise exception 'FAIL S31 cursor % repetiu %', v_sort, r.content_id; end if;
        v_seen := array_append(v_seen, r.content_id); v_cursor := r.cursor; n := n + 1;
      end loop;
      v_page := v_page + 1;
      exit when n < 3 or v_page > 10;
    end loop;
    perform tests.ok('S31 cursor (' || v_sort || ') pagina de 3 em 3 sem repetir e cobre as 8', cardinality(v_seen) = 8);
  end loop;
end $s31$;
select tests.login('10000000-0000-4000-8000-000000000028', 's28prem@test.local');
select public.select_modules(array[public.seed_uuid('module:chef_full')]);
select tests.ok('S31 premium com a etapa encontra g8 por "cabotiá" (ingrediente)',
  exists (select 1 from public.recipe_catalog('cabotiá', null, null, null, null, null, null, 'relevance', null, 24) where content_id = public.seed_uuid('content:g8')));
select tests.expect_error('S31 cursor que não é do formato: invalid_cursor', $q$select * from public.recipe_catalog(null, null, null, null, null, null, null, 'recent', 'abc', 3)$q$, 'invalid_cursor');
select tests.login('10000000-0000-4000-8000-000000000026', 's26helena@test.local');
select public.creator_unpublish_content('28000000-0000-4000-8000-000000000001');

-- ================================================================ S32 · Exclusão de conta com dados de receitas (0027)
-- Herói com versões e mídia (Marcos), comentarista com avaliação, lista, histórico e comentário, e um
-- admin que validou nutrição saem por delete_my_account; um herói sai pelo painel do Auth (delete direto).
select tests.su();
insert into public.role_assignments (user_id, role, scope_type) values ('10000000-0000-4000-8000-000000000032', 'admin', 'global');
update public.app_settings set value = 'true'::jsonb where key = 'recipes.comments_enabled';
select tests.login('10000000-0000-4000-8000-000000000027', 's27marcos@test.local');
create temporary table t_s32_media as select public.recipe_register_media('27000000-0000-4000-8000-000000000002',
  public.seed_uuid('creator:marcos') || '/27000000-0000-4000-8000-000000000002/a2700000-0000-4000-8000-000000000021.png', 'gallery', 'Foto do Marcos', true, null, null) as id;
select public.recipe_save('27000000-0000-4000-8000-000000000002',
  tests.rp('Receita S27 do Marcos', jsonb_build_array(tests.ing('a3200000-0000-4000-8000-000000000001', 'Arroz', 1, 'cup')),
           jsonb_build_array(tests.step('a3200000-0000-4000-8000-000000000002', 'Cozinhe.')), '["almoco"]',
           jsonb_build_object('details', jsonb_build_object('servings', 2, 'total_minutes', 20, 'allergens', '[]'::jsonb, 'allergens_declared', true,
                                                            'cover_media_id', (select id from t_s32_media)))),
  tests.upd('27000000-0000-4000-8000-000000000002'));
select public.creator_publish_content('27000000-0000-4000-8000-000000000002');
select public.creator_unpublish_content('27000000-0000-4000-8000-000000000002');
select tests.login('10000000-0000-4000-8000-000000000031', 's31comm@test.local');
select public.complete_content(public.seed_uuid('content:g1'), 'America/Sao_Paulo');
insert into public.recipe_ratings (content_id, stars) values (public.seed_uuid('content:g1'), 3);
insert into public.recipe_comments (content_id, body) values (public.seed_uuid('content:g1'), 'Comentário que sai com a conta');
insert into public.shopping_list_items (ingredient_id, name) values ((select id from public.recipe_ingredients where content_id = public.seed_uuid('content:g1') and position = 1), 'Peito de frango');
insert into public.user_recipe_prefs (history_enabled) values (true);
insert into public.recipe_view_history (content_id) values (public.seed_uuid('content:g1'));
select tests.login('10000000-0000-4000-8000-000000000032', 's32admin@test.local');
select public.admin_validate_recipe_nutrition('26000000-0000-4000-8000-000000000001', true, 'Nutricionista CRN 3232', current_date, null);
select public.admin_moderate_recipe_comment((select c.id from public.recipe_comments c where c.status = 'pending' limit 1), 'approved', null);
select tests.su();
select tests.ok('S32 antes: autorias gravadas (versão e mídia do Marcos, validação e moderação do admin) e agregado com a avaliação',
  exists (select 1 from public.recipe_versions where content_id = '27000000-0000-4000-8000-000000000002' and created_by = '10000000-0000-4000-8000-000000000027')
  and (select created_by = '10000000-0000-4000-8000-000000000027' from public.recipe_media where id = (select id from t_s32_media))
  and (select validated_by_user = '10000000-0000-4000-8000-000000000032' from public.recipe_nutrition where content_id = '26000000-0000-4000-8000-000000000001')
  and exists (select 1 from public.recipe_comments where moderated_by = '10000000-0000-4000-8000-000000000032')
  and (select rating_count = 1 and rating_sum = 3 from public.recipe_details where content_id = public.seed_uuid('content:g1')));
-- herói com conteúdo criado por ele (created_by = uid, coluna protegida): duplicar receita grava a autoria
select tests.login('10000000-0000-4000-8000-000000000027', 's27marcos@test.local');
create temporary table t_s32_dup as select public.creator_duplicate_recipe('27000000-0000-4000-8000-000000000002', 'Cópia do Marcos S32', 's32-copia-marcos') as id;
select tests.su();
select tests.ok('S32 a cópia do Marcos tem created_by = o usuário dele',
  (select created_by = '10000000-0000-4000-8000-000000000027' from public.content where id = (select id from t_s32_dup)));
-- vendedor que cadastrou produto (products.created_by também é protegida)
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000033', 's33seller@test.local');
create temporary table t_s32_prod as select id from public.products order by id limit 1;
update public.products set created_by = '10000000-0000-4000-8000-000000000033' where id = (select id from t_s32_prod);
select tests.login('10000000-0000-4000-8000-000000000027', 's27marcos@test.local');
select public.delete_my_account();
select tests.login('10000000-0000-4000-8000-000000000032', 's32admin@test.local');
select public.delete_my_account();
select tests.login('10000000-0000-4000-8000-000000000033', 's33seller@test.local');
select public.delete_my_account();
select tests.su();
select tests.ok('S32 herói que criou conteúdo e vendedor que cadastrou produto excluem a conta: conteúdo e produto ficam, com created_by nulo',
  not exists (select 1 from auth.users where id = '10000000-0000-4000-8000-000000000033')
  and (select created_by is null from public.content where id = (select id from t_s32_dup))
  and (select created_by is null from public.products where id = (select id from t_s32_prod)));
delete from public.content where id = (select id from t_s32_dup);
select tests.login('10000000-0000-4000-8000-000000000031', 's31comm@test.local');
select public.delete_my_account();
select tests.su();
select tests.ok('S32 as três contas somem',
  not exists (select 1 from auth.users where id in ('10000000-0000-4000-8000-000000000027', '10000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000032')));
select tests.ok('S32 versões e mídia continuam, com created_by nulo; validação continua com validated_by_user nulo',
  exists (select 1 from public.recipe_versions where content_id = '27000000-0000-4000-8000-000000000002')
  and not exists (select 1 from public.recipe_versions where created_by in ('10000000-0000-4000-8000-000000000027', '10000000-0000-4000-8000-000000000032'))
  and (select created_by is null from public.recipe_media where id = (select id from t_s32_media))
  and (select validated and validated_by = 'Nutricionista CRN 3232' and validated_by_user is null from public.recipe_nutrition where content_id = '26000000-0000-4000-8000-000000000001'));
select tests.ok('S32 dados pessoais do comentarista saem (avaliação, comentário, lista, histórico, preferência) e o agregado desconta',
  not exists (select 1 from public.recipe_ratings where user_id = '10000000-0000-4000-8000-000000000031')
  and not exists (select 1 from public.recipe_comments where user_id = '10000000-0000-4000-8000-000000000031')
  and not exists (select 1 from public.shopping_list_items where user_id = '10000000-0000-4000-8000-000000000031')
  and not exists (select 1 from public.recipe_view_history where user_id = '10000000-0000-4000-8000-000000000031')
  and not exists (select 1 from public.user_recipe_prefs where user_id = '10000000-0000-4000-8000-000000000031')
  and (select rating_count = 0 and rating_sum = 0 from public.recipe_details where content_id = public.seed_uuid('content:g1')));
select tests.ok('S32 o perfil do Marcos fica sem usuário (set null)', (select user_id is null from public.creator_profiles where id = public.seed_uuid('creator:marcos')));
-- caminho do painel do Auth: delete direto em auth.users de um herói com versões (Helena de teste)
select tests.ok('S32 a Helena de teste tem versões antes do delete direto', exists (select 1 from public.recipe_versions where created_by = '10000000-0000-4000-8000-000000000026'));
delete from auth.users where id = '10000000-0000-4000-8000-000000000026';
select tests.ok('S32 delete direto em auth.users (painel): os gatilhos aceitam o set null da cascata e as versões ficam',
  not exists (select 1 from auth.users where id = '10000000-0000-4000-8000-000000000026')
  and not exists (select 1 from public.recipe_versions where created_by = '10000000-0000-4000-8000-000000000026')
  and exists (select 1 from public.recipe_versions where content_id = '28000000-0000-4000-8000-000000000001')
  and (select user_id is null from public.creator_profiles where id = public.seed_uuid('creator:helena')));
-- limpeza: chaves de volta ao padrão e nada dos cenários S25–S32 no ar
update public.app_settings set value = 'false'::jsonb where key = 'recipes.comments_enabled';
update public.recipe_nutrition set validated = false, validated_by = null, validated_at = null, validation_note = null where content_id = '26000000-0000-4000-8000-000000000001';
select tests.ok('S32 nada dos cenários S25–S32 ficou no ar e as chaves de receita voltaram ao padrão',
  not exists (select 1 from public.content where (id::text ~ '^2[5-9]000000-' or id::text ~ '^3[0-2]000000-' or slug like 's2_-%') and status = 'published')
  and (select count(*) from public.content where status = 'published') = 40
  and (public.public_settings() -> 'recipes.ratings_enabled') = 'true'::jsonb and (public.public_settings() -> 'recipes.comments_enabled') = 'false'::jsonb
  and (public.public_settings() -> 'recipes.uploads_enabled') = 'true'::jsonb);

-- ================================================================ S33 · Foto de perfil no Storage (0031, shim local)
-- Bucket público sem escrita pela API; o envio é reservado pela RPC (kill switch, cota de 20/dia,
-- nome do objeto) e aplicado nos dois lados (perfil e herói) só para envio próprio já gravado.
-- Quem grava no bucket é o service role (o "su" aqui faz o papel dele). O Rafael fica ligado ao
-- usuário de teste só neste cenário e volta sem usuário e com a ilustração do seed.
select tests.su();
insert into auth.users (id, email) values
  ('33000000-0000-4000-8000-000000000001', 's33photo@test.local'),
  ('33000000-0000-4000-8000-000000000002', 's33other@test.local');
create temporary table t_s33_seed as select avatar_url from public.creator_profiles where id = public.seed_uuid('creator:rafael');
grant select on t_s33_seed to authenticated, anon;
update public.creator_profiles set user_id = '33000000-0000-4000-8000-000000000001' where id = public.seed_uuid('creator:rafael');
select tests.ok('S33 bucket avatars público, 2 MiB e só WebP/JPEG',
  (select public and file_size_limit = 2097152 and allowed_mime_types = array['image/webp', 'image/jpeg'] from storage.buckets where id = 'avatars'));
select tests.ok('S33 nenhuma política do Storage cita o bucket avatars (escrita só pelo service role)',
  (select count(*) from pg_policies where schemaname = 'storage' and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%avatars%') = 0);
select tests.ok('S33 public_settings expõe avatars.uploads_enabled (ligado) sem perder as chaves da 0027',
  (public.public_settings() -> 'avatars.uploads_enabled') = 'true'::jsonb
  and (select count(*) from jsonb_object_keys(public.public_settings())) = 11);
select tests.ok('S33 avatar_uploads: RLS ligada, uma política de leitura só para authenticated',
  (select relrowsecurity from pg_class where oid = 'public.avatar_uploads'::regclass)
  and (select string_agg(cmd || ':' || array_to_string(roles, ','), ';') from pg_policies where schemaname = 'public' and tablename = 'avatar_uploads') = 'SELECT:authenticated');

-- visitante
select tests.anon();
select tests.expect_error('S33 anon não reserva envio', $q$select public.avatar_upload_claim(1000, 'image/webp')$q$, 'permission denied');
select tests.expect_error('S33 anon não aplica foto', $q$select public.avatar_set_photo('https://x.supabase.co/storage/v1/object/public/avatars/a/b.webp')$q$, 'permission denied');
select tests.expect_error('S33 anon não lista órfãos', $q$select public.avatar_orphan_uploads(10)$q$, 'permission denied');
select tests.expect_error('S33 anon não lê avatar_uploads', $q$select count(*) from public.avatar_uploads$q$, 'permission denied');

-- usuário: nada de escrita direta, validações da reserva
select tests.login('33000000-0000-4000-8000-000000000001', 's33photo@test.local');
select tests.expect_error('S33 usuário não grava no bucket avatars pela API (sem política)',
  $q$insert into storage.objects (bucket_id, name, owner_id, metadata) values ('avatars', auth.uid() || '/a3300000-0000-4000-8000-000000000001.webp', auth.uid()::text, '{"mimetype":"image/webp","size":1}')$q$, '42501');
select tests.expect_error('S33 usuário não insere em avatar_uploads',
  $q$insert into public.avatar_uploads (user_id, path, bytes, mime) values (auth.uid(), auth.uid() || '/a3300000-0000-4000-8000-000000000002.webp', 1, 'image/webp')$q$, '42501');
select tests.expect_error('S33 tipo fora da lista: not_image', $q$select public.avatar_upload_claim(1000, 'image/png')$q$, 'not_image');
select tests.expect_error('S33 arquivo vazio: empty_file', $q$select public.avatar_upload_claim(0, 'image/webp')$q$, 'empty_file');
select tests.expect_error('S33 acima de 2 MiB: file_too_large', $q$select public.avatar_upload_claim(2097153, 'image/jpeg')$q$, 'file_too_large');
create temporary table t_s33_claim as select public.avatar_upload_claim(120000, 'image/webp') as path;
select tests.ok('S33 reserva devolve <user_id>/<uuid>.webp e o usuário vê a própria linha',
  (select path ~ '^33000000-0000-4000-8000-000000000001/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$' from t_s33_claim)
  and (select count(*) from public.avatar_uploads where path = (select path from t_s33_claim) and bytes = 120000 and mime = 'image/webp') = 1);
create temporary table t_s33_url as
  select 'https://proj.supabase.co/storage/v1/object/public/avatars/' || (select path from t_s33_claim) as url;
select tests.expect_error('S33 foto reservada mas não gravada no bucket: invalid_path',
  $q$select public.avatar_set_photo((select url from t_s33_url))$q$, 'invalid_path');
select tests.su();
insert into storage.objects (bucket_id, name, metadata) values ('avatars', (select path from t_s33_claim), '{"mimetype":"image/webp","size":120000}');

-- outro usuário não vê nem usa o envio alheio
select tests.login('33000000-0000-4000-8000-000000000002', 's33other@test.local');
select tests.ok('S33 outro usuário não lê o envio alheio', (select count(*) from public.avatar_uploads) = 0);
select tests.expect_error('S33 outro usuário não aplica a foto alheia', $q$select public.avatar_set_photo((select url from t_s33_url))$q$, 'invalid_path');

select tests.login('33000000-0000-4000-8000-000000000001', 's33photo@test.local');
select tests.expect_error('S33 URL de outro bucket: invalid_path',
  $q$select public.avatar_set_photo(replace((select url from t_s33_url), '/avatars/', '/recipe-media/'))$q$, 'invalid_path');
select tests.expect_error('S33 URL com consulta: invalid_path', $q$select public.avatar_set_photo((select url from t_s33_url) || '?x=1')$q$, 'invalid_path');
select tests.expect_error('S33 extensão trocada (.png): invalid_path', $q$select public.avatar_set_photo(replace((select url from t_s33_url), '.webp', '.png'))$q$, 'invalid_path');
create temporary table t_s33_prev as select public.avatar_set_photo((select url from t_s33_url)) as prev;
select tests.ok('S33 aplicar devolve o anterior do herói (a ilustração) e o perfil sem foto não entra',
  (select prev = array[(select avatar_url from t_s33_seed)] from t_s33_prev));
select tests.ok('S33 a foto vale no perfil e no herói ligado',
  (select avatar_url from public.profiles where id = auth.uid()) = (select url from t_s33_url)
  and (select avatar_url from public.creator_profiles where id = public.seed_uuid('creator:rafael')) = (select url from t_s33_url));
select tests.anon();
select tests.ok('S33 o visitante vê a foto no perfil público do herói',
  (select avatar_url from public.creator_profiles where id = public.seed_uuid('creator:rafael')) like '%/avatars/33000000-0000-4000-8000-000000000001/%');

-- kill switch
select tests.su();
update public.app_settings set value = 'false'::jsonb where key = 'avatars.uploads_enabled';
select tests.login('33000000-0000-4000-8000-000000000001', 's33photo@test.local');
select tests.expect_error('S33 kill switch desligado: uploads_disabled', $q$select public.avatar_upload_claim(1000, 'image/webp')$q$, 'uploads_disabled');
select tests.su();
update public.app_settings set value = 'true'::jsonb where key = 'avatars.uploads_enabled';

-- cota: 20 por 24 h (1 já feito + 18 + 1 = 20; o 21º é recusado; fora da janela não conta)
insert into public.avatar_uploads (user_id, path, bytes, mime)
select '33000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001/' || gen_random_uuid() || '.jpg', 1000, 'image/jpeg'
from generate_series(1, 18);
select tests.login('33000000-0000-4000-8000-000000000001', 's33photo@test.local');
create temporary table t_s33_twentieth as select public.avatar_upload_claim(1000, 'image/jpeg') as path;
select tests.ok('S33 o 20º envio do dia passa (.jpg)', (select path like '%.jpg' from t_s33_twentieth)
  and (select count(*) from public.avatar_uploads where user_id = auth.uid()) = 20);
select tests.expect_error('S33 o 21º envio do dia: too_many_uploads', $q$select public.avatar_upload_claim(1000, 'image/jpeg')$q$, 'too_many_uploads');
select tests.su();
update public.avatar_uploads set created_at = now() - interval '25 hours'
where user_id = '33000000-0000-4000-8000-000000000001' and path <> (select path from t_s33_claim);
select tests.login('33000000-0000-4000-8000-000000000001', 's33photo@test.local');
create temporary table t_s33_after as select public.avatar_upload_claim(1000, 'image/webp') as path;
select tests.ok('S33 envios de mais de 24 h não contam na cota', (select path is not null from t_s33_after));

-- limpeza diária: só o service role; lista o não referenciado com mais de 1 h e nunca o que está em uso
select tests.expect_error('S33 usuário não lista órfãos', $q$select public.avatar_orphan_uploads(10)$q$, 'permission denied');
select tests.su();
create temporary table t_s33_orphans as select p from public.avatar_orphan_uploads(1000) p;
select tests.ok('S33 órfãos: os 19 antigos não referenciados entram; o em uso e o recém-reservado (< 1 h) não',
  (select count(*) from t_s33_orphans where p like '33000000-0000-4000-8000-000000000001/%') = 19
  and not exists (select 1 from t_s33_orphans where p = (select path from t_s33_claim))
  and not exists (select 1 from t_s33_orphans where p = (select path from t_s33_after)));
select tests.ok('S33 órfãos: o limite é respeitado', (select count(*) from public.avatar_orphan_uploads(5)) = 5);

-- exclusão de conta: a linha fica sem usuário e a foto em uso no herói vira alvo da limpeza diária
select tests.login('33000000-0000-4000-8000-000000000001', 's33photo@test.local');
select public.delete_my_account();
select tests.su();
create temporary table t_s33_gone as select p from public.avatar_orphan_uploads(1000) p;
select tests.ok('S33 conta excluída: envios ficam sem usuário e a foto em uso no herói entra na limpeza (inclusive a recente)',
  not exists (select 1 from public.avatar_uploads where user_id = '33000000-0000-4000-8000-000000000001')
  and exists (select 1 from t_s33_gone where p = (select path from t_s33_claim))
  and exists (select 1 from t_s33_gone where p = (select path from t_s33_after))
  and (select user_id is null from public.creator_profiles where id = public.seed_uuid('creator:rafael')));

select tests.ok('S33 funções: search_path fixo; reserva e aplicação definer sem anon; órfãos só service role',
  (select bool_and(exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')) from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname in ('avatar_upload_claim', 'avatar_set_photo', 'avatar_orphan_uploads'))
  and (select bool_and(p.prosecdef) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('avatar_upload_claim', 'avatar_set_photo'))
  and not has_function_privilege('anon', 'public.avatar_upload_claim(int, text)', 'execute')
  and not has_function_privilege('anon', 'public.avatar_set_photo(text)', 'execute')
  and has_function_privilege('authenticated', 'public.avatar_upload_claim(int, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.avatar_orphan_uploads(int)', 'execute')
  and has_function_privilege('service_role', 'public.avatar_orphan_uploads(int)', 'execute'));

-- limpeza: o Rafael volta com a ilustração do seed (o usuário de teste já saiu)
update public.creator_profiles set avatar_url = (select avatar_url from t_s33_seed) where id = public.seed_uuid('creator:rafael');
delete from storage.objects where bucket_id = 'avatars';
delete from auth.users where id = '33000000-0000-4000-8000-000000000002';
select tests.ok('S33 o Rafael volta ao seed, sem usuário e com a ilustração',
  (select user_id is null and avatar_url = (select avatar_url from t_s33_seed) from public.creator_profiles where id = public.seed_uuid('creator:rafael')));

-- ================================================================ S34 · Credenciais decididas sobre o texto que o admin viu (0032)
-- O herói edita o pedido entre a abertura da fila e o clique: a decisão com o texto antigo é recusada
-- (request_changed) e nada vai ao perfil público. A decisão fica no pedido para o herói ver
-- "reprovadas"; editar o texto limpa a decisão. Usuário próprio (…0034), desvinculado no fim.
select tests.su();
insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000034', 's34helena@test.local');
update public.creator_profiles set user_id = '10000000-0000-4000-8000-000000000034' where id = public.seed_uuid('creator:helena') and user_id is null;
select tests.login('10000000-0000-4000-8000-000000000034', 's34helena@test.local');
insert into public.creator_credentials_requests (creator_id, text) values (public.seed_uuid('creator:helena'), 'Chef formada pelo Senac');
select tests.ok('S34 pedido novo sem decisão', (select decision is null and decided_at is null from public.creator_credentials_requests where creator_id = public.seed_uuid('creator:helena')));
select tests.expect_error('S34 herói não grava a própria decisão (fora do grant)',
  $q$update public.creator_credentials_requests set decision = 'approved' where creator_id = public.seed_uuid('creator:helena')$q$, '42501');
-- a fila do admin mostrou 'Chef formada pelo Senac'; antes do clique o herói troca o texto
update public.creator_credentials_requests set text = 'Nutricionista CRN 12345, cura diabetes' where creator_id = public.seed_uuid('creator:helena');
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select tests.expect_error('S34 aprovar com o texto que a fila mostrou, já editado pelo herói: request_changed',
  $q$select public.admin_set_creator_credentials(public.seed_uuid('creator:helena'), true, 'S34 conferido na fila', 'Chef formada pelo Senac')$q$, 'request_changed');
select tests.expect_error('S34 reprovar com texto antigo também é recusado',
  $q$select public.admin_set_creator_credentials(public.seed_uuid('creator:helena'), false, 'S34 não confere', 'Chef formada pelo Senac')$q$, 'request_changed');
select tests.ok('S34 nada foi ao perfil público nem à auditoria',
  (select credentials is null and credentials_approved_at is null from public.creator_profiles where id = public.seed_uuid('creator:helena'))
  and not exists (select 1 from public.admin_audit where action = 'creator.credentials' and resource_id = public.seed_uuid('creator:helena')::text
                  and justification like 'S34 %'));
-- tudo roda numa transação (now() fixo): o pedido ganha uma data antiga para a comparação valer
select tests.su();
update public.creator_credentials_requests set updated_at = '2020-01-01T00:00:00Z' where creator_id = public.seed_uuid('creator:helena');
create temporary table t_s34_before as select updated_at from public.creator_credentials_requests where creator_id = public.seed_uuid('creator:helena');
grant select on t_s34_before to authenticated;
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_set_creator_credentials(public.seed_uuid('creator:helena'), false, 'Registro não confere', '  Nutricionista CRN 12345, cura diabetes ');
select tests.ok('S34 reprovar com o texto atual: decisão no pedido, sem mudar o updated_at do pedido',
  (select decision = 'rejected' and decided_at is not null and updated_at = (select updated_at from t_s34_before)
   from public.creator_credentials_requests where creator_id = public.seed_uuid('creator:helena')));
select tests.login('10000000-0000-4000-8000-000000000034', 's34helena@test.local');
select tests.ok('S34 o herói lê a própria reprovação', (select decision = 'rejected' from public.creator_credentials_requests where creator_id = public.seed_uuid('creator:helena')));
update public.creator_credentials_requests set text = 'Chef formada pelo Senac (2015)' where creator_id = public.seed_uuid('creator:helena');
select tests.ok('S34 editar o texto limpa a decisão (pedido volta a aguardar)',
  (select decision is null and decided_at is null and updated_at > (select updated_at from t_s34_before) from public.creator_credentials_requests where creator_id = public.seed_uuid('creator:helena')));
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_set_creator_credentials(public.seed_uuid('creator:helena'), true, 'Conferido de novo', 'Chef formada pelo Senac (2015)');
select tests.ok('S34 aprovar com o texto atual publica exatamente esse texto e marca a decisão',
  (select credentials = 'Chef formada pelo Senac (2015)' and credentials_approved_at is not null from public.creator_profiles where id = public.seed_uuid('creator:helena'))
  and (select decision = 'approved' from public.creator_credentials_requests where creator_id = public.seed_uuid('creator:helena')));
select tests.ok('S34 RPC de 4 argumentos: security definer com search_path fixo, sem anon; a de 3 argumentos saiu',
  (select p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%') and not has_function_privilege('anon', p.oid, 'execute')
   from pg_proc p where p.oid = 'public.admin_set_creator_credentials(uuid, boolean, text, text)'::regprocedure)
  and to_regprocedure('public.admin_set_creator_credentials(uuid, boolean, text)') is null
  and not has_function_privilege('anon', 'public.creator_credentials_request_reset_decision()', 'execute'));
select tests.su();
delete from public.creator_credentials_requests where creator_id = public.seed_uuid('creator:helena');
update public.creator_profiles set user_id = null, credentials = null where id = public.seed_uuid('creator:helena') and user_id = '10000000-0000-4000-8000-000000000034';
delete from auth.users where id = '10000000-0000-4000-8000-000000000034';
select tests.ok('S34 limpeza: Helena sem usuário, sem pedido e sem credenciais',
  (select user_id is null and credentials is null and credentials_approved_at is null from public.creator_profiles where id = public.seed_uuid('creator:helena'))
  and not exists (select 1 from public.creator_credentials_requests where creator_id = public.seed_uuid('creator:helena')));

-- ================================================================ S36 · Histórico como o app grava e a coleção (fase 4, sem migração)
-- A página da receita insere só content_id e, quando a receita já está no histórico, atualiza só
-- viewed_at: o upsert do PostgREST (do update set content_id = excluded.content_id) fica fora do grant
-- de update, por isso o app não o usa. Ligar é upsert da preferência por user_id; "Tirar do
-- histórico" e "Limpar" apagam só linhas da própria pessoa; desligar apaga tudo. Usuários próprios
-- (…0036 e …0136), apagados no fim.
select tests.su();
insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000036', 's36a@test.local'),
  ('10000000-0000-4000-8000-000000000136', 's36b@test.local');
select tests.login('10000000-0000-4000-8000-000000000136', 's36b@test.local');
insert into public.user_recipe_prefs (user_id, history_enabled) values ('10000000-0000-4000-8000-000000000136', true)
  on conflict (user_id) do update set user_id = excluded.user_id, history_enabled = excluded.history_enabled;
insert into public.recipe_view_history (content_id) values (public.seed_uuid('content:g3'));
select tests.login('10000000-0000-4000-8000-000000000036', 's36a@test.local');
select tests.ok('S36 sem linha de preferência (padrão) a pessoa não vê preferência nem histórico de ninguém',
  not exists (select 1 from public.user_recipe_prefs) and not exists (select 1 from public.recipe_view_history));
select tests.expect_error('S36 desligado (padrão): a gravação da página da receita é recusada',
  $q$insert into public.recipe_view_history (content_id) values (public.seed_uuid('content:g1'))$q$, '42501');
-- ligar como a action: upsert por user_id (o PostgREST põe todas as colunas do payload no do update)
insert into public.user_recipe_prefs (user_id, history_enabled) values ('10000000-0000-4000-8000-000000000036', true)
  on conflict (user_id) do update set user_id = excluded.user_id, history_enabled = excluded.history_enabled;
select tests.ok('S36 ligar pelo upsert da action grava a data do consentimento pelo banco',
  (select history_enabled and history_enabled_at = now() from public.user_recipe_prefs));
insert into public.recipe_view_history (content_id) values (public.seed_uuid('content:g1'));
select tests.expect_error('S36 segunda visita: o insert dá 23505 (o app então atualiza viewed_at)',
  $q$insert into public.recipe_view_history (content_id) values (public.seed_uuid('content:g1'))$q$, '23505');
update public.recipe_view_history set viewed_at = '2000-01-01' where user_id = '10000000-0000-4000-8000-000000000036' and content_id = public.seed_uuid('content:g1');
select tests.ok('S36 a atualização da visita passa no grant de update e o banco põe now() (só o último acesso)',
  (select count(*) = 1 and bool_and(viewed_at = now()) from public.recipe_view_history));
select tests.expect_error('S36 upsert no estilo PostgREST (do update set content_id) fica fora do grant: por isso o app não o usa',
  $q$insert into public.recipe_view_history (content_id, viewed_at) values (public.seed_uuid('content:g1'), now())
     on conflict (user_id, content_id) do update set content_id = excluded.content_id, viewed_at = excluded.viewed_at$q$, '42501');
insert into public.recipe_view_history (content_id) values (public.seed_uuid('content:g4'));
delete from public.recipe_view_history where user_id = '10000000-0000-4000-8000-000000000036' and content_id = public.seed_uuid('content:g4');
select tests.ok('S36 "Tirar do histórico" apaga só aquela receita',
  (select array_agg(content_id) = array[public.seed_uuid('content:g1')] from public.recipe_view_history));
delete from public.recipe_view_history where user_id = '10000000-0000-4000-8000-000000000136';
delete from public.recipe_view_history where user_id = '10000000-0000-4000-8000-000000000036';
select tests.ok('S36 "Limpar histórico" apaga tudo da pessoa e a preferência continua ligada',
  not exists (select 1 from public.recipe_view_history) and (select history_enabled from public.user_recipe_prefs));
select tests.su();
select tests.ok('S36 a limpeza de uma pessoa não toca no histórico de outra (a RLS filtra o delete)',
  exists (select 1 from public.recipe_view_history where user_id = '10000000-0000-4000-8000-000000000136' and content_id = public.seed_uuid('content:g3')));
select tests.login('10000000-0000-4000-8000-000000000036', 's36a@test.local');
insert into public.recipe_view_history (content_id) values (public.seed_uuid('content:g1'));
update public.user_recipe_prefs set history_enabled = false where user_id = '10000000-0000-4000-8000-000000000036';
select tests.ok('S36 desligar pela action (update) apaga o histórico e a data do consentimento',
  not exists (select 1 from public.recipe_view_history) and (select not history_enabled and history_enabled_at is null from public.user_recipe_prefs));
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select tests.ok('S36 o admin não lê preferência nem histórico de ninguém (dado pessoal)',
  not exists (select 1 from public.user_recipe_prefs where user_id in ('10000000-0000-4000-8000-000000000036', '10000000-0000-4000-8000-000000000136'))
  and not exists (select 1 from public.recipe_view_history where user_id = '10000000-0000-4000-8000-000000000136'));
select tests.su();
delete from auth.users where id in ('10000000-0000-4000-8000-000000000036', '10000000-0000-4000-8000-000000000136');
select tests.ok('S36 limpeza: usuários, preferências e histórico do cenário saíram (cascata)',
  not exists (select 1 from public.user_recipe_prefs where user_id in ('10000000-0000-4000-8000-000000000036', '10000000-0000-4000-8000-000000000136'))
  and not exists (select 1 from public.recipe_view_history where user_id in ('10000000-0000-4000-8000-000000000036', '10000000-0000-4000-8000-000000000136')));

-- ================================================================ S14 · Endurecimento (0016): grants e search_path
select tests.anon();
select tests.expect_error('S14 anon não executa admin_set_role (permission denied)',
  $q$select public.admin_set_role('10000000-0000-4000-8000-000000000001', 'admin', true, 'x')$q$, 'permission denied');
select tests.expect_error('S14 anon não executa checkout_cart',
  $q$select public.checkout_cart(public.seed_uuid('dest:sp'), '{}'::jsonb, false)$q$, 'permission denied');
select tests.expect_error('S14 anon não executa select_modules',
  $q$select public.select_modules(array[public.seed_uuid('module:base')])$q$, 'permission denied');
select tests.expect_error('S14 anon não executa delete_my_account', $q$select public.delete_my_account()$q$, 'permission denied');
select tests.expect_error('S14 anon não executa user_entitled_modules de terceiros',
  $q$select public.user_entitled_modules('10000000-0000-4000-8000-000000000001')$q$, 'permission denied');
select tests.ok('S14 anon lê configurações públicas', (public.public_settings() ->> 'commerce.enabled') is not null);
select tests.ok('S14 anon busca no catálogo', (select count(*) from public.search_content('sono')) > 0);
select tests.ok('S14 anon vê catálogo publicado com políticas reescritas (40)', (select count(*) from public.content where status = 'published') = 40);
select tests.ok('S14 anon vê produtos publicados', (select count(*) from public.products where status = 'published') > 0);
select tests.ok('S14 anon consulta certificado inexistente sem erro', coalesce((public.verify_certificate('NAO-EXISTE') ->> 'valid')::boolean, false) = false);
select public.track_event('page.view', '{"path":"/"}'::jsonb, 'anon-s14', 'pt-BR');
select tests.su(); -- anon não lê analytics_events; a conferência é feita como sistema
select tests.ok('S14 anon registra evento sem PII', exists (select 1 from public.analytics_events where anon_id = 'anon-s14'));
select tests.login('10000000-0000-4000-8000-000000000001', 'consumer@test.local');
select tests.expect_error('S14 usuário não executa sync_subscription (interna)', $q$select public.sync_subscription(auth.uid())$q$, 'permission denied');
select tests.expect_error('S14 usuário não executa evaluate_achievements (interna)', $q$select public.evaluate_achievements(auth.uid(), 'UTC')$q$, 'permission denied');
select tests.expect_error('S14 usuário não executa recompute_order_status (interna)', $q$select public.recompute_order_status(gen_random_uuid())$q$, 'permission denied');
select tests.ok('S14 usuário continua vendo a própria assinatura (chama sync_subscription por dentro)', (public.my_subscription() ->> 'status') is not null);
select tests.ok('S14 usuário continua lendo o próprio perfil (política reescrita)', (select count(*) from public.profiles where id = auth.uid()) = 1);
select tests.su();
select tests.ok('S14 nenhuma função pública sem search_path fixo',
  (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prolang <> (select oid from pg_language where lanname = 'c')
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')) = 0);
select tests.ok('S14 nenhuma política avalia auth.uid()/is_admin() por linha',
  (select count(*) from pg_policies where schemaname = 'public'
     and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(^|[^T] )(auth\.uid|is_admin|my_creator_id)\(\)') = 0);
select tests.ok('S14 anon só executa a lista pública de security definer',
  (select string_agg(p.proname, ',' order by p.proname) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and has_function_privilege('anon', p.oid, 'execute'))
  = 'can_access_content,has_role,is_admin,is_seller_of,my_creator_id,my_entitled_modules,my_roles,my_seller_org_ids,my_subscription,product_is_purchasable,program_required_items,public_settings,quote_shipping,search_content,submit_feedback,track_event,verify_certificate');
-- receitas (0027–0029): nenhuma função nova recipe_*, creator_* ou admin_* é executável pelo visitante,
-- salvo o catálogo público (security invoker; a RLS decide o que aparece)
select tests.ok('S14 receitas: anon só executa recipe_catalog entre as funções recipe_*, creator_* e admin_*',
  (select string_agg(distinct p.proname, ',') from pg_proc p where p.pronamespace = 'public'::regnamespace
     and (p.proname like 'recipe\_%' or p.proname like 'creator\_%' or p.proname like 'admin\_%'
          or p.proname in ('content_localized_body', 'content_review_required', 'audit_actor', 'content_type_lock', 'content_recipe_publishable',
                           'content_recipe_version', 'content_recipe_cover', 'content_bodies_recipe_managed', 'shopping_list_items_before',
                           'user_recipe_prefs_before', 'user_recipe_prefs_after', 'products_recipe_links_suspend', 'content_type_settings_review_guard'))
     and has_function_privilege('anon', p.oid, 'execute')) = 'recipe_catalog');

-- ================================================================ S15 · Agendamento de publicação (0017)
-- Publicado com publish_at no futuro = agendado: invisível ao público até a data; admin e a
-- personalidade dona continuam vendo. now() é fixo na transação, então "a data chegou" é simulado
-- movendo publish_at para o passado como sistema.
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_set_content_status(public.seed_uuid('content:r2'), 'published', 'Agendamento de teste', now() + interval '1 day');
select tests.ok('S15 agendado: publicado, publish_at no futuro e published_at = publish_at',
  (select status = 'published' and publish_at > now() and published_at = publish_at from public.content where id = public.seed_uuid('content:r2')));
select tests.ok('S15 auditoria registra a data agendada', exists (select 1 from public.admin_audit where action = 'content.set_status'
  and resource_id = public.seed_uuid('content:r2')::text and (after_data ->> 'publish_at')::timestamptz > now()));
select tests.ok('S15 admin vê e acessa o agendado', (select count(*) from public.content where id = public.seed_uuid('content:r2')) = 1
  and public.can_access_content(public.seed_uuid('content:r2')));
insert into public.content_localizations (content_id, locale, title, status) values (public.seed_uuid('content:r2'), 'en', 'Scheduled title (en)', 'published')
  on conflict (content_id, locale) do update set title = excluded.title, status = 'published';
select tests.ok('S15 admin lê a tradução publicada do agendado', (select count(*) from public.content_localizations where content_id = public.seed_uuid('content:r2') and locale = 'en') = 1);
select tests.anon();
select tests.ok('S15 visitante não vê o agendado', (select count(*) from public.content where id = public.seed_uuid('content:r2')) = 0);
select tests.ok('S15 visitante não lê a tradução do agendado', (select count(*) from public.content_localizations where content_id = public.seed_uuid('content:r2')) = 0);
select tests.ok('S15 visitante vê 39 no ar (40 publicados menos o agendado)', (select count(*) from public.content where status = 'published') = 39);
select tests.ok('S15 busca não devolve o agendado', (select count(*) from public.search_content(null, null, null, null, null, 100, 0) where id = public.seed_uuid('content:r2')) = 0);
select tests.ok('S15 can_access_content nega o agendado ao visitante', not public.can_access_content(public.seed_uuid('content:r2')));
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
select tests.ok('S15 consumidor não vê o agendado nem o corpo', (select count(*) from public.content where id = public.seed_uuid('content:r2')) = 0
  and (select count(*) from public.content_bodies where content_id = public.seed_uuid('content:r2')) = 0);
select tests.ok('S15 consumidor não acessa o agendado', not public.can_access_content(public.seed_uuid('content:r2')));
select tests.ok('S15 consumidor não lê a tradução do agendado', (select count(*) from public.content_localizations where content_id = public.seed_uuid('content:r2')) = 0);
select tests.expect_error('S15 consumidor não conclui o agendado', $q$select public.complete_content(public.seed_uuid('content:r2'), 'America/Sao_Paulo')$q$, 'content_forbidden');
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
select tests.ok('S15 personalidade dona vê e acessa o próprio agendado', (select count(*) from public.content where id = public.seed_uuid('content:r2')) = 1
  and public.can_access_content(public.seed_uuid('content:r2')));
select tests.ok('S15 personalidade dona lê a tradução do próprio agendado', (select count(*) from public.content_localizations where content_id = public.seed_uuid('content:r2') and locale = 'en') = 1);
select tests.expect_error('S15 personalidade não agenda (coluna protegida)', $q$update public.content set publish_at = now() + interval '1 day' where id = '20000000-0000-4000-8000-000000000001'$q$, 'protected_column');
select tests.su();
update public.content set publish_at = now() - interval '1 minute' where id = public.seed_uuid('content:r2');
select tests.anon();
select tests.ok('S15 data chegou: visitante vê, busca devolve e o catálogo volta a 40 sem nova ação',
  (select count(*) from public.content where id = public.seed_uuid('content:r2')) = 1
  and (select count(*) from public.search_content(null, null, null, null, null, 100, 0) where id = public.seed_uuid('content:r2')) = 1
  and (select count(*) from public.content where status = 'published') = 40
  and (select count(*) from public.content_localizations where content_id = public.seed_uuid('content:r2') and locale = 'en') = 1);
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_set_content_status(public.seed_uuid('content:r3'), 'draft', 'Teste de agendamento');
select public.admin_review_content(public.seed_uuid('content:r3'), 'approved', 'ok', now() - interval '1 hour');
select tests.ok('S15 aprovação com data no passado publica agora (publish_at nulo)',
  (select status = 'published' and publish_at is null and published_at <= now() from public.content where id = public.seed_uuid('content:r3')));
select public.admin_set_content_status(public.seed_uuid('content:r4'), 'draft', 'Teste de agendamento');
select public.admin_review_content(public.seed_uuid('content:r4'), 'approved', 'ok', now() + interval '2 days');
select tests.ok('S15 aprovação agendada: publicado com publish_at no futuro e auditoria com a data',
  (select status = 'published' and publish_at > now() and published_at = publish_at from public.content where id = public.seed_uuid('content:r4'))
  and exists (select 1 from public.admin_audit where action = 'content.review' and resource_id = public.seed_uuid('content:r4')::text and (after_data ->> 'publish_at')::timestamptz > now()));
select tests.anon();
select tests.ok('S15 aprovado agendado fica oculto do visitante', (select count(*) from public.content where id = public.seed_uuid('content:r4')) = 0);
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_set_content_status(public.seed_uuid('content:r4'), 'published', 'Publicar agora');
select tests.ok('S15 publicar agora (chamada de 3 parâmetros) limpa publish_at e published_at vira agora',
  (select publish_at is null and published_at = now() from public.content where id = public.seed_uuid('content:r4')));
select tests.anon();
select tests.ok('S15 após publicar agora o visitante vê', (select count(*) from public.content where id = public.seed_uuid('content:r4')) = 1);
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select public.admin_set_content_status(public.seed_uuid('content:r4'), 'published', 'Reagendar', now() + interval '3 days');
select public.admin_set_content_status(public.seed_uuid('content:r4'), 'draft', 'Voltar a rascunho');
select tests.ok('S15 voltar a rascunho descarta o agendamento', (select status = 'draft' and publish_at is null from public.content where id = public.seed_uuid('content:r4')));
select public.admin_set_content_status(public.seed_uuid('content:r4'), 'published', 'Republicar');
select tests.su();
select tests.ok('S15 content_is_live é security invoker, com search_path fixo e executável pelo público',
  (select not p.prosecdef and p.proconfig @> array['search_path=public'] from pg_proc p where p.oid = 'public.content_is_live(public.content_status, timestamptz)'::regprocedure)
  and has_function_privilege('anon', 'public.content_is_live(public.content_status, timestamptz)', 'execute'));
select tests.ok('S15 sobrecargas com agendamento: security definer, search_path fixo, sem execute para anon',
  (select bool_and(p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
                   and not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute'))
   from pg_proc p where p.oid in ('public.admin_review_content(uuid, public.review_status, text, timestamptz)'::regprocedure,
                                  'public.admin_set_content_status(uuid, public.content_status, text, timestamptz)'::regprocedure)));

-- ================================================================ S16 · Direitos por personalidade, licença de mídia e origem do vínculo (0017)
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
select tests.expect_error('S16 personalidade não altera rights_status', $q$update public.creator_profiles set rights_status = 'authorized' where id = public.seed_uuid('creator:lia')$q$, 'protected_column');
select tests.expect_error('S16 personalidade não altera rights_holder', $q$update public.creator_profiles set rights_holder = 'Eu mesma' where id = public.seed_uuid('creator:lia')$q$, 'protected_column');
select tests.expect_error('S16 personalidade não altera rights_valid_until', $q$update public.creator_profiles set rights_valid_until = current_date + 30 where id = public.seed_uuid('creator:lia')$q$, 'protected_column');
update public.creator_profiles set headline = 'Chamada ajustada pela personalidade' where id = public.seed_uuid('creator:lia');
select tests.ok('S16 personalidade segue editando campos permitidos', (select headline from public.creator_profiles where id = public.seed_uuid('creator:lia')) = 'Chamada ajustada pela personalidade');
select tests.ok('S16 personalidade não lê creator_rights_private', (select count(*) from public.creator_rights_private) = 0);
select tests.expect_error('S16 personalidade não grava creator_rights_private', $q$insert into public.creator_rights_private (creator_id, document_ref) values (public.seed_uuid('creator:lia'), 'FALSO')$q$, '42501');
select tests.expect_error('S16 personalidade não executa a RPC privada de direitos', $q$select public.admin_set_creator_rights_private(public.seed_uuid('creator:lia'), 'FALSO', null, null)$q$, '42501');
select tests.login('10000000-0000-4000-8000-000000000002', 'consumer1@test.local');
select tests.ok('S16 consumidor não lê creator_rights_private', (select count(*) from public.creator_rights_private) = 0);
select tests.anon();
select tests.expect_error('S16 visitante não lê creator_rights_private (tabela sem grant para anon)', $q$select count(*) from public.creator_rights_private$q$, 'permission denied');
select tests.expect_error('S16 visitante não executa a RPC privada de direitos', $q$select public.admin_set_creator_rights_private(public.seed_uuid('creator:lia'), 'FALSO', null, null)$q$, 'permission denied');
select tests.ok('S16 seed: todas as personalidades seguem fictícias, sem titular nem validade', (select count(*) from public.creator_profiles where rights_status = 'fictional' and rights_holder is null and rights_valid_until is null) = 8);
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select tests.expect_error('S16 autorizado sem titular é recusado (check no banco)', $q$update public.creator_profiles set rights_status = 'authorized', rights_holder = null where id = public.seed_uuid('creator:lia')$q$, '23514');
select tests.expect_error('S16 autorizado com titular em branco é recusado', $q$update public.creator_profiles set rights_status = 'authorized', rights_holder = '   ' where id = public.seed_uuid('creator:lia')$q$, '23514');
update public.creator_profiles set rights_status = 'authorized', rights_holder = 'Titular de teste', rights_valid_until = current_date + 30 where id = public.seed_uuid('creator:lia');
select tests.ok('S16 admin altera os direitos e a auditoria registra', (select rights_status from public.creator_profiles where id = public.seed_uuid('creator:lia')) = 'authorized'
  and exists (select 1 from public.admin_audit where action = 'creator_profiles.update' and resource_id = public.seed_uuid('creator:lia')::text and after_data ->> 'rights_status' = 'authorized'));
select tests.expect_error('S16 rights_status fora da lista é recusado', $q$update public.creator_profiles set rights_status = 'real' where id = public.seed_uuid('creator:lia')$q$, '23514');
select public.admin_set_creator_rights_private(public.seed_uuid('creator:lia'), '  CONTRATO-TESTE-001  ', 'Nota interna', 'Documentação de teste');
select tests.ok('S16 admin grava e lê a parte privada (revisor registrado; auditoria sem as notas)',
  (select document_ref = 'CONTRATO-TESTE-001' and notes = 'Nota interna' and reviewed_by = '10000000-0000-4000-8000-000000000001' and reviewed_at is not null
   from public.creator_rights_private where creator_id = public.seed_uuid('creator:lia'))
  and exists (select 1 from public.admin_audit where action = 'creator.rights_private' and resource_id = public.seed_uuid('creator:lia')::text
              and after_data ->> 'document_ref' = 'CONTRATO-TESTE-001' and (after_data ->> 'has_notes')::boolean and not (after_data ? 'notes')));
select public.admin_set_creator_rights_private(public.seed_uuid('creator:lia'), 'CONTRATO-TESTE-002', '', null);
select tests.ok('S16 regravar atualiza em vez de duplicar', (select count(*) from public.creator_rights_private where creator_id = public.seed_uuid('creator:lia')) = 1
  and (select document_ref = 'CONTRATO-TESTE-002' and notes is null from public.creator_rights_private where creator_id = public.seed_uuid('creator:lia')));
select tests.expect_error('S16 RPC privada recusa personalidade inexistente', $q$select public.admin_set_creator_rights_private(gen_random_uuid(), 'X', null, null)$q$, 'creator_not_found');
select tests.anon();
select tests.ok('S16 campos públicos de direitos visíveis ao visitante (documento fica na tabela privada, negada acima)',
  (select rights_status = 'authorized' and rights_holder = 'Titular de teste' and rights_valid_until = current_date + 30
   from public.creator_profiles where id = public.seed_uuid('creator:lia')));
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
update public.creator_profiles set rights_status = 'fictional', rights_holder = null, rights_valid_until = null where id = public.seed_uuid('creator:lia');

-- licença de mídia × provedor
select tests.ok('S16 seed: licença coerente com o provedor em todos os corpos', (select count(*) from public.content c join public.content_bodies b on b.content_id = c.id
  where not public.media_license_compatible(b.media_provider, c.media_license_kind)) = 0);
select tests.expect_error('S16 corpo YouTube com licença platform_demo é recusado', $q$update public.content_bodies set media_provider = 'embed_youtube', media_ref = 'dQw4w9WgXcQ' where content_id = public.seed_uuid('content:r1')$q$, 'media_license_mismatch');
update public.content set media_license_kind = 'third_party_embed', media_credit = 'Canal de teste' where id = public.seed_uuid('content:r1');
update public.content_bodies set media_provider = 'embed_youtube', media_ref = 'dQw4w9WgXcQ' where content_id = public.seed_uuid('content:r1');
select tests.ok('S16 third_party_embed aceita o embed', (select media_provider from public.content_bodies where content_id = public.seed_uuid('content:r1')) = 'embed_youtube');
select tests.expect_error('S16 voltar a sem mídia mantendo third_party_embed é recusado', $q$update public.content_bodies set media_provider = 'none', media_ref = null where content_id = public.seed_uuid('content:r1')$q$, 'media_license_mismatch');
update public.content set media_license_kind = 'platform_demo', media_credit = null where id = public.seed_uuid('content:r1');
update public.content_bodies set media_provider = 'none', media_ref = null where content_id = public.seed_uuid('content:r1');
select tests.expect_error('S16 media_license_kind fora da lista é recusado', $q$update public.content set media_license_kind = 'qualquer' where id = public.seed_uuid('content:r1')$q$, '23514');
update public.content set media_license_kind = 'third_party_embed' where id = public.seed_uuid('content:r1'); -- estado transitório (o corpo é a escrita final)
select tests.expect_error('S16 publicação bloqueada com licença incoerente com o corpo', $q$select public.admin_set_content_status(public.seed_uuid('content:r1'), 'published', 'Teste de licença')$q$, 'media_license_mismatch');
select public.admin_set_content_status(public.seed_uuid('content:r1'), 'draft', 'Teste de licença');
select tests.expect_error('S16 aprovação bloqueada com licença incoerente com o corpo', $q$select public.admin_review_content(public.seed_uuid('content:r1'), 'approved', 'ok')$q$, 'media_license_mismatch');
update public.content set media_license_kind = 'platform_demo' where id = public.seed_uuid('content:r1');
select public.admin_set_content_status(public.seed_uuid('content:r1'), 'published', 'Teste de licença');
select tests.ok('S16 licença coerente volta a publicar', (select status from public.content where id = public.seed_uuid('content:r1')) = 'published');

-- origem do vínculo; personalidade preenche licença e crédito do próprio rascunho
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
insert into public.content (id, slug, creator_id, pillar, type, title, media_license_kind, media_credit, creator_link_origin) values
  ('20000000-0000-4000-8000-000000000002', 'teste-licenca-lia', public.seed_uuid('creator:lia'), 'routine', 'video', 'Vídeo de teste com licença', 'third_party_embed', 'Canal de teste', 'admin_assignment');
select tests.ok('S16 vínculo criado pela personalidade registra creator_submission (valor enviado é ignorado)',
  (select creator_link_origin from public.content where id = '20000000-0000-4000-8000-000000000002') = 'creator_submission');
insert into public.content_bodies (content_id, body, media_provider, media_ref) values ('20000000-0000-4000-8000-000000000002', '{"kind":"video","intro":"x"}', 'embed_youtube', 'dQw4w9WgXcQ');
update public.content set media_credit = 'Outro canal', media_license_ref = 'https://example.com/licenca' where id = '20000000-0000-4000-8000-000000000002';
select tests.ok('S16 personalidade grava e edita licença, referência e crédito do próprio rascunho',
  (select media_license_kind = 'third_party_embed' and media_credit = 'Outro canal' and media_license_ref = 'https://example.com/licenca' from public.content where id = '20000000-0000-4000-8000-000000000002'));
select tests.expect_error('S16 personalidade não altera a origem do vínculo', $q$update public.content set creator_link_origin = 'admin_assignment' where id = '20000000-0000-4000-8000-000000000002'$q$, 'protected_column');

-- nutrição (RB-08) no banco: a personalidade nunca se valida; o admin só valida com responsável e data real
select tests.expect_error('S16 personalidade não marca a nutrição como validada', $q$update public.content_bodies set body = body || '{"nutrition":{"per_serving":{"kcal":300},"validated":true,"validated_by":"Eu mesma","validated_at":"2026-10-20","note":""}}'::jsonb where content_id = '20000000-0000-4000-8000-000000000002'$q$, 'nutrition_validation_forbidden');
select tests.expect_error('S16 personalidade não grava responsável de validação nem com validated=false', $q$update public.content_bodies set body = body || '{"nutrition":{"per_serving":{"kcal":300},"validated":false,"validated_by":"Eu mesma","validated_at":null,"note":""}}'::jsonb where content_id = '20000000-0000-4000-8000-000000000002'$q$, 'nutrition_validation_forbidden');
update public.content_bodies set body = body || '{"nutrition":{"per_serving":{"kcal":300,"protein_g":12},"validated":false,"validated_by":null,"validated_at":null,"note":"estimativa"}}'::jsonb where content_id = '20000000-0000-4000-8000-000000000002';
select tests.ok('S16 personalidade grava números sem validação', (select (body -> 'nutrition' -> 'per_serving' ->> 'kcal')::int = 300 and not (body -> 'nutrition' ->> 'validated')::boolean from public.content_bodies where content_id = '20000000-0000-4000-8000-000000000002'));
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
select tests.expect_error('S16 admin não valida sem responsável e data', $q$update public.content_bodies set body = jsonb_set(body, '{nutrition,validated}', 'true') where content_id = '20000000-0000-4000-8000-000000000002'$q$, 'nutrition_validation_incomplete');
select tests.expect_error('S16 admin não valida com data que não existe', $q$update public.content_bodies set body = body || '{"nutrition":{"per_serving":{"kcal":300},"validated":true,"validated_by":"Nutricionista CRN 00000","validated_at":"2026-13-45","note":""}}'::jsonb where content_id = '20000000-0000-4000-8000-000000000002'$q$, 'nutrition_validation_incomplete');
update public.content_bodies set body = body || '{"nutrition":{"per_serving":{"kcal":300,"protein_g":12},"validated":true,"validated_by":"Nutricionista CRN 00000","validated_at":"2026-10-20","note":""}}'::jsonb where content_id = '20000000-0000-4000-8000-000000000002';
select tests.ok('S16 admin valida com responsável e data', (select (body -> 'nutrition' ->> 'validated')::boolean and body -> 'nutrition' ->> 'validated_by' = 'Nutricionista CRN 00000' from public.content_bodies where content_id = '20000000-0000-4000-8000-000000000002'));
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
select tests.expect_error('S16 personalidade não regrava o corpo mantendo a validação do admin', $q$update public.content_bodies set body = jsonb_set(body, '{nutrition,note}', '"ajuste"') where content_id = '20000000-0000-4000-8000-000000000002'$q$, 'nutrition_validation_forbidden');
update public.content_bodies set body = body || '{"nutrition":{"per_serving":{"kcal":310},"validated":false,"validated_by":null,"validated_at":null,"note":"ajuste"}}'::jsonb where content_id = '20000000-0000-4000-8000-000000000002';
select tests.ok('S16 personalidade regrava zerando a validação (como faz a server action)', (select not (body -> 'nutrition' ->> 'validated')::boolean and body -> 'nutrition' ->> 'validated_by' is null from public.content_bodies where content_id = '20000000-0000-4000-8000-000000000002'));
select tests.login('10000000-0000-4000-8000-000000000001', 'admin@test.local');
insert into public.content (id, slug, creator_id, pillar, type, title) values
  ('20000000-0000-4000-8000-000000000003', 'teste-atribuicao-admin', public.seed_uuid('creator:rafael'), 'routine', 'guide', 'Guia atribuído pelo admin');
select tests.ok('S16 vínculo criado pelo admin registra admin_assignment', (select creator_link_origin from public.content where id = '20000000-0000-4000-8000-000000000003') = 'admin_assignment');
update public.content set creator_id = public.seed_uuid('creator:rafael') where id = '20000000-0000-4000-8000-000000000002';
select tests.ok('S16 reatribuição pelo admin troca a origem para admin_assignment', (select creator_link_origin from public.content where id = '20000000-0000-4000-8000-000000000002') = 'admin_assignment');
update public.content set title = 'Guia atribuído (editado)' where id = '20000000-0000-4000-8000-000000000003';
select tests.ok('S16 edição sem trocar a personalidade preserva a origem', (select creator_link_origin from public.content where id = '20000000-0000-4000-8000-000000000003') = 'admin_assignment');
update public.content set creator_id = null where id = '20000000-0000-4000-8000-000000000003';
select tests.ok('S16 sem personalidade não há origem', (select creator_link_origin is null from public.content where id = '20000000-0000-4000-8000-000000000003'));
select tests.ok('S16 seed: todo conteúdo com personalidade tem origem registrada', (select count(*) from public.content where creator_id is not null and creator_link_origin is null) = 0);

-- nutrição validada do seed e endurecimento das funções novas
select tests.su();
select tests.ok('S16 seed: g1 e g5 com nutrição validada; g9 com números ainda em validação',
  (select count(*) from public.content_bodies where content_id in (public.seed_uuid('content:g1'), public.seed_uuid('content:g5'))
     and (body -> 'nutrition' ->> 'validated')::boolean and body -> 'nutrition' ->> 'validated_by' is not null and body -> 'nutrition' ->> 'validated_at' is not null
     and (body -> 'nutrition' -> 'per_serving' ->> 'kcal')::numeric > 0) = 2
  and (select not (body -> 'nutrition' ->> 'validated')::boolean and body -> 'nutrition' ->> 'validated_by' is null and (body -> 'nutrition' -> 'per_serving' ->> 'kcal')::numeric > 0
       from public.content_bodies where content_id = public.seed_uuid('content:g9')));
select tests.ok('S16 funções novas: triggers e checagem interna sem execute para anon; RPC privada security definer com search_path fixo',
  not has_function_privilege('anon', 'public.creator_rights_guard()', 'execute')
  and not has_function_privilege('anon', 'public.content_media_license_check()', 'execute')
  and not has_function_privilege('anon', 'public.content_link_origin()', 'execute')
  and not has_function_privilege('anon', 'public.content_bodies_nutrition_guard()', 'execute')
  and not has_function_privilege('anon', 'public.content_assert_media_license(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.content_assert_media_license(uuid)', 'execute')
  and (select p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
       from pg_proc p where p.oid = 'public.admin_set_creator_rights_private(uuid, text, text, text)'::regprocedure));

do $$ begin raise notice 'PASS cenários concluídos — transação será desfeita (rollback)'; end $$;
rollback;
