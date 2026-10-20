-- =============================================================================
-- Ultra Hero · 0016 · Endurecimento apontado pelos advisors do Supabase (20/10/2026)
--   1. search_path fixo nas 9 funções que ainda dependiam do search_path da sessão;
--   2. anon só executa o que uma visita pública usa (helpers de política, catálogo, settings,
--      analytics, feedback, certificado). O Supabase concede EXECUTE a anon/authenticated por
--      padrão em toda função nova; as checagens internas (is_admin, auth.uid) continuam valendo;
--   3. funções internas (chamadas só por outras security definer) deixam de ser RPC de usuário;
--   4. políticas: auth.uid()/is_admin()/my_creator_id() avaliados uma vez por consulta
--      ((select ...)) em vez de uma vez por linha, sem mudar a semântica.
-- =============================================================================

-- 1) search_path fixo
alter function public.content_creator_edit_guard() set search_path = public;
alter function public.enrollment_status_guard() set search_path = public;
alter function public.f_array_join(text[]) set search_path = public;
alter function public.guard_protected_columns() set search_path = public;
alter function public.is_trusted_call() set search_path = public;
alter function public.local_date_for(p_timezone text) set search_path = public;
alter function public.products_validate_publish() set search_path = public;
alter function public.seed_uuid(p text) set search_path = public;
alter function public.set_updated_at() set search_path = public;

