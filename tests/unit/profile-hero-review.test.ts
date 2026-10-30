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
import { Avatar } from "@/components/ui";
import enAdmin from "../../messages/en/adminOps.json";
import esAdmin from "../../messages/es/adminOps.json";
import ptAdmin from "../../messages/pt-BR/adminOps.json";
import commonMessages from "../../messages/pt-BR/common.json";
import creatorMessages from "../../messages/pt-BR/creator.json";
import editorsMessages from "../../messages/pt-BR/editors.json";
import meMessages from "../../messages/pt-BR/me.json";
import enCreator from "../../messages/en/creator.json";
import enMe from "../../messages/en/me.json";
import esCreator from "../../messages/es/creator.json";
import esMe from "../../messages/es/me.json";

// Perfil do herói no /profile: o topo exige o papel (como o portal); o editor "Editar perfil" fica
// recolhido; um avatar só para o herói ativo (só foto real, no editor; nada de avatar em Dados) e a
// capa só com foto real (envio próprio, 0042). Nenhuma ilustração em lugar nenhum.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
vi.mock("@/app/creator/profile/actions", () => ({ updateCreatorProfile: async () => ({ ok: true }) }));
vi.mock("@/app/(app)/profile/actions", () => ({ updateProfile: async () => ({ ok: true }) }));
vi.mock("@/app/(app)/profile/avatar-actions", () => ({ uploadAvatar: async () => ({ ok: true }), removeAvatar: async () => ({ ok: true }) }));
vi.mock("@/app/creator/profile/cover-actions", () => ({ uploadHeroCover: async () => ({ ok: true }), removeHeroCover: async () => ({ ok: true }) }));

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
  initial: { headline: "", bio: "", socials: { instagram: "", youtube: "", site: "" } },
  avatarUrl: null as string | null,
  coverUrl: null as string | null,
  name: "Érick Jacquin",
};
const photoState = { upload: "not_configured" as const, canRemove: false };
const coverState = { upload: "not_configured" as const, canRemove: false };
const count = (html: string, needle: string) => html.split(needle).length - 1;
const read = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
// src das <img> renderizadas (next/image codifica a URL em /_next/image?url=)
const imgSrcs = (html: string) => Array.from(html.matchAll(/<img[^>]*src="([^"]+)"/g), (m) => decodeURIComponent(m[1].replace(/&amp;/g, "&")));

describe("editor do herói: só foto real, sem ilustrações", () => {
  it("perfil ativo: 'Sua foto' com o envio de foto e a capa com envio de foto real; nenhuma grade de ilustrações", () => {
    const html = render(createElement(CreatorProfileForm, { ...formProps, showPhotoPicker: true, photoState, coverState }));
    expect(count(html, 'data-testid="avatar-photo"')).toBe(1);
    const group = html.slice(html.indexOf('data-testid="hero-avatar"'), html.indexOf("</fieldset>", html.indexOf('data-testid="hero-avatar"')));
    expect(group).toContain(`<legend class="text-base font-semibold text-fg">${creatorMessages.profile.avatarTitle}</legend>`);
    expect(group).toContain(creatorMessages.profile.avatarShared);
    // nada de ilustração nem de capa desenhada, nem grade de rádios
    expect(html).not.toContain('role="radiogroup"');
    expect(html).not.toContain("/placeholders/");
    expect(html).not.toContain("Nenhuma opção escolhida");
    // capa: título, superfície lisa ("Sem capa"), câmera traseira e galeria
    expect(count(html, 'data-testid="hero-cover"')).toBe(1);
    expect(html).toContain(creatorMessages.profile.cover.title);
    expect(html).toContain('data-testid="hero-cover-empty"');
    expect(html).toContain(creatorMessages.profile.cover.none);
    expect(html).toMatch(/<input[^>]*capture="environment"[^>]*data-testid="hero-cover-camera-input"/);
    expect(html).toContain('data-testid="hero-cover-gallery-input"');
    // sem a 0042 ou sem service role: indisponível (sem erro), botões desabilitados, sem "Remover capa"
    expect(html).toContain('data-testid="hero-cover-unavailable"');
    expect(html).toContain(creatorMessages.profile.cover.unavailable);
    expect(html).not.toContain(creatorMessages.profile.cover.remove);
  });

  it("sem foto: as iniciais no círculo (nada de ilustração sorteada pelo nome)", () => {
    const html = render(createElement(CreatorProfileForm, { ...formProps, showPhotoPicker: true, photoState, coverState }));
    const picker = html.slice(html.indexOf('data-testid="avatar-photo"'), html.indexOf('data-testid="hero-cover"'));
    expect(picker).toContain(">ÉJ</span>");
    expect(imgSrcs(picker)).toEqual([]);
  });

  it("avatar e capa antigos desenhados salvos no banco aparecem como 'sem foto' e 'sem capa'", () => {
    const html = render(
      createElement(CreatorProfileForm, { ...formProps, avatarUrl: "/placeholders/avatar-4.svg", coverUrl: "/placeholders/cover-training-1.svg", showPhotoPicker: true, photoState, coverState }),
    );
    expect(html).not.toContain("/placeholders/");
    expect(html).toContain(">ÉJ</span>");
    expect(html).toContain('data-testid="hero-cover-empty"');
  });

  it("foto e capa oficiais (fotos reais dos heróis demo) continuam; envio pronto mostra 'Remover capa'", () => {
    const html = render(
      createElement(CreatorProfileForm, {
        ...formProps,
        avatarUrl: "/heroes/erick-jacquin-avatar.webp",
        coverUrl: "/heroes/erick-jacquin-cover.webp",
        showPhotoPicker: true,
        photoState,
        coverState: { upload: "ready" as const, canRemove: true },
      }),
    );
    const srcs = imgSrcs(html);
    expect(srcs.some((src) => src.includes("/heroes/erick-jacquin-avatar.webp"))).toBe(true);
    expect(srcs.some((src) => src.includes("/heroes/erick-jacquin-cover.webp"))).toBe(true);
    expect(html).toContain('data-testid="hero-cover-image"');
    expect(html).not.toContain('data-testid="hero-cover-unavailable"');
    expect(html).toContain(creatorMessages.profile.cover.remove);
  });

  it("perfil inativo (somente leitura): sem envio de foto nem de capa, com o aviso de que a foto do app fica em Dados", () => {
    const html = render(createElement(CreatorProfileForm, { ...formProps, readOnly: true, showPhotoPicker: false, photoState, coverState }));
    expect(html).not.toContain('data-testid="avatar-photo"');
    expect(html).not.toContain('data-testid="hero-cover"');
    expect(html).toContain('data-testid="hero-cover-readonly"');
    expect(html).toContain(creatorMessages.profile.avatarReadOnly);
    expect(html).not.toContain(creatorMessages.profile.avatarShared);
  });
});

