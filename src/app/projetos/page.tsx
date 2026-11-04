import type { Metadata } from "next";
import { FolderOpen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { MessagesHomeCard } from "@/components/messaging/MessagesHomeCard";
import { MyRoomsList } from "@/components/project-room/MyRoomsList";
import { EmptyState, PageHeader } from "@/components/ui";
import { getMyRooms } from "@/lib/project-room/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projectRoom.mine");
  return { title: t("title") };
}

// "Meus projetos" do staff externo (0110): salas abertas em que a pessoa foi chamada, próxima diária e NDA pendente.
export default async function MyProjectsPage() {
  const [t, rooms] = await Promise.all([getTranslations("projectRoom.mine"), getMyRooms()]);
  const staff = rooms.items.filter((r) => r.side === "staff");
  return (
    <div className="flex flex-col gap-5" data-testid="my-projects">
      <PageHeader title={t("title")} description={t("description")} />
      {/* 0115: conversas das salas (aba Mensagens de "Avisos e mensagens") */}
      {staff.length > 0 ? <MessagesHomeCard portal="staff" basePath="/projetos/avisos" /> : null}
      {!rooms.available ? (
        <div className="rounded-2xl border border-border bg-surface" data-testid="module-unavailable">
          <EmptyState icon={<FolderOpen />} title={t("unavailable")} />
        </div>
      ) : staff.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<FolderOpen />} title={t("empty")} description={t("emptyHint")} />
        </div>
      ) : (
        <MyRoomsList rooms={staff} portal="staff" />
      )}
    </div>
  );
}
