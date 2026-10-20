# Ultra Hero

Stack: **Next.js** (App Router + TypeScript + Tailwind) · **Supabase** (banco, auth, storage) · **Vercel** (deploy) · **GitHub**.

## Rodar localmente

```bash
cp .env.example .env.local   # preencha a chave pública do Supabase
npm install
npm run dev
```

## Variáveis de ambiente

| Nome | Onde achar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys |

## Estrutura

- `src/lib/supabase/` — clientes do Supabase (navegador, servidor e middleware de sessão)
- `src/middleware.ts` — renova a sessão em cada requisição e exige login em `/admin`, `/creator`, `/seller`, `/evolution`, `/profile`, `/cart`, `/checkout`, `/orders`, `/onboarding` (papéis são checados nos layouts, no servidor)
- `src/lib/auth/session.ts` — `getUser()`, `getProfile()`, `getRoles()`, `requireUser()`, `requireRole()`
- `src/app/(app)/` — experiência do consumidor (5 abas: Início, Explorar, Personalidades, Evolução, Perfil)
- `src/app/(auth)/` — login, cadastro, recuperação e redefinição de senha (Supabase Auth: e-mail/senha + Google)
- `src/app/auth/{callback,confirm,signout}` — route handlers de autenticação
- `src/app/{admin,creator,seller}/` — portais com `PortalShell` e gate de papel
- `src/components/ui/` — design system (tokens em `src/app/globals.css`)
- `src/i18n/` + `messages/<locale>/*.json` — next-intl sem prefixo na URL; cada JSON vira um namespace (adicione arquivos, não edite código compartilhado)
- `public/placeholders/` — capas, avatares e produtos abstratos usados pelos seeds
- `public/sw.js` + `src/app/manifest.ts` — PWA (registrado só em produção)

## Scripts úteis

```bash
node scripts/generate-icons.mjs        # regenera public/icons/*.png, src/app/apple-icon.png e favicon.ico
npx tsx scripts/check-messages.ts      # garante a mesma árvore de chaves em messages/pt-BR, en e es
```

## Ambiente de demonstração

Tudo que é comercial (planos, pedidos, entregas) é simulado. Não há pagamentos, cobranças ou envios reais.
