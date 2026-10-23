import { redirect } from "next/navigation";

// O perfil do herói passou para a tela Perfil (/profile, topo com "Editar perfil"): o endereço antigo
// (favoritos, links salvos, menus antigos) leva direto para lá, e a âncora abre o editor sozinha.
// As actions continuam nesta pasta.
export default function CreatorProfilePage() {
  redirect("/profile#perfil-publico");
}
