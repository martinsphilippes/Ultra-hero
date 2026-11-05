# Projeto "groscove": teaser de lançamento em ambiente separado

Documento de passagem para outra sessão. O objetivo é tirar o teaser de lançamento de dentro do app Ultra-hero e colocá-lo num
projeto **totalmente separado**, chamado **groscove**: outro repositório, outro projeto na Vercel e outro endereço. Assim,
quem entra no teaser **não consegue chegar ao app trocando o que vem depois da barra** (ex.: `/login`, `/agencia`), porque o
app simplesmente não existe naquele projeto.

> Quem for executar: leia tudo antes de começar. O responsável (Philippe) lê só português; responda e reporte em português.

---

## 1. Situação hoje

- O teaser está **dentro do app** em `https://ultra-hero.vercel.app/conheca` (público) e `/conheca/influenciador`.
- Mesmo projeto Vercel do app: `ultra-hero` (projeto `prj_0QDZPGVVGfufndHhw6uen6t4JKzm`, time `team_LlFJqc9gzg8eNGkiDRIWNrOg`).
- Repositório: `martinsphilippes/Ultra-hero`, branch `master`.
- Banco: Supabase do Ultra-hero (`cjcvlfypjoxaynwtmuhz`). Os interessados ficam na tabela `public.launch_leads`
  (migração `0117_teaser_lancamento.sql`) e aparecem no app em **Admin › Interessados**, com download em planilha.
- Existe uma proteção parcial por domínio (`MARKETING_HOSTS` no middleware), mas ela depende de configuração e o código do app
  continua no mesmo projeto. A decisão agora é separar de verdade.

## 2. Objetivo (o que precisa existir no fim)

1. Repositório novo no GitHub: **`groscove`** (privado), contendo **só** o teaser.
2. Projeto novo na Vercel: **`groscove`**, ligado a esse repositório. Endereço inicial `https://groscove.vercel.app`
   (ou o domínio próprio quando existir).
3. Páginas: `/` (teaser público) e `/influenciador`. **Qualquer outro caminho → 404 ou volta para `/`.**
   Termos e Privacidade: páginas próprias no groscove (`/termos`, `/privacidade`) copiando o texto do Ultra-hero, **ou**
   links externos para `https://ultra-hero.vercel.app/legal/...` (decidir com o responsável; recomendado: páginas próprias).
4. O formulário continua gravando na **mesma lista** `launch_leads` (para o Admin › Interessados do app seguir funcionando).
5. Nenhuma chave secreta do banco do app no projeto groscove (ver seção 5).
6. Visual **idêntico** ao teaser atual (Ultra Lançamento).
7. No app Ultra-hero, `/conheca` passa a **redirecionar** para o endereço novo (depois que o groscove estiver no ar e testado).

## 3. Conteúdo atual do teaser (manter igual)

