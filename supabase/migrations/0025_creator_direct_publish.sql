-- =============================================================================
-- Ultra Hero · 0025 · Publicação direta pelo herói
--   O herói (papel creator) publica o próprio rascunho sem passar pela fila do admin e pode
--   despublicá-lo para editar e publicar de novo. O admin continua governando depois (arquivar,
--   devolver, definir regra de acesso) pelas RPCs que já existem; o fluxo antigo
--   (submit_content_for_review + admin_review_content) segue intacto para quem quiser revisão.
-- Regras desta migração: nada de drop/delete/truncate; search_path fixo; grants explícitos;
-- gatilhos de guarda continuam ligados — as RPCs usam o mesmo sinalizador transacional
-- app.trusted das demais funções confiáveis (0010) para mudar status/review_status/access_level.
-- =============================================================================

-- Licença × provedor: o vídeo gravado pelo herói é 'own' + 'cloudflare_stream'. A regra de 0017
-- já aceita (mídia hospedada: platform_demo | own | licensed), então media_license_compatible
-- fica como está; a checagem continua sendo feita por content_assert_media_license.

-- ---------------------------------------------------------------- publicar
-- Pré-condições (as da aprovação do admin, mais as do autor):
--   * dono: content.creator_id = my_creator_id(); conteúdo inexistente também responde
--     'forbidden' para não revelar ids de terceiros;
--   * status 'draft' (arquivado ou já publicado → 'not_draft'). Arquivar continua sendo a trava
--     do admin: conteúdo arquivado nunca volta ao ar por aqui;
--   * título não vazio ('missing_title') e linha em content_bodies ('missing_body');
--   * vídeo exige mídia: provedor <> 'none' e media_ref preenchido ('missing_media'). Segue o
--     checklist do editor (item "media" só para vídeo): post de vídeo sem vídeo não vai ao ar,
--     mesmo com texto no corpo. Os demais tipos seguem a regra do admin (basta existir o corpo);
--   * licença coerente com o provedor (content_assert_media_license, igual à aprovação).
-- Regra de acesso continua sendo do admin: sem regra vira 'free'; premium já definido é
-- preservado (required_module_id não muda, então o check premium→módulo segue válido).
-- Rodada em revisão aberta (o herói tinha enviado ao admin) é fechada como autoaprovação;
-- sem rodada aberta, registra uma nova. content_reviews não tem restrição de unicidade nem
-- exige decided_by admin, então o histórico mostra quem publicou sem quebrar a fila do admin
-- (admin_review_content só mexe em rodadas 'in_review').
create or replace function public.creator_publish_content(p_content uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_uid uuid := auth.uid(); v_creator uuid;
        v_provider public.media_provider; v_ref text; v_round int;
        v_feedback constant text := 'Publicação direta pelo herói';
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.my_creator_id();
  select * into c from public.content where id = p_content for update;
  if not found or v_creator is null or c.creator_id is distinct from v_creator then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status <> 'draft' then raise exception 'not_draft'; end if;
  if nullif(btrim(coalesce(c.title, '')), '') is null then raise exception 'missing_title'; end if;
  select b.media_provider, nullif(btrim(coalesce(b.media_ref, '')), '') into v_provider, v_ref
  from public.content_bodies b where b.content_id = p_content;
  if not found then raise exception 'missing_body'; end if;
  if c.type = 'video' and (v_provider = 'none' or v_ref is null) then raise exception 'missing_media'; end if;
  perform public.content_assert_media_license(p_content);

  -- checagens feitas: só agora liga o sinalizador, e desliga antes de qualquer outra coisa
  perform set_config('app.trusted', 'on', true);
  update public.content
  set status = 'published', review_status = 'approved', published_at = now(), publish_at = null,
      access_level = coalesce(access_level, 'free')
  where id = p_content;
  perform set_config('app.trusted', 'off', true);

  update public.content_reviews
  set decision = 'approved', feedback = v_feedback, decided_by = v_uid, decided_at = now()
  where content_id = p_content and decision = 'in_review';
  if not found then
    select coalesce(max(round), 0) + 1 into v_round from public.content_reviews where content_id = p_content;
    insert into public.content_reviews (content_id, round, submitted_by, decision, feedback, decided_by, decided_at)
    values (p_content, v_round, v_uid, 'approved', v_feedback, v_uid, now());
  end if;

  perform public.audit_log('content.creator_publish', 'content', p_content::text,
    jsonb_build_object('status', c.status, 'review_status', c.review_status, 'access_level', c.access_level, 'publish_at', c.publish_at),
    jsonb_build_object('status', 'published', 'review_status', 'approved', 'access_level', coalesce(c.access_level, 'free'),
                       'media_provider', v_provider, 'media_license_kind', c.media_license_kind),
    null, 'creator');
  return jsonb_build_object('id', c.id, 'slug', c.slug, 'status', 'published');
end $$;

-- ---------------------------------------------------------------- despublicar
-- Volta o próprio conteúdo publicado (ou agendado) a rascunho editável: review_status 'none'
-- porque o gatilho content_creator_edit_guard só libera edição de rascunho fora de revisão.
-- publish_at é descartado (como em admin_set_content_status); published_at fica como histórico
-- e é renovado na próxima publicação. Regra de acesso e licença ficam como estão.
create or replace function public.creator_unpublish_content(p_content uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_creator uuid;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.my_creator_id();
  select * into c from public.content where id = p_content for update;
  if not found or v_creator is null or c.creator_id is distinct from v_creator then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if c.status <> 'published' then raise exception 'not_published'; end if;

  perform set_config('app.trusted', 'on', true);
  update public.content set status = 'draft', review_status = 'none', publish_at = null where id = p_content;
  perform set_config('app.trusted', 'off', true);

  perform public.audit_log('content.creator_unpublish', 'content', p_content::text,
    jsonb_build_object('status', c.status, 'review_status', c.review_status, 'publish_at', c.publish_at),
    jsonb_build_object('status', 'draft', 'review_status', 'none'),
    null, 'creator');
  return jsonb_build_object('id', c.id, 'slug', c.slug, 'status', 'draft');
end $$;

-- ---------------------------------------------------------------- grants
-- Visitante nunca executa (fora da lista pública do S14); a checagem de dono fica dentro.
revoke execute on function public.creator_publish_content(uuid) from public, anon;
grant execute on function public.creator_publish_content(uuid) to authenticated, service_role;
revoke execute on function public.creator_unpublish_content(uuid) from public, anon;
grant execute on function public.creator_unpublish_content(uuid) to authenticated, service_role;
