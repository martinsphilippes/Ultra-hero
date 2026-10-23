-- =============================================================================
-- Ultra Hero · 0036 · Receitas fase 6: o herói exclui de vez a receita que ele mesmo arquivou
--   Até aqui só o rascunho que nunca foi ao ar podia ser excluído (creator_delete_recipe_draft): a
--   receita que esteve no ar só podia ser arquivada e ficava para sempre na conta do herói. Isso
--   também impedia a prova de "publicada e encontrada no catálogo" do E2E em produção (P4 da
--   decisão do módulo), que precisa sair do remoto sem deixar nada.
--   creator_delete_recipe aceita:
--     - rascunho (ou devolvido) que nunca foi ao ar e não está em revisão (mesma regra de antes);
--     - receita arquivada PELO PRÓPRIO HERÓI (a que o admin arquivou continua trava dele).
--   Publicada ou agendada: 'not_deletable' (arquive antes). Rascunho que já esteve no ar:
--   'already_published' (arquive antes). Em programa ou com conclusões: 'content_in_use' (as FKs
--   restritivas de program_items/completions). Favoritos, listas, histórico, avaliações, versões e
--   mídia saem em cascata; os itens da lista de compras ficam sem a receita (on delete set null).
--   A auditoria guarda o registro (content.creator_delete com o status anterior e os caminhos).
--   Devolve os caminhos das fotos (o app apaga no Storage) e o uid do Stream, como a função antiga.
--   creator_delete_recipe_draft não muda: o app publicado antes desta migração continua chamando-a.
-- Reaplicável. Sem dados para migrar. Sem execute para anon (a lista do S14 não muda).
-- =============================================================================

create or replace function public.creator_delete_recipe(p_content uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.content%rowtype; v_creator uuid; v_paths text[]; v_provider public.media_provider; v_ref text; v_owned text;
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  v_creator := public.my_creator_id();
  select * into c from public.content where id = p_content for update;
  if not found or v_creator is null or c.creator_id is distinct from v_creator then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.type <> 'recipe' then raise exception 'not_recipe' using errcode = '22023'; end if;
  if c.status = 'archived' then
    if c.archived_by is distinct from 'creator' then raise exception 'archived_by_admin'; end if;
  elsif c.status = 'draft' then
    if c.published_at is not null then raise exception 'already_published'; end if;
    if c.review_status = 'in_review' then raise exception 'content_not_editable' using errcode = '42501'; end if;
  else
    raise exception 'not_deletable';
  end if;
  select coalesce(array_agg(m.storage_path order by m.storage_path), '{}') into v_paths from public.recipe_media m where m.content_id = p_content;
  select b.media_provider, b.media_ref into v_provider, v_ref from public.content_bodies b where b.content_id = p_content;
  -- o vídeo do Stream só é descartado se foi este herói que enviou e nenhum outro conteúdo o usa
  if v_provider = 'cloudflare_stream' then
    select s.uid into v_owned from public.stream_uploads s
    where s.uid = v_ref and s.creator_id = v_creator and s.discarded_at is null and (s.content_id is null or s.content_id = p_content)
      and not exists (select 1 from public.content_bodies b2 where b2.media_provider = 'cloudflare_stream' and b2.media_ref = v_ref and b2.content_id <> p_content)
    for update of s;
  end if;
  begin
    delete from public.content where id = p_content;
  exception when foreign_key_violation then
    raise exception 'content_in_use';
  end;
  if v_owned is not null then update public.stream_uploads set discarded_at = now() where uid = v_owned; end if;
  perform public.audit_log('content.creator_delete', 'content', p_content::text,
    jsonb_build_object('status', c.status, 'slug', c.slug, 'title', c.title, 'published_at', c.published_at,
                       'archived_by', c.archived_by, 'media_paths', to_jsonb(v_paths), 'media_ref', v_ref),
    null, null, 'creator');
  return jsonb_build_object('id', c.id, 'slug', c.slug, 'paths', to_jsonb(v_paths), 'uid', v_owned);
end $$;
revoke execute on function public.creator_delete_recipe(uuid) from public, anon;
grant execute on function public.creator_delete_recipe(uuid) to authenticated, service_role;
