import { permanentRedirect } from "next/navigation";

// O app é gratuito (decisão do responsável, 31/10/2026): não há mais plano nem assinatura simulada.
// A rota fica só para links antigos não darem 404 e leva ao Perfil.
export default function PlanPage() {
  permanentRedirect("/profile");
}
