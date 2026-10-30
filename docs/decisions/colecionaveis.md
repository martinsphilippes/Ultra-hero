# Decisão: Colecionáveis (lances ao vivo de itens assinados) e Minhas compras

Status: **implementado** (30/10/2026; revisado no mesmo dia: **sem pagamento online**). Migração
`0057_collectibles_auctions.sql`, cenário S66 em
`supabase/tests/rls_scenarios.sql`, regras puras em `src/lib/collectibles/rules.ts` (testes em
`tests/unit/collectibles-rules.test.ts`), leituras em `src/lib/collectibles/queries.ts`, componentes em
`src/components/collectibles/`, E2E `tests/e2e/collectibles.spec.ts`.

## Nome e lugar

- Na interface o recurso se chama **Colecionáveis** (nunca "leilão" em botão ou menu). Dentro da página
  aparecem "lance" e "arrematar".
- **Aba Comprar**, topo: seletor **Loja | Colecionáveis** (`/shop` e `/shop/colecionaveis`). Com algum item
  ao vivo, "Colecionáveis" ganha o selo **AO VIVO** pulsando. Sem a 0057 no banco o seletor some.
- **Minhas compras** (`/shop/compras`, dentro de Comprar, a aba fica marcada): **Pedidos** (a lista que
  morava em `/orders`, que agora redireciona para cá; o detalhe continua em `/orders/[id]`) e **Lances e
  arremates** (vencendo, superado, encerrado, cancelado; arrematado aparece como "Arrematado · R$ X", sem
  link de pedido nem de pagamento).
- Página do herói: cartão pequeno quando ele tem item ao vivo ou agendado. Social (`/inicio`): destaque
  "Ao vivo" no topo quando há item ao vivo. Os dois somem sem item ou sem a 0057.
- Admin: `/admin/collectibles` (lista com fase, preço, lances e visualizações), novo, detalhe com
  lançar agora / agendar, cancelar com justificativa, lances chegando ao vivo, histórico de ações e edição.
  Item encerrado com vencedor: painel **Vencedor** com nome, e-mail (só admin, pela RPC `admin_get_user`),
  valor final e o andamento do contato (**A contatar → Contatado → Entregue**).

## Sem pagamento online

Decisão do responsável: "Não terá pagamento online, é só uma dinâmica." Não há checkout, destino, pedido nem
cobrança. Ao encerrar:

- **Vencedor**: estado de comemoração "**Você arrematou!**" com o valor final e "Nossa equipe vai entrar em
  contato para combinar a entrega."
- **Demais**: veem o valor final (e o rótulo mascarado de quem arrematou).
- **Equipe**: no detalhe do admin, vê nome e e-mail do vencedor e marca o contato com
  `admin_collectible_set_contact(id, 'pending' | 'contacted' | 'delivered')` (security definer, só admin, sem
  execute para anon; cada troca grava `collectible.contact` em `admin_audit`; repetir a mesma situação não
  grava nada). Item sem lances não tem contato (`no_winner`).

## Regras (no banco, `place_bid(auction_id, increment_cents)`)

- Só `authenticated` executa (anon não: a lista do S14 segue com **17** funções security definer).
- Trava a linha do item (`FOR UPDATE`); exige fase **ao vivo** e `now() < ends_at`.
- O incremento tem de ser **um dos botões** configurados pelo admin (1 a 4 valores; padrão R$ 10/50/100).
- **Novo valor = lance atual + incremento.** O primeiro lance é **preço inicial + incremento**: a regra é a
  mesma para todos os toques (os botões sempre somam), e o preço inicial funciona como lance de abertura.
- Quem já está vencendo **não cobre o próprio lance** (`already_winning`).
- Limite simples: **1 lance a cada 2 s** por pessoa e item (`rate_limited`).
- **Anti-sniping** (aprovado pelo responsável): lance com menos de 2 min para o fim leva o fim para
  `now() + 2 min` (`extensions_count` conta as extensões).
- Não dão lance: conta suspensa (`auth.users.banned_until` no futuro), admin e o próprio herói do item.
- **Encerramento por tempo**, sem rotina obrigatória: a fase é calculada na leitura
  (`collectible_phase`). Quem está logado e abre um item vencido grava o resultado
  (`collectible_finalize`, idempotente); a rotina diária `/api/cron/collectibles` (`collectible_finalize_due`,
  só service role) encerra o resto. Resultado: vencedor (ou "sem lances"), valor final e contato
  "a contatar" (`contact_status = 'pending'`; sem vencedor, `'none'`).
- Admin escreve só por RPC (`admin_collectible_save`, `admin_collectible_launch`, `admin_collectible_cancel`,
  `admin_collectible_set_contact`),
  todas com `admin_audit`. Antes de começar tudo é editável; depois, só textos e fotos (preço, botões e
  duração travados). Cancelar exige justificativa; encerrado não volta.

## Dados e privacidade

| Tabela | Quem lê | Conteúdo |
|---|---|---|
| `collectibles` | todos (rascunho só admin) | item + estado público do lance (preço, fim, nº de lances, lance vencedor, rótulo mascarado do vencedor). Sem id de usuário. |
| `collectible_bids` | todos (do item público) | valor, hora, rótulo mascarado ("Ma***a"). Sem id de usuário. |
| `collectible_bid_owners` | cada um os seus; admin | dono de cada lance. A tela marca "Você" comparando os ids dos lances. |
| `collectible_results` | vencedor; admin | vencedor, lance vencedor, valor final, situação do contato (`none`, `pending`, `contacted`, `delivered`) e quando mudou. Sem pedido, sem cobrança. |

Nenhuma tabela da 0057 tem chave primária com FK para duas tabelas (não cria caminho muitos-para-muitos na
API, que deixaria embeds como `collectibles → creator_profiles` ambíguos, PGRST201); o S66 confere.

