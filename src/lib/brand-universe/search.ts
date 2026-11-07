/** Chave de busca do nome da marca: minúsculas, sem acento e sem nada além de letras e números. */
export function brandSearchKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
