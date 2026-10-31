"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { AGENCY_COOKIE, getAgencyContext } from "@/lib/agency/server";

// Admin geral escolhe a agência que está vendo (quem é membro tem uma só). O cliente recarrega com
// window.location.replace, sem histórico.
export async function selectAgencyAction(input: { id: string }): Promise<{ ok: boolean }> {
  const parsed = z.object({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false };
  const ctx = await getAgencyContext();
  if (ctx.state !== "ok" || !ctx.platformAdmin || !ctx.agencies.some((a) => a.id === parsed.data.id)) return { ok: false };
  (await cookies()).set(AGENCY_COOKIE, parsed.data.id, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30 });
  return { ok: true };
}
