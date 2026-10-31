-- 0069 · App gratuito: sem planos, módulos nem assinatura simulada; todo conteúdo é livre para quem entrou.
-- Idempotente (update condicional / drop constraint if exists). Depende da 0002.
--
-- Decisões (responsável, 31/10/2026: "não vamos mais ter planos, o app é gratuito"):
--   • todo conteúdo passa a ser 'free' e sem módulo exigido; conteúdo sem regra (access_level nulo) também vira
--     'free', porque não existe mais outra regra possível;
--   • uma trava (content_free_only) impede que um conteúdo volte a ser premium ou a exigir módulo;
--   • tabelas e funções de planos (plans, plan_modules, plan_bundle_modules, subscriptions, my_subscription,
--     select_modules, cancel_subscription, sync_all_subscriptions) ficam no banco, dormentes: nenhuma tela as usa
--     e o cron de renovação saiu do vercel.json. Nada é apagado aqui (sem drop destrutivo);
--   • o tipo access_level segue com 'premium' (enum) só para não mexer nos tipos gerados nem nas funções antigas.

-- 1) conteúdo existente → livre -------------------------------------------------------------------------------------
update public.content
set access_level = 'free', required_module_id = null
where access_level is distinct from 'free' or required_module_id is not null;

-- 2) trava: só conteúdo livre ---------------------------------------------------------------------------------------
alter table public.content drop constraint if exists content_free_only;
alter table public.content
  add constraint content_free_only check (access_level = 'free' and required_module_id is null) not valid;
alter table public.content validate constraint content_free_only;
