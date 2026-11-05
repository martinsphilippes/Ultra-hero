import { CalendarDays, ChevronRight, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import type { MyRoom } from "@/lib/project-room/queries";
import { roomHref, type RoomPortal } from "@/lib/project-room/vocab";

// "Meus projetos" (staff externo) e as salas do Hero: cada sala aberta com a próxima diária e o NDA pendente.
export async function MyRoomsList({ rooms, portal }: { rooms: MyRoom[]; portal: RoomPortal }) {
  const [t, locale] = await Promise.all([getTranslations("projectRoom.mine"), getLocale() as Promise<Locale>]);
  return (
    <ul className="flex flex-col gap-2" data-testid="my-rooms">
      {rooms.map((r) => (
        <li key={r.dealId}>
          <Link href={roomHref(portal, r.dealId)} className="flex min-h-11 items-center gap-3 rounded-2xl border border-border bg-surface p-4 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" data-testid="my-room">
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-sm font-semibold text-fg">{r.title}</span>
              <span className="truncate type-caption text-fg-muted">{[r.service, r.agency, r.role].filter(Boolean).join(" · ")}</span>
              {r.nextShoot ? (
                <span className="flex items-center gap-1 type-caption text-fg">
                  <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
                  {t("nextShoot", { date: formatDate(r.nextShoot.startsAt, locale, { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }), place: r.nextShoot.location })}
                </span>
              ) : null}
              {r.ndaNeeded ? (
                <Badge size="sm" variant="warning" icon={<ShieldAlert />} className="w-fit">
                  {t("ndaNeeded")}
                </Badge>
              ) : null}
            </span>
            <ChevronRight className="size-5 shrink-0 text-fg-subtle" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
