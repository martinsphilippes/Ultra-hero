import { Archive, FileText, Pin, ScrollText, Users } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { RoadmapProgress } from "@/components/roadmap/RoadmapProgress";
import { Badge, buttonBase, buttonSizes, buttonVariants } from "@/components/ui";
import type { RoomView } from "@/lib/project-room/queries";
import { clippingHref, type RoomPortal } from "@/lib/project-room/vocab";
import { cn } from "@/lib/utils";
import { FeedbackForm } from "./FeedbackForm";
import { GuideButton } from "./GuideButton";
import { NdaGate } from "./NdaGate";
import { RoomManage } from "./RoomManage";
import { RoomThread } from "./RoomThread";
import { ShootDayCard } from "./ShootDayCard";
import { StaffPanel } from "./StaffPanel";

type Props = { portal: RoomPortal; room: RoomView };

// Sala do projeto (0110): substitui o grupo de WhatsApp do staff. Fixados (normas, briefing, diária, guia de uso), a
// conversa única e quem está na sala; ferramentas da agência; pesquisa do cliente. O que cada lado vê vem do banco.
export async function ProjectRoom({ portal, room }: Props) {
  const t = await getTranslations("projectRoom.room");
  if (room.locked === "nda") return <NdaGate portal={portal} dealId={room.deal.id} dealTitle={room.deal.title} agency={room.deal.agency} />;
  const counts = { agency: 0, talent: 0, staff: 0, brand: 0 };
  for (const m of room.members) if (m.side !== "staff" || m.status === "active") counts[m.side] += 1;
  const total = counts.agency + counts.talent + counts.staff + counts.brand;
  const archived = room.status === "archived";
  const pendingFeedback = room.side === "brand" || room.side === "talent" ? room.feedback.filter((f) => f.party === room.side && f.answeredAt === null) : [];
  const card = "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4";
  const showClipping = portal !== "staff";

  return (
    <div className="flex flex-col gap-5" data-testid="project-room" data-side={room.side}>
      <section className={card}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-fg">{t("title", { deal: room.deal.title })}</h2>
          <Badge size="sm" variant={archived ? "neutral" : "success"} icon={archived ? <Archive /> : undefined}>
            {archived ? t("archived") : t("open")}
          </Badge>
        </div>
        <p className="type-caption text-fg-muted">
          {[room.deal.service, t("people", { n: total })].filter(Boolean).join(" · ")}
        </p>
        <p className="flex flex-wrap gap-1.5">
          {(["agency", "talent", "staff", "brand"] as const)
            .filter((k) => counts[k] > 0)
            .map((k) => (
              <Badge key={k} size="sm" variant="neutral">
                {t(`count.${k}`, { n: counts[k] })}
              </Badge>
            ))}
        </p>
        {room.progress ? <RoadmapProgress progress={room.progress} compact /> : null}
        {archived ? <p className="rounded-xl border border-dashed border-border px-3 py-2 type-body-sm text-fg-muted">{t("archivedHint")}</p> : <p className="type-caption text-fg-subtle">{t("closingHint")}</p>}
        {showClipping ? (
          <Link href={clippingHref(portal, room.deal.id)} className={cn(buttonBase, buttonVariants.secondary, buttonSizes.md, "w-full sm:w-fit")} data-testid="room-clipping-link">
            <ScrollText className="size-4" aria-hidden="true" />
            {t("clipping")}
          </Link>
        ) : null}
      </section>

      {pendingFeedback.map((f) => (
        <FeedbackForm key={f.id} portal={room.side as "brand" | "talent"} dealId={room.deal.id} feedback={f} agency={room.deal.agency} />
      ))}

      <section className={card} aria-label={t("pinned")}>
        <h3 className="flex items-center gap-2 type-caption font-semibold uppercase tracking-wider text-fg-subtle">
          <Pin className="size-4" aria-hidden="true" />
          {t("pinned")}
        </h3>
        {room.side === "agency" || room.side === "staff" ? (
          <details className="rounded-xl border border-border bg-bg p-3" open={room.side === "staff"}>
            <summary className="cursor-pointer text-sm font-semibold text-fg">{t("norms")}</summary>
            <p className="mt-2 whitespace-pre-wrap type-body-sm text-fg">{room.norms}</p>
          </details>
        ) : null}
        <div className="rounded-xl border border-border bg-bg p-3">
          <p className="text-sm font-semibold text-fg">{t("briefing")}</p>
          <p className="mt-1 whitespace-pre-wrap type-body-sm text-fg">{room.briefing || t("noBriefing")}</p>
        </div>
        {room.usageGuide ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-bg p-3">
            <FileText className="size-5 text-fg-subtle" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-fg">{t("guide")}</span>
              <span className="block truncate type-caption text-fg-muted">{room.usageGuide.name}</span>
            </span>
            <GuideButton messageId={room.usageGuide.messageId} />
          </div>
        ) : null}
        {room.shootDays.length === 0 ? <p className="type-caption text-fg-muted">{t("noShoot")}</p> : null}
        {room.shootDays.map((d) => (
          <ShootDayCard
            key={d.id}
            portal={portal}
            dealId={room.deal.id}
            dealTitle={room.deal.title}
            day={d}
            timezone={room.timezone}
            canManage={room.canManage}
            showArrivals={room.side === "agency" || room.side === "staff"}
            people={room.members}
            canCheckin={!archived}
          />
        ))}
      </section>

      {room.side === "agency" ? (
        <section className={card} aria-label={t("tools")}>
          <h3 className="text-sm font-semibold text-fg">{t("tools")}</h3>
          <RoomManage
            dealId={room.deal.id}
            briefing={room.briefing}
            ndaHeroes={room.ndaHeroes}
            status={room.status}
            canManage={room.canManage}
            isManager={room.isManager}
            dealClosed={room.deal.stage === "closed"}
            people={room.members}
            timezone={room.timezone}
          />
        </section>
      ) : null}

      <section className="flex flex-col gap-3" aria-label={t("conversation")}>
        <h3 className="text-sm font-semibold text-fg">{t("conversation")}</h3>
        {room.side === "brand" || room.side === "talent" ? <p className="type-caption text-fg-muted">{t("clientHint")}</p> : null}
        <RoomThread
          portal={portal}
          dealId={room.deal.id}
          side={room.side}
          messages={room.messages}
          canPost={room.canPost}
          canInternal={room.canInternal}
          canSetGuide={room.canManage}
          usageGuideId={room.usageGuide?.messageId ?? null}
          timezone={room.timezone}
        />
      </section>

      <details className={card} open={room.side === "agency" && room.canManage}>
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-fg">
          <Users className="size-4" aria-hidden="true" />
          {t("whoIsHere")}
        </summary>
        <StaffPanel dealId={room.deal.id} members={room.members} canManage={room.canManage} ndaHeroes={room.ndaHeroes} />
      </details>
    </div>
  );
}
