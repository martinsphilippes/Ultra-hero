// O que a seção Dados do /profile envia para updateProfile. Função pura (formulário e testes).

export type ProfileDataInput = { displayName: string; avatarUrl?: string | null; locale: string; theme: string };

type Draft = {
  name: string;
  avatar: string | null;
  /** A pessoa mexeu no avatar neste formulário. */
  avatarTouched: boolean;
  /** O avatar é editado em Dados. Herói ativo: não (fica em "Editar perfil"). */
  avatarHere: boolean;
  locale: string;
  theme: string;
};

/** Avatar só vai junto quando é editado aqui e a pessoa mexeu nele; sem ele, a action mantém o do banco. */
export function profileDataInput({ name, avatar, avatarTouched, avatarHere, locale, theme }: Draft): ProfileDataInput {
  const input: ProfileDataInput = { displayName: name.trim(), locale, theme };
  if (avatarHere && avatarTouched) input.avatarUrl = avatar;
  return input;
}
