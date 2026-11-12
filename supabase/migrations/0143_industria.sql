-- 0143 — "Agência" passa a se chamar "Indústria" nos textos que o banco gera (pedido do responsável, 12/11/2026).
--
-- Os textos das telas estão nos arquivos de mensagens (pt-BR, en, es). Aqui ficam só os textos que o próprio banco
-- escreve e alguém lê: termo comercial para assinatura e condições de pagamento, observações do acordo da chamada da
-- marca, termo de confidencialidade e normas padrão da sala do projeto, notas das importações do casting, os nomes da
-- conta de exemplo e a descrição da chave de convites.
--
-- Não muda (de propósito):
--   • nomes internos: tabelas, colunas, papel 'agency', funções agency_*, chaves de mensagens e endereços (/agencia);
--   • dados das pessoas (nomes, e-mails, textos escritos por elas);
--   • registros: termos e NDAs já gerados ou assinados, auditoria e avisos já enviados (são histórico);
--   • "agência" bancária (banco, agência e conta) — nenhuma das funções abaixo a usa.
-- Idempotente; CREATE OR REPLACE mantém dono e permissões das funções.

do $$
declare
  v_oid oid;
  v_def text;
  v_novo text;
  v_nomes text[] := array[
    'agency_demo_seed', 'brand_call_agree', 'casting_groscove_2027_import', 'casting_groscove_2027_publish',
    'deal_terms_payment_text', 'deal_terms_signable_text', 'project_default_nda', 'project_default_norms',
    'project_nda_signable_text'];
begin
  for v_oid in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (v_nomes) and p.prosrc ~ 'g[êÊ]ncia'
  loop
    v_def := pg_get_functiondef(v_oid);
    v_novo := replace(replace(replace(replace(v_def,
      'Agências', 'Indústrias'), 'agências', 'indústrias'), 'Agência', 'Indústria'), 'agência', 'indústria');
    if v_novo <> v_def then
      execute v_novo;
    end if;
  end loop;
end $$;

update public.app_settings
set description = replace(replace(replace(replace(description,
  'Agências', 'Indústrias'), 'agências', 'indústrias'), 'Agência', 'Indústria'), 'agência', 'indústria')
where key = 'invites.enabled' and description ~ 'g[êÊ]ncia';
