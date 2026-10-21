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
--    guia sem corpo, vídeo sem mídia e guia com título em branco
select tests.login('10000000-0000-4000-8000-000000000004', 'creator1@test.local');
insert into public.content (id, slug, creator_id, pillar, type, title, summary, media_license_kind) values
  ('23000000-0000-4000-8000-000000000001', 's23-video-celular', public.seed_uuid('creator:lia'), 'training', 'video', 'Treino relampago S23 gravado no celular', 'Vídeo curto do herói', 'own'),
  ('23000000-0000-4000-8000-000000000002', 's23-video-premium', public.seed_uuid('creator:lia'), 'training', 'video', 'Video premium S23', null, 'own'),
  ('23000000-0000-4000-8000-000000000003', 's23-guia-sem-corpo', public.seed_uuid('creator:lia'), 'routine', 'guide', 'Guia S23 sem corpo', null, 'platform_demo'),
  ('23000000-0000-4000-8000-000000000004', 's23-video-sem-midia', public.seed_uuid('creator:lia'), 'training', 'video', 'Video S23 sem midia', null, 'own'),
  ('23000000-0000-4000-8000-000000000005', 's23-titulo-branco', public.seed_uuid('creator:lia'), 'routine', 'guide', '   ', null, 'platform_demo');
insert into public.content_bodies (content_id, body, media_provider, media_ref) values
  ('23000000-0000-4000-8000-000000000001', '{"kind":"video","intro":""}', 'cloudflare_stream', 'cf-s23-uid-0001'),
  ('23000000-0000-4000-8000-000000000002', '{"kind":"video","intro":"x"}', 'cloudflare_stream', 'cf-s23-uid-0002'),
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
    and (select media_ref from public.content_bodies where content_id = '23000000-0000-4000-8000-000000000001') = 'cf-s23-uid-0001');
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
update public.content_bodies set body = '{"kind":"video","intro":"texto"}', media_provider = 'cloudflare_stream', media_ref = '  ' where content_id = '23000000-0000-4000-8000-000000000004';
select tests.expect_error('S23 vídeo com media_ref em branco (mesmo com corpo): missing_media', $q$select public.creator_publish_content('23000000-0000-4000-8000-000000000004')$q$, 'missing_media');
select tests.expect_error('S23 título em branco: missing_title', $q$select public.creator_publish_content('23000000-0000-4000-8000-000000000005')$q$, 'missing_title');
update public.content_bodies set media_ref = 'cf-s23-uid-0004' where content_id = '23000000-0000-4000-8000-000000000004';
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
update public.content_bodies set media_ref = 'cf-s23-uid-0001b' where content_id = '23000000-0000-4000-8000-000000000001';
select tests.ok('S23 dono edita título e mídia depois de despublicar', (select c.title = 'Treino relampago S23 editado' and b.media_ref = 'cf-s23-uid-0001b'
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
