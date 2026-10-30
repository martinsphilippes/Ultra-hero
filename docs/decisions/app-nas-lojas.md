# App nas lojas (App Store e Google Play): casca Expo sobre a web

Decisões do responsável (30/10/2026): publicar o GC Hero na App Store e no Google Play **mantendo a
versão web**; arquitetura de casca Expo + WebView; identificador `com.gchero.com`; nome **GC Hero**;
no app das lojas, comércio e assinaturas simuladas ficam **ocultos**. Contas: Apple Developer
**pessoal**, Google Play de **organização** (a do Quantso), Expo do Quantso.

O roteiro de publicação, passo a passo, está em [`docs/lojas.md`](../lojas.md).

## Arquitetura

```
mobile/ (Expo SDK 54, EAS)                 web (Next.js na Vercel, sem mudança de deploy)
┌──────────────────────────────┐           ┌──────────────────────────────────────────┐
│ WebView → https://<site>     │──HTTPS───▶│ middleware: user agent "GCHeroApp/x (os)" │
│  user agent + GCHeroApp/x    │           │   → rotas de comércio/plano: 307 p/ Hero  │
│ ponte postMessage ◀────────▶ │           │ <html data-native-app> → CSS native:hidden│
│  · oauth  → navegador do SO  │           │ /auth/native → gchero://auth/callback     │
│  · apple  → Sign in with Apple│          │ AppleButton → signInWithIdToken           │
│  · share  → folha do sistema │           └──────────────────────────────────────────┘
│ tela própria sem conexão     │
└──────────────────────────────┘
```

- **Por que casca, e não reescrita nativa**: a web é Next.js com SSR, server actions e sessão em
  cookie; não exporta para estático, e reescrever todas as telas em React Native custaria meses. A
  casca reaproveita 100% da web e cada correção da web chega ao app sem nova versão na loja.
- **Por que Expo/EAS, e não Capacitor**: é o pipeline que o Quantso já aprovou no Google; o EAS
  compila iOS na nuvem (não exige Mac), guarda as credenciais e envia às lojas (`eas submit`).
- **O contrato da ponte** mora em `src/lib/native-app/bridge-contract.ts`, sem import, e a casca
  importa o mesmo arquivo (`mobile/metro.config.js`): os dois lados não divergem. Mensagem fora do
  contrato é ignorada dos dois lados (testes em `tests/unit/native-bridge-contract.test.ts`).
- **Navegação**: só o próprio site roda dentro da casca; outro domínio no quadro principal abre no
  navegador do app; iframes (player de vídeo) carregam; esquemas desconhecidos são barrados
  (`mobile/src/navigation.ts`, testes em `mobile/tests/`).

## Login

- **Google**: o Google recusa OAuth dentro de WebView (`disallowed_useragent`). No app, o
  `GoogleButton` pede a URL ao Supabase com volta em `/auth/native` e a entrega à casca, que abre o
  login no navegador do sistema (`ASWebAuthenticationSession` / Custom Tab). O Supabase volta para
  `/auth/native`, que redireciona para `gchero://auth/callback?code=…`; a casca então abre
  `/auth/callback?code=…` **na WebView**, onde está o verificador PKCE gravado no início. Um app
  que interceptasse o esquema `gchero://` teria só o código, que sem o verificador não vira sessão.
  `/auth/native` já é coberto pelas Redirect URLs (`https://<site>/**`).
- **Apple** (só iOS): com login do Google, a Apple exige Sign in with Apple (guideline 4.8). A casca
  faz o login nativo com nonce (a Apple recebe o SHA-256, o Supabase confere o nonce cru) e devolve o
  token de identidade; a web chama `signInWithIdToken({ provider: "apple" })`, que grava os cookies
  da sessão como qualquer login. Exige o provedor Apple ligado no Supabase com o Client ID
  `com.gchero.com` (passo em `docs/lojas.md`).
- **Contas demo de um toque** (inclui admin) não aparecem no app, em nenhuma tela, e a ação
  `signInAsDemo` recusa pedido vindo do app: o revisor recebe credenciais.
- **Nome na Apple**: a Apple manda o nome só no primeiro login e fora do token; a casca o repassa e
  a web grava em `full_name` e no `display_name` do perfil.
- **A ponte só aceita mensagens do próprio site** (no Android ela ouve qualquer quadro, inclusive
  iframes de terceiros) e o pedido de OAuth só abre `/auth/v1/authorize`.

## O que o app das lojas não mostra (e por quê)