describe("Avatar: só foto real; sem foto, as iniciais", () => {
  it("sem foto, com ilustração antiga ou URL de outro host: iniciais sobre a cor sólida; foto real aparece", () => {
    for (const src of [null, "", "/placeholders/avatar-1.svg", "/placeholders/avatar-6.svg", "https://lh3.googleusercontent.com/a/foto"]) {
      const html = renderToStaticMarkup(createElement(Avatar, { src, name: "Érick Jacquin", size: "xl", alt: "" }));
      expect(html).toContain(">ÉJ</span>");
      expect(html).not.toContain("<img");
      expect(html).toContain("bg-surface-elevated");
    }
    const html = renderToStaticMarkup(createElement(Avatar, { src: "/heroes/erick-jacquin-avatar.webp", name: "Érick Jacquin", alt: "" }));
    expect(html).toContain("<img");
    expect(html).not.toContain(">ÉJ</span>");
  });

  it("nenhuma tela usa mais ilustração de reserva (cabeçalho, página pública, card, menu)", () => {
    for (const file of [
      "src/components/creator/HeroProfileTop.tsx",
      "src/app/(app)/personalities/[slug]/page.tsx",
      "src/components/catalog/CreatorCard.tsx",
      "src/lib/auth/session.ts",
      "src/components/ui/avatar.tsx",
      "src/components/ui/avatar-image.tsx",
      "src/components/me/AvatarPhotoPicker.tsx",
      "src/components/admin-ops/CreatorForm.tsx",
    ]) {
      const source = read(file);
      expect(source, file).not.toMatch(/HERO_DEFAULT_AVATAR|heroAvatarSrc|ILLUSTRATIONS|placeholders\/avatar|placeholders\/cover|fallbackSrc/);
    }
    expect(read("src/components/creator/HeroProfileTop.tsx")).toContain("<Avatar src={profile.avatar_url}");
    expect(read("src/components/catalog/CreatorCard.tsx")).toContain("<HeroCoverImage src={creator.cover_url}");
    expect(read("src/app/(app)/profile/page.tsx")).not.toContain("{/* Visão geral */}");
  });
});

