import { expect, test } from "@playwright/test";

// Atalho na Tela de Início: ícones do manifesto e telas de abertura do iPhone com a marca Groscove Ultra.
// Só leitura.
test("ícones do manifesto e telas de abertura do iOS existem", async ({ page, request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.name).toBe("Groscove Ultra");
  for (const icon of manifest.icons as { src: string }[]) {
    const res = await request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  }

  await page.goto("/personalities");
  const splash = await page.locator('link[rel="apple-touch-startup-image"]').evaluateAll((links) => links.map((l) => l.getAttribute("href")!));
  expect(splash.length).toBeGreaterThanOrEqual(10);
  for (const href of splash) {
    const res = await request.get(href);
    expect(res.status(), href).toBe(200);
  }
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});
