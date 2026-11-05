"use client";

import { Archive, CalendarPlus, DoorOpen, MessageSquareHeart, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, FormField, Switch, Textarea, useToast } from "@/components/ui";
import { requestFeedbackAction, setRoomOpenAction, updateRoomAction } from "@/lib/project-room/actions";
import type { RoomMember } from "@/lib/project-room/queries";
import { ShootDayForm } from "./ShootDayForm";

type Props = {
  dealId: string;
  briefing: string;
  ndaHeroes: boolean;
  status: "open" | "archived";
  canManage: boolean;
  isManager: boolean;
  dealClosed: boolean;
  people: RoomMember[];
  timezone: string;
};

// Ferramentas da agência na sala: briefing fixado, "Heros também assinam o NDA", nova diária, pedir feedback ao cliente
// e arquivar/reabrir (gestor+). O fechamento do negócio arquiva sozinho.
export function RoomManage({ dealId, briefing, ndaHeroes, status, canManage, isManager, dealClosed, people, timezone }: Props) {
  const t = useTranslations("projectRoom.manage");
  const { toast } = useToast();
  const [text, setText] = useState(briefing);
  const [heroes, setHeroes] = useState(ndaHeroes);
  const [newDay, setNewDay] = useState(false);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
    start(async () => {
      const result = await fn();
      toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
    });
  }

  if (status === "archived") {
    return isManager && !dealClosed ? (
      <Button type="button" variant="secondary" leadingIcon={<DoorOpen />} loading={pending} onClick={() => run(() => setRoomOpenAction({ dealId, open: true }))}>
        {t("reopen")}
      </Button>
    ) : null;
  }
  if (!canManage) return null;

  return (
    <div className="flex flex-col gap-4" data-testid="room-manage">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="button" leadingIcon={<CalendarPlus />} onClick={() => setNewDay(true)} data-testid="shoot-new">
          {t("newShoot")}
        </Button>
        <Button type="button" variant="secondary" leadingIcon={<MessageSquareHeart />} disabled={pending} onClick={() => run(() => requestFeedbackAction({ dealId, moment: "production_day" }))}>
          {t("askFeedback")}
        </Button>
      </div>
      <FormField label={t("briefing")} hint={t("briefingHint")}>
        <Textarea value={text} rows={4} maxLength={6000} onChange={(e) => setText(e.target.value)} disabled={pending} />
      </FormField>
      <Switch checked={heroes} onCheckedChange={setHeroes} label={t("ndaHeroes")} description={t("ndaHeroesHint")} disabled={pending} />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="button" leadingIcon={<Save />} loading={pending} onClick={() => run(() => updateRoomAction({ dealId, briefing: text, ndaHeroes: heroes }))} data-testid="room-save">
          {t("save")}
        </Button>
        {isManager ? (
          <Button
            type="button"
            variant="ghost"
            leadingIcon={<Archive />}
            disabled={pending}
            onClick={() => (window.confirm(t("confirmArchive")) ? run(() => setRoomOpenAction({ dealId, open: false })) : undefined)}
          >
            {t("archive")}
          </Button>
        ) : null}
      </div>
      {newDay ? <ShootDayForm dealId={dealId} day={null} people={people} timezone={timezone} onClose={() => setNewDay(false)} /> : null}
    </div>
  );
}
