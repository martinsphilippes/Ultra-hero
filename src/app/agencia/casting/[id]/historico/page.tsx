import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { getKit, listSocial } from "@/lib/talent/queries";
import { loadTalent } from "../_lib";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("agency.meta");
  return { title: t("talentHistory") };
}

type Props = { params: Promise<{ id: string }> };

type Entry = { at: string; key: string; values?: Record<string, string> };

// Linha do tempo do talento a partir do que a ficha já registra (cadastro, contato, consentimento,
// redes, kit). Atividades e negócios entram com o pipeline (etapa C).
export default async function TalentHistoryPage({ params }: Props) {
  const { id } = await params;
  const { talent } = await loadTalent(id);
  const [t, locale, kit, networks] = await Promise.all([getTranslations("agency.casting.history"), getLocale() as Promise<Locale>, getKit(talent.id), listSocial(talent.id)]);
  const entries: Entry[] = [{ at: talent.createdAt, key: "created" }];
  if (talent.lastContactAt) entries.push({ at: talent.lastContactAt, key: "lastContact" });
  if (talent.consentAt) entries.push({ at: talent.consentAt, key: "consentGiven", values: { version: talent.consentVersion ?? "" } });
  if (talent.consentRevokedAt) entries.push({ at: talent.consentRevokedAt, key: "consentRevoked" });
  for (const n of networks) entries.push({ at: n.updated_at, key: "network", values: { handle: n.handle } });
  if (kit.updatedAt) entries.push({ at: kit.updatedAt, key: "kitUpdated" });
  if (kit.shareCreatedAt) entries.push({ at: kit.shareCreatedAt, key: "kitShared" });
  if (kit.shareRevokedAt) entries.push({ at: kit.shareRevokedAt, key: "kitRevoked" });
  if (kit.lastViewedAt) entries.push({ at: kit.lastViewedAt, key: "kitViewed", values: { count: String(kit.viewCount) } });
  if (talent.archivedAt) entries.push({ at: talent.archivedAt, key: "archived" });
  entries.sort((a, b) => b.at.localeCompare(a.at));

  return (
    <section className="flex flex-col gap-3" aria-labelledby="talent-history">
      <h2 id="talent-history" className="text-base font-semibold text-fg">
        {t("title")}
      </h2>
      <ol className="flex flex-col gap-0 border-l border-border pl-4" data-testid="talent-history">
        {entries.map((e, i) => (
          <li key={`${e.key}-${i}`} className="relative pb-4">
            <span aria-hidden="true" className="absolute -left-[1.3rem] top-1.5 size-2.5 rounded-full bg-accent" />
            <p className="text-sm text-fg">{t(`entries.${e.key}`, e.values ?? {})}</p>
            <p className="type-caption text-fg-muted">{formatDateTime(e.at, locale)}</p>
          </li>
        ))}
      </ol>
      <p className="type-caption text-fg-muted">{t("upcoming")}</p>
    </section>
  );
}
