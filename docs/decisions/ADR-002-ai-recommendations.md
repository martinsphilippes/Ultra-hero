# ADR-002 — Motor de recomendações (OpenAI vs Google Gemini)

- **Status:** Proposta técnica (não é decisão de negócio aprovada)
- **Data:** 2026-10-20
- **Contexto:** Ultra Hero (PWA mobile-first, público Brasil, pt-BR/en/es)
- **Verificado em:** 2026-10-20 (USD, fontes ao final)

## 1. Contexto e escopo

Queremos um motor de recomendação **restrito ao catálogo**: o app monta uma lista de candidatos permitidos (ids opacos + tags, pilares, dificuldade, popularidade) e um perfil mínimo do usuário (interesses declarados + interações recentes, só ids e tags). O modelo devolve um **subconjunto ranqueado** com uma justificativa de uma linha por item, no idioma do usuário, em **JSON estrito**.

Fora de escopo: chatbot, conversa livre e qualquer prescrição individual de saúde, dieta ou treino. O modelo só reordena e explica itens já existentes e permitidos.

**Sem chaves de API o app funciona igual**, com fallback determinístico (seção 6). O LLM é opcional e desligável.

## 2. Requisitos

- Saída JSON validada por schema (UI consome direto).
- Modelo barato (~3k entrada / 400 saída, 6 recálculos/usuário/mês).
- Latência aceitável em job assíncrono (recomendações pré-calculadas).
- Sem uso dos dados para treino (LGPD), disponível no Brasil.
- Troca de fornecedor fácil: mesmo harness para os dois.

## 3. Opções

### 3.1 OpenAI (Responses API)

- **Modelos atuais:** linha GPT-6 (`gpt-6-luna` barato, `gpt-6.1-sol` intermediário, `gpt-6-astra` topo); GPT-5.x ainda listado como legado.
- **Preço (por 1M tokens, standard):** `gpt-6-luna` US$ 0,10 entrada / 0,50 saída (cache 0,01); `gpt-6.1-sol` 2,00 / 10,00; `gpt-5-nano` 0,05 / 0,40 (legado, sem garantia de longevidade).
- **JSON estruturado:** `text.format = { type: "json_schema", strict: true }`; suporta subconjunto do JSON Schema (`additionalProperties: false`, todos os campos em `required`). Primeira chamada com schema novo tem latência extra; pode vir `refusal` fora do schema; corte por `max_output_tokens` gera JSON incompleto.
- **Rate limits:** tiers por crédito comprado (Build ≥ US$ 5 → 5.000 RPM; Launch ≥ US$ 100 → 10.000 RPM). Folga para todos os cenários.
- **Dados:** não treina com dados da API por padrão; logs de abuso retidos até 30 dias; ZDR e residência de dados só sob aprovação comercial (sem região Brasil; processamento regional só EUA/Europa/EAU).
- **Brasil:** listado como país suportado.
- **Latência:** sem benchmark oficial; trackers de terceiros divergem muito. Medir no nosso protocolo.

### 3.2 Google Gemini (Gemini API / AI Studio)

- **Modelos atuais:** `gemini-3.8-flash` (recomendado geral), `gemini-3.5-flash-lite` e `gemini-3.1-flash-lite` (baratos). Os 2.5 (`gemini-2.5-flash-lite` a US$ 0,10/0,40) só continuam para projetos que já os usavam — **não contar com eles**.
- **Preço (por 1M tokens, pago):** `gemini-3.1-flash-lite` 0,25 / 1,50; `gemini-3.5-flash-lite` 0,30 / 2,50; `gemini-3.8-flash` 0,75 / 3,75 (anunciado aumento para 1,50 / 7,50 em 2027). Tier gratuito existe, mas ver "Dados".
- **JSON estruturado:** `response_format` com `mime_type: application/json` + `schema`; subconjunto do JSON Schema (`enum`, `required`, `additionalProperties`, `minItems`/`maxItems`). Docs recomendam validar valores mesmo assim; schemas muito grandes são rejeitados.
- **Rate limits:** Tier 1 (billing ativo, teto US$ 10/10 min); Tier 2 (US$ 100 pagos, US$ 50/10 min). RPM por modelo só no painel do projeto.
- **Dados:** **tier gratuito usa prompts para treinar e permite revisão humana** → proibido para o app. Tier pago não treina e só loga por tempo limitado para abuso/segurança; dados podem transitar por qualquer país.
- **Brasil:** listado como país disponível.
- **Latência:** terceiros indicam throughput alto no Flash-Lite, mas TTFT de vários segundos (inclui "thinking"). Medir no nosso protocolo.

## 4. Custo estimado

Premissas: 6 recalculações/usuário/mês, ~3.000 tokens de entrada + 400 de saída por chamada, sem cache, sem batch. Chamadas/mês: POC 3.000; crescimento 60.000; escala 600.000. Custo por chamada = (3.000 × entrada + 400 × saída) / 1M.

| Modelo                               | US$/chamada | POC (500 usuários) | Crescimento (10k) | Escala (100k) |
| ------------------------------------ | ----------- | ------------------ | ----------------- | ------------- |
| OpenAI `gpt-6-luna` (barato)         | 0,00050     | US$ 1,50           | US$ 30            | US$ 300       |
| OpenAI `gpt-6.1-sol` (qualidade)     | 0,01000     | US$ 30,00          | US$ 600           | US$ 6.000     |
| Gemini `gemini-3.1-flash-lite` (barato) | 0,00135  | US$ 4,05           | US$ 81            | US$ 810       |
| Gemini `gemini-3.8-flash` (qualidade) | 0,00375    | US$ 11,25          | US$ 225           | US$ 2.250     |