-- 2) grants explícitos por função: o EXECUTE implícito de PUBLIC é removido de todas;
--    anon só fica na lista pública; funções internas e de sistema só para service_role.
revoke execute on function public.accept_invitation(p_token text) from public, anon; grant execute on function public.accept_invitation(p_token text) to authenticated, service_role;
revoke execute on function public.admin_advance_transport(p_minutes integer) from public, anon; grant execute on function public.admin_advance_transport(p_minutes integer) to authenticated, service_role;
revoke execute on function public.admin_create_invitation(p_email text, p_role app_role, p_seller_org_id uuid, p_creator_profile_id uuid, p_days integer) from public, anon; grant execute on function public.admin_create_invitation(p_email text, p_role app_role, p_seller_org_id uuid, p_creator_profile_id uuid, p_days integer) to authenticated, service_role;
revoke execute on function public.admin_create_program_version(p_program uuid, p_copy_from uuid) from public, anon; grant execute on function public.admin_create_program_version(p_program uuid, p_copy_from uuid) to authenticated, service_role;
revoke execute on function public.admin_get_user(p_id uuid) from public, anon; grant execute on function public.admin_get_user(p_id uuid) to authenticated, service_role;
revoke execute on function public.admin_list_users(p_search text, p_limit integer, p_offset integer) from public, anon; grant execute on function public.admin_list_users(p_search text, p_limit integer, p_offset integer) to authenticated, service_role;
revoke execute on function public.admin_log_account_status(p_user uuid, p_suspended boolean, p_justification text) from public, anon; grant execute on function public.admin_log_account_status(p_user uuid, p_suspended boolean, p_justification text) to authenticated, service_role;
revoke execute on function public.admin_metrics(p_days integer) from public, anon; grant execute on function public.admin_metrics(p_days integer) to authenticated, service_role;
revoke execute on function public.admin_moderate_product(p_product uuid, p_action text, p_reason text) from public, anon; grant execute on function public.admin_moderate_product(p_product uuid, p_action text, p_reason text) to authenticated, service_role;
revoke execute on function public.admin_publish_program_version(p_version uuid) from public, anon; grant execute on function public.admin_publish_program_version(p_version uuid) to authenticated, service_role;
revoke execute on function public.admin_review_content(p_content uuid, p_decision review_status, p_feedback text) from public, anon; grant execute on function public.admin_review_content(p_content uuid, p_decision review_status, p_feedback text) to authenticated, service_role;
revoke execute on function public.admin_revoke_invitation(p_id uuid, p_justification text) from public, anon; grant execute on function public.admin_revoke_invitation(p_id uuid, p_justification text) to authenticated, service_role;
revoke execute on function public.admin_revoke_membership(p_membership uuid, p_justification text) from public, anon; grant execute on function public.admin_revoke_membership(p_membership uuid, p_justification text) to authenticated, service_role;
revoke execute on function public.admin_run_retention() from public, anon; grant execute on function public.admin_run_retention() to authenticated, service_role;
revoke execute on function public.admin_set_content_status(p_content uuid, p_status content_status, p_justification text) from public, anon; grant execute on function public.admin_set_content_status(p_content uuid, p_status content_status, p_justification text) to authenticated, service_role;
revoke execute on function public.admin_set_creator_status(p_creator uuid, p_status partner_status, p_justification text) from public, anon; grant execute on function public.admin_set_creator_status(p_creator uuid, p_status partner_status, p_justification text) to authenticated, service_role;
revoke execute on function public.admin_set_featured(p_kind text, p_id uuid, p_featured boolean, p_rank integer) from public, anon; grant execute on function public.admin_set_featured(p_kind text, p_id uuid, p_featured boolean, p_rank integer) to authenticated, service_role;
revoke execute on function public.admin_set_link_status(p_link uuid, p_status link_status, p_note text) from public, anon; grant execute on function public.admin_set_link_status(p_link uuid, p_status link_status, p_note text) to authenticated, service_role;
revoke execute on function public.admin_set_role(p_user uuid, p_role app_role, p_active boolean, p_justification text) from public, anon; grant execute on function public.admin_set_role(p_user uuid, p_role app_role, p_active boolean, p_justification text) to authenticated, service_role;
revoke execute on function public.admin_set_seller_status(p_org uuid, p_status partner_status, p_justification text) from public, anon; grant execute on function public.admin_set_seller_status(p_org uuid, p_status partner_status, p_justification text) to authenticated, service_role;
revoke execute on function public.admin_set_setting(p_key text, p_value jsonb, p_justification text) from public, anon; grant execute on function public.admin_set_setting(p_key text, p_value jsonb, p_justification text) to authenticated, service_role;
revoke execute on function public.admin_substitute_program_item(p_version uuid, p_original uuid, p_replacement uuid, p_reason text) from public, anon; grant execute on function public.admin_substitute_program_item(p_version uuid, p_original uuid, p_replacement uuid, p_reason text) to authenticated, service_role;
revoke execute on function public.admin_user_emails(p_ids uuid[]) from public, anon; grant execute on function public.admin_user_emails(p_ids uuid[]) to authenticated, service_role;
revoke execute on function public.advance_simulated_transport(p_minutes_per_step integer) from public, anon; grant execute on function public.advance_simulated_transport(p_minutes_per_step integer) to authenticated, service_role;
revoke execute on function public.anonymize_user_data(p_user uuid) from public, anon, authenticated; grant execute on function public.anonymize_user_data(p_user uuid) to service_role;
revoke execute on function public.audit_log(p_action text, p_resource_type text, p_resource_id text, p_before jsonb, p_after jsonb, p_justification text, p_actor_type actor_type) from public, anon, authenticated; grant execute on function public.audit_log(p_action text, p_resource_type text, p_resource_id text, p_before jsonb, p_after jsonb, p_justification text, p_actor_type actor_type) to service_role;
revoke execute on function public.audit_partner_changes() from public, anon; grant execute on function public.audit_partner_changes() to authenticated, service_role;
revoke execute on function public.can_access_content(p_content uuid) from public; grant execute on function public.can_access_content(p_content uuid) to anon, authenticated, service_role;
revoke execute on function public.cancel_subscription() from public, anon; grant execute on function public.cancel_subscription() to authenticated, service_role;
revoke execute on function public.cancel_test_order(p_order uuid) from public, anon; grant execute on function public.cancel_test_order(p_order uuid) to authenticated, service_role;
revoke execute on function public.cart_set_item(p_product uuid, p_quantity integer) from public, anon; grant execute on function public.cart_set_item(p_product uuid, p_quantity integer) to authenticated, service_role;
revoke execute on function public.cart_validate(p_expected jsonb) from public, anon; grant execute on function public.cart_validate(p_expected jsonb) to authenticated, service_role;
revoke execute on function public.check_program_completion(p_enrollment uuid) from public, anon, authenticated; grant execute on function public.check_program_completion(p_enrollment uuid) to service_role;
revoke execute on function public.checkout_cart(p_destination uuid, p_expected jsonb, p_accept_changes boolean) from public, anon; grant execute on function public.checkout_cart(p_destination uuid, p_expected jsonb, p_accept_changes boolean) to authenticated, service_role;
revoke execute on function public.checkout_create_fulfillment(p_order uuid, p_user uuid, p_seller uuid, p_seller_name text, p_shipping_share integer, p_zone text, p_eta integer) from public, anon, authenticated; grant execute on function public.checkout_create_fulfillment(p_order uuid, p_user uuid, p_seller uuid, p_seller_name text, p_shipping_share integer, p_zone text, p_eta integer) to service_role;
revoke execute on function public.complete_content(p_content uuid, p_timezone text, p_source text) from public, anon; grant execute on function public.complete_content(p_content uuid, p_timezone text, p_source text) to authenticated, service_role;
revoke execute on function public.compute_streak(p_user uuid, p_timezone text) from public, anon; grant execute on function public.compute_streak(p_user uuid, p_timezone text) to authenticated, service_role;
revoke execute on function public.content_creator_edit_guard() from public, anon; grant execute on function public.content_creator_edit_guard() to authenticated, service_role;
revoke execute on function public.delete_my_account() from public, anon; grant execute on function public.delete_my_account() to authenticated, service_role;
revoke execute on function public.enroll_program(p_program uuid, p_timezone text) from public, anon; grant execute on function public.enroll_program(p_program uuid, p_timezone text) to authenticated, service_role;
revoke execute on function public.enrollment_status_guard() from public, anon; grant execute on function public.enrollment_status_guard() to authenticated, service_role;
revoke execute on function public.evaluate_achievements(p_user uuid, p_timezone text) from public, anon, authenticated; grant execute on function public.evaluate_achievements(p_user uuid, p_timezone text) to service_role;
revoke execute on function public.f_array_join(text[]) from public; grant execute on function public.f_array_join(text[]) to anon, authenticated, service_role;
revoke execute on function public.f_unaccent(text) from public; grant execute on function public.f_unaccent(text) to anon, authenticated, service_role;
revoke execute on function public.fulfillment_transition(p_fulfillment uuid, p_to fulfillment_status, p_note text) from public, anon; grant execute on function public.fulfillment_transition(p_fulfillment uuid, p_to fulfillment_status, p_note text) to authenticated, service_role;
revoke execute on function public.guard_protected_columns() from public, anon; grant execute on function public.guard_protected_columns() to authenticated, service_role;
revoke execute on function public.handle_new_user() from public, anon; grant execute on function public.handle_new_user() to authenticated, service_role;
revoke execute on function public.has_role(p_role app_role) from public; grant execute on function public.has_role(p_role app_role) to anon, authenticated, service_role;
revoke execute on function public.is_admin() from public; grant execute on function public.is_admin() to anon, authenticated, service_role;
revoke execute on function public.is_seller_of(p_org uuid) from public; grant execute on function public.is_seller_of(p_org uuid) to anon, authenticated, service_role;
revoke execute on function public.is_trusted_call() from public; grant execute on function public.is_trusted_call() to anon, authenticated, service_role;
revoke execute on function public.local_date_for(p_timezone text) from public; grant execute on function public.local_date_for(p_timezone text) to anon, authenticated, service_role;
revoke execute on function public.my_creator_id() from public; grant execute on function public.my_creator_id() to anon, authenticated, service_role;
revoke execute on function public.my_entitled_modules() from public; grant execute on function public.my_entitled_modules() to anon, authenticated, service_role;
revoke execute on function public.my_roles() from public; grant execute on function public.my_roles() to anon, authenticated, service_role;
revoke execute on function public.my_seller_org_ids() from public; grant execute on function public.my_seller_org_ids() to anon, authenticated, service_role;
revoke execute on function public.my_subscription() from public; grant execute on function public.my_subscription() to anon, authenticated, service_role;
revoke execute on function public.product_is_purchasable(p_product uuid) from public; grant execute on function public.product_is_purchasable(p_product uuid) to anon, authenticated, service_role;
revoke execute on function public.products_before_update() from public, anon; grant execute on function public.products_before_update() to authenticated, service_role;
revoke execute on function public.products_validate_publish() from public, anon; grant execute on function public.products_validate_publish() to authenticated, service_role;
revoke execute on function public.program_required_items(p_version uuid) from public; grant execute on function public.program_required_items(p_version uuid) to anon, authenticated, service_role;
revoke execute on function public.public_settings() from public; grant execute on function public.public_settings() to anon, authenticated, service_role;
revoke execute on function public.quote_shipping(p_zone text, p_seller_count integer, p_subtotal integer) from public; grant execute on function public.quote_shipping(p_zone text, p_seller_count integer, p_subtotal integer) to anon, authenticated, service_role;
revoke execute on function public.recompute_order_status(p_order uuid) from public, anon, authenticated; grant execute on function public.recompute_order_status(p_order uuid) to service_role;
revoke execute on function public.run_retention() from public, anon, authenticated; grant execute on function public.run_retention() to service_role;
revoke execute on function public.search_content(p_query text, p_pillar pillar, p_type content_type, p_creator uuid, p_access access_level, p_limit integer, p_offset integer, p_difficulty text) from public; grant execute on function public.search_content(p_query text, p_pillar pillar, p_type content_type, p_creator uuid, p_access access_level, p_limit integer, p_offset integer, p_difficulty text) to anon, authenticated, service_role;
revoke execute on function public.seed_uuid(p text) from public; grant execute on function public.seed_uuid(p text) to anon, authenticated, service_role;
revoke execute on function public.select_modules(p_module_ids uuid[]) from public, anon; grant execute on function public.select_modules(p_module_ids uuid[]) to authenticated, service_role;
revoke execute on function public.set_updated_at() from public, anon; grant execute on function public.set_updated_at() to authenticated, service_role;
revoke execute on function public.setting(p_key text) from public, anon, authenticated; grant execute on function public.setting(p_key text) to service_role;
revoke execute on function public.slugify(p text) from public; grant execute on function public.slugify(p text) to anon, authenticated, service_role;
revoke execute on function public.submit_content_for_review(p_content uuid) from public, anon; grant execute on function public.submit_content_for_review(p_content uuid) to authenticated, service_role;
revoke execute on function public.submit_feedback(p_context text, p_rating integer, p_message text, p_locale locale_code) from public; grant execute on function public.submit_feedback(p_context text, p_rating integer, p_message text, p_locale locale_code) to anon, authenticated, service_role;
revoke execute on function public.sync_all_subscriptions() from public, anon, authenticated; grant execute on function public.sync_all_subscriptions() to service_role;
revoke execute on function public.sync_subscription(p_user uuid) from public, anon, authenticated; grant execute on function public.sync_subscription(p_user uuid) to service_role;
revoke execute on function public.track_event(p_event text, p_properties jsonb, p_anon_id text, p_locale locale_code) from public; grant execute on function public.track_event(p_event text, p_properties jsonb, p_anon_id text, p_locale locale_code) to anon, authenticated, service_role;
revoke execute on function public.track_progress(p_content uuid, p_position_seconds integer, p_progress_pct integer, p_timezone text) from public, anon; grant execute on function public.track_progress(p_content uuid, p_position_seconds integer, p_progress_pct integer, p_timezone text) to authenticated, service_role;
revoke execute on function public.user_entitled_modules(p_user uuid) from public, anon; grant execute on function public.user_entitled_modules(p_user uuid) to authenticated, service_role;
revoke execute on function public.verify_certificate(p_code text) from public; grant execute on function public.verify_certificate(p_code text) to anon, authenticated, service_role;

