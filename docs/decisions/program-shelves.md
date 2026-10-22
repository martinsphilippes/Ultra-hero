# Decisão: programas em prateleiras (estilo playlists)

Status: **implementado** (22/10/2026). Migração `0035_program_shelves_seed.sql` (só dados de demonstração), cenários S38–S39 em `supabase/tests/rls_scenarios.sql`, componente `src/components/programs/ProgramShelf.tsx` + `ShelfRail.tsx`, regras puras em `src/lib/catalog/program-shelf.ts` e carga em lote em `src/lib/catalog/program-shelves.ts`.

## Pedido

O responsável pediu que a biblioteca "Programas" do herói (`/personalities/[slug]/programas`) ficasse como as playlists do YouTube: um **título por programa** e, embaixo, **vários quadrados, um por etapa**, com rolagem lateral; no celular, pelo menos 3 a 4 quadrados lado a lado e, havendo mais, rolar para a direita.

## O que mudou

- **Uma prateleira por programa publicado** do herói, no lugar do card grande. Ordem: inscrito em andamento primeiro; depois a ordem da consulta (destaque, depois mais recentes).
- **Cabeçalho**: eyebrow "PILAR · PROGRAMA", título (link para `/programs/[slug]`), meta curta (`n etapas · duração estimada · n de m concluídas` para quem está inscrito) e ação "Ver programa" ou, com inscrição ativa, "Continuar" (vai para a próxima etapa aberta).
- **Quadrados**: capa 1:1 na linguagem do `ContentTile`, selo "Etapa N", ícone do tipo, título em até 2 linhas, tipo · duração, "Concluída" (só para inscrito; vale o conteúdo efetivo ou o original substituído, como no banco) e cadeado para premium sem o módulo (para visitante, todo premium tem cadeado — o mesmo que o quadro público já mostra). A seção ("Essencial" / "Para ir além") aparece como rótulo discreto no primeiro quadrado de cada uma, traduzida.
- **Celular**: a linha sangra até a borda, o 1º quadrado fica na margem de 16px e a largura `(100% − 0,5rem) / 3,4` deixa 3 quadrados inteiros e ~40% do 4º no Pixel 7 (412px). Snap horizontal, sem barra de rolagem.
- **Desktop (≥ md)**: quadrados de 11rem e setas ‹ › (nome "Etapas anteriores/Próximas etapas de {programa}", desabilitadas nas pontas, rolagem suave salvo `prefers-reduced-motion`).
- **Acessibilidade**: a lista se chama "Etapas de {programa}"; cada quadrado é um link cujo nome vem do texto visível completado por trechos só para leitor de tela — "Etapa 2 de 6: {título}, concluída" (sem `aria-label`, para o nome sempre conter o que aparece). O quadrado focado pelo Tab entra inteiro na vista (o navegador só rola quando o item está todo escondido).
- **Dados em lote**: versões, traduções, etapas, substituições, conteúdos e conclusões vêm numa consulta por tabela para todos os programas da página; as substituições são aplicadas no app (`resolveShelfSteps`), com resultado igual ao da RPC `program_required_items` (cenário S39). Quem está inscrito vê a versão em que entrou, como na página do programa. Título e resumo usam `program_localizations` publicada no idioma da interface.

## O que ficou de fora

- **Hub do herói** (`/personalities/[slug]`): continua no formato do Instagram (bibliotecas como botões + grade de posts), sem prateleiras. Ele não tem seção de programas; colocar 3 prateleiras acima dos posts mudaria o formato aprovado e os testes `hero-hub`. A biblioteca "Programas" segue a um toque.
- **Explorar → Programas**: continua em grade de cards (24 programas cabem no limite de 48). A prateleira agrupa por herói; no Explorar o agrupamento natural seria por pilar, decisão em aberto.
- **Contexto de programa na página do conteúdo**: `/content/[slug]` não aceita hoje esse contexto; o quadrado leva ao conteúdo puro.
- **Traduções dos 8 programas originais**: a 0035 não toca nos programas existentes, então em en/es os títulos originais seguem em português (os 16 novos têm en/es).

## Dados de demonstração (0035)

Cada um dos 8 heróis passa a ter **3 programas publicados** (24 no total): o original + 2 novos coerentes com a persona, com 6 a 8 etapas (105 no total) feitas de conteúdos já publicados do próprio herói (pelo menos 3 por programa) e, quando faltam, do outro herói do mesmo pilar. Seções "Essencial" (obrigatórias, posições 1..n) e "Para ir além" (opcionais, 101..), capas de `public/content/*.webp`, en/es em `program_localizations`, sem destaque (`is_featured = false`) e `created_at` 1–2 dias antes do original do herói (o original continua primeiro na biblioteca). Idempotente: ids fixos (`seed_uuid('program:shelf-<herói>-<n>')`, `pv:…:1`, `pi:…:<conteúdo>`), `on conflict do nothing` e a versão atual só é apontada onde ainda não há uma.

| Herói | Programas novos |
|---|---|
| Lia Monteiro | Noites que Descansam (8) · Autocuidado em Pequenas Doses (6) |
| Rafael Duarte | Semana Sob Controle (6) · Foco Sem Telas (7) |
| Camila Sato | Força em Casa com Elástico (6) · Core e Postura em 3 Semanas (7) |
| Tiago Albuquerque | Mobilidade para Correr Melhor (6) · Primeiro Intervalado (7) |
| Bruna Castellano | Supermercado Sem Mistério (6) · Lanches e Proteína no Dia a Dia (7) |
| Davi Nascimento | Planejamento de Refeições em 4 Semanas (6) · Energia para Treinar (7) |
| Helena Vilar | Técnicas de Faca e Mise en Place (6) · Cozinha Rápida do Dia a Dia (7) |
| Marcos Ferraz | Marmitas Congeláveis (6) · Domingo de Preparo (7) |
