import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { requireAgency } from "@/lib/agency/server";
import { getTalent } from "@/lib/talent/queries";

// Ficha do talento: a agência do contexto e o talento (a RLS já limita à agência).
export const loadTalent = cache(async (id: string) => {
  const ctx = await requireAgency("staff");
  const talent = await getTalent(ctx.agency.id, id);
  if (!talent) notFound();
  return { ctx, talent };
});
