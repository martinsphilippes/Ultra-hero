# Checklist de segurança, privacidade, acessibilidade e lançamento

Marque com evidência (link/commit/print). Itens **bloqueantes** impedem abertura pública.

## Segurança
- [x] **(B)** RLS habilitado em todas as tabelas (`select count(*) from pg_tables where schemaname='public' and not rowsecurity` = 0) (verificado no remoto e no local em 20/10/2026: 0 tabelas sem RLS; no local com as 26 migrações em 21/10/2026: 67 tabelas, 0 sem RLS)
- [x] **(B)** Vídeo do herói: 0025 e 0026 aplicadas no remoto (21/10/2026) e Stream ligado na Vercel (`CLOUDFLARE_*`, `VIDEO_PROVIDER`); com elas, `stream_uploads` só é gravada pelo service role, o banco recusa uid do Stream sem vínculo do próprio herói (543 cenários de RLS passando no local), há limite de 10 envios por herói por hora e a limpeza diária roda no cron de retenção (03:00 UTC). Rodar `E2E_STREAM_REAL=1` contra produção depois do deploy
- [x] **(B)** `npm run test:rls` verde no commit de release (897/897 em 23/10/2026, com as 35 migrações locais 0001–0036; antes, 430/430 em 21/10/2026 com 0017–0024)
- [x] **(B)** `SUPABASE_SERVICE_ROLE_KEY` só em variáveis de servidor (Vercel), nunca `NEXT_PUBLIC_` (módulo `server-only`; busca no bundle do cliente sem ocorrências; variável cadastrada na Vercel em 20/10/2026 como Sensitive, só Production e Preview; `/api/cron/*` respondendo ok)
- [x] **(B)** `CRON_SECRET` definido; `/api/cron/*` retorna 403 sem ele (definido na Vercel; 403 com segredo ausente ou errado coberto em `tests/unit/video-cron.test.ts`)
- [ ] **(B)** Admin de bootstrap confere apenas os e-mails esperados (`app_settings.bootstrap_admin_emails`)
- [x] Advisors de segurança do Supabase revisados (migração 0016, 20/10/2026: 0 funções sem `search_path`, PUBLIC sem EXECUTE, anon só nas 17 RPCs públicas; restam só os avisos inerentes a RPCs de usuários logados)
- [x] Google OAuth com redirect restrito ao domínio do app (20/10/2026: provedor ativo no Supabase, Site URL e Redirect URLs `https://ultra-hero.vercel.app/**`; `/auth/v1/authorize?provider=google` redireciona para o Google; app publicado no Google Auth Platform em 20/10/2026, com página inicial, Política de Privacidade e Termos informados na marca; só escopos básicos, sem verificação do Google)
- [ ] Headers: `no-store` em rotas autenticadas sensíveis; CSP básica avaliada
- [ ] Rate limiting: feedback (20/dia), recomendações (setting), auth (Supabase)
- [ ] Nenhum segredo no repositório (`git log -p | grep -i key` limpo)

## Privacidade / LGPD
- [x] **(B)** Termos e política de privacidade publicados e linkados no cadastro (`/legal/terms` e `/legal/privacy`, commit `2d445ef`; revisão jurídica pendente)
- [ ] **(B)** Exclusão de conta testada ponta a ponta (anonimização de pedidos verificada)
- [x] Retenção automatizada ativa (cron diário) e `retention_jobs` com execuções (primeira execução manual em 20/10/2026 às 20:11 UTC, 0 registros afetados)
- [ ] Analytics sem PII (função rejeita chaves suspeitas; amostragem manual de `properties`)
- [ ] Documento `docs/privacy-and-retention.md` revisado por jurídico

## Integridade do produto
- [x] **(B)** Receitas fase 1 (0027–0029): app publicado antes (E2E 146/146 contra produção com o banco antigo), 0027 e 0028 aplicadas, 0029 com dry-run (41 ingredientes e 28 etapas literais, 8 receitas) e bloco final; E2E 146/146 depois e nenhum erro de execução na Vercel (22/10/2026)
- [ ] **(B)** Receitas fase 6 (0036, exclusão da receita arquivada pelo herói): app publicado antes, 0036 aplicada pelo roteiro de `docs/decisions/recipes-module.md` (seção "Fase 6": 175 funções em `public`, anon sem execute em `creator_delete_recipe`, as 17 `security definer` do visitante iguais), `database.types.ts` igual ao do remoto e `recipes-journeys.spec.ts` (mobile) contra produção com a publicação efêmera; no fim, `select count(*) from public.content where title like '[E2E]%'` = 0
- [ ] **(B)** Receitas fase 3 (catálogo, página da receita e perfil do chef; sem migração): `RECIPES_SEO_INDEX` **desligada** na Vercel (P6: sem sitemap de receitas nem JSON-LD enquanto os chefs forem fictícios); conferir em produção `/robots.txt` (sem `Sitemap:`), `/sitemap.xml` vazio e uma receita sem `application/ld+json`
- [ ] **(B)** Conteúdo publicado sempre com regra de acesso e corpo (consulta: `content where status='published' and (access_level is null or id not in (select content_id from content_bodies))` = 0)
- [ ] **(B)** Rótulos de demonstração em catálogo, carrinho, checkout, pedidos, planos
- [ ] Personalidades marcadas como fictícias; nenhuma imagem/nome real
- [ ] Alegações de saúde revisadas em conteúdos e produtos (lista de termos + revisão humana)
- [ ] Dashboard separa interesse em assinatura, interesse comercial, pedido de teste e receita real (0)