-- 3) novas funções não herdam EXECUTE de PUBLIC nem de anon; cada migração concede o que precisa
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;

-- 4) políticas: subconsulta estável (initplan) para auth.uid()/is_admin()/my_creator_id()
alter policy account_deletion_admin on public.account_deletion_requests using (( SELECT is_admin()));
alter policy achievements_admin on public.achievements using (( SELECT is_admin())) with check (( SELECT is_admin()));
alter policy admin_audit_admin_select on public.admin_audit using (( SELECT is_admin()));
alter policy analytics_admin on public.analytics_events using (( SELECT is_admin()));
alter policy app_settings_admin_all on public.app_settings using (( SELECT is_admin())) with check (( SELECT is_admin()));
alter policy cart_items_own_delete on public.cart_items using ((EXISTS ( SELECT 1
   FROM carts c
  WHERE ((c.id = cart_items.cart_id) AND (c.user_id = ( SELECT auth.uid() AS uid))))));
alter policy cart_items_own_select on public.cart_items using ((EXISTS ( SELECT 1
   FROM carts c
  WHERE ((c.id = cart_items.cart_id) AND (c.user_id = ( SELECT auth.uid() AS uid))))));
alter policy carts_own on public.carts using ((user_id = ( SELECT auth.uid() AS uid)));
alter policy certificates_select_own on public.certificates using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin())));
alter policy completions_select_own on public.completions using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin())));
alter policy content_delete_admin on public.content using (( SELECT is_admin()));
alter policy content_insert_creator on public.content with check ((( SELECT is_admin()) OR ((creator_id = ( SELECT my_creator_id())) AND (status = 'draft'::content_status) AND (review_status = 'none'::review_status))));
alter policy content_select on public.content using (((status = 'published'::content_status) OR ( SELECT is_admin()) OR ((creator_id IS NOT NULL) AND (creator_id = ( SELECT my_creator_id())))));
alter policy content_update on public.content using ((( SELECT is_admin()) OR ((creator_id IS NOT NULL) AND (creator_id = ( SELECT my_creator_id()))))) with check ((( SELECT is_admin()) OR ((creator_id IS NOT NULL) AND (creator_id = ( SELECT my_creator_id())))));
alter policy content_bodies_write on public.content_bodies using ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM content c
  WHERE ((c.id = content_bodies.content_id) AND (c.creator_id = ( SELECT my_creator_id())) AND (c.status = 'draft'::content_status) AND (c.review_status <> 'in_review'::review_status)))))) with check ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM content c
  WHERE ((c.id = content_bodies.content_id) AND (c.creator_id = ( SELECT my_creator_id())) AND (c.status = 'draft'::content_status) AND (c.review_status <> 'in_review'::review_status))))));
