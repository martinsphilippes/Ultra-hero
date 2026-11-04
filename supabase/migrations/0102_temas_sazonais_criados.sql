-- =============================================================================
-- Groscove Ultra · 0102 · Temas sazonais criados (Natal, Réveillon, Black Friday, Carnaval, Copa Feminina, reality,
-- Dia das Mães, Dia dos Pais) com ilustrações próprias · cenário S108
-- Pedido do responsável (04/11/2026): "monte os temas e, além das cores, traga imagens… deixe disponível como temas
-- criados, para eu conseguir ver lá no app". Idempotente; nada de drop de tabela/coluna; nenhuma função nova (S14 segue 18).
--
-- Decisões (sem perguntar ao responsável):
--   • IMAGENS NO PRÓPRIO APP: as ilustrações (arte vetorial própria, rasterizada em WebP transparente) ficam em
--     public/temas/<tema>/<nome>.webp e são servidas pelo próprio site. O banco passa a aceitar, além das URLs do bucket
--     theme-assets (que continua para envios futuros do admin), caminhos internos estritos: /temas/<pasta>/<arquivo>.
--     (png|jpg|webp), só letras minúsculas, dígitos e hífen em cada parte — sem "..", sem barra dupla, sem outro
--     domínio, sem SVG. O app repete a mesma regra (vocab.ts) e o otimizador de imagens só lê arquivos locais.
--   • TEMAS PUBLICADOS com id FIXO (b0102000-…-0000000000NN = chave do tema): reaplicar não duplica e não sobrescreve o
--     que o admin já ajustou (on conflict do nothing). Cada tema liga ao evento real do Calendário Groscove (0099),
--     localizado pela source_key estável da importação e, na falta dela, por título + data; sem o evento (banco sem a
--     importação), o tema entra "por data" com as MESMAS datas — a janela é igual nos dois casos.
--   • Janelas (fuso America/Sao_Paulo, fim exclusivo): Natal 15/12 → fim do Natal (26/12 00:00); Réveillon 26/12 →
--     02/01/2027 00:00 (inclui 1º de janeiro); Black Friday 20/11 → 28/11/2026; reality 11/01 → 21/04/2027; Carnaval
--     01/02 → 10/02/2027; Dia das Mães 02/05 → 10/05/2027; Copa do Mundo Feminina 17/06 → 26/07/2027; Dia dos Pais
--     01/08 → 09/08/2027.
--   • Prioridade (vence a maior): Copa Feminina 800 > Carnaval 500 > Réveillon 400 > Natal 300 > Mães/Pais 200 >
--     reality 150 > Black Friday 100. O reality (meses no ar) perde para o Carnaval quando coincidem.
--   • Áreas: app + portais + institucional (checkout, carrinho, planos e pagamentos seguem sem tema — trava no app).
--   • Cores claro/escuro escolhidas com a validação de contraste do app (5 templates, AA, sem avisos); fundo: padrão leve
--     em imagem (flocos no Natal, confete no Réveillon) ou degradê suave; 4 decorativos, um por canto (os dois principais embaixo: em cima a faixa cobre o canto no celular); animação (flutuar
--     6 px, só sem "reduzir movimento") no Natal, Réveillon, Carnaval e Copa; faixa curta pt-BR/en/es SEM link de compra.
--   • Sem logotipos nem nomes registrados no visual: o tema do reality usa câmera/olho/coração/estrela e a faixa não cita
--     o programa; a Copa usa bola, troféu genérico, bandeirinhas e uma jogadora estilizada.
-- =============================================================================

-- 1) imagens: bucket theme-assets OU caminho interno /temas/… (mesma assinatura: os checks da 0100 passam a usar esta)
create or replace function public.seasonal_theme_asset_ok(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p is not null and char_length(p) <= 300 and (
    p ~ '^https?://[a-z0-9.:-]+/storage/v1/object/public/theme-assets/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$'
    or p ~ '^/temas/[a-z0-9]+(-[a-z0-9]+)*/[a-z0-9]+(-[a-z0-9]+)*\.(png|jpg|webp)$')
$$;
revoke execute on function public.seasonal_theme_asset_ok(text) from public, anon;
grant execute on function public.seasonal_theme_asset_ok(text) to authenticated, service_role;

-- 2) temas criados -----------------------------------------------------------------------------------------------
do $$
declare
  r record;
  v_event uuid;
  tz constant text := 'America/Sao_Paulo';
