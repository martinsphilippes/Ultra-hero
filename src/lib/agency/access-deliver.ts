import "server-only";
import { getTranslations } from "next-intl/server";
import { getOrigin } from "@/lib/auth/origin";
import { sendAccessEmail } from "@/lib/email/access";
import { ACCESS_INVITE_DAYS, type AccessKind, type AccessProvision } from "./access-contact";

// Depois de ligar/convidar (0112): manda o e-mail certo e monta a mensagem da tela. Só no servidor (nunca é uma
// server action: não pode virar um "mande e-mail para qualquer um").
export type AccessOutcome = { account: AccessProvision["account"]; link: string | null; emailed: boolean; message: string };

/** Manda o e-mail certo (convite ou "ligado à sua conta") e monta a mensagem da tela. Usado também na criação. */
export async function deliverAccess(input: { kind: AccessKind; result: AccessProvision; email: string; name: string; agencyName: string }): Promise<AccessOutcome> {
  const t = await getTranslations("agency.access");
  const origin = await getOrigin();
  const who = input.kind === "talent" ? "hero" : "brand";
  if (input.result.account === "invited" && input.result.token) {
    const link = `${origin}/invite?token=${encodeURIComponent(input.result.token)}`;
    const emailed = await sendAccessEmail({ to: input.email, kind: input.kind, outcome: "invited", name: input.name, agencyName: input.agencyName, link, days: ACCESS_INVITE_DAYS });
    return { account: "invited", link, emailed, message: t(`${who}.invitedMessage`, { email: input.email }) };
  }
  if (input.result.account === "linked") {
    const link = `${origin}${input.kind === "talent" ? "/heroi" : "/marca"}`;
    const emailed = await sendAccessEmail({ to: input.email, kind: input.kind, outcome: "linked", name: input.name, agencyName: input.agencyName, link, days: ACCESS_INVITE_DAYS });
    return { account: "linked", link: null, emailed, message: t(`${who}.linkedMessage`, { email: input.email }) };
  }
  return { account: input.result.account, link: null, emailed: false, message: input.result.account === "active" ? t("savedActive") : t("savedPending") };
}

