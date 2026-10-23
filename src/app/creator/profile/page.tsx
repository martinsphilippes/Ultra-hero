import { redirect } from "next/navigation";

// O perfil do herói passou para a tela Perfil (/profile, seção "Seu perfil de herói"): o endereço antigo
// (favoritos, links salvos, menus antigos) leva direto para lá. As actions continuam nesta pasta.
export default function CreatorProfilePage() {
  redirect("/profile#perfil-publico");
}
