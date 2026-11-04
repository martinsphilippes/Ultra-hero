import { launchDateLabel } from "@/lib/launch";
import type { WelcomeArea } from "@/lib/welcome/areas";
import { getWelcomeState } from "@/lib/welcome/server";
import { WelcomeTour } from "./WelcomeTour";

// Monta o card de boas-vindas da área no layout (só com sessão). Abre sozinho só no primeiro acesso.
export async function WelcomeTourMount({ area }: { area: WelcomeArea }) {
  const state = await getWelcomeState(area);
  if (!state.mounted) return null;
  return <WelcomeTour area={area} initialOpen={state.initialOpen} launchDate={launchDateLabel()} />;
}