Cache de prompt (instruções fixas) reduz a parcela de entrada em até ~90% nos dois; batch dá ~50% extra. Em qualquer cenário o custo de IA é marginal frente a vídeo e infraestrutura.

## 5. Protocolo de avaliação (roda quando houver chaves)

Harness único em `scripts/eval-recommendations.ts` (a criar), mesmo prompt e schema para ambos:

1. **10 cenários fixos** (fixtures versionadas): usuário novo sem interações; só hábitos; só treino iniciante; nutrição + gastronomia; interesse em um pilar e histórico em outro; usuário avançado; catálogo com itens bloqueados por plano; candidatos com tags conflitantes; usuário `en`; usuário `es`.
2. **Cada cenário × 5 execuções × modelo**, temperatura baixa, `max_output_tokens` fixo.
3. **Métricas por modelo:** latência p50/p95 (ms, fim a fim); taxa de JSON válido (parse + Zod); **taxa de conformidade com o catálogo** = ids recomendados que existem **e** estão permitidos ÷ ids recomendados; idioma correto da justificativa; custo por chamada a partir dos tokens reportados.
4. **Critério de aceite:** JSON válido ≥ 99%; conformidade ≥ 99,5% (o que sobrar é descartado pela validação, seção 6); p95 ≤ 8 s (job assíncrono); idioma correto ≥ 98%.
5. Resultado preenche a tabela abaixo; só então a proposta vira decisão.

| Modelo | p50 (ms) | p95 (ms) | JSON válido % | Conformidade % | Idioma OK % | Tokens in/out médios | US$/chamada |
| ------ | -------- | -------- | ------------- | -------------- | ----------- | -------------------- | ----------- |
| gpt-6-luna |      |          |               |                |             |                      |             |
| gpt-6.1-sol |     |          |               |                |             |                      |             |
| gemini-3.1-flash-lite | |      |               |                |             |                      |             |
| gemini-3.8-flash |  |          |               |                |             |                      |             |
| fallback determinístico | | |   100           | 100            | 100         | 0                    | 0           |

## 6. Fallback determinístico e guardrails

**Fallback (padrão sem chaves, e sempre que o LLM falhar):** pontuação por regras — sobreposição de tags com interesses, pilares pouco explorados, dificuldade compatível com o nível, popularidade e novidade; justificativas vêm de templates i18n ("porque você segue hábitos", etc.). A resposta é marcada `source: "fallback"` e isso aparece na UI (selo discreto "recomendações por regras") e nos eventos de analytics (`recommendation_source`). Sem chaves ou com kill switch ligado, **nenhuma** chamada externa é feita.

**Guardrails (valem para qualquer fornecedor):**

- **Kill switch:** flag `AI_RECOMMENDATIONS_ENABLED` (env + admin); desligado por padrão.
- **Rate limit por usuário:** no máximo 1 recálculo a cada 24 h e 6 por mês; recálculo é job de servidor, nunca disparado direto pelo cliente.
- **Máximo de candidatos:** 60 itens por chamada; catálogo é pré-filtrado por plano/idioma/visibilidade antes de montar o prompt.
- **Validação da saída:** schema Zod estrito; ids fora da lista de candidatos são descartados; justificativa limitada a 140 caracteres e sem termos de prescrição (lista de bloqueio: "você deve", "dose", "calorias por dia"...); menos de 3 itens válidos → cai no fallback.
- **Sem PII:** o prompt leva só id opaco do usuário (hash), tags, pilares, nível e ids de interações. Nada de nome, e-mail, peso, idade, condições de saúde ou texto livre.
- **Disclaimer:** toda lista exibe "Sugestões de conteúdo, não orientação de saúde".
- **Só tier pago** (o gratuito do Gemini treina com dados). Timeout 10 s, 1 retry, depois fallback.
- **Observabilidade:** logar modelo, tokens, latência, descartes e `source`.

## 7. Proposta técnica

1. Implementar a interface `RecommendationProvider` com três implementações: `fallback` (obrigatória, única no POC), `openai`, `gemini`.
2. Começar o eval com **`gpt-6-luna`** e **`gemini-3.1-flash-lite`**; subir para `gemini-3.8-flash` ou `gpt-6.1-sol` só se a conformidade ou a qualidade das justificativas em pt-BR ficar abaixo do aceite.
3. Preferência inicial, **a confirmar pelo eval**: OpenAI `gpt-6-luna`, por custo 2–3× menor, JSON estrito com `strict: true` e tiers de rate limit mais simples. Gemini fica como segundo provedor pronto (mesmo harness) para negociação e redundância.
4. Nenhum fornecedor oferece residência de dados no Brasil; como só enviamos ids e tags o risco é baixo, mas o jurídico valida antes de produção.

Recomendação de engenharia: fornecedor, orçamento e ativação em produção dependem de aprovação de negócio e revisão jurídica (LGPD).

## Fontes (verificadas em 2026-10-20)

- OpenAI preços: https://developers.openai.com/api/docs/pricing
- OpenAI structured outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI rate limits/tiers: https://developers.openai.com/api/docs/guides/rate-limits
- OpenAI uso de dados: https://developers.openai.com/api/docs/guides/your-data
- OpenAI países: https://developers.openai.com/api/docs/supported-countries
- Gemini preços: https://ai.google.dev/gemini-api/docs/pricing
- Gemini modelos: https://ai.google.dev/gemini-api/docs/models
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Gemini rate limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Gemini termos (dados): https://ai.google.dev/gemini-api/terms
- Gemini regiões: https://ai.google.dev/gemini-api/docs/available-regions
- Latência (terceiros): https://artificialanalysis.ai/models/gemini-3-5-flash-lite/providers
