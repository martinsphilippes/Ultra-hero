import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Arquivo "use server" só pode exportar funções async: uma constante exportada faz o Next recusar o módulo
// inteiro em produção (erro E352) e todas as actions dele quebram (aconteceu com o aceite de convite).
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('arquivos "use server"', () => {
  it("exportam só funções (tipos são apagados no build)", () => {
    const offenders = files("src")
      .filter((f) => /^\s*["']use server["']/.test(readFileSync(f, "utf8")))
      .flatMap((f) =>
        readFileSync(f, "utf8")
          .split("\n")
          .map((line, i) => ({ line, i }))
          .filter(({ line }) => /^export\s+(const|let|var|class|enum|\{|default\s+(?!async\s+function|function))/.test(line))
          .map(({ i }) => `${f}:${i + 1}`),
      );
    expect(offenders).toEqual([]);
  });
});
