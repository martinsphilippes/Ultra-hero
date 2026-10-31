import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { agencyCan, canWorkDeal } from "@/lib/agency/roles";
import { requireAgency } from "@/lib/agency/server";
import { getUser } from "@/lib/auth/session";
import { getDeal } from "@/lib/deals/queries";

// Ficha do negócio: agência do contexto, o negócio (a RLS já limita: o colaborador só vê os dele) e
// quem pode mexer (gestor+ ou colaborador responsável/na equipe).
export const loadDeal = cache(async (id: string) => {
  const ctx = await requireAgency("staff");
  const [deal, user] = await Promise.all([getDeal(ctx.agency.id, id), getUser()]);
  if (!deal) notFound();
  const isOwner = Boolean(user && (deal.ownerId === user.id || deal.team.includes(user.id)));
  const canEdit = canWorkDeal(ctx.role, isOwner, ctx.platformAdmin) && deal.stage !== "closed";
  const isManager = agencyCan(ctx.role, "manager", ctx.platformAdmin);
  const isAdmin = agencyCan(ctx.role, "admin", ctx.platformAdmin);
  return { ctx, deal, isOwner, canEdit, isManager, isAdmin, userId: user?.id ?? null };
});
