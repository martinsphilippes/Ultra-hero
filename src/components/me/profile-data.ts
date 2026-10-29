// O que a seção Dados do /profile envia para updateProfile. Função pura (formulário e testes).

export type ProfileDataInput = { displayName: string; avatarUrl?: string | null; locale: string; theme: string };

type Draft = { name: string; locale: string; theme: string };

/**
 * Nunca envia o avatar: a foto entra e sai só pelo envio/remoção (AvatarPhotoPicker), já aplicados no
 * servidor. Sem avatarUrl, a action mantém o do banco (um formulário velho não troca nem apaga a foto).
 */
export function profileDataInput({ name, locale, theme }: Draft): ProfileDataInput {
  return { displayName: name.trim(), locale, theme };
}
