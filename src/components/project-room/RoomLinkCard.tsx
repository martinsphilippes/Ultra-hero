import { ChevronRight, MessagesSquare, ScrollText, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { RoomAccess } from "@/lib/project-room/queries";
import { clippingHref, roomHref } from "@/lib/project-room/vocab";

// Atalho para a sala do projeto (aberta) ou para o clipping (arquivada) no portal da marca e do Hero (0110).
export async function RoomLinkCard({ portal, dealId, access }: { portal: "brand" | "talent"; dealId: string; access: RoomAccess }) {
  const t = await getTranslations("projectRoom.link");
  const open = access.status === "open";
  const href = open ? roomHref(portal, dealId) : clippingHref(portal, dealId);
  const Icon = open ? (access.ndaNeeded ? ShieldAlert : MessagesSquare) : ScrollText;
  return (
    <Link
      href={href}
      className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-accent-soft/30 p-4 transition-colors hover:bg-accent-soft/50"
      data-testid="room-link"
    >
      <span className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-accent-text" aria-hidden="true" />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-fg">{open ? t("room") : t("clipping")}</span>
          <span className="type-caption text-fg-muted">{open ? (access.ndaNeeded ? t("ndaHint") : t("roomHint")) : t("clippingHint")}</span>
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-fg-muted" aria-hidden="true" />
    </Link>
  );
}
