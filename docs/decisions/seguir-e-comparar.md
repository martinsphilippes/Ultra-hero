# Seguir heróis e "Você vs Hero" (0056)

Pedido do responsável: o consumidor segue heróis, gere quem segue no Perfil e escolhe um deles para
comparar os próprios indicadores (treinos, sono, passos, uso do app).

## Decisões

- **Seguir = `hero_favorites` (0054).** A relação já existia (favoritar herói, que dispara o push de
  post novo). Não há tabela nova de seguir: o botão passou a se chamar **Seguir / Seguindo** e é um só
  (`FollowButton`), com a mesma ação `toggleHeroFavorite` e o pedido de permissão de push no app.
- **Onde aparece:** card de cada herói na aba Hero, cabeçalho da página do herói (com a contagem de
  seguidores) e cabeçalho de cada post do Início. Visitante vai ao login e volta à mesma página.
  Otimista, `aria-pressed`, alvo de 44px; o mesmo herói muda junto em todos os botões da aba.
- **Início:** abas "Seguindo | Todos" (`?feed=seguindo|todos`, navegação de documento). Padrão:
  Seguindo para quem segue ao menos um herói. Seguindo vazio sugere a aba Hero e o Todos.
- **Perfil › Heróis que sigo** (`/profile/herois`): lista com Seguindo (deixar de seguir) e o
  **Hero de comparação** (rádio, um só, ou "Nenhum").
- **Hero de comparação:** `profiles.compare_creator_id`. Gatilho só aceita herói seguido
  (`compare_requires_follow`); deixar de seguir limpa a escolha (gatilho em `hero_favorites`).
- **Comparação:** card "Você vs <Hero>" no Hoje (`/profile/today`, e nas seções Sono, Atividade e
  Treinos só com os indicadores delas) e na Evolução. Barras + "Seu sono está em 85% da referência
  de Neymar". Janela de 7 dias.
- **O lado do herói é REFERÊNCIA da equipe**, nunca dado medido: `creator_reference_metrics`
  (`source = 'reference'`), editada pelo admin em `/admin/creators/[id]` › "Referências para
  comparação" (em branco = não compara), auditada em `admin_audit` (`creator_reference`). Seed de
  demonstração para os 6 heróis, editável. Se um herói ligar um relógio real, `source` muda.
- **Contagem de seguidores:** `creator_follower_counts`, pública, mantida por gatilho, sem
  identidades (a RLS de `hero_favorites` continua só-dono). Também aparece no admin.

## Indicadores comparados

| Indicador | Fonte da pessoa |
| --- | --- |
| Sono (h, média de 7 noites) | relógio (demo ou real) |
| Passos (média de 7 dias completos) | relógio |
| Treinos no relógio (soma de 7 dias) | relógio |
| Carga do dia (média de 7 dias completos) | relógio |
| Dias ativos no app (de 7) | `streak_events` |
| Conteúdos concluídos (7 dias) | `completions` |
| Alimentação: receitas concluídas (7 dias) | `completions` de conteúdo `recipe` |

Fora, de propósito: FC de repouso, VFC, SpO₂ e afins (fisiologia individual, "mais" não é melhor);
calorias/ingestão (não existe diário alimentar); programas concluídos por semana (raro demais para
uma janela de 7 dias). Sem relógio, os indicadores do relógio aparecem "Conecte um relógio"; o
"Exemplo" simulado nunca entra na comparação.

## Banco sem a migração

Sem `hero_favorites`: sem botões nem abas. Sem a 0056: sem contagem, sem comparação, sem a escolha
de Hero (a lista de seguidos continua) e o admin avisa. As páginas sempre renderizam.
