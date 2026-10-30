import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/login";
import { supabaseEnv } from "./helpers/supabase";

// Seguir heróis e "Você vs Hero" (0054 hero_favorites + 0056). SÓ LEITURA: nenhum teste toca em
// Seguir/Seguindo nem grava a escolha de comparação (o servidor dos E2E usa o banco remoto).
// Sem as tabelas no banco, os botões e as abas somem e as páginas seguem normais (é o que se confere).

async function tableExists(table: string): Promise<boolean | null> {
  const env = supabaseEnv();
  if (!env) return null;
  const res = await fetch(`${env.url}/rest/v1/${table}?select=creator_id&limit=1`, { headers: { apikey: env.key } }).catch(() => null);
  if (!res) return null;
  const body = (await res.json().catch(() => null)) as { code?: string } | null;
  // existe: 200 (pública) ou 401/403 (sem acesso do visitante); não existe: PGRST205 / 404
  if (body && !Array.isArray(body) && (body.code === "PGRST205" || body.code === "42P01")) return false;
  return res.status === 200 || res.status === 401 || res.status === 403;
}

test.describe("seguir heróis (visitante)", () => {
  test("aba Hero: Seguir leva ao login e volta para a mesma página; sem a tabela, sem botão", async ({ page }) => {
    const follows = await tableExists("hero_favorites");
    await page.goto("/personalities");
    await expect(page.locator("main h1").first()).toBeVisible();
    const buttons = page.getByTestId("follow-button");
    if (follows === false) {
      await expect(buttons).toHaveCount(0);
      return;
    }
    test.skip(follows === null, "sem como consultar o banco");
    await expect(buttons.first()).toBeVisible();
    await expect(buttons.first()).toHaveAttribute("href", `/login?next=${encodeURIComponent("/personalities")}`);
    await expect(buttons.first()).toContainText("Seguir");
    // alvo de toque de 44px
    expect((await buttons.first().boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  });

  test("página do herói: Seguir no cabeçalho com a contagem de seguidores (0056)", async ({ page }) => {
    const [follows, counts] = await Promise.all([tableExists("hero_favorites"), tableExists("creator_follower_counts")]);
    await page.goto("/personalities/neymar");
    await expect(page.getByRole("heading", { level: 1, name: "Neymar" })).toBeVisible();
    if (follows === false) {
      await expect(page.getByTestId("hero-follow")).toHaveCount(0);
      return;
    }
    test.skip(follows === null, "sem como consultar o banco");
    const follow = page.getByTestId("hero-follow");
    await expect(follow.getByTestId("follow-button")).toHaveAttribute("href", `/login?next=${encodeURIComponent("/personalities/neymar")}`);
    // a contagem é pública e não expõe quem segue; sem a 0056 ela some
    await expect(follow.getByTestId("hero-followers")).toHaveCount(counts ? 1 : 0);
    if (counts) await expect(follow.getByTestId("hero-followers")).toContainText(/seguidor/);
  });

  test("Início do visitante: sem abas Seguindo | Todos; Seguir no cabeçalho dos posts", async ({ page }) => {
    const follows = await tableExists("hero_favorites");
    await page.goto("/inicio");
    await expect(page.getByTestId("feed-post").first()).toBeVisible();
    await expect(page.getByTestId("feed-tabs")).toHaveCount(0);
    const postFollow = page.getByTestId("feed-post").first().getByTestId("follow-button");
    await expect(postFollow).toHaveCount(follows === false ? 0 : 1);
  });

  test("/profile/herois pede login", async ({ page }) => {
    await page.goto("/profile/herois");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("seguir heróis (conta demo, só leitura)", () => {
  test("Início com abas, Heróis que sigo e Hoje/Evolução renderizam", async ({ page }) => {
    const follows = await tableExists("hero_favorites");
    await loginAs(page, "premium", { home: null });

    await page.goto("/inicio");
    if (follows === false) {
      await expect(page.getByTestId("feed-tabs")).toHaveCount(0);
    } else {
      const tabs = page.getByTestId("feed-tabs");
      await expect(tabs).toBeVisible();
      // padrão: Seguindo para quem segue alguém, Todos para o resto (a aba fica no data-tab)
      const tab = await tabs.getAttribute("data-tab");
      expect(["seguindo", "todos"]).toContain(tab);
      await expect(page.getByTestId(`feed-tab-${tab}`)).toHaveAttribute("aria-current", "page");
      await page.goto("/inicio?feed=todos");
      await expect(page.getByTestId("feed-tabs")).toHaveAttribute("data-tab", "todos");
      await expect(page.getByTestId("feed-post").first()).toBeVisible();
    }

    await page.goto("/profile/herois");
    await expect(page.getByRole("heading", { level: 1, name: "Heróis que sigo" })).toBeVisible();

    // Hoje e Evolução seguem de pé com ou sem a 0056 (a comparação só aparece com Hero escolhido)
    await page.goto("/profile/today");
    await expect(page.locator("main h1").first()).toBeVisible();
    await page.goto("/profile/evolution");
    await expect(page.locator("main h1").first()).toBeVisible();
    const compare = page.getByTestId("hero-compare");
    if ((await compare.count()) > 0) await expect(compare).toContainText(/referência/i);
  });
});
