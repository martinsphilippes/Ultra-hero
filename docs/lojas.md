# Publicação nas lojas — App Store e Google Play

Roteiro do app **GC Hero** (`mobile/`, identificador `com.gchero.com`). O porquê de cada escolha
está em [`decisions/app-nas-lojas.md`](decisions/app-nas-lojas.md). Os passos marcados **(dono)**
pedem conta, pagamento ou assinatura de quem responde pela empresa; o resto é do time.

## 0. Antes de tudo (irreversível)

- [ ] **(dono)** Confirmar o identificador `com.gchero.com` (`mobile/app.config.ts`, `APP_ID`).
  Depois do primeiro envio ele não muda em nenhuma das lojas. O padrão para o domínio `gchero.com`
  seria `com.gchero.app`; os dois funcionam.
- [ ] **(dono)** App **gratuito** nas duas lojas (no Google, gratuito → pago não volta).
- [ ] Domínio e marca: `EXPO_PUBLIC_WEB_URL` aponta para a web (hoje `https://ultra-hero.vercel.app`).
  Trocar o nome da web para GC Hero antes do envio (a Apple confere nome do app × conteúdo).

## 1. Contas

| Conta | Situação | O que fazer |
|---|---|---|
| Expo (EAS) | a do Quantso | `cd mobile && npx eas-cli login && npx eas-cli init` → copie o `projectId` e a conta para `EAS_PROJECT_ID` e `EXPO_OWNER` em `mobile/app.config.ts` e commite |
| Google Play Console | organização (Quantso) | criar o app "GC Hero" na mesma conta; conta de organização **não** tem a regra dos 12 testadores por 14 dias |
| Apple Developer | pessoal | **(dono)** US$ 99/ano; criar o app no App Store Connect com o bundle `com.gchero.com`; habilitar **Sign in with Apple** no identificador (Certificates, Identifiers & Profiles) |

## 2. Configuração do projeto EAS

```bash
cd mobile
npm ci
npx eas-cli env:set --name EXPO_PUBLIC_WEB_URL --value https://ultra-hero.vercel.app --visibility plaintext --environment production --environment preview --environment development
```

Lição do Quantso: variável faltando no EAS **não quebra o build**, quebra a tela na frente do
revisor. `env:set` cria ou atualiza (o `env:create` antigo falhava se a variável já existia). `EXPO_PUBLIC_*` vai como `plaintext`, nunca
`secret` (vai no binário de qualquer jeito).

## 3. Supabase (login no app)

- [ ] **Apple**: Authentication → Providers → Apple → ligar; em **Client IDs** incluir
  `com.gchero.com` (login nativo por token de identidade; não precisa de Services ID nem de chave
  enquanto não houver "Entrar com Apple" na web).
- [ ] **Google**: nada novo. A volta passa por `/auth/native`, já coberto por `https://<site>/**` nas
  Redirect URLs. Se o domínio mudar, atualizar a Site URL e as Redirect URLs.

## 4. Builds

```bash
cd mobile
npm run check                                   # typecheck + testes + permissões do manifest final
npx eas-cli build --profile preview --platform android   # APK para instalar direto no aparelho
npx eas-cli build --profile production --platform all     # AAB (Play) + IPA (App Store)
```

- Credenciais: deixe o EAS gerar e guardar (keystore Android, certificados iOS). No Google, o
  **Play App Signing** guarda a chave de assinatura; o EAS guarda a de **upload**.
- O EAS recusa build com a árvore suja (`requireCommit`): build de loja sai de um commit que existe.
- O número do build é do EAS (`autoIncrement`); a versão que a pessoa vê é `version` em
  `app.config.ts`, decisão humana.
- Primeiro build: conferir que o EAS instala as dependências **em `mobile/`** (o repositório tem
  outro `package-lock.json` na raiz) e que o Metro achou `../src/lib/native-app/bridge-contract.ts`.

## 5. Teste no aparelho antes de enviar

Roteiro mínimo, nas duas plataformas, contra o endereço de produção:

- [ ] Abre na aba Hero, sem banner de demonstração; a barra inferior tem 4 abas (sem Comprar).
- [ ] `/shop`, `/cart`, `/profile/plan` digitados num link voltam para a aba Hero.
- [ ] Conteúdo bloqueado mostra o aviso **sem** botão de planos.
- [ ] Entrar com Google abre o navegador do sistema e volta logado; cancelar devolve o botão.
- [ ] (iOS) Entrar com Apple; (Android) o botão da Apple não aparece.
- [ ] Sair e entrar de novo; fechar e reabrir o app mantém a sessão.
- [ ] Foto de perfil/post: o seletor do sistema abre (câmera e galeria).
- [ ] Vídeo toca inline e em tela cheia.
- [ ] Link externo (Instagram do herói) abre no navegador do app, não dentro da casca.
- [ ] Modo avião: aparece "Sem conexão" com "Tentar de novo".
- [ ] (Android) voltar do sistema navega no histórico antes de sair.
- [ ] Excluir conta por Perfil › Conta e privacidade (com uma conta de teste — por último).