describe("Dados: foto só pelo envio", () => {
  const dataProps = { displayName: "Érick", avatarUrl: "/placeholders/avatar-3.svg", locale: "pt-BR" as const, theme: "dark" as const, photoState };

  it("herói ativo: sem avatar nem atalho repetido ('Editar perfil' fica só no topo da página)", () => {
    const html = render(createElement(ProfileDataForm, { ...dataProps, avatarInHeroEditor: true }));
    expect(html).not.toContain('data-testid="avatar-in-hero-editor"');
    expect(html).not.toContain("Editar perfil");
    expect(html).not.toContain('data-testid="avatar-photo"');
    expect(html).not.toContain('name="avatar"');
  });

  it("quem não é herói (ou herói inativo): a foto fica em Dados, sem ilustrações; ilustração antiga vira as iniciais", () => {
    const html = render(createElement(ProfileDataForm, dataProps));
    expect(html).toContain('data-testid="avatar-photo"');
    // o único grupo de rádios é o do tema
    expect(html.split('role="radiogroup"').length - 1).toBe(1);
    expect(html).toContain('role="radiogroup" aria-label="Tema"');
    expect(html).not.toContain('name="avatar"');
    expect(html).not.toContain("avatar-illustrations-label");
    expect(html).not.toContain("/placeholders/");
    expect(html).toContain(">É</span>");
  });

  it("salvar Dados nunca envia o avatar (a action mantém o do banco)", () => {
    expect(profileDataInput({ name: " Érick ", locale: "pt-BR", theme: "dark" })).toEqual({ displayName: "Érick", locale: "pt-BR", theme: "dark" });
    expect(profileDataInput({ name: "Érick", locale: "pt-BR", theme: "dark" })).not.toHaveProperty("avatarUrl");
  });
});

describe("Editar perfil recolhido", () => {
  it("fechado por padrão: botão com aria-expanded/aria-controls, região escondida com título h2 focável e dois Fechar", () => {
    // arquivo .ts (sem JSX): o tipo das props exige children
    // eslint-disable-next-line react/no-children-prop
    const html = render(createElement(HeroEditorDisclosure, { publicHref: "/personalities/erick-jacquin", children: createElement("p", null, "conteúdo") }));
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="editar-perfil"[^>]*>.*Editar perfil<\/span><\/button>/);
    expect(html).toMatch(/<section id="editar-perfil" aria-labelledby="hero-editor-title" hidden=""/);
    expect(html).toContain('<h2 id="hero-editor-title" tabindex="-1"');
    expect(count(html, ">Fechar</span></button>")).toBe(2);
    // o link da página pública vem depois do botão (o Portal do herói continua o primeiro link da página)
    expect(html).toContain('href="/personalities/erick-jacquin"');
    expect(html.indexOf("Editar perfil")).toBeLessThan(html.indexOf('href="/personalities/erick-jacquin"'));
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
      for (const key of ["editProfile", "editorTitle", "editorDescription", "close", "avatarTitle", "avatarShared", "avatarReadOnly", "photoHint"] as const) {
        expect(creator.profile[key].length).toBeGreaterThan(2);
      }
      for (const key of ["title", "hint", "none", "take", "gallery", "remove", "unavailable", "disabled", "limits", "previewTitle", "use"] as const) {
        expect(creator.profile.cover[key].length).toBeGreaterThan(2);
      }
      expect(Object.keys(creator.profile.cover.errors).length).toBe(12);
      expect(creator.errors.avatar_not_saved.length).toBeGreaterThan(10);
      expect(creator.profile).not.toHaveProperty("photoInData");
      expect(creator.profile).not.toHaveProperty("avatar");
      // ilustrações e grade de capas saíram
      for (const gone of ["illustrations", "optionN", "noneSelected", "photoInUse", "photoWillBeDeleted", "keepPhoto"]) {
        expect(creator.profile).not.toHaveProperty(gone);
      }
    }
    for (const me of [meMessages, enMe, esMe]) {
      expect(me.profile.data).not.toHaveProperty("avatarInHeroEditor");
      expect(me.profile.data).not.toHaveProperty("openHeroEditor");
      expect(me.profile.account.title.length).toBeGreaterThan(3);
      expect(me.profile.data).not.toHaveProperty("title");
      expect(me.profile.data.errors.avatar_not_saved.length).toBeGreaterThan(10);
      expect(me.profile.data).not.toHaveProperty("illustrationsAppOnly");
      for (const gone of ["avatarOption", "illustrations", "illustrationsWhenPhoto", "photoWillBeDeleted", "keepPhoto"]) {
        expect(me.profile.data).not.toHaveProperty(gone);
      }
    }
    for (const admin of [ptAdmin, enAdmin, esAdmin]) {
      for (const gone of ["avatar", "cover", "placeholderOption", "photoKeep"]) {
        expect(admin.creators.form).not.toHaveProperty(gone);
      }
      expect(admin.creators.form.coverRemove.length).toBeGreaterThan(3);
      expect(admin.errors.no_cover.length).toBeGreaterThan(3);
    }
  });
});
