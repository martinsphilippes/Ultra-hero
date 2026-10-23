# RASCUNHO — Consentimento e política para dados de relógio (para revisão jurídica)

> **Não publicado.** Este arquivo é o rascunho separado pedido para a F3/F4 do Hoje com relógio real
> (`docs/decisions/hoje-relogio.md`). A política publicada (`messages/*/legal.json`, `/legal/privacy`)
> e `docs/privacy-and-retention.md` **não foram alterados**: com `WEARABLES_REAL_ENABLED` desligada
> (padrão) o Ultra Hero não coleta nenhum dado de relógio, anel ou pulseira.
>
> Data: 23/10/2026 · Versão do texto no banco: `2026-10-draft-1` (migração `0038_health_foundation.sql`,
> tabela `health.consent_texts`, imutável, com hash SHA-256 calculado no servidor).
> **Antes de ligar:** o jurídico e o encarregado revisam, a versão final entra por uma nova migração
> (`insert into health.consent_texts … version = '2026-xx-v1'` nos 3 idiomas) e é publicada com
> `select health.set_consent_version('2026-xx-v1')`. A versão de rascunho não deve ser aceita por
> ninguém fora da equipe.

## 1. O que o responsável já decidiu (Q1–Q20)

| Tema | Decisão | Onde está no código |
|---|---|---|
| Q1 Tratar dado de saúde | Sim, **depois** do jurídico e do encarregado | Chave `WEARABLES_REAL_ENABLED` desligada por padrão |
| Q3 Marcas | Só Garmin, Oura, WHOOP e Polar (web, sem app nativo) | `src/lib/health/providers.ts`; Apple Watch, Galaxy e Pixel seguem "Em breve" |
| Q4 Agregador | Não: integração direta | — |
| Q6 Para quem | Todos | sem checagem de plano |
| Q8 O que a marca não libera | Citar em "Sobre seus dados" | `/profile/today/about` (`wearables.vendorOnly.*`, inclui Polar) |
| Q9 Índices nossos | Aprovados, sempre rotulados | "Calculado pelo Ultra Hero · pode diferir do número do seu relógio" |
| Q10 Sequência | Só conteúdos por ora | relógio não entra em `compute_streak` |
| Q11 Prazos | 13 meses diário, 30 dias intradiário, 30 dias após revogação na marca | `public.health_run_retention()` |
| Q13 Sob demanda | Fora; treino iniciado no relógio conta | adaptadores e catálogo |
| Q14 Passos | Só do relógio | adaptadores (não há fonte de celular nas 4 marcas) |
| Q15 Payload bruto Garmin | 30 dias | `health_run_retention()` (demais marcas: 7 dias) |
| Q16 Contas demo | Desligadas no projeto com dado real; no código, demo nunca conecta | servidor + banco (`demo_account_cannot_connect`) |
| Q17 Projetos | Produção nova + um de testes | roteiro de ligar |
| Q18 Custos | **Ainda não aprovado** | bloqueia ligar |
| Q19 Encarregado | Pessoa da empresa (nome a confirmar) | placeholder no texto |
| Q20 Mudança material | 30 dias sem novo aceite → apaga | `health.set_consent_version()` + retenção |
| Q7 Idade | **Outra regra — A DEFINIR** | `health.config.min_age` (padrão 18) e `min_age_rule_pending = true` |

## 2. Texto do consentimento (rascunho `2026-10-draft-1`)

O texto abaixo é **idêntico** ao arquivado no banco (pt-BR; en e es na migração). A tela mostra este
texto, as categorias para marcar (nenhuma pré-marcada, salvo as que a pessoa já autorizou para outra
marca), a autodeclaração de idade e o botão "Concordo e quero conectar". O aceite exige login nos
últimos 5 minutos.

> Consentimento para os dados do seu relógio (rascunho 2026-10-draft-1, em revisão jurídica)
>
> Ao conectar um relógio, anel ou pulseira (Garmin, Oura, WHOOP ou Polar), você autoriza o Ultra Hero a receber e guardar dados de saúde medidos por esse aparelho. São dados pessoais sensíveis (LGPD, art. 5º, II), tratados com o seu consentimento específico e destacado (art. 11, I), só nas categorias que você marcar: índice do dia, sono, coração, atividade, treinos, respiração e oxigenação, temperatura e estresse.
>
> O que lemos: só o que o aparelho mede sozinho, de forma automática ou num treino iniciado nele. Nunca lemos o que é digitado (água, alimentação, peso, humor, ciclo, esforço que você informa), funções médicas reguladas (ECG, ritmo irregular, apneia, pressão) nem rota de GPS.
>
> Para quê: só para mostrar a você o Hoje, os detalhes e as tendências. Não usamos para anúncios, venda ou recomendação de produtos, estatísticas de uso, inteligência artificial externa, heróis ou fornecedores, e não compartilhamos com ninguém.
>
> Por quanto tempo: dados diários por até 13 meses; o que a marca nos envia em formato bruto, por até 7 dias (Garmin: 30 dias, para corrigir erros). Ao desconectar, retirar uma categoria ou retirar este consentimento, apagamos na hora. Se você desautorizar o Ultra Hero no app da marca e não reconectar, apagamos em 30 dias. Cópias de segurança somem em até 7 dias.
>
> Quem trata: o Ultra Hero (controlador) e os operadores Supabase Inc. (banco de dados, região de São Paulo) e Vercel Inc. (servidores), empresas estrangeiras que podem acessar dados fora do Brasil para suporte e operação.
>
> Seus direitos: ver, corrigir, exportar e apagar seus dados e retirar este consentimento a qualquer momento, de graça, em Perfil › Relógios e anéis. Retirar o consentimento desconecta todos os aparelhos e apaga os dados. A retirada nunca é bloqueada.
>
> Idade: você declara ter a idade mínima indicada nesta tela.
>
> É bem-estar, não diagnóstico: não substitui avaliação médica.
>
> Encarregado pelo tratamento de dados: [nome e contato a publicar antes da abertura].

