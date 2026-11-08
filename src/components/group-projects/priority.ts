// Plano de projetos (0137): cores das prioridades como no PDF da ordem oficial — urgente vermelho, importante
// laranja, estrutural azul, circunstancial cinza.
import type { Priority } from "@/lib/group-projects/format";

export const PRIORITY_CLASS: Record<Priority, string> = {
  urgent: "border-danger/40 bg-danger-soft text-danger",
  important: "border-warning/40 bg-warning-soft text-warning",
  structural: "border-info/40 bg-info-soft text-info",
  circumstantial: "border-border bg-surface-hover text-fg-muted",
};
