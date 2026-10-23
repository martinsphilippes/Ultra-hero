import { readFileSync } from "node:fs";
import path from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CreatorProfileForm } from "@/components/creator/CreatorProfileForm";
import { HeroEditorDisclosure } from "@/components/creator/HeroEditorDisclosure";
import { heroProfileFor } from "@/components/creator/hero-access";
import { ProfileDataForm } from "@/components/me/ProfileDataForm";
import { profileDataInput } from "@/components/me/profile-data";
import commonMessages from "../../messages/pt-BR/common.json";
import creatorMessages from "../../messages/pt-BR/creator.json";
import editorsMessages from "../../messages/pt-BR/editors.json";
import meMessages from "../../messages/pt-BR/me.json";
import enCreator from "../../messages/en/creator.json";
import enMe from "../../messages/en/me.json";
import esCreator from "../../messages/es/creator.json";
import esMe from "../../messages/es/me.json";

// Perfil do herói no /profile: o topo exige o papel (como o portal); o editor "Editar perfil" fica
// recolhido; um avatar só para o herói ativo (foto + ilustrações no editor, nada de avatar em Dados).

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
const photoState = { upload: "not_configured" as const, canRemove: false };
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("um avatar só no editor do herói", () => {
  it("perfil ativo: foto e ilustrações no mesmo grupo 'Sua foto ou ilustração', que vale no app e na página pública", () => {
    const html = render(createElement(CreatorProfileForm, { ...formProps, showPhotoPicker: true, photoState }));
    expect(count(html, 'data-testid="avatar-photo"')).toBe(1);
    const group = html.slice(html.indexOf('data-testid="hero-avatar"'), html.indexOf("</fieldset>", html.indexOf('data-testid="hero-avatar"')));
    expect(group).toContain(`<legend class="text-base font-semibold text-fg">${creatorMessages.profile.avatarTitle}</legend>`);
    expect(group).toContain(creatorMessages.profile.avatarShared);
    // a foto vem antes das ilustrações, no mesmo grupo
    expect(group.indexOf('data-testid="avatar-photo"')).toBeLessThan(group.indexOf('role="radiogroup"'));
    expect(group).toMatch(new RegExp(`<span id="[^"]+-avatar" class="text-sm font-semibold text-fg">${creatorMessages.profile.illustrations}</span>`));
    // nada da nota antiga ("a foto é enviada em Dados")
    expect(html).not.toContain("profile-hero-photo-note");
  });

  it("perfil inativo (somente leitura): sem seletor de foto, com o aviso de que a foto do app fica em Dados", () => {
    const html = render(createElement(CreatorProfileForm, { ...formProps, readOnly: true, showPhotoPicker: false, photoState }));
    expect(html).not.toContain('data-testid="avatar-photo"');
    expect(html).toContain(creatorMessages.profile.avatarReadOnly);
    expect(html).not.toContain(creatorMessages.profile.avatarShared);
  });
});

