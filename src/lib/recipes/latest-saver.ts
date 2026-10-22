// Gravação em que a última escolha vence (a nota por estrelas). Enquanto uma gravação está em curso,
// novas escolhas só trocam o valor pendente, sem desabilitar os controles: o foco do teclado fica no
// rádio escolhido e as setas continuam funcionando. Ao terminar, grava o valor mais recente; as
// escolhas intermediárias não chegam ao banco.

type SaveResult<E> = { ok: true } | { ok: false; error: E };

export type LatestSaveOutcome<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function createLatestSaver<T, E>(save: (value: T) => Promise<SaveResult<E>>) {
  let running = false;
  let wanted: T;
  return {
    /**
     * Pede para gravar `value`. Devolve o resultado da fila quando esta chamada abriu a gravação, ou
     * null quando só trocou o valor pendente de uma gravação em curso (ela leva esta escolha).
     */
    async submit(value: T): Promise<LatestSaveOutcome<T, E> | null> {
      wanted = value;
      if (running) return null;
      running = true;
      try {
        let sent: T;
        do {
          sent = wanted;
          const result = await save(sent);
          if (!result.ok) return { ok: false, error: result.error };
        } while (!Object.is(wanted, sent));
        return { ok: true, value: sent };
      } finally {
        running = false;
      }
    },
  };
}