alter policy content_loc_admin on public.content_localizations using (( SELECT is_admin())) with check (( SELECT is_admin()));
alter policy content_loc_select on public.content_localizations using (((status = 'published'::text) OR ( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM content c
  WHERE ((c.id = content_localizations.content_id) AND (c.creator_id = ( SELECT my_creator_id())))))));
alter policy links_admin_update on public.content_product_links using (( SELECT is_admin())) with check (( SELECT is_admin()));
alter policy links_delete_creator on public.content_product_links using ((( SELECT is_admin()) OR ((status = 'suggested'::link_status) AND (suggested_by_creator = ( SELECT my_creator_id())))));
alter policy links_insert_creator on public.content_product_links with check ((( SELECT is_admin()) OR ((status = 'suggested'::link_status) AND (suggested_by_creator = ( SELECT my_creator_id())) AND (EXISTS ( SELECT 1
   FROM content c
  WHERE ((c.id = content_product_links.content_id) AND (c.creator_id = ( SELECT my_creator_id()))))))));
alter policy links_select on public.content_product_links using (((status = 'validated'::link_status) OR ( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM content c
  WHERE ((c.id = content_product_links.content_id) AND (c.creator_id = ( SELECT my_creator_id()))))) OR (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = content_product_links.product_id) AND is_seller_of(p.seller_org_id))))));