describe("Dados do herói ativo: sem avatar", () => {
  const dataProps = { displayName: "Helena", avatarUrl: "/placeholders/avatar-3.svg", locale: "pt-BR" as const, theme: "dark" as const, photoState };

  it("no lugar do avatar, o aviso e o botão que abre 'Editar perfil'", () => {
    const html = render(createElement(ProfileDataForm, { ...dataProps, avatarInHeroEditor: true }));
    expect(html).toContain('data-testid="avatar-in-hero-editor"');
    expect(html).toContain(meMessages.profile.data.avatarInHeroEditor);
    expect(html).toMatch(new RegExp(`<button[^>]*type="button"[^>]*>.*${meMessages.profile.data.openHeroEditor}</span></button>`));
    expect(html).not.toContain('data-testid="avatar-photo"');
    expect(html).not.toContain("avatar-illustrations-label");
    expect(html).not.toContain('name="avatar"');
  });

  it("quem não é herói (ou herói inativo): o avatar continua em Dados, como antes", () => {
    const html = render(createElement(ProfileDataForm, dataProps));
    expect(html).not.toContain("avatar-in-hero-editor");
    expect(html).toContain('data-testid="avatar-photo"');
    expect(html).toContain('<div role="radiogroup" aria-labelledby="avatar-illustrations-label" class=');
  });

  it("salvar Dados do herói nunca envia o avatar, mesmo que o estado diga que mexeu", () => {
    const draft = { name: " Helena ", avatar: "/placeholders/avatar-2.svg", avatarTouched: true, locale: "pt-BR", theme: "dark" };
    expect(profileDataInput({ ...draft, avatarHere: false })).toEqual({ displayName: "Helena", locale: "pt-BR", theme: "dark" });
    expect(profileDataInput({ ...draft, avatarHere: false })).not.toHaveProperty("avatarUrl");
    // fora do herói ativo: só quando a pessoa mexeu
    expect(profileDataInput({ ...draft, avatarHere: true })).toEqual({ displayName: "Helena", avatarUrl: "/placeholders/avatar-2.svg", locale: "pt-BR", theme: "dark" });
    expect(profileDataInput({ ...draft, avatarHere: true, avatarTouched: false })).not.toHaveProperty("avatarUrl");
  });
});

describe("Editar perfil recolhido", () => {
  it("fechado por padrão: botão com aria-expanded/aria-controls, região escondida com título h2 focável e dois Fechar", () => {
    // arquivo .ts (sem JSX): o tipo das props exige children
    // eslint-disable-next-line react/no-children-prop
    const html = render(createElement(HeroEditorDisclosure, { publicHref: "/personalities/helena-vilar", children: createElement("p", null, "conteúdo") }));
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="editar-perfil"[^>]*>.*Editar perfil<\/span><\/button>/);
    expect(html).toMatch(/<section id="editar-perfil" aria-labelledby="hero-editor-title" hidden=""/);
    expect(html).toContain('<h2 id="hero-editor-title" tabindex="-1"');
    expect(count(html, ">Fechar</span></button>")).toBe(2);
    // o link da página pública vem depois do botão (o Portal do herói continua o primeiro link da página)
    expect(html).toContain('href="/personalities/helena-vilar"');
    expect(html.indexOf("Editar perfil")).toBeLessThan(html.indexOf('href="/personalities/helena-vilar"'));
  });

  it("perfil inativo: sem o link da página pública", () => {
    // arquivo .ts (sem JSX): o tipo das props exige children
    // eslint-disable-next-line react/no-children-prop
    const html = render(createElement(HeroEditorDisclosure, { publicHref: null, children: null }));
    expect(html).not.toContain("/personalities/");
    expect(html).toContain('aria-controls="editar-perfil"');
  });
});

describe("mensagens novas nos 3 idiomas e as antigas fora", () => {
  it("existem e são texto simples", () => {
    for (const creator of [creatorMessages, enCreator, esCreator]) {
      for (const key of ["editProfile", "editorTitle", "editorDescription", "close", "avatarTitle", "avatarShared", "avatarReadOnly", "illustrations"] as const) {
        expect(creator.profile[key].length).toBeGreaterThan(2);
      }
      expect(creator.errors.avatar_not_saved.length).toBeGreaterThan(10);
      expect(creator.profile).not.toHaveProperty("photoInData");
      expect(creator.profile).not.toHaveProperty("avatar");
    }
    for (const me of [meMessages, enMe, esMe]) {
      expect(me.profile.data.avatarInHeroEditor).toContain(me === meMessages ? "Editar perfil" : me === enMe ? "Edit profile" : "Editar perfil");
      expect(me.profile.data.openHeroEditor.length).toBeGreaterThan(2);
      expect(me.profile.data.errors.avatar_not_saved.length).toBeGreaterThan(10);
      expect(me.profile.data).not.toHaveProperty("illustrationsAppOnly");
    }
  });
});