O rótulo mascarado é gravado no lance (primeira palavra do nome: 2 letras + `***` + última letra; nome curto
vira 1 letra + `***`; sem nome, a tela mostra "Participante"). Ninguém recebe id ou nome de outra pessoa.
Indicadores (sem dado pessoal): visualizações = eventos `collectible.view` no analytics; lances = contador do item.

## Tempo real

- **Supabase Realtime** (`postgres_changes`): INSERT em `collectible_bids` e UPDATE em `collectibles`, filtrados
  pelo item. Só essas duas tabelas entram na publicação `supabase_realtime` (a migração as adiciona se a
  publicação existir). A RLS vale também para o Realtime; como as duas não têm id de usuário, não há o que vazar.
  A 0061 acrescenta `user_alerts` (avisos de lance superado), que tem id de usuário mas só é entregue a quem a
  política de leitura deixa: a própria pessoa.
- **Reserva**: sem `SUBSCRIBED` em 5 s (ou erro), a tela consulta `/api/collectibles/[id]/state` a cada 3 s;
  com Realtime, confere a cada 20 s. Pausa com a aba escondida.
- **Relógio**: a contagem usa a hora do servidor; a diferença para o aparelho é medida em cada consulta
  (ida e volta, ponto médio) e na geração da página. Último minuto em destaque; ao zerar, a tela confere
  (o anti-sniping pode ter estendido) e o encerramento é gravado.
- Movimento: preço "pisca" a cada lance, lance novo desliza na lista, selo pulsando; tudo some com
  `prefers-reduced-motion`. Novo preço anunciado numa região `aria-live="polite"`, no máximo a cada 4 s.

## Aviso de lance superado (0061)

Pedido do responsável: quem é coberto num item recebe um aviso, por push (app das lojas) e por pop-up
dentro do site. Migração `0061_outbid_and_hero_views.sql`, cenário S71, regras puras em
`src/lib/collectibles/outbid.ts` (testes em `tests/unit/outbid-alerts.test.ts`).

- **Quem recebe**: só quem vencia o item antes do lance (nunca quem deu o lance). O gatilho
  `trg_collectible_outbid` em `collectibles` (troca de `leading_bid_id`) roda dentro da transação do
  `place_bid`, que já trava a linha do item: lances do mesmo item são serializados.
- **Push** (`auction_outbid` na fila `push_outbox` da 0054): opt-in como os outros tipos
  (`notification_preferences.auction_outbid`, nasce desligado; chave "Lance superado nos Colecionáveis" em
  `/profile/notifications`), exige `channel_push` e aparelho registrado. **No máximo um por pessoa e item a
  cada 2 minutos** (guerra de lances não vira spam); a chave de dedupe é o lance que cobriu. Texto: "Seu lance
  foi superado · <item>: o lance agora é R$ X. Toque para dar um novo lance."; link `/shop/colecionaveis/<id>`.
  O envio confere de novo o consentimento e descarta o aviso se o item acabou/foi cancelado ou se a pessoa já
  voltou à frente. Sai **logo depois do lance** (`schedulePushDispatch` no `placeBidAction`, via `after()`), sem
  esperar o cron diário, que só recolhe sobras (falha da Expo).
- **Pop-up** (`OutbidAlerts`, montado na casca do grupo `(app)` para quem está logado, na web):
  "Seu lance em <item> foi superado · Lance atual: R$ X · **Dar novo lance**". Fonte: `user_alerts` (uma linha
  pendente por pessoa e item; RLS: cada um lê e marca como visto só as suas; grant de update só em
  `seen_at`; sem insert/delete para a API; some com a conta e com o item). Chega pelo **Realtime** (a tabela
  entra na publicação; a RLS filtra no servidor) com consulta de reserva **a cada 20 s só com a aba visível**
  (60 s com Realtime ligado). Cada aviso aparece **uma vez**: ao aparecer vira visto (outra aba não repete).
  Na **página do próprio item** não aparece (o aviso "Seu lance foi superado" de lá continua) e é dado como
  visto; item encerrado ou aviso com mais de 6 h também somem sem aparecer. Voltar à frente marca o aviso
  pendente do item como visto. `role="status"`, não rouba o foco, fecha no X (44 px) ou com Esc, sem animação
  com `prefers-reduced-motion`. Sem a 0061 no banco a consulta falha e o componente para.
- **App das lojas**: `/shop` é bloqueado no app (Apple 2.2/3.1.1, `src/lib/native-app/surface.ts`), então o
  pop-up não é montado lá e o toque no push cai na rota de reserva (aba Hero). O aviso por push continua
  útil para quem dá lance pelo site com o app instalado. **Decisão pendente do responsável**: liberar só
  `/shop/colecionaveis` no app (não há pagamento) ou abrir esse link no navegador do sistema.
- Limpeza: `push_outbox_cleanup()` (cron diário) apaga também os avisos com mais de 30 dias.

## Seed

4 itens de **demonstração em rascunho** (nunca começam sozinhos): bola assinada por Neymar, prancha e
bermuda de surf assinadas por Gabriel Medina, camisa assinada por Ronaldinho Gaúcho. Imagens neutras em
`public/collectibles/*.svg` (sem marca, sem logotipo). O admin revisa e lança. Reaplicar não sobrescreve.

## Limites conhecidos

- Realtime não foi exercitado contra o projeto real (o E2E local usa o remoto sem a 0057); a reserva por
  consulta garante o funcionamento mesmo sem ele.
- Um produto com slug `colecionaveis` ou `compras` ficaria escondido pelas rotas novas de `/shop`.
- Fotos são endereços (como a imagem do produto no admin): caminho do app ou `https://`.
