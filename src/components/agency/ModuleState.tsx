import { Building2, ShieldAlert, Wrench } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui";

type Props = { state: "unavailable" | "demo_forbidden" | "none"; portal: "agency" | "brand" };

// Estados do portal sem conteúdo: migração ainda não chegou, conta de demonstração sem vínculo, ou
// pessoa sem agência/marca (convite revogado, vínculo arquivado).
export async function ModuleState({ state, portal }: Props) {
  const t = await getTranslations("agency.module");
  const icon = state === "unavailable" ? <Wrench /> : state === "demo_forbidden" ? <ShieldAlert /> : <Building2 />;
  return (
    <div className="rounded-2xl border border-border bg-surface" data-testid={state === "unavailable" ? "module-unavailable" : `module-${state}`}>
      <EmptyState icon={icon} title={t(`${state}.title`)} description={t(`${state}.${portal}`)} />
    </div>
  );
}