begin
  for r in
    select * from (values
      -- id, chave, nome, source_key do evento, título, dia do evento, início (date|lead_days), dias antes, início por data, fim (date|event_end), fim por data,
      -- início/fim quando não há evento, prioridade, animação, tokens, fundo, decorativos, faixa
      ('b0102000-0000-4000-8000-000000000001'::uuid, 'natal-2026', 'Natal 2026',
       'gc:calendario-groscove-2026-geral:2026-12-25:natal', 'Natal', date '2026-12-25',
       'lead_days', 10, null::timestamp, 'event_end', null::timestamp, timestamp '2026-12-15 00:00', timestamp '2026-12-26 00:00', 300, true,
       '{"light":{"accent":"#c62a37","bg":"#fbf6f1"},"dark":{"accent":"#f0646e","bg":"#0b110e"}}'::jsonb,
       '{"type":"image","url":"/temas/natal/padrao-flocos.webp","fit":"repeat","intensity":22}'::jsonb,
       '[{"url":"/temas/natal/papai-noel.webp","position":"bottom-right","size":"lg"},{"url":"/temas/natal/arvore.webp","position":"bottom-left","size":"lg"},
         {"url":"/temas/natal/bola.webp","position":"top-right","size":"md"},{"url":"/temas/natal/presente.webp","position":"top-left","size":"sm"}]'::jsonb,
       '{"text":{"pt-BR":"Boas festas da Groscove Ultra","en":"Happy holidays from Groscove Ultra","es":"Felices fiestas de Groscove Ultra"}}'::jsonb),
      ('b0102000-0000-4000-8000-000000000002'::uuid, 'reveillon-2027', 'Réveillon 2026 → 2027',
       'gc:calendario-groscove-2026-geral:2026-12-31:vespera-de-ano-novo', 'Véspera de Ano-Novo', date '2026-12-31',
       'date', 0, timestamp '2026-12-26 00:00', 'date', timestamp '2027-01-02 00:00', timestamp '2026-12-26 00:00', timestamp '2027-01-02 00:00', 400, true,
       '{"light":{"accent":"#24387a","bg":"#f5f6fa"},"dark":{"accent":"#e8c060","bg":"#090d1a"}}'::jsonb,
       '{"type":"image","url":"/temas/reveillon/padrao-confete.webp","fit":"repeat","intensity":30}'::jsonb,
       '[{"url":"/temas/reveillon/fogos.webp","position":"bottom-right","size":"lg"},{"url":"/temas/reveillon/tacas.webp","position":"bottom-left","size":"lg"},
         {"url":"/temas/reveillon/relogio.webp","position":"top-right","size":"md"},{"url":"/temas/reveillon/brilhos.webp","position":"top-left","size":"sm"}]'::jsonb,
       '{"text":{"pt-BR":"Feliz 2027! Que venha um ano de grandes parcerias.","en":"Happy 2027! Here''s to a year of great partnerships.","es":"¡Feliz 2027! Que venga un año de grandes alianzas."}}'::jsonb),
      ('b0102000-0000-4000-8000-000000000003'::uuid, 'black-friday-2026', 'Black Friday 2026',
       'gc:calendario-groscove-2026-geral:2026-11-27:black-friday', 'Black Friday', date '2026-11-27',
       'lead_days', 7, null::timestamp, 'event_end', null::timestamp, timestamp '2026-11-20 00:00', timestamp '2026-11-28 00:00', 100, false,
       '{"light":{"accent":"#c03c0d","bg":"#f6f4f1"},"dark":{"accent":"#ff6a2b","bg":"#050505"}}'::jsonb,
       '{"type":"gradient","from":"#ff5a1f","to":"#161616","angle":160,"intensity":8}'::jsonb,
       '[{"url":"/temas/black-friday/etiqueta.webp","position":"bottom-right","size":"lg"},{"url":"/temas/black-friday/sacola.webp","position":"bottom-left","size":"lg"},
         {"url":"/temas/black-friday/raio.webp","position":"top-right","size":"md"},{"url":"/temas/black-friday/selo.webp","position":"top-left","size":"sm"}]'::jsonb,
       '{"text":{"pt-BR":"Semana de Black Friday: hora de planejar as campanhas.","en":"Black Friday week: time to plan your campaigns.","es":"Semana de Black Friday: hora de planificar las campañas."}}'::jsonb),
      ('b0102000-0000-4000-8000-000000000004'::uuid, 'carnaval-2027', 'Carnaval 2027',
       'gc:calendario-groscove-2027-geral:2027-02-06:carnaval', 'Carnaval', date '2027-02-06',
       'lead_days', 5, null::timestamp, 'event_end', null::timestamp, timestamp '2027-02-01 00:00', timestamp '2027-02-10 00:00', 500, true,
       '{"light":{"accent":"#6e43c9","bg":"#faf6fd"},"dark":{"accent":"#b28cff","bg":"#100b17"}}'::jsonb,
       '{"type":"gradient","from":"#e2357b","to":"#14a89c","angle":135,"intensity":10}'::jsonb,
       '[{"url":"/temas/carnaval/mascara.webp","position":"bottom-right","size":"lg"},{"url":"/temas/carnaval/plumas.webp","position":"bottom-left","size":"lg"},
         {"url":"/temas/carnaval/serpentina.webp","position":"top-right","size":"md"},{"url":"/temas/carnaval/tamborim.webp","position":"top-left","size":"sm"}]'::jsonb,
       '{"text":{"pt-BR":"Bom Carnaval! Aproveite com segurança.","en":"Happy Carnival! Enjoy it safely.","es":"¡Feliz Carnaval! Disfrútalo con seguridad."}}'::jsonb),
      ('b0102000-0000-4000-8000-000000000005'::uuid, 'copa-feminina-2027', 'Copa do Mundo Feminina 2027',
       'gc:calendario-groscove-2027-geral:2027-06-24:copa-do-mundo-feminina-fifa-brasil-2027', 'Copa do Mundo Feminina FIFA Brasil 2027', date '2027-06-24',
       'lead_days', 7, null::timestamp, 'event_end', null::timestamp, timestamp '2027-06-17 00:00', timestamp '2027-07-26 00:00', 800, true,
       '{"light":{"accent":"#0f7f45","bg":"#f4f9f5"},"dark":{"accent":"#ffd23f","bg":"#07120c"}}'::jsonb,
       '{"type":"gradient","from":"#13894a","to":"#ffd23f","angle":160,"intensity":10}'::jsonb,
       '[{"url":"/temas/copa-feminina/trofeu.webp","position":"bottom-right","size":"lg"},{"url":"/temas/copa-feminina/jogadora.webp","position":"bottom-left","size":"lg"},
         {"url":"/temas/copa-feminina/bandeirinhas.webp","position":"top-right","size":"md"},{"url":"/temas/copa-feminina/bola.webp","position":"top-left","size":"sm"}]'::jsonb,
       '{"text":{"pt-BR":"A Copa Feminina é no Brasil — bora torcer!","en":"The Women''s World Cup is in Brazil — let''s cheer!","es":"El Mundial Femenino es en Brasil: ¡a alentar!"}}'::jsonb),
      ('b0102000-0000-4000-8000-000000000006'::uuid, 'reality-2027', 'BBB 27 (temporada de reality)',
       'gc:calendario-groscove-2027-geral:2027-01-11:big-brother-brasil-27', 'Big Brother Brasil 27', date '2027-01-11',
       'lead_days', 0, null::timestamp, 'event_end', null::timestamp, timestamp '2027-01-11 00:00', timestamp '2027-04-21 00:00', 150, false,
       '{"light":{"accent":"#6b4cf0","bg":"#f7f6fe"},"dark":{"accent":"#a08bff","bg":"#0d0b16"}}'::jsonb,
       '{"type":"gradient","from":"#6b4cf0","to":"#ff5a1f","angle":150,"intensity":8}'::jsonb,
       '[{"url":"/temas/reality/camera.webp","position":"bottom-right","size":"lg"},{"url":"/temas/reality/coracao.webp","position":"bottom-left","size":"md"},
         {"url":"/temas/reality/olho.webp","position":"top-right","size":"md"},{"url":"/temas/reality/estrela.webp","position":"top-left","size":"sm"}]'::jsonb,
       '{"text":{"pt-BR":"A temporada de reality está no ar.","en":"Reality season is on.","es":"La temporada de reality está al aire."}}'::jsonb),
      ('b0102000-0000-4000-8000-000000000007'::uuid, 'dia-das-maes-2027', 'Dia das Mães 2027',
       'gc:calendario-groscove-2027-geral:2027-05-09:dia-das-maes', 'Dia das Mães', date '2027-05-09',
       'lead_days', 7, null::timestamp, 'event_end', null::timestamp, timestamp '2027-05-02 00:00', timestamp '2027-05-10 00:00', 200, false,
       '{"light":{"accent":"#b8406a","bg":"#fdf6f8"},"dark":{"accent":"#f08aa8","bg":"#130c0f"}}'::jsonb,
       '{"type":"gradient","from":"#f6b9c9","to":"#efb85c","angle":160,"intensity":14}'::jsonb,
       '[{"url":"/temas/dia-das-maes/buque.webp","position":"bottom-right","size":"lg"},{"url":"/temas/dia-das-maes/flor.webp","position":"bottom-left","size":"lg"},
         {"url":"/temas/dia-das-maes/coracao.webp","position":"top-right","size":"md"},{"url":"/temas/dia-das-maes/ramo.webp","position":"top-left","size":"sm"}]'::jsonb,
       '{"text":{"pt-BR":"Feliz Dia das Mães!","en":"Happy Mother''s Day!","es":"¡Feliz Día de la Madre!"}}'::jsonb),
      ('b0102000-0000-4000-8000-000000000008'::uuid, 'dia-dos-pais-2027', 'Dia dos Pais 2027',
       'gc:calendario-groscove-2027-geral:2027-08-08:dia-dos-pais', 'Dia dos Pais', date '2027-08-08',
       'lead_days', 7, null::timestamp, 'event_end', null::timestamp, timestamp '2027-08-01 00:00', timestamp '2027-08-09 00:00', 200, false,
       '{"light":{"accent":"#2b5682","bg":"#f4f7fa"},"dark":{"accent":"#7fb0e6","bg":"#0a0f15"}}'::jsonb,
       '{"type":"gradient","from":"#3a6ea5","to":"#e3a83b","angle":160,"intensity":10}'::jsonb,
       '[{"url":"/temas/dia-dos-pais/gravata.webp","position":"bottom-right","size":"lg"},{"url":"/temas/dia-dos-pais/caneca.webp","position":"bottom-left","size":"lg"},
         {"url":"/temas/dia-dos-pais/bigode.webp","position":"top-right","size":"md"},{"url":"/temas/dia-dos-pais/oculos.webp","position":"top-left","size":"sm"}]'::jsonb,
       '{"text":{"pt-BR":"Feliz Dia dos Pais!","en":"Happy Father''s Day!","es":"¡Feliz Día del Padre!"}}'::jsonb)
    ) as t(id, chave, name, source_key, title, event_day, start_mode, lead_days, starts_local, end_mode, ends_local, fb_start, fb_end, priority, animations,
           tokens, background, decorations, banner)
  loop
    continue when exists (select 1 from public.seasonal_themes s where s.id = r.id);
    -- evento real: source_key da importação; senão título + dia (evento da plataforma, não cancelado)
    select e.id into v_event from public.calendar_events e
     where e.scope = 'platform' and e.source_key = r.source_key and e.status <> 'cancelled'
     limit 1;
    if v_event is null then
      select e.id into v_event from public.calendar_events e
       where e.scope = 'platform' and e.status <> 'cancelled' and lower(e.title) = lower(r.title)
         and (e.starts_at at time zone tz)::date = r.event_day
       order by e.created_at limit 1;
    end if;
    insert into public.seasonal_themes (id, name, notes, status, event_id, start_mode, lead_days, starts_at, end_mode, ends_at, timezone, priority, areas,
                                        tokens, background, decorations, animations, banner, published_at)
    values (r.id, r.name,
            format('Tema criado pela migração 0102 (chave %s). Ilustrações próprias em /temas/%s. %s', r.chave,
                   split_part((r.decorations -> 0 ->> 'url'), '/', 3),
                   case when v_event is null then 'Evento do Calendário Groscove não encontrado: datas fixas.' else 'Ligado ao evento do Calendário Groscove.' end),
            'published', v_event,
            case when v_event is null then 'date' else r.start_mode end,
            case when v_event is null then 0 else r.lead_days end,
            case when v_event is null then r.fb_start at time zone tz when r.start_mode = 'date' then r.starts_local at time zone tz end,
            case when v_event is null then 'date' else r.end_mode end,
            case when v_event is null then r.fb_end at time zone tz when r.end_mode = 'date' then r.ends_local at time zone tz end,
            tz, r.priority, array['app', 'portals', 'institutional']::text[],
            r.tokens, r.background, r.decorations, r.animations, r.banner, now())
    on conflict (id) do nothing;
    v_event := null;
  end loop;
end $$;
