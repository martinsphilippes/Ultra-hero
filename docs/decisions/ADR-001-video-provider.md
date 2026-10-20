# ADR-001 — Provedor de vídeo (Cloudflare Stream vs Mux vs Embeds)

- **Status:** Proposta técnica (não é decisão de negócio aprovada)
- **Data:** 2026-10-20
- **Contexto:** Ultra Hero (PWA mobile-first, público Brasil, pt-BR/en/es)
- **Preços verificados em:** 2026-10-20 (todos em USD, fontes ao final)

## 1. Contexto e requisitos

O app exibe vídeos curtos (treinos, receitas, hábitos, 1–5 min) e longos (aulas de programas, 20–60 min). Requisitos:

| Requisito                              | Por quê                                           |
| -------------------------------------- | ------------------------------------------------- |
| HLS no Safari (iOS) e Chrome (Android) | PWA sem app nativo; iOS só toca HLS nativo        |
| Legendas pt/en/es                      | Acessibilidade e i18n                             |
| URLs assinadas / "DRM-lite"            | Conteúdo premium atrás de assinatura simulada     |
| Upload do portal do criador            | Personalidades fictícias publicam conteúdo        |
| Webhooks                               | Marcar vídeo como `ready` no Supabase sem polling |
| Analytics                              | Progresso do usuário e métricas de retenção       |
| Custo previsível                       | POC sem receita real                              |

Como o commerce do POC é simulado, o custo de vídeo precisa ser perto de zero.

## 2. Opções

### 2.1 Embeds (YouTube/Vimeo) — caminho de custo zero (POC)

- **Custo:** zero; sem conta paga.
- **Como:** iframe do player oficial (`youtube-nocookie.com` ou `player.vimeo.com`) com `mediaRef` = ID do vídeo.
- **Prós:** imediato, CDN global, legendas automáticas do YouTube, funciona em qualquer navegador.
- **Contras:** sem URL assinada ("não listado" é só obscuridade), sem analytics por usuário, branding de terceiro, cookies/consentimento, privacidade por domínio no Vimeo exige plano pago.
- **Veredito:** suficiente para o POC; inadequado para premium real.

### 2.2 Cloudflare Stream

- **Preço:** US$ 5 / 1.000 min **armazenados** (pré-pago, em blocos de US$ 5) e US$ 1 / 1.000 min **entregues** (pós-pago). Ingestão e encoding gratuitos; sem egress separado. **Não há tier gratuito**; precisa de cartão na conta. Entrega é contada por segmento HTTP (buffer conta, cache de navegador não).
- **Player:** iframe oficial, `@cloudflare/stream-react` ou manifest HLS/DASH para player próprio (hls.js no Chrome, nativo no Safari).
- **Legendas:** upload WebVTT por idioma (`PUT /captions/{lang}`) ou geração por IA — inclui **pt, en, es** — sem custo documentado.
- **Proteção:** signed URLs/tokens (JWT assinado com chave da conta, com `exp`, `nbf`, `accessRules` por IP/país). Vídeo marcado `requireSignedURLs`. **Sem DRM (Widevine/FairPlay) documentado** na data da verificação; é "DRM-lite" via token.
- **Upload:** Direct Creator Upload (URL de uso único, expira em 30 min por padrão; POST até 200 MB, tus acima; limite 30 GB). `maxDurationSeconds` reserva armazenamento.
- **Webhooks:** uma URL de notificação por conta com segredo para verificar assinatura; evento de `ready`/erro.
- **Analytics:** GraphQL Analytics API (minutos, visualizações por vídeo/país); sem QoE por sessão.
- **Limitações:** H.264 até 1080p (sem 4K), analytics rasa, um webhook por conta, armazenamento comprado antes do upload.
- **Brasil:** PoPs em várias cidades brasileiras.
- **Lock-in:** médio. Download MP4 disponível; IDs e tokens são proprietários, mas o fluxo é HLS padrão.

### 2.3 Mux

- **Preço (on-demand, 1080p, 1º tier):** encoding **basic gratuito**; armazenamento US$ 0,003 / min / mês (720p: 0,0024); entrega US$ 0,001 / min (720p: 0,0008) **após 100.000 min gratuitos/mês**; crédito de US$ 20/mês no pay-as-you-go; US$ 500 para startups elegíveis. Cold storage automático (−40% após 30 dias sem play, −60% após 90). Cobrança por segundo, sem arredondar.
- **Player:** `@mux/mux-player` (web component/React) com Mux Data embutido; HLS via `stream.mux.com/{playbackId}.m3u8`; thumbnails/storyboards automáticos.
- **Legendas:** auto-captions on-demand gratuitas (configuradas no upload); upload de VTT/SRT por idioma.
- **Proteção:** playback policy `public` ou `signed` (JWT RS256 com chave de assinatura). **DRM GA** (Widevine, PlayReady, FairPlay): add-on de US$ 100/mês + US$ 0,003 por licença (~1 por view). FairPlay exige credencial Apple.
- **Upload:** Direct Upload (URL temporária, resumível), `new_asset_settings` com política e captions.
- **Webhooks:** múltiplos endpoints, HMAC, retry com backoff, dezenas de eventos (`video.asset.ready`, `video.upload.*`).
- **Analytics:** Mux Data incluída (startup, rebuffer, erros, por view/usuário).
- **Limitações:** o grátis de 100k min pode mudar; muitos meters (resolução, basic/plus/premium, cold storage) dificultam previsão; tiers de volume não publicados.
- **Brasil:** CDNs multi-vendor; sem dado público de PoP em BR.
- **Lock-in:** médio. Master/MP4 exportável; playback IDs, JWT e Mux Data são proprietários.