alter policy progress_select_own on public.content_progress using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin())));
alter policy content_reviews_select on public.content_reviews using ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM content c
  WHERE ((c.id = content_reviews.content_id) AND (c.creator_id = ( SELECT my_creator_id())))))));
alter policy cts_admin on public.content_type_settings using (( SELECT is_admin())) with check (( SELECT is_admin()));
alter policy creators_admin_delete on public.creator_profiles using (( SELECT is_admin()));
alter policy creators_admin_insert on public.creator_profiles with check (( SELECT is_admin()));
alter policy creators_select_public on public.creator_profiles using (((status = 'active'::partner_status) OR (user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin())));
alter policy creators_update_own on public.creator_profiles using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin()))) with check (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin())));
alter policy lists_own on public.custom_lists using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin()))) with check ((user_id = ( SELECT auth.uid() AS uid)));
alter policy destinations_admin on public.demo_destinations using (( SELECT is_admin())) with check (( SELECT is_admin()));
alter policy destinations_select on public.demo_destinations using ((is_active OR ( SELECT is_admin())));
alter policy shipping_admin on public.demo_shipping_rules using (( SELECT is_admin())) with check (( SELECT is_admin()));
alter policy enrollments_select_own on public.enrollments using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin())));
alter policy enrollments_update_own on public.enrollments using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin()))) with check (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin())));
alter policy favorites_own on public.favorites using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
alter policy feedback_admin on public.feedback using (( SELECT is_admin()));
alter policy feedback_admin_update on public.feedback using (( SELECT is_admin())) with check (( SELECT is_admin()));
alter policy fulfillment_events_select on public.fulfillment_events using ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM test_fulfillments f
  WHERE ((f.id = fulfillment_events.fulfillment_id) AND (is_seller_of(f.seller_org_id) OR (EXISTS ( SELECT 1
           FROM test_orders o
          WHERE ((o.id = f.order_id) AND (o.user_id = ( SELECT auth.uid() AS uid)))))))))));
