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
select tests.ok('S1 visitante vê produtos regulares (23 de 24: 1 indisponível ainda aparece; nenhum oculto)', (select count(*) from public.products) = 24);
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
select tests.ok('S3 downgrade fica agendado (módulo segue ativo até o fim)', (select count(*) from jsonb_array_elements(public.select_modules(array[public.seed_uuid('module:base')]) -> 'modules') m where m ->> 'status' = 'scheduled_removal') = 1
  and (select count(*) from public.content_bodies where content_id = public.seed_uuid('content:g8')) = 1);
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