## 3. Simulação de custos (mensal, USD, 1080p, sem DRM)

Premissas: vídeo médio 5 min; "min entregues" = usuários × 10 min; CF armazenamento em blocos de 1.000 min; Mux com 100k min grátis e crédito de US$ 20; tiers de volume do Mux não publicados (valores acima de 500k min podem ser menores).

| Cenário                               | Min armazenados | Min entregues | Embeds | Cloudflare Stream                   | Mux                                                                         |
| ------------------------------------- | --------------- | ------------- | ------ | ----------------------------------- | --------------------------------------------------------------------------- |
| **POC** (40 vídeos, 500 usuários)     | 200             | 5.000         | 0      | 5 (storage) + 5 (delivery) = **10** | 0,60 storage + 0 delivery − crédito = **0**                                 |
| **Growth** (500 vídeos, 10k usuários) | 2.500           | 100.000       | 0      | 15 + 100 = **115**                  | 7,50 + 0 (no limite do grátis) − crédito = **0** (~**8** se passar de 100k) |
| **Scale** (2k vídeos, 100k usuários)  | 10.000          | 1.000.000     | 0      | 50 + 1.000 = **1.050**              | 30 + 900 − 20 ≈ **910** (menos com cold storage e volume)                   |

Adicional **Mux DRM** (100 + 0,003 × views, 2 views/usuário): POC ≈ 103; Growth ≈ 160; Scale ≈ 700. Cloudflare não cobra extra por signed URLs, mas não oferece DRM.

Observações: Cloudflare sobe linearmente com entrega; Mux é quase gratuito até 100k min/mês (cobre POC e Growth); em Scale os dois convergem e a diferença vira features e negociação.

## 4. Comparativo resumido

| Critério                 | Embeds       | Cloudflare Stream | Mux               |
| ------------------------ | ------------ | ----------------- | ----------------- |
| Custo POC                | 0            | ~10/mês           | ~0/mês            |
| Tier gratuito            | sim          | não               | 100k min + US$ 20 |
| HLS Safari/Chrome        | via iframe   | sim               | sim               |
| Legendas pt/en/es        | YouTube auto | VTT + IA          | VTT + auto        |
| URL assinada             | não          | sim               | sim               |
| DRM                      | não          | não documentado   | sim (add-on)      |
| Upload do criador        | não          | sim (tus)         | sim (resumível)   |
| Webhooks                 | não          | 1 URL/conta       | múltiplos, HMAC   |
| Analytics                | não          | GraphQL básico    | Mux Data (QoE)    |
| Previsibilidade de preço | alta         | alta              | média             |
| Lock-in                  | baixo        | médio             | médio             |

## 5. Proposta técnica (não é aprovação de fornecedor)

1. **POC (agora):** `EmbedProvider` (YouTube/Vimeo) atrás da interface `VideoProvider` (ver `video-provider-interface.md`). Custo zero, nenhuma chave necessária.
2. **Prefira Cloudflare Stream quando:** o orçamento precisa ser linear e previsível; já há Workers/R2/DNS na Cloudflare; "DRM-lite" por URL assinada é suficiente; o time quer um fornecedor só.
3. **Prefira Mux quando:** o uso mensal ficar abaixo de 100k min (custo ~zero); analytics por usuário for requisito de produto (retenção, progresso); DRM real for exigido para conteúdo premium; legendas automáticas em escala.
4. **Condições para revisitar:** receita real ativa, >50k min entregues/mês, exigência contratual de DRM, ou necessidade de live.
5. **Mitigação de lock-in:** `mediaRef` opaco no banco, master original guardado (Supabase Storage/R2) e os dois adapters como stubs desde já.

## 6. Fontes (verificadas em 2026-10-20)

- Cloudflare Stream pricing: https://developers.cloudflare.com/stream/pricing/
- Cloudflare plans (linhas Stream): https://www.cloudflare.com/plans/
- Cloudflare Stream docs (upload, player, limites): https://developers.cloudflare.com/stream/
- Cloudflare Stream captions: https://developers.cloudflare.com/stream/edit-videos/adding-captions/
- Mux pricing overview: https://www.mux.com/docs/pricing/overview
- Mux pricing (créditos, grátis): https://www.mux.com/pricing
- Mux DRM GA (US$ 100/mês + 0,003/licença): https://www.mux.com/blog/protect-your-video-content-with-drm-now-ga
- Mux DRM guide: https://docs.mux.com/guides/protect-videos-with-drm