## 6. Google Play — ficha e formulários

- **Ficha**: ícone 512 (`mobile/assets/store-icon-512.png`), feature graphic 1024×500
  (`mobile/assets/feature-graphic-1024x500.png`), capturas do app **das lojas** (sem comércio). Os
  dois arquivos são provisórios até a marca GC Hero: `npm run assets` em `mobile/` regenera.
  Capturas que o revisor não consegue alcançar com a conta demo contam como propaganda enganosa.
- **Acesso ao app**: conta demo com e-mail e senha (o revisor está fora do Brasil). Nota em inglês
  (§8). Garantir que a conta tem os conteúdos que as capturas mostram.
- **Exclusão de conta**: "URL de exclusão de conta" = `https://<site>/legal/account-deletion`;
  "URL de exclusão de dados" = `https://<site>/legal/privacy`. Conferir com `curl -I` que as duas
  respondem 200 **depois** do deploy (no Quantso a URL deu 404 após o merge).
- **Data Safety**: declarar o que a **web** coleta (a casca não coleta nada próprio), a partir de
  `docs/privacy-and-retention.md`: nome, e-mail, celular (opcional), foto de perfil, conteúdo gerado
  (posts, receitas, listas), atividade no app (progresso, favoritos), identificadores de conta.
  Operadores (Supabase, Vercel, Cloudflare Stream) não contam como "compartilhamento".
  Criptografia em trânsito: sim. Exclusão a pedido: sim.
- **Classificação etária**: público adulto (os Termos dizem 18+). **Anúncios**: não. **App de saúde**:
  responder o questionário de saúde/condicionamento (treino e nutrição), sem alegação médica.
- **Trilha**: `eas submit --profile production --platform android` envia para **teste interno** como
  rascunho (`eas.json`); promover para produção pelo Console depois do roteiro do §5.
- **Conta de serviço** para o `eas submit`: criar no Google Cloud do Play Console, dar acesso ao app,
  baixar o JSON para `mobile/play-service-account.json` (ignorado pelo git) ou subir com
  `eas credentials`. Nunca versionar.

## 7. App Store — ficha e formulários

- **Capturas**: só iPhone (`supportsTablet: false`), 6,9" (1320×2868) e 6,5" (1284×2778).
- **Privacidade (rótulos)**: os mesmos dados do Data Safety, marcados como "vinculados à pessoa",
  **sem rastreamento**. O `PrivacyInfo.xcprivacy` da casca é gerado de `ios.privacyManifests` em
  `app.config.ts` (nenhum dado coletado pela casca; motivos das APIs de sistema do React Native).
- **Criptografia de exportação**: `ITSAppUsesNonExemptEncryption = false` já vai no binário.
- **Sign-in de revisão**: a mesma conta demo; a Apple testa a exclusão de conta (5.1.1(v)): peça
  que exclua uma conta criada por ela mesma, não a demo, e tenha a demo recuperável.
- **Direitos de imagem (5.2.1)**: anexar na nota ao revisor os contratos/autorizações de uso de nome
  e imagem dos heróis.
- `eas submit --profile production --platform ios` cai no **TestFlight**; o envio para revisão é
  pelo App Store Connect. Para o `submit` não perguntar, preencha `ascAppId` e `appleTeamId` em
  `eas.json` depois de criar o app.

## 8. Nota ao revisor (modelo, em inglês)

> GC Hero is a fitness, nutrition and cooking companion featuring content from real athletes and
> chefs, used under license (agreements attached). Sign in with the demo account below, or create
> an account with Sign in with Apple / Google. There are no purchases in the app: all content shown
> is included. Account deletion: Profile › Account & privacy › Delete my account (please use an
> account you created, so the demo account stays available).
> Demo account: `<email>` / `<senha>`

## 9. Atualizações depois da publicação

- **Mudança na web** (quase tudo): deploy normal na Vercel; o app pega na hora, sem loja.
- **Mudança na casca** (`mobile/`): `eas update --channel production` só alcança builds com o mesmo
  fingerprint; mudou dependência nativa ou `app.config.ts` → novo build e envio às lojas.
- **Rotas novas de comércio** na web precisam entrar em `isBlockedInNativeApp`
  (`src/lib/native-app/surface.ts`) e o botão novo em `native:hidden`, senão aparecem no app.
