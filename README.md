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
- `src/middleware.ts` — renova a sessão do usuário em cada requisição
