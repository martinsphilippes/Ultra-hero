import { randomInt } from "node:crypto";

// Senha gerada no cadastro rápido: fácil de anotar à mão, sem caracteres que se confundem
// (0/O, 1/l/I, i). Formato "Xxxx-xxxx-xxxx": 12 sorteados + 2 hífens = 14 caracteres, com maiúscula,
// minúscula, dígito e símbolo (passa em qualquer regra de senha do Auth). ~59 bits de entropia.

export const PASSWORD_LETTERS = "abcdefghjkmnpqrstuvwxyz";
export const PASSWORD_DIGITS = "23456789";
export const PASSWORD_ALPHABET = PASSWORD_LETTERS + PASSWORD_DIGITS;
export const PASSWORD_GROUPS = 3;
export const PASSWORD_GROUP_SIZE = 4;
export const GENERATED_PASSWORD_PATTERN = /^[A-HJKMNP-Z][a-hjkmnp-z2-9]{3}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/;

/** Entropia (bits) do formato: 1ª letra (23 opções) + 11 sorteios no alfabeto de 31. */
export function generatedPasswordEntropyBits(): number {
  const n = PASSWORD_GROUPS * PASSWORD_GROUP_SIZE;
  return Math.log2(PASSWORD_LETTERS.length) + (n - 1) * Math.log2(PASSWORD_ALPHABET.length);
}

type RandomInt = (max: number) => number;

/** Gera a senha com sorteio sem viés (crypto.randomInt). `rand` só para teste. */
export function generatePassword(rand: RandomInt = (max) => randomInt(max)): string {
  const n = PASSWORD_GROUPS * PASSWORD_GROUP_SIZE;
  for (;;) {
    const chars: string[] = [PASSWORD_LETTERS[rand(PASSWORD_LETTERS.length)].toUpperCase()];
    for (let i = 1; i < n; i++) chars.push(PASSWORD_ALPHABET[rand(PASSWORD_ALPHABET.length)]);
    // pelo menos 2 dígitos para ficar com cara de senha e passar em regras de complexidade
    if (chars.filter((c) => PASSWORD_DIGITS.includes(c)).length < 2) continue;
    const groups: string[] = [];
    for (let g = 0; g < PASSWORD_GROUPS; g++) groups.push(chars.slice(g * PASSWORD_GROUP_SIZE, (g + 1) * PASSWORD_GROUP_SIZE).join(""));
    return groups.join("-");
  }
}