- **Frase principal:** "A rede wellness das celebridades está chegando." (pt-BR; en/es também existem).
- **Logo:** GROSCOVE ULTRA em branco nítido + triângulo laranja (#FD4F05), brilho que atravessa o logo inteiro (inclui o triângulo)
  com clarão suave em volta; mesmo efeito no título. Sem reflexo em "reduzir movimento".
- **Linha:** "Lançamento · 01.01.2027".
- **Contagem regressiva** até 01/01/2027 00:00 (America/Sao_Paulo) = `2027-01-01T03:00:00Z`, dígitos que viram (DIAS · HORAS · MIN · SEG).
- **Formulário "Seja o primeiro a saber":** Nome, Celular (máscara BR), E-mail, caixinha obrigatória "Aceito receber novidades
  do Groscove Ultra." + link da Política de Privacidade; botão "Quero saber primeiro"; sucesso "Pronto. Você vai saber antes de todo mundo."
- **Botão no topo:** "Sou influenciador ↗" → página com o título "Um ecossistema inteiro que conecta você a marcas e empresas.",
  três tópicos centralizados e o campo "@ do Instagram" (opcional). Sem opção para empresas.
- **Rodapé:** só Termos de Uso e Política de Privacidade. **Sem "Já tenho acesso"** (nada leva ao app).
- Seletor de idioma (pt-BR/en/es). Preto + laranja, fontes Manrope e DM Mono.

## 4. Arquivos de origem (copiar do Ultra-hero e simplificar)

| Origem no Ultra-hero | Para quê |
|---|---|
| `src/app/conheca/page.tsx` | página pública → vira `app/page.tsx` |
| `src/app/conheca/influenciador/page.tsx` | página do influenciador → `app/influenciador/page.tsx` |
| `src/app/conheca/actions.ts` | gravação do formulário → **reescrever** (ver seção 5) |
| `src/components/launch/LaunchTeaser.tsx`, `LaunchLeadForm.tsx`, `LaunchLogo.tsx`, `teaser.css` | a página em si |
| `src/components/commerce/coming-soon/ComingSoonCountdown.tsx`, `Hourglass.tsx`, `coming-soon.css` | contagem e ampulheta |
| `src/lib/launch.ts` | data do lançamento e cálculo da contagem |
| `src/lib/launch-leads.ts` | validação do formulário (zod), honeypot, tags/UTM |
| `src/lib/auth/phone.ts` (só `formatBrPhoneInput` e a normalização E.164) | máscara de celular |
| `src/components/layout/brand-paths.ts` (+ `BRAND_NAME` de `Logo.tsx`) | desenho do logo |
| `src/components/layout/LocaleSwitcher.tsx` | idioma (simplificar: cookie `NEXT_LOCALE`) |
| `messages/{pt-BR,en,es}/institutional.json` (chaves `teaser`, `influencer`) e `launchLeads.json` | textos |
| `src/app/legal/*` (termos/privacidade) | se fizer páginas próprias |
| fontes Manrope + DM Mono (como o app carrega em `src/app/layout.tsx`) | tipografia |

**Remover na cópia:** tudo de `SeasonalTheme`, `INSTITUTIONAL_PATH`, `isMarketingHost/parseMarketingHosts/requestHost`,
`createAdminClient`, `recordQuickSignupAttempt`, Supabase do app, links internos do app. O projeto groscove não deve ter
nenhum código do app.

Stack igual ao app (para copiar sem atrito): Next.js 15.5 (App Router), React 19, next-intl 4, Tailwind 4, zod.

## 5. Formulário: como gravar sem expor o banco do app (decisão de segurança)

**Não** colocar `SUPABASE_SERVICE_ROLE_KEY` do Ultra-hero no projeto groscove (essa chave abre o banco inteiro do app).

Recomendado: **o groscove envia o cadastro para uma rota do app**, que valida e grava.

1. No **Ultra-hero**, criar `src/app/api/launch-leads/route.ts` (POST):
   - aceita JSON `{ kind, name, phone, email, consent, instagram?, source?, utm_* }`;
   - exige cabeçalho `x-groscove-signature` = HMAC-SHA256 do corpo com o segredo `GROSCOVE_LEADS_SECRET`
     (comparação em tempo constante) e `x-groscove-ts` com no máximo 5 min de diferença (evita repetição);
   - usa `launchLeadSchema` + honeypot + o mesmo limite por IP/e-mail que a server action atual
     (IP vem do cabeçalho `x-forwarded-for` repassado pelo groscove, em `x-groscove-client-ip`, só confiável porque a requisição está assinada);
   - grava com o mesmo código da `joinLaunchListAction` atual (upsert por e-mail + tipo, `source = 'groscove'`);
   - responde `{ ok: true }` ou `{ ok: false, fieldErrors | error }`; CORS fechado (chamada servidor→servidor).
2. No **groscove**, a server action do formulário chama essa rota com `fetch` **do servidor** (nunca do navegador),
   assinando com o mesmo `GROSCOVE_LEADS_SECRET`.
3. Variáveis de ambiente:
   - groscove: `GROSCOVE_LEADS_SECRET`, `LEADS_ENDPOINT=https://ultra-hero.vercel.app/api/launch-leads`, `LAUNCH_AT` (opcional);
   - Ultra-hero: `GROSCOVE_LEADS_SECRET` (o mesmo valor; gerar com `openssl rand -base64 32`).
4. Testes: unidade da assinatura (válida, corpo alterado, horário vencido) e do mapeamento de erros; e2e no groscove
   enviando um cadastro de teste e conferindo em Admin › Interessados (apagar o teste depois).

Alternativa (só se o responsável preferir): Supabase próprio para o groscove. Desvantagem: a lista sai do Admin do app.

## 6. Isolamento (o motivo de tudo)

- `middleware.ts` do groscove: permitir só `/`, `/influenciador`, `/termos`, `/privacidade`, arquivos estáticos e
  `/_next/*`; o resto responde **404** (ou redireciona para `/`).
- `robots`/metadados: título "Groscove Ultra — Em breve", descrição sem detalhes do produto, imagem OG do teaser.
- Cabeçalhos de segurança (CSP simples, `X-Frame-Options: DENY`, `Referrer-Policy`).
- Nenhum link para `ultra-hero.vercel.app` além dos documentos legais, se optar por links externos.

## 7. Passo a passo sugerido

1. Criar o repositório `groscove` (privado) no GitHub da conta `martinsphilippes` e o app Next.js mínimo.
2. Copiar e simplificar os arquivos da seção 4; conferir visual lado a lado com `https://ultra-hero.vercel.app/conheca`
   (prints Playwright em 1440×900 e iPhone 13).
3. Fazer a rota `/api/launch-leads` no Ultra-hero (seção 5), publicar, e configurar o segredo nos dois projetos.
4. Criar o projeto Vercel **`groscove`** ligado ao repositório, com as variáveis de ambiente; publicar.
5. Testar em produção: página, contagem, formulário público e de influenciador (cadastro aparece no Admin › Interessados),
   tentativa de abrir `/login`, `/agencia`, `/admin` → 404.
6. Só depois de aprovado pelo responsável: no Ultra-hero, `/conheca` e `/conheca/influenciador` redirecionam (308) para
   o groscove; remover a variável `MARKETING_HOSTS` se não for mais usada.
7. Domínio próprio (quando existir): apontar para o projeto `groscove` na Vercel; o app continua em outro endereço.

## 8. Cuidados

- Mudanças no app Ultra-hero seguem o fluxo de sempre: validar (`tsc`, `lint`, `messages:check`, `vitest`, `build`),
  commit em `master`, sem expor chaves.
- Não apagar o teaser do Ultra-hero antes do groscove estar no ar e aprovado (há versões guardadas: **Ultra Lançamento**
  e **Ultra Clássico**).
- O acesso ao app continua em `ultra-hero.vercel.app`; a apresentação completa do produto fica em `/sobre` no app.