## Acessibilidade (WCAG 2.2 AA como referência; não declarar conformidade sem verificar)
- [ ] Navegação por teclado em: login, Início, Explorar, conteúdo (player), programa, carrinho/checkout, perfil, admin (tabelas e diálogos)
- [ ] Foco visível e ordem lógica; `aria-current` na navegação; diálogos devolvem foco
- [x] Contraste ≥ 4.5:1 nos dois temas (tokens verificados) (token `fg-subtle` corrigido no commit `f7eb694`)
- [ ] Rótulos em todos os campos; mensagens de erro associadas (`aria-describedby`)
- [ ] Vídeos essenciais com legenda/transcrição (player demo exibe transcrição)
- [x] axe (Playwright) sem violações críticas nas rotas principais (32/32 no commit `229253c`, 9 rotas públicas)
- [ ] Layout 360px–1440px sem rolagem horizontal

## Performance e PWA
- [ ] Lighthouse mobile: Performance ≥ 80, A11y ≥ 95, PWA instalável
- [ ] Imagens responsivas/lazy; estados de rede lenta (skeletons) presentes
- [ ] Service worker: offline fallback funciona; versão atualizada após deploy

## Storage, cron e contas de demonstração
- [ ] **(B)** Buckets no Supabase Storage conferidos: `avatars` **público** (sem política de escrita; só o servidor com service role grava, 512×512 sem EXIF, 20 envios por 24 h) e `recipe-media` **privado** (5 MB por objeto, 3 políticas em `storage.objects`, cota de 50 objetos ou 100 MB por herói por dia em `recipe_media_quota_ok`); consulta: `select id, public, file_size_limit from storage.buckets` e `select policyname, cmd from pg_policies where schemaname = 'storage'`
- [ ] **(B)** Cron diário de órfãos ativo: `/api/cron/retention` (03:00 UTC, `vercel.json`) com `CRON_SECRET` e `SUPABASE_SERVICE_ROLE_KEY` na Vercel; a resposta traz o resultado de retenção, Stream (`stream_cleanup_*`), fotos de perfil (`avatar_orphan_uploads`) e fotos de receita órfãs há mais de 24 h (`recipe_orphan_media` + API do Storage); sem a função no banco, o passo responde `recipe_orphans_skipped: not_migrated`
- [ ] **(B)** `RECIPES_SEO_INDEX` desligada (P6), conferida junto com o item da fase 3 acima
- [ ] **(B)** Contas demo (`DEMO_ACCOUNTS_PASSWORD` na Vercel: admin, herói, fornecedor, premium e gratuita, com um toque em `/login`) **desligadas ou sem o papel admin antes da abertura pública** (Q16 do documento do Hoje; `src/lib/demo/accounts.ts`). Enquanto existirem: os E2E entram com elas (as que gravam rodam só no projeto mobile e desfazem o que criam); o botão "Sair" usa `signOut()` global e derruba as outras sessões da mesma conta demo; o fuso de cada conta acompanha o aparelho do último acesso (`TimezoneSync`), por isso o Playwright roda em `America/Sao_Paulo`
- [x] E2E local com `next start`: o otimizador de imagens do Next 15.5.28 prendia para sempre a imagem cujo pedido o navegador abortava (socket do navegador repassado à requisição interna); corrigido pelo `postinstall` (`scripts/patch-next-image-optimizer.mjs`) e coberto por `tests/unit/next-image-patch.test.ts`; na Vercel a otimização roda no serviço dela (23/10/2026)

## Relógio real (F3 em diante de `docs/decisions/hoje-relogio.md`) — nada disso está no ar
- [ ] **(B)** Encarregado (DPO) nomeado e com nome e contato publicados no site; RIPD feito (dado sensível de saúde, art. 11 e 38 da LGPD)
- [ ] **(B)** Política de Privacidade e `legal.json` (3 idiomas) reescritas antes de qualquer dado real (hoje dizem que nenhum dado de relógio é coletado); consentimento específico por categoria, com o texto arquivado
- [ ] **(B)** Contas das marcas: Garmin Connect Developer Program (exige CNPJ, e-mail de domínio próprio, site e política públicos), Apple Developer de **organização** com D-U-N-S e Google Play Console de organização (Apple Watch e Health Connect só com app nativo nas lojas)
- [ ] **(B)** Vercel Pro e Supabase Pro (backups diários) e, recomendado, projeto de produção separado do experimento com contas demo

## Operação do experimento (14 dias)
- [ ] Ambientes: staging e produção experimental separados (projetos Supabase distintos)
- [ ] Backups: política do plano documentada; restauração testada uma vez
- [ ] Runbook de incidente: kill switches (`commerce.enabled`, `ai.enabled`, `experiment.open`), quem aciona, como comunicar
- [ ] Métricas-alvo definidas sem percentuais inventados; janelas de observação por coorte de cadastro
- [ ] Relatório final por dimensão (usabilidade, ativação, retorno, incidentes, limitações)

## Aprovação
- [ ] Responsável técnico: ________ data ___/___
- [ ] Segundo revisor: ________ data ___/___