alter policy interest_tags_admin on public.interest_tags using (( SELECT is_admin())) with check (( SELECT is_admin()));
alter policy invitations_admin_select on public.invitations using (( SELECT is_admin()));
alter policy list_items_own on public.list_items using ((EXISTS ( SELECT 1
   FROM custom_lists l
  WHERE ((l.id = list_items.list_id) AND (l.user_id = ( SELECT auth.uid() AS uid)))))) with check ((EXISTS ( SELECT 1
   FROM custom_lists l
  WHERE ((l.id = list_items.list_id) AND (l.user_id = ( SELECT auth.uid() AS uid))))));
alter policy module_deps_admin on public.module_dependencies using (( SELECT is_admin())) with check (( SELECT is_admin()));
alter policy not_interested_own on public.not_interested using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
alter policy plan_bundle_admin on public.plan_bundle_modules using (( SELECT is_admin())) with check (( SELECT is_admin()));
alter policy plan_modules_admin on public.plan_modules using (( SELECT is_admin())) with check (( SELECT is_admin()));
alter policy plans_admin on public.plans using (( SELECT is_admin())) with check (( SELECT is_admin()));
alter policy categories_admin on public.product_categories using (( SELECT is_admin())) with check (( SELECT is_admin()));
alter policy product_interest_admin on public.product_interest using (( SELECT is_admin()));
alter policy product_interest_insert on public.product_interest with check ((user_id = ( SELECT auth.uid() AS uid)));
alter policy product_moderation_select on public.product_moderation using ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_moderation.product_id) AND is_seller_of(p.seller_org_id))))));
alter policy product_versions_select on public.product_versions using ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_versions.product_id) AND is_seller_of(p.seller_org_id))))));
alter policy products_insert_seller on public.products with check (((is_seller_of(seller_org_id) AND (moderation_status = 'clear'::moderation_status)) OR ( SELECT is_admin())));
alter policy products_select on public.products using ((((status = 'published'::product_status) AND (moderation_status = 'clear'::moderation_status) AND (EXISTS ( SELECT 1
   FROM seller_organizations o
  WHERE ((o.id = products.seller_org_id) AND (o.status = 'active'::partner_status))))) OR is_seller_of(seller_org_id) OR ( SELECT is_admin())));
alter policy products_update_seller on public.products using ((is_seller_of(seller_org_id) OR ( SELECT is_admin()))) with check ((is_seller_of(seller_org_id) OR ( SELECT is_admin())));
alter policy profiles_select_own on public.profiles using (((id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin())));
alter policy profiles_update_own on public.profiles using (((id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin()))) with check (((id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin())));
alter policy pis_admin on public.program_item_substitutions using (( SELECT is_admin())) with check (( SELECT is_admin()));
alter policy pis_select on public.program_item_substitutions using ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM program_versions v
  WHERE ((v.id = program_item_substitutions.version_id) AND (v.status = 'published'::content_status))))));