**Pontos para o jurídico decidir:**
1. **Exportar** ("exportar seus dados"): a exportação self-service (RF-10) ainda não foi construída nesta entrega; até lá, o direito é atendido pelo encarregado. Ajustar o texto ou construir antes de ligar.
2. **Idade (Q7):** a regra está pendente; o texto fala em "idade mínima indicada nesta tela" e o banco guarda, em cada aceite, a idade mínima vigente. ECA Digital (Lei 15.211/2025): confirmar se autodeclaração basta.
3. **Backups em 7 dias:** só vale com Supabase **Pro** (backups diários de 7 dias). No Free não há backup automático.
4. **Prova após exclusão:** guardamos a prova do consentimento por **5 anos após a revogação**, sem o id da pessoa (só `subject_ref` = HMAC do id com segredo do servidor). Confirmar o prazo.
5. **Transferência internacional (art. 33):** Vercel e Supabase como operadores estrangeiros; verificar se os DPAs adotam as cláusulas-padrão da ANPD (Res. CD/ANPD 19/2024).

## 3. Item proposto para a Política de Privacidade (não publicado)

**Dados do seu relógio, anel ou pulseira (opcional)**

- **O que coletamos:** só se você conectar Garmin, Oura, WHOOP ou Polar e autorizar, por categoria: índice do dia da marca (Body Battery, Readiness, Recovery, Nightly Recharge), sono e estágios, frequência cardíaca de repouso e VFC, passos, distância, calorias ativas, andares, minutos de intensidade, treinos iniciados ou detectados pelo aparelho (sem rota GPS), respiração e SpO₂ do sono, temperatura da pele do sono e estresse. Nada digitado (água, comida, peso, humor, ciclo, esforço informado), nenhuma função médica regulada.
- **Base legal:** consentimento específico e destacado (LGPD art. 11, I), por categoria, com texto versionado guardado como prova.
- **Finalidade:** mostrar a você o Hoje, os detalhes e as tendências. Proibido: anúncios, recomendação de produtos, analytics, IA externa, heróis, fornecedores.
- **Proteção:** dados num schema separado do banco, fora da API pública; nenhuma rotina do sistema além da ingestão tem acesso; tokens das marcas cifrados (AES-256-GCM) com chave fora do banco.
- **Retenção:** 13 meses (diário); 7 dias para o dado bruto (Garmin: 30); imediato ao desconectar, retirar categoria, retirar consentimento ou excluir a conta; 30 dias após desautorizar na marca ou após mudança material da política sem novo aceite; backups em até 7 dias.
- **Operadores:** Supabase Inc. e Vercel Inc. (estrangeiros); as marcas (Garmin, Oura, WHOOP, Polar) recebem só o pedido de revogação do acesso quando você desconecta.
- **Seus direitos:** Perfil › Relógios e anéis (desconectar e apagar, retirar categorias, retirar consentimento); demais pedidos ao encarregado.

## 4. Tabela de retenção proposta (para `docs/privacy-and-retention.md` quando ligar)

| Conjunto | Prazo | Mecanismo |
|---|---|---|
| `health.daily_metrics`, `sleep_sessions`, `workouts` | 13 meses | `health_run_retention()` no cron diário |
| `health.ingest_events.payload` | 7 dias (Garmin 30) | idem |
| `health.ingest_events` (metadados) | 30 dias | idem |
| `health.pending_revocations` | até sucesso ou 7 dias | `/api/cron/wearables` + retenção |
| `health.audit` | 365 dias | retenção |
| `health.consents` | enquanto a conta existir + 5 anos após a revogação (sem `user_id` após a exclusão) | retenção |
| Conexão desautorizada na marca | 30 dias | retenção |
| Mudança material sem novo aceite | 30 dias | retenção |
| Conexão sem dado | 12 meses | retenção |
| Desconectar / reduzir / retirar / excluir conta | imediato | RPC na mesma transação; gatilho em `auth.users` |

## 5. Itens que o responsável precisa providenciar antes de ligar

Ver o "Roteiro de ligar" em `docs/decisions/hoje-relogio.md` (seção "Estado da implementação").
