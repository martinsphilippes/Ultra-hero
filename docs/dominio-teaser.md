# Domínio próprio: teaser no domínio principal, app no subdomínio

O código já está pronto; nada foi configurado na Vercel. Sem as variáveis abaixo, nada muda.

## Como fica

| Endereço | O que abre |
| --- | --- |
| `dominio.com` e `www.dominio.com` | o teaser de lançamento (`/conheca`) no próprio `/` |
| `dominio.com/conheca/influenciador` | a porta "Sou influenciador" |
| `dominio.com/legal/terms`, `/legal/privacy` | termos e privacidade |
| qualquer outra rota em `dominio.com` (`/login`, `/personalities`, `/agencia`…) | volta para `/` (307) |
| `app.dominio.com` | o app, como hoje em ultra-hero.vercel.app |

O teaser não tem link para o app (o rodapé traz só Termos de Uso e Política de Privacidade): quem já tem conta entra
direto por `app.dominio.com`.

A regra fica em `src/lib/marketing-host.ts` (testes em `tests/unit/marketing-host.test.ts`) e é aplicada no
`src/middleware.ts`, antes de tudo. O formulário do teaser é server action (POST na própria página): não depende de
`/api`.

## Como ligar

1. Na Vercel (projeto ultra-hero) → Settings → Domains: adicionar `dominio.com`, `www.dominio.com` e
   `app.dominio.com`, todos apontando para o mesmo projeto (sem redirecionar um para o outro, salvo `www` → raiz se
   preferir; nesse caso basta pôr só a raiz na lista abaixo).
2. Settings → Environment Variables (Production):
   - `MARKETING_HOSTS=dominio.com,www.dominio.com` — hosts que mostram só o teaser (separados por vírgula; sem
     `https://`; porta e maiúsculas são ignoradas).
   - `NEXT_PUBLIC_SITE_URL=https://app.dominio.com` — origem do app (links de e-mail, convites, Open Graph).
3. Supabase → Authentication → URL Configuration: incluir `https://app.dominio.com/**` nas Redirect URLs (login com
   Google/Apple, recuperação de senha) e trocar o Site URL quando o app mudar de endereço.
4. Redeploy. Conferir: `dominio.com` mostra o teaser; `dominio.com/login` volta para `/`; `app.dominio.com` abre o app.

`ultra-hero.vercel.app` continua sendo o app (não está na lista).

## Data do lançamento

A contagem do teaser e o Coming soon da loja usam a mesma data (`src/lib/launch.ts`, padrão 01/01/2027 00h de São
Paulo). Para mudar: `SHOP_OPENS_AT=2027-01-01T03:00:00Z` (ISO com fuso).

## Interessados

Os cadastros do teaser ficam na tabela `launch_leads` (migração 0117, sem acesso pela API) e aparecem em
`/admin/interessados`, com totais por tipo e "Baixar planilha (CSV)".
