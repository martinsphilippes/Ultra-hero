import { readFileSync } from "node:fs";
import path from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CreatorProfileForm } from "@/components/creator/CreatorProfileForm";
import { heroProfileFor } from "@/components/creator/hero-access";
import { ProfileDataForm } from "@/components/me/ProfileDataForm";
import commonMessages from "../../messages/pt-BR/common.json";
import creatorMessages from "../../messages/pt-BR/creator.json";
import editorsMessages from "../../messages/pt-BR/editors.json";
import meMessages from "../../messages/pt-BR/me.json";
import enMe from "../../messages/en/me.json";
import esMe from "../../messages/es/me.json";

// Correções da revisão do perfil do herói no /profile: a seção exige o papel (como o portal), a nota
// "a foto é enviada em Dados" fica no lugar do envio de foto e descreve o grupo do avatar, e em Dados
// o herói lê que a ilustração dali vale só no app.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
vi.mock("@/app/creator/profile/actions", () => ({ updateCreatorProfile: async () => ({ ok: true }) }));
vi.mock("@/app/(app)/profile/actions", () => ({ updateProfile: async () => ({ ok: true }) }));
vi.mock("@/app/(app)/profile/avatar-actions", () => ({ uploadAvatar: async () => ({ ok: true }), removeAvatar: async () => ({ ok: true }) }));

function render(children: ReactNode) {
  return renderToStaticMarkup(
    // arquivo .ts (sem JSX): o tipo do provider exige children nas props
    // eslint-disable-next-line react/no-children-prop
    createElement(NextIntlClientProvider, {
      locale: "pt-BR",
      timeZone: "America/Sao_Paulo",
      messages: { common: commonMessages, creator: creatorMessages, editors: editorsMessages, me: meMessages },
      children,
    }),
  );
}

describe("seção do herói no /profile: só com o papel", () => {
  const profile = { id: "c1" };
  it("creator ou admin veem o perfil; sem o papel (mesmo com a linha em creator_profiles) não", () => {
    expect(heroProfileFor(["consumer", "creator"], profile)).toBe(profile);
    expect(heroProfileFor(["admin"], profile)).toBe(profile);
    // papel tirado pelo admin, perfil ainda vinculado e ativo
    expect(heroProfileFor(["consumer"], profile)).toBeNull();
    expect(heroProfileFor(["seller"], profile)).toBeNull();
    expect(heroProfileFor([], profile)).toBeNull();
    expect(heroProfileFor(["creator"], null)).toBeNull();
  });

  it("a página usa a regra para a seção e para os textos de herói em Dados", () => {
    const source = readFileSync(path.resolve(__dirname, "../../src/app/(app)/profile/page.tsx"), "utf8");
    expect(source).toMatch(/const heroProfile = heroProfileFor\(\s*roles\.map\(\(r\) => r\.role\),\s*creator\.profile,?\s*\);/);
    expect(source).not.toMatch(/const heroProfile = creator\.profile/);
  });
});

const formProps = {
  initial: { headline: "", bio: "", avatar_url: "/placeholders/avatar-4.svg", cover_url: "", socials: { instagram: "", youtube: "", site: "" } },
  pillars: ["training"],
  name: "Helena",
};

describe("nota da foto no formulário do herói", () => {
  it("fica no cartão do avatar, logo antes das ilustrações, e descreve o grupo", () => {
    const html = render(createElement(CreatorProfileForm, { ...formProps, showPhotoPicker: false, photoNote: createElement("a", { href: "#dados" }, "Dados") }));
    const note = html.match(/<p id="([^"]+)"[^>]*data-testid="profile-hero-photo-note"[^>]*>/);
    expect(note).not.toBeNull();
    const noteId = note![1];
    const group = html.match(/<div role="radiogroup" aria-labelledby="([^"]+-avatar)" aria-describedby="([^"]+)"/);
    expect(group).not.toBeNull();
    expect(group![2]).toBe(noteId);
    // ordem: Headline/Bio → nota → grupo do avatar (no mesmo cartão: nada de cartão entre eles)
    const headlineAt = html.indexOf("Headline");
    const noteAt = html.indexOf('data-testid="profile-hero-photo-note"');
    const groupAt = html.indexOf(group![0]);
    expect(headlineAt).toBeLessThan(noteAt);
    expect(noteAt).toBeLessThan(groupAt);
    expect(html.slice(noteAt, groupAt)).not.toContain("rounded-2xl border");
    // a capa não ganha a descrição
    expect(html).toMatch(/<div role="radiogroup" aria-labelledby="[^"]+-cover" class=/);
  });

  it("sem nota (ou com o envio de foto) nada muda no grupo do avatar", () => {
    const html = render(createElement(CreatorProfileForm, { ...formProps, showPhotoPicker: false }));
    expect(html).not.toContain("profile-hero-photo-note");
    expect(html).toMatch(/<div role="radiogroup" aria-labelledby="[^"]+-avatar" class=/);
  });
});

describe("ilustrações em Dados para o herói", () => {
  const dataProps = { displayName: "Helena", avatarUrl: "/placeholders/avatar-3.svg", locale: "pt-BR" as const, theme: "dark" as const, photoState: { upload: "not_configured" as const, canRemove: false } };

  it("herói: legenda 'vale só no app' ligada ao grupo das ilustrações", () => {
    const hint = meMessages.profile.data.illustrationsAppOnly;
    const html = render(createElement(ProfileDataForm, { ...dataProps, photoHint: "foto", illustrationsHint: hint }));
    expect(html).toContain(`<p id="avatar-illustrations-app-only" class="type-caption text-fg-muted" data-testid="avatar-illustrations-app-only">${hint}</p>`);
    expect(html).toContain('<div role="radiogroup" aria-labelledby="avatar-illustrations-label" aria-describedby="avatar-illustrations-app-only"');
  });

  it("quem não é herói: nada muda", () => {
    const html = render(createElement(ProfileDataForm, dataProps));
    expect(html).not.toContain("avatar-illustrations-app-only");
    expect(html).toContain('<div role="radiogroup" aria-labelledby="avatar-illustrations-label" class=');
  });

  it("o texto existe nos 3 idiomas e aponta para 'Seu perfil de herói'", () => {
    expect(meMessages.profile.data.illustrationsAppOnly).toContain(creatorMessages.profile.title);
    expect(enMe.profile.data.illustrationsAppOnly).toContain("Your hero profile");
    expect(esMe.profile.data.illustrationsAppOnly).toContain("Tu perfil de héroe");
  });
});