| Superfície | No app | Motivo |
|---|---|---|
| `/shop`, `/cart`, `/checkout`, `/orders`, `/profile/plan`, `/personalities/<slug>/produtos` | 307 para a aba Hero (middleware) | compra e assinatura simuladas: Apple 2.2 (app de demonstração) e 3.1.1 (desbloqueio de conteúdo digital fora da compra no app) |
| Aba Comprar, aba Produtos do Explorar, biblioteca Produtos do herói, cards de produto, produtos relacionados, oferta da lista de compras, linhas Plano e Pedidos do Perfil | ocultos (`native:hidden` / filtro no servidor) | idem; a trava de verdade é a rota |
| CTA "ver planos" do conteúdo bloqueado | oculto; fica o aviso de conteúdo do plano | Apple 3.1.1: nada de caminho de compra fora do IAP |
| Selos "Demonstração" (`DemoBadge`) | ocultos (o aviso de demonstração do topo e dos rodapés saiu também da web em 30/10/2026) | Apple 2.2 |
| Acesso rápido às contas demo (inclui admin), em qualquer tela | oculto, e a ação recusa pedido vindo do app | Apple 2.2; o revisor recebe credenciais |
| Itens de produto em listas e favoritos | célula inteira oculta (`data-kind="product"`) | idem |
| Portal do profissional (`/profissional`) e "Contratar" (perfil do profissional, receita, Alimentação) | rota com 307 (middleware); botão não renderizado e a ação `hireService` recusa pedido vindo do app; a lista `/profissionais` e o perfil continuam (0058) | serviço contratado com pagamento simulado |

| Todo selo `variant="demo"` (inclui "Personagem fictício", o do portal e o do relógio) | oculto pelo próprio `Badge` | decisão do responsável (30/10/2026, opção "esconder tudo") |
| Textos que falam em demonstração, simulado ou fictício | trocados por versão do app em `messages-native/<locale>.json`, sobreposta às mesmas chaves quando o pedido vem do app | idem |
| Relógio simulado (Hoje da conta demo e "Ver um exemplo") | oculto; `?exemplo=1` travado no middleware | dado de saúde inventado sem o aviso de demonstração confundiria |
| Contagem de produtos no perfil do herói | oculta | sem comércio no app |
| Certificado (PDF) | aviso sem "ambiente de demonstração" (segue simbólico e sem validade); autor sem "(demo)" | idem |

O que garante que nada escape: `tests/unit/native-messages.test.ts` reprova texto da base que fale
em demonstração sem versão do app, a menos que a chave esteja numa superfície que o app não mostra
(lista `NOT_IN_APP` do teste); e reprova sobreposição que mude placeholder ou volte a dizer
"demonstração". **Os Termos de Uso e a Política de Privacidade não são sobrepostos**: valem para a
web e o app e só mudam com revisão jurídica — eles ainda descrevem a versão de demonstração.

Push: [`push-notifications.md`](push-notifications.md). Ficam fora, e são decisão do responsável
antes de abrir ao público: compra real pelo app (IAP/Play Billing, ex.: RevenueCat); HealthKit /
Health Connect (o "relógio real" hoje é só por API das marcas).

## Riscos conhecidos de revisão

- **Apple 4.2 (funcionalidade mínima)**: casca de site é o motivo mais comum de recusa. Mitigação
  atual: login nativo (Apple, Google pelo sistema), compartilhar do sistema, tela própria sem
  conexão, gestos e voltar do sistema, e push nativo (posts de heróis favoritos, conquistas).
- **Apple 5.2.1 (pessoas reais)**: nomes e fotos de Neymar, Medina, Fonseca, Anitta, Ronaldinho e
  Jacquin exigem prova de direito de uso; os contratos vão em anexo na nota ao revisor.
- **Nome**: a loja diz "GC Hero" e a web ainda diz "Groscove Ultra". Trocar a marca da web antes do
  primeiro envio evita "app não corresponde à ficha".
- **Conta Apple pessoal**: a ficha mostra o nome da pessoa como vendedor; dá para transferir o app
  para uma conta de organização depois (Apple permite transferência).

## Lições do Quantso aplicadas

Fonte: `attilasm/quantso`, `docs/operations/publicacao-nas-lojas.md`.

- Identificador fixado antes do primeiro envio (é irreversível) — numa constante só, em `app.config.ts`.
- `appVersionSource: remote` + `autoIncrement`, `requireCommit: true`, `runtimeVersion: fingerprint`,
  um canal de update por perfil (`eas.json`).
- **R8 ligado** (`enableMinifyInReleaseBuilds`): a Play reclamou de ofuscação em ~1% na versão 7 do Quantso.
- **Sem trava de orientação**: a Play pediu para remover; o Android 16 a ignora em telas grandes.
- **Permissões mínimas, conferidas no manifest final** (`npm run check:permissions` em `mobile/`, que
  lê `expo config --type introspect`): plugin injeta permissão sem avisar.
- Ícone da Apple sem alfa; adaptive icon com a marca na zona segura; feature graphic sem alfa.
- Exclusão de conta com URL pública que **responde** e é alcançável do rodapé (`/legal/account-deletion`).
- Conta demo para o revisor (fora do Brasil, sem SMS) e nota ao revisor em inglês.
- `EXPO_PUBLIC_WEB_URL` por ambiente no EAS, como `plaintext` (não `secret`).
