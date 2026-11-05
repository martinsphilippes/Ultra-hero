// Âncoras do editor do Hero no Perfil, num módulo comum (sem "use client"): o Perfil é página do servidor e
// usa ACCOUNT_ANCHOR como id; importado de um arquivo "use client", viria só uma referência de cliente.
/** Âncora do topo do Hero (cabeçalho público); o endereço com ela abre o editor. */
export const HERO_ANCHOR = "perfil-publico";
/** Região recolhível do editor (aria-controls do botão). */
export const HERO_EDITOR_ID = "editar-perfil";
/** Parte "Sua conta" dentro do editor (antes a seção Dados); o endereço com ela também abre o editor. */
export const ACCOUNT_ANCHOR = "dados";
