"use client";

import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, Checkbox, DatePicker, Dialog, FormField, Input, Textarea, useToast } from "@/components/ui";
import { zonedTime } from "@/lib/calendar/form";
import { zonedDayKey } from "@/lib/calendar/grid";
import { saveShootDayAction } from "@/lib/project-room/actions";
import type { RoomMember, ShootDay } from "@/lib/project-room/queries";

type Props = { dealId: string; day: ShootDay | null; people: RoomMember[]; timezone: string; onClose: () => void };

type CrewPick = { userId: string; name: string; side: string; role: string; on: boolean };

// Criar/editar a ficha da diária (agência). Equipe: quem está na sala com conta (agência do negócio, heróis, staff que
// aceitou); a função vem do convite e pode ser ajustada aqui. Sem ninguém marcado na criação, vai toda a sala.
export function ShootDayForm({ dealId, day, people, timezone, onClose }: Props) {
  const t = useTranslations("projectRoom.shootForm");
  const ts = useTranslations("projectRoom.shoot");
  const { toast } = useToast();
  const candidates: CrewPick[] = people
    .filter((p) => p.userId && (p.side !== "staff" || p.status === "active"))
    .map((p) => {
      const current = day?.crew.find((c) => c.userId === p.userId);
      return { userId: p.userId as string, name: p.name, side: p.side, role: current?.role ?? (p.side === "staff" ? p.role : ""), on: day ? Boolean(current) : true };
    });
  const [date, setDate] = useState(day ? zonedDayKey(day.startsAt, timezone) : "");
  const [startTime, setStartTime] = useState(day ? zonedTime(day.startsAt, timezone) : "09:00");
  const [endTime, setEndTime] = useState(day ? zonedTime(day.endsAt, timezone) : "17:00");
  const [location, setLocation] = useState(day?.location ?? "");
  const [mapUrl, setMapUrl] = useState(day?.mapUrl ?? "");
  const [parking, setParking] = useState(day?.parking ?? "");
  const [food, setFood] = useState(day?.food ?? "");
  const [limit, setLimit] = useState(day?.peopleLimit ? String(day.peopleLimit) : "");
  const [notes, setNotes] = useState(day?.notes ?? "");
  const [crew, setCrew] = useState<CrewPick[]>(candidates);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    if (!date || !startTime || location.trim().length < 2) return setError(t("required"));
    const n = limit.trim() ? Number(limit) : null;
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 999)) return setError(t("limitInvalid"));
    start(async () => {
      const result = await saveShootDayAction({
        dealId,
        id: day?.id ?? null,
        date,
        startTime,
        endTime,
        location: location.trim(),
        mapUrl: mapUrl.trim(),
        parking: parking.trim(),
        food: food.trim(),
        peopleLimit: n,
        notes: notes.trim(),
        crew: crew.filter((c) => c.on).map((c) => ({ userId: c.userId, role: c.role.trim() })),
      });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onClose();
    });
  }

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(o) => (!o ? onClose() : null)}
      title={day ? t("editTitle") : t("newTitle")}
      description={t("hint")}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {t("close")}
          </Button>
          <Button type="button" onClick={save} loading={pending} leadingIcon={<Save />} data-testid="shoot-save">
            {t("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="shoot-form">
        <FormField label={t("date")} required>
          <DatePicker value={date} onChange={setDate} required />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t("start")} required>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </FormField>
          <FormField label={t("end")}>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </FormField>
        </div>
        <FormField label={t("location")} required>
          <Input value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} placeholder={t("locationPlaceholder")} />
        </FormField>
        <FormField label={t("mapUrl")} hint={t("mapUrlHint")}>
          <Input type="url" inputMode="url" value={mapUrl} maxLength={500} onChange={(e) => setMapUrl(e.target.value)} placeholder="https://" />
        </FormField>
        <FormField label={t("parking")}>
          <Input value={parking} maxLength={300} onChange={(e) => setParking(e.target.value)} />
        </FormField>
        <FormField label={t("food")}>
          <Input value={food} maxLength={300} onChange={(e) => setFood(e.target.value)} />
        </FormField>
        <FormField label={t("limit")}>
          <Input type="number" inputMode="numeric" min={1} max={999} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </FormField>
        <FormField label={t("notes")}>
          <Textarea value={notes} maxLength={2000} rows={2} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-fg">{t("crew")}</legend>
          {crew.length === 0 ? <p className="type-caption text-fg-muted">{t("noPeople")}</p> : null}
          {crew.map((c, i) => (
            <div key={c.userId} className="flex flex-col gap-2 rounded-xl border border-border p-2 sm:flex-row sm:items-center">
              <Checkbox
                checked={c.on}
                onChange={(e) => { const on = e.target.checked; setCrew((list) => list.map((x, j) => (j === i ? { ...x, on } : x))); }}
                label={`${c.name} · ${ts(`sides.${c.side === "talent" || c.side === "staff" ? c.side : "agency"}`)}`}
              />
              <Input
                className="sm:ml-auto sm:max-w-[14rem]"
                value={c.role}
                maxLength={60}
                aria-label={t("roleOf", { name: c.name })}
                placeholder={t("rolePlaceholder")}
                onChange={(e) => setCrew((list) => list.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}
              />
            </div>
          ))}
        </fieldset>
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
