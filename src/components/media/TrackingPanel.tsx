"use client";

import { Copy, Link2, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button, Dialog, FormField, Input, Select, useToast } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatPlainDate } from "@/i18n/format";
import { formatCents, parseBrlToCents } from "@/lib/deals/schemas";
import { deleteSaleAction, recordSaleAction, saveTrackingLinkAction } from "@/lib/media/actions";
import { conversionRate, normalizeCoupon, salesTotals, trackingUrl, type SaleRow } from "@/lib/media/metrics";
import type { TrackingLink } from "@/lib/media/queries";

type Row = { dealTalentId: string; talentName: string; link: TrackingLink | null };
type Props = {
  portal: "agency" | "brand" | "office";
  origin: string;
  dealId: string;
  requestId?: string | null;
  rows: Row[];
  /** vendas (só a marca e o Adm da agência leem; os demais recebem []) */
  sales?: SaleRow[];
  showSales?: boolean;
  /** agência: criar/editar link e cupom */
  canEdit?: boolean;
  /** marca: informar vendas */
  canSell?: boolean;
  brandSite?: string | null;
  myUserId?: string | null;
  isOwner?: boolean;
  today: string;
};

// Link rastreável e cupom por influenciador (0083). Agência cria/edita (destino https; padrão = site da marca);
// a marca vê cliques e informa vendas por cupom; o influenciador vê o link e o cupom dele para publicar.
export function TrackingPanel({ portal, origin, dealId, requestId, rows, sales = [], showSales = false, canEdit = false, canSell = false, brandSite, myUserId, isOwner = false, today }: Props) {
  const t = useTranslations("media.links");
  const ts = useTranslations("media.sales");
  const locale = useLocale() as Locale;
  const { toast } = useToast();
  const [edit, setEdit] = useState<Row | null>(null);
  const [selling, setSelling] = useState(false);
  const [deleting, startDelete] = useTransition();
  const totals = salesTotals(sales);
  const nf = new Intl.NumberFormat(locale);
  const totalClicks = rows.reduce((a, r) => a + (r.link?.clicks ?? 0), 0);
  const links = rows.filter((r) => r.link);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t("copied"), variant: "success" });
    } catch {
      toast({ title: url });
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="tracking-panel">
      {rows.length === 0 ? <p className="type-body-sm text-fg-muted">{t("empty")}</p> : null}
      <ul className="flex flex-col gap-2">
        {rows.map((r) => {
          const url = r.link ? trackingUrl(origin, r.link.code) : null;
          const sold = r.link ? totals.byLink.get(r.link.id) : undefined;
          const conv = r.link && sold ? conversionRate(r.link.clicks, sold.quantity) : null;
          return (
            <li key={r.dealTalentId} className="flex flex-col gap-2 rounded-xl border border-border px-3 py-2" data-testid="tracking-row">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-fg">{portal === "office" ? t("mine") : r.talentName}</span>
                {canEdit ? (
                  <Button type="button" size="sm" variant="secondary" leadingIcon={<Link2 />} onClick={() => setEdit(r)} data-testid="tracking-edit">
                    {r.link ? t("edit") : t("create")}
                  </Button>
                ) : null}
              </div>
              {r.link && url ? (
                <>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-hover px-2 py-1.5 text-sm text-fg">{url}</code>
                    <Button type="button" size="sm" variant="ghost" leadingIcon={<Copy />} onClick={() => void copy(url)}>
                      {t("copy")}
                    </Button>
                  </div>
                  <p className="type-caption text-fg-muted">
                    {r.link.coupon ? `${t("couponIs", { coupon: r.link.coupon })} · ` : ""}
                    {t("clicks", { count: r.link.clicks })}
                    {showSales && sold ? ` · ${ts("soldLine", { quantity: sold.quantity, revenue: formatCents(sold.revenueCents, locale) })}` : ""}
                    {showSales && conv !== null ? ` · ${ts("conversion", { rate: nf.format(conv) })}` : ""}
                  </p>
                  {portal !== "office" ? <p className="truncate type-caption text-fg-subtle">{t("goesTo", { url: r.link.destinationUrl })}</p> : null}
                </>
              ) : (
                <p className="type-caption text-fg-muted">{t("noLink")}</p>
              )}
            </li>
          );
        })}
      </ul>
      {portal === "office" && links.length > 0 ? <p className="type-caption text-fg-muted">{t("mineHint")}</p> : null}
      {showSales ? (
        <section className="flex flex-col gap-2 border-t border-border pt-3" aria-label={ts("title")} data-testid="sales-panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-fg">{ts("title")}</span>
            {canSell && links.length > 0 ? (
              <Button type="button" size="sm" onClick={() => setSelling(true)} data-testid="sales-record">
                {ts("record")}
              </Button>
            ) : null}
          </div>
          <p className="type-caption text-fg-muted">
            {ts("totals", { quantity: totals.quantity, revenue: formatCents(totals.revenueCents, locale), clicks: totalClicks })}
          </p>
          {sales.length === 0 ? (
            <p className="type-caption text-fg-muted">{ts("empty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {sales.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm text-fg">
                      {s.coupon || rows.find((r) => r.dealTalentId === s.dealTalentId)?.talentName || "—"} · {ts("line", { quantity: s.quantity, revenue: formatCents(s.revenueCents, locale) })}
                    </span>
                    <span className="type-caption text-fg-muted">
                      {formatPlainDate(s.reportedOn, locale)}
                      {s.note ? ` · ${s.note}` : ""}
                    </span>
                  </span>
                  {canSell && (isOwner || s.createdBy === myUserId) ? (
                    <button
                      type="button"
                      className="flex size-9 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-hover hover:text-danger focus-visible:outline-2 focus-visible:outline-focus"
                      aria-label={ts("delete")}
                      disabled={deleting}
                      onClick={() =>
                        startDelete(async () => {
                          const result = await deleteSaleAction({ dealId, requestId, id: s.id });
                          toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
                        })
                      }
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      {edit ? <LinkDialog row={edit} dealId={dealId} requestId={requestId} brandSite={brandSite ?? null} onClose={() => setEdit(null)} /> : null}
      {selling ? <SaleDialog rows={links} dealId={dealId} requestId={requestId} today={today} onClose={() => setSelling(false)} /> : null}
    </div>
  );
}

function LinkDialog({ row, dealId, requestId, brandSite, onClose }: { row: Row; dealId: string; requestId?: string | null; brandSite: string | null; onClose: () => void }) {
  const t = useTranslations("media.links");
  const tc = useTranslations("media.common");
  const { toast } = useToast();
  const [destination, setDestination] = useState(row.link?.destinationUrl ?? "");
  const [coupon, setCoupon] = useState(row.link?.coupon ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function submit() {
    setError(null);
    const dest = destination.trim();
    if (dest && !/^https:\/\//.test(dest)) return setError(t("httpsOnly"));
    if (!dest && !brandSite) return setError(t("destinationRequired"));
    const c = normalizeCoupon(coupon);
    if (c === null) return setError(t("couponInvalid"));
    start(async () => {
      const result = await saveTrackingLinkAction({ dealId, requestId, linkDealTalentId: row.dealTalentId, destination: dest, coupon: c });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onClose();
    });
  }
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)} title={t("dialogTitle", { name: row.talentName })} description={t("dialogHint")}>
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <FormField label={t("destination")} hint={brandSite ? t("destinationHint", { site: brandSite }) : t("destinationRequired")}>
          <Input type="url" inputMode="url" value={destination} maxLength={500} placeholder={brandSite ?? "https://"} onChange={(e) => setDestination(e.target.value)} disabled={pending} />
        </FormField>
        <FormField label={t("coupon")} hint={t("couponHint")}>
          <Input value={coupon} maxLength={40} autoCapitalize="characters" onChange={(e) => setCoupon(e.target.value.toUpperCase())} disabled={pending} data-testid="tracking-coupon" />
        </FormField>
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {tc("cancel")}
          </Button>
          <Button type="submit" loading={pending} data-testid="tracking-save">
            {tc("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function SaleDialog({ rows, dealId, requestId, today, onClose }: { rows: Row[]; dealId: string; requestId?: string | null; today: string; onClose: () => void }) {
  const t = useTranslations("media.sales");
  const tc = useTranslations("media.common");
  const { toast } = useToast();
  const [linkId, setLinkId] = useState(rows[0]?.link?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [revenue, setRevenue] = useState("");
  const [reportedOn, setReportedOn] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function submit() {
    setError(null);
    const q = quantity.trim() === "" ? 0 : /^\d{1,8}$/.test(quantity.trim()) ? Number(quantity.trim()) : NaN;
    if (!Number.isFinite(q)) return setError(t("invalidQuantity"));
    const cents = parseBrlToCents(revenue);
    if (cents === undefined) return setError(t("invalidRevenue"));
    if (q === 0 && !cents) return setError(t("needOne"));
    if (!linkId) return setError(t("needLink"));
    start(async () => {
      const result = await recordSaleAction({ dealId, requestId, linkId, quantity: q, revenueCents: cents ?? 0, reportedOn, note: note.trim() });
      if (!result.ok) return setError(result.error);
      toast({ title: result.message, variant: "success" });
      onClose();
    });
  }
  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)} title={t("dialogTitle")} description={t("dialogHint")}>
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <FormField label={t("link")} required>
          <Select value={linkId} onChange={(e) => setLinkId(e.target.value)} disabled={pending}>
            {rows.map((r) => (
              <option key={r.link!.id} value={r.link!.id}>
                {r.talentName}
                {r.link!.coupon ? ` · ${r.link!.coupon}` : ""}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t("quantity")}>
            <Input inputMode="numeric" value={quantity} maxLength={8} onChange={(e) => setQuantity(e.target.value)} disabled={pending} data-testid="sales-quantity" />
          </FormField>
          <FormField label={t("revenue")}>
            <Input inputMode="decimal" value={revenue} maxLength={20} placeholder="0,00" onChange={(e) => setRevenue(e.target.value)} disabled={pending} data-testid="sales-revenue" />
          </FormField>
        </div>
        <FormField label={t("reportedOn")} required>
          <Input type="date" value={reportedOn} max={today} onChange={(e) => setReportedOn(e.target.value)} disabled={pending} />
        </FormField>
        <FormField label={t("note")}>
          <Input value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} disabled={pending} />
        </FormField>
        {error ? (
          <p role="alert" className="type-body-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {tc("cancel")}
          </Button>
          <Button type="submit" loading={pending} data-testid="sales-save">
            {tc("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