alter policy pi_admin on public.program_items using (( SELECT is_admin())) with check (( SELECT is_admin()));
alter policy pi_select on public.program_items using ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM program_versions v
  WHERE ((v.id = program_items.version_id) AND (v.status = 'published'::content_status)))) OR (EXISTS ( SELECT 1
   FROM enrollments e
  WHERE ((e.version_id = e.version_id) AND (e.user_id = ( SELECT auth.uid() AS uid)))))));
alter policy ploc_admin on public.program_localizations using (( SELECT is_admin())) with check (( SELECT is_admin()));
alter policy ploc_select on public.program_localizations using (((status = 'published'::text) OR ( SELECT is_admin())));
alter policy pv_admin on public.program_versions using (( SELECT is_admin())) with check (( SELECT is_admin()));
alter policy pv_select on public.program_versions using ((( SELECT is_admin()) OR ((status = 'published'::content_status) AND (EXISTS ( SELECT 1
   FROM programs p
  WHERE ((p.id = program_versions.program_id) AND (p.status = 'published'::content_status))))) OR (EXISTS ( SELECT 1
   FROM enrollments e
  WHERE ((e.version_id = e.id) AND (e.user_id = ( SELECT auth.uid() AS uid)))))));
alter policy programs_admin on public.programs using (( SELECT is_admin())) with check (( SELECT is_admin()));
alter policy programs_select on public.programs using (((status = 'published'::content_status) OR ( SELECT is_admin())));
alter policy rec_runs_admin on public.recommendation_runs using (( SELECT is_admin()));
alter policy retention_exceptions_admin on public.retention_exceptions using (( SELECT is_admin())) with check (( SELECT is_admin()));
alter policy retention_jobs_admin on public.retention_jobs using (( SELECT is_admin()));
alter policy roles_select_own on public.role_assignments using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin())));
alter policy memberships_admin_write on public.seller_memberships using (( SELECT is_admin())) with check (( SELECT is_admin()));
alter policy memberships_select_own on public.seller_memberships using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin())));
alter policy sellers_admin_insert on public.seller_organizations with check (( SELECT is_admin()));
alter policy sellers_select_public on public.seller_organizations using (((status = 'active'::partner_status) OR is_seller_of(id) OR ( SELECT is_admin())));
alter policy sellers_update_member on public.seller_organizations using ((is_seller_of(id) OR ( SELECT is_admin()))) with check ((is_seller_of(id) OR ( SELECT is_admin())));
alter policy subs_select_own on public.simulated_subscriptions using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin())));
alter policy streak_select_own on public.streak_events using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin())));
alter policy sub_events_select_own on public.subscription_events using ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM simulated_subscriptions s
  WHERE ((s.id = subscription_events.subscription_id) AND (s.user_id = ( SELECT auth.uid() AS uid)))))));
alter policy sub_modules_select_own on public.subscription_modules using ((( SELECT is_admin()) OR (EXISTS ( SELECT 1
   FROM simulated_subscriptions s
  WHERE ((s.id = subscription_modules.subscription_id) AND (s.user_id = ( SELECT auth.uid() AS uid)))))));
alter policy fulfillments_select on public.test_fulfillments using ((( SELECT is_admin()) OR is_seller_of(seller_org_id) OR (EXISTS ( SELECT 1
   FROM test_orders o
  WHERE ((o.id = test_fulfillments.order_id) AND (o.user_id = ( SELECT auth.uid() AS uid)))))));
alter policy order_items_select on public.test_order_items using ((( SELECT is_admin()) OR is_seller_of(seller_org_id) OR (EXISTS ( SELECT 1
   FROM test_orders o
  WHERE ((o.id = test_order_items.order_id) AND (o.user_id = ( SELECT auth.uid() AS uid)))))));
alter policy orders_select_own on public.test_orders using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin())));
alter policy user_ach_select_own on public.user_achievements using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin())));
alter policy user_interests_own on public.user_interests using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
alter policy recs_select_own on public.user_recommendations using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin())));
