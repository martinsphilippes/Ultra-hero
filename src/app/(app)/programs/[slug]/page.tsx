import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, Download, Layers, LogIn, Play } from "lucide-react";
import { displayTimeZone, ViewTracker } from "@/components/content";
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget";
import { AddToListButton, FavoriteButton } from "@/components/library";
import { Avatar, Badge, Button, PillarBadge, ProgressBar, ProgressRing } from "@/components/ui";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/i18n/format";
import { getProfile, getUser } from "@/lib/auth/session";
import { CONTENT_CARD_SELECT, type ContentCardData } from "@/lib/catalog/queries";
import { favoriteStatus, mixedListsSupported } from "@/lib/library/lists-support";
import { getNativeApp } from "@/lib/native-app/server";
import { rhythmChips } from "@/lib/programs/concept";
import { loadProgramConcept } from "@/lib/programs/concept-query";
import { programProfessionals, serviceIdsInCart } from "@/lib/professionals/queries";
import { loadHireEnv } from "@/lib/professionals/server";
import { loadProgramNutrition } from "@/lib/programs/nutrition-query";
import { cardSearch, conceptScreens, firstSentence, nutritionProductsAllowed, nutritionScreens, nutritionVisible, type ConceptScreenKey } from "@/lib/programs/program-cards";
import { nextPendingSlug, startAction, supportPlan } from "@/lib/programs/support";
import { loadProgramProducts } from "@/lib/programs/support-query";
import type { Enums, FnReturns, Pillar } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";
import { AbandonButton } from "./AbandonButton";
import { EnrollButton } from "./EnrollButton";
import { ProgramCards, type ProgramCard } from "./ProgramCards";
import { CONCEPT_SCREEN_TITLE, ConceptScreenBody } from "./ConceptScreen";
import { NutritionContentList, NutritionProductGrid, ProgramItemList, type ProgramItemView } from "./ProgramScreens";
import { ProgramActions, ProgramProductRows, ProgramProfessionalRows } from "./ProgramSupport";

// Página de programa: cabeçalho da versão (atual ou a versão em que o usuário está inscrito),
// itens via program_required_items (com substituições), progresso e certificado simbólico.
// Depois do cabeçalho, "Próximos passos" (Começar, Comprar produto, Contratar profissional; só com
// produto ou profissional ligado, 0059) e até 5 cards (Conceito, Prepare-se, Conteúdo, Nutricional,
// Apoio) que abrem telas em sequência.

const PROGRAM_SELECT = "id, slug, pillar, cover_url, status, current_version_id, creator:creator_profiles(id, slug, name, headline, avatar_url, is_fictional)";

type Program = {
  id: string;
  slug: string;
  pillar: Pillar;
  cover_url: string | null;
  status: Enums<"content_status">;
  current_version_id: string | null;
  creator: { id: string; slug: string; name: string; headline: string | null; avatar_url: string | null; is_fictional: boolean } | null;
};

type Version = {
  id: string;
  version_no: number;
  title: string;
  summary: string | null;
  description: string | null;
  source_locale: Enums<"locale_code">;
  estimated_weeks: number | null;
  status: Enums<"content_status">;
};

type Enrollment = { id: string; status: Enums<"enrollment_status">; version_id: string; enrolled_at: string; completed_at: string | null };
type RequiredItem = FnReturns<"program_required_items">[number];
type ItemContent = ContentCardData & { required_module_id: string | null };

type Params = { params: Promise<{ slug: string }> };

async function loadProgram(slug: string): Promise<Program | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("programs").select(PROGRAM_SELECT).eq("slug", slug).maybeSingle();
  return (data as unknown as Program | null) ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const program = await loadProgram(slug);
  if (!program?.current_version_id) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("program_versions").select("title, summary").eq("id", program.current_version_id).maybeSingle();
  return data ? { title: data.title, description: data.summary ?? undefined } : {};
}

export default async function ProgramPage({ params }: Params) {
  const { slug } = await params;
  const [program, user, locale, t, tcat, nativeApp] = await Promise.all([
    loadProgram(slug),
    getUser(),
    getLocale(),
    getTranslations("consume.program"),
    getTranslations("catalog"),
    getNativeApp(),
  ]);
  if (!program) notFound();

  const supabase = await createClient();
  const path = `/programs/${program.slug}`;
  const uiLocale = locale as Locale;

  // Inscrição relevante: ativa > concluída > abandonada (a mais recente de cada).
  let enrollment: Enrollment | null = null;
  if (user) {
    const { data } = await supabase
      .from("enrollments")
      .select("id, status, version_id, enrolled_at, completed_at")
      .eq("user_id", user.id)
      .eq("program_id", program.id)
      .order("enrolled_at", { ascending: false });
    const rows = (data ?? []) as Enrollment[];
    enrollment = rows.find((e) => e.status === "active") ?? rows.find((e) => e.status === "completed") ?? rows[0] ?? null;
  }
  const enrolledVersion = enrollment && enrollment.status !== "abandoned" ? enrollment.version_id : null;
  const versionId = enrolledVersion ?? program.current_version_id;
  if (!versionId) notFound();

  // Guardar em lista e favoritar: só programa publicado (as políticas da 0040/0041 recusam o resto) e só
  // com a migração no banco; favorite nulo = sem a 0041, coração escondido.
  // Conceito em consulta separada: banco sem a 0048 cai na descrição em vez de quebrar a página.
  const [versionRes, locRes, itemsRes, currentRes, profile, canSaveToList, favorite, concept] = await Promise.all([
    supabase.from("program_versions").select("id, version_no, title, summary, description, source_locale, estimated_weeks, status").eq("id", versionId).maybeSingle(),
    supabase.from("program_localizations").select("title, summary, description").eq("version_id", versionId).eq("locale", uiLocale).eq("status", "published").maybeSingle(),
    supabase.rpc("program_required_items", { p_version: versionId }),
    program.current_version_id && program.current_version_id !== versionId
      ? supabase.from("program_versions").select("version_no").eq("id", program.current_version_id).maybeSingle()
      : null,
    user ? getProfile() : null,
    user && program.status === "published" ? mixedListsSupported() : false,
    user && program.status === "published" ? favoriteStatus(user.id, { kind: "program", id: program.id }) : null,
    loadProgramConcept(supabase, versionId, uiLocale),
  ]);
  const version = (versionRes.data as Version | null) ?? null;
  if (!version) notFound();
  const localization = locRes.data ?? null;
  const title = localization?.title ?? version.title;
  const summary = localization?.summary ?? version.summary;
  const description = localization?.description ?? version.description;
  const items = (itemsRes.data ?? []) as RequiredItem[];

  const contentIds = Array.from(new Set(items.map((i) => i.content_id)));
  const matchIds = Array.from(new Set(items.flatMap((i) => [i.content_id, i.original_content_id])));

  const [contentRes, completionsRes, progressRes, entitledRes, certificateRes] = await Promise.all([
    contentIds.length > 0 ? supabase.from("content").select(`${CONTENT_CARD_SELECT}, required_module_id`).in("id", contentIds) : null,
    user && matchIds.length > 0 ? supabase.from("completions").select("content_id, completed_at").eq("user_id", user.id).in("content_id", matchIds) : null,
    user && contentIds.length > 0 ? supabase.from("content_progress").select("content_id, progress_pct").eq("user_id", user.id).in("content_id", contentIds) : null,
    user ? supabase.rpc("my_entitled_modules") : null,
    enrollment?.status === "completed" ? supabase.from("certificates").select("code, issued_at, revoked_at").eq("enrollment_id", enrollment.id).maybeSingle() : null,
  ]);
  const contentById = new Map(((contentRes?.data ?? []) as unknown as ItemContent[]).map((c) => [c.id, c]));
  const completedIds = new Set((completionsRes?.data ?? []).map((c) => c.content_id));
  const progressById = new Map((progressRes?.data ?? []).map((p) => [p.content_id, p.progress_pct]));
  const entitled = new Set<string>(((entitledRes?.data ?? []) as string[]) ?? []);
  const certificate = certificateRes?.data ?? null;

  // Conclusão vale pelo conteúdo efetivo OU pelo original (mesma regra de check_program_completion).
  const isDone = (item: RequiredItem) => completedIds.has(item.content_id) || completedIds.has(item.original_content_id);
  const required = items.filter((i) => i.is_required);
  const requiredDone = required.filter(isDone).length;
  const progressPct = required.length > 0 ? Math.round((requiredDone / required.length) * 100) : 0;

  // Agrupa por seção preservando a ordem de aparição.
  const sections = new Map<string, ProgramItemView[]>();
  for (const item of items) {
    const key = item.section ?? "";
    const content = contentById.get(item.content_id) ?? null;
    const progress = content ? progressById.get(content.id) : undefined;
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key)!.push({
      key: `${item.original_content_id}-${item.content_id}`,
      content,
      required: item.is_required,
      done: isDone(item),
      locked: Boolean(content && content.access_level === "premium" && content.required_module_id && !entitled.has(content.required_module_id)),
      substituted: Boolean(item.substituted),
      progress: typeof progress === "number" ? progress : null,
    });
  }

  // Apoio (0059): produtos ligados (só onde o comércio vale) e profissionais sugeridos no programa.
  const hireEnv = await loadHireEnv();
  const commerceAllowed = nutritionProductsAllowed({ commerceEnabled: hireEnv.commerceEnabled, nativeApp: hireEnv.nativeApp });
  const [programProducts, professionals] = await Promise.all([
    commerceAllowed ? loadProgramProducts(supabase, { programId: program.id, userId: user?.id ?? null }) : [],
    programProfessionals(program.id),
  ]);
  const servicesInCart = !hireEnv.nativeApp && user && professionals.length > 0 ? await serviceIdsInCart() : new Set<string>();
  const support = supportPlan({ products: programProducts.length, professionals: professionals.length, commerceEnabled: hireEnv.commerceEnabled, nativeApp: hireEnv.nativeApp });
  const creatorId = program.creator?.id ?? null;

  // Nutricional: conteúdos de nutrição/receitas do programa e os próprios do herói + produtos de comida.
  const programContents = Array.from(new Set(items.map((i) => i.content_id)))
    .map((id) => contentById.get(id))
    .filter((c): c is ItemContent => Boolean(c));
  const nutrition = await loadProgramNutrition(supabase, { creatorId, programContents, userId: user?.id ?? null, nativeApp: Boolean(nativeApp), linkedProducts: programProducts });
  const enrolled = Boolean(enrollment && enrollment.status !== "abandoned");
  const cards = buildCards();
  const start = startAction({ loggedIn: Boolean(user), enrollment: enrollment?.status ?? null });
  const nextSlug = nextPendingSlug(items.map((i) => ({ slug: contentById.get(i.content_id)?.slug ?? null, required: i.is_required, done: isDone(i) })));
  const contentCardHref = `${path}${cardSearch("", { card: "conteudo", screen: 0 })}`;

  const tz = displayTimeZone(profile?.timezone);
  const cover = program.cover_url ?? `/placeholders/cover-${program.pillar}-1.svg`;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  // Cards na ordem pedida: Conceito, Prepare-se, Conteúdo e Nutricional (só os que têm telas).
  function buildCards(): ProgramCard[] {
    const split = conceptScreens(concept, description, version!.estimated_weeks);
    const conceptScreen = (key: ConceptScreenKey) => ({
      id: key,
      title: t(CONCEPT_SCREEN_TITLE[key]),
      body: <ConceptScreenBody screen={key} concept={concept} description={description} estimatedWeeks={version!.estimated_weeks} />,
    });
    const chips = rhythmChips(version!.estimated_weeks, concept)
      .map((chip) => (chip.key === "weeks" ? t("weeks", { n: chip.n }) : t(`concept.${chip.key}`, { n: chip.n })))
      .join(" · ");
    const nutritionKeys = nutritionScreens({ contents: nutrition.contents.length, products: nutrition.products.length, productsAllowed: nutrition.productsAllowed });

    const list: ProgramCard[] = [
      { key: "conceito", title: t("cards.concept"), teaser: firstSentence(concept?.idea ?? description), screens: split.conceito.map(conceptScreen) },
      {
        key: "prepare-se",
        title: t("cards.prepare"),
        teaser: chips || firstSentence(concept?.rhythm.note ?? concept?.care),
        screens: split["prepare-se"].map(conceptScreen),
      },
      {
        key: "conteudo",
        title: t("cards.content"),
        teaser: enrolled ? t("progressText", { done: requiredDone, total: required.length }) : t("items", { n: items.length }),
        screens: Array.from(sections.entries()).map(([section, list], i) => ({
          id: `secao-${i + 1}`,
          title: section || t("sectionDefault"),
          body: <ProgramItemList items={list} pillar={program!.pillar} note={i === 0 ? t("freeOrder") : undefined} />,
        })),
      },
    ];
    if (nutritionVisible({ contents: nutrition.contents.length, products: nutrition.products.length, productsAllowed: nutrition.productsAllowed })) {
      list.push({
        key: "nutricional",
        title: t("cards.nutrition"),
        teaser: t("cards.nutritionTeaser"),
        screens: nutritionKeys.map((key, i) =>
          key === "contents"
            ? { id: key, title: t("cards.nutritionContents"), body: <NutritionContentList contents={nutrition.contents} note={t("cards.nutritionContentsNote")} /> }
            : {
                id: key,
                title: t("cards.nutritionProducts"),
                body: (
                  <NutritionProductGrid
                    products={nutrition.products}
                    note={t("cards.nutritionProductsNote")}
                    isLoggedIn={Boolean(user)}
                    nextPath={`${path}${cardSearch("", { card: "nutricional", screen: i })}`}
                  />
                ),
              },
        ),
      });
    }
    if (support.apoioScreens.length > 0) {
      list.push({
        key: "apoio",
        title: t("cards.support"),
        teaser: t("cards.supportTeaser"),
        screens: support.apoioScreens.map((key, i) =>
          key === "products"
            ? {
                id: key,
                title: t("cards.supportProducts"),
                body: (
                  <div className="flex flex-col gap-3">
                    <p className="type-body-sm text-fg-muted">{t("cards.supportProductsNote")}</p>
                    <ProgramProductRows products={programProducts} isLoggedIn={Boolean(user)} nextPath={`${path}${cardSearch("", { card: "apoio", screen: i })}`} />
                  </div>
                ),
              }
            : {
                id: key,
                title: t("cards.supportProfessionals"),
                body: (
                  <div className="flex flex-col gap-3">
                    <p className="type-body-sm text-fg-muted">{t("cards.supportProfessionalsNote")}</p>
                    <ProgramProfessionalRows
                      professionals={professionals}
                      env={{ ...hireEnv, inCart: servicesInCart }}
                      creatorId={creatorId}
                      nextPath={`${path}${cardSearch("", { card: "apoio", screen: i })}`}
                    />
                  </div>
                ),
              },
        ),
      });
    }
    return list.filter((card) => card.screens.length > 0);
  }

  // Passo "Começar" de Próximos passos (o mesmo botão de participar, que sai do cabeçalho)
  function startNode() {
    if (start === "login") {
      return (
        <Button asChild variant="primary" leadingIcon={<LogIn />} className="self-start">
          <Link href={`/login?next=${encodeURIComponent(path)}`}>{t("visitorCta")}</Link>
        </Button>
      );
    }
    if (start === "enroll" || start === "reenroll") return <EnrollButton programId={program!.id} path={path} reenroll={start === "reenroll"} className="self-start" />;
    return (
      <Button asChild variant={start === "continue" ? "primary" : "secondary"} leadingIcon={<Play />} className="self-start" data-testid="program-action-continue">
        <Link href={start === "continue" && nextSlug ? `/content/${nextSlug}` : contentCardHref}>{start === "continue" ? t("actions.continue") : t("actions.review")}</Link>
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <ViewTracker kind="program" id={program.id} extra={{ version_id: versionId, enrolled: Boolean(enrolledVersion) }} />

      <header className="flex flex-col gap-5">
        <Link href="/explore" className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          ← {t("backToExplore")}
        </Link>
        <div className="relative aspect-[21/9] w-full overflow-hidden rounded-2xl border border-border bg-surface-elevated sm:aspect-[3/1]">
          <Image src={cover} alt="" fill priority unoptimized={cover.endsWith(".svg")} sizes="(min-width: 1024px) 60vw, 100vw" className="object-cover" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-obsidian/70 via-transparent to-transparent" />
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
            <PillarBadge pillar={program.pillar} />
            <Badge variant="accent" icon={<Layers />}>
              {t("eyebrow")}
            </Badge>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 type-caption text-fg-muted">
            <li>
              <Badge variant="neutral" size="sm">
                {t("version", { n: version.version_no })}
              </Badge>
            </li>
            {version.estimated_weeks ? <li>{t("weeks", { n: version.estimated_weeks })}</li> : null}
            <li>{t("items", { n: items.length })}</li>
            {enrollment && enrollment.status !== "abandoned" ? (
              <li>
                <Badge variant={enrollment.status === "completed" ? "success" : "info"} size="sm">
                  {t(`status.${enrollment.status}`)}
                </Badge>
              </li>
            ) : null}
          </ul>
          <h1 className="type-h1 text-balance text-fg">{title}</h1>
          {summary && <p className="type-body max-w-prose text-fg-muted">{summary}</p>}

          {program.creator && (
            <Link
              href={`/personalities/${program.creator.slug}`}
              className="flex w-fit min-h-11 items-center gap-3 rounded-xl pr-2 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <Avatar src={program.creator.avatar_url} name={program.creator.name} alt="" size="md" />
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-fg">{t("by", { name: program.creator.name })}</span>
                <span className="flex items-center gap-2 type-caption text-fg-muted">
                  {program.creator.headline}
                  {program.creator.is_fictional && (
                    <Badge variant="demo" size="sm">
                      {tcat("fictional")}
                    </Badge>
                  )}
                </span>
              </span>
            </Link>
          )}

          {currentRes?.data && enrolledVersion ? (
            <p className="rounded-lg border border-border bg-surface-elevated px-3 py-2 type-caption text-fg-muted" role="note">
              {t("versionNotice", { n: version.version_no, current: currentRes.data.version_no })}
            </p>
          ) : null}

          {/* Estado de inscrição */}
          {!user && support.showActions ? null : !user ? (
            <div className="flex flex-col items-start gap-2 pt-1">
              <Button asChild variant="primary" size="lg" leadingIcon={<LogIn />}>
                <Link href={`/login?next=${encodeURIComponent(path)}`}>{t("visitorCta")}</Link>
              </Button>
              <span className="type-caption text-fg-muted">{t("visitorNote")}</span>
            </div>
          ) : !enrollment || enrollment.status === "abandoned" ? (
            <div className="flex flex-col items-start gap-2 pt-1">
              {!support.showActions || favorite || canSaveToList ? (
                <div className="flex flex-wrap items-center gap-2">
                  {support.showActions ? null : <EnrollButton programId={program.id} path={path} reenroll={enrollment?.status === "abandoned"} />}
                  {favorite ? <FavoriteButton kind="program" id={program.id} initial={favorite.favorite} path={path} /> : null}
                  {canSaveToList ? <AddToListButton kind="program" id={program.id} withLabel /> : null}
                </div>
              ) : null}
              <span className="type-caption text-fg-muted">{t("freeOrder")}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:flex-row sm:items-center">
              <ProgressRing value={progressPct} label={t("progressLabel")} size={80} />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <ProgressBar value={progressPct} label={t("progressLabel")} />
                <p className="type-body-sm text-fg">{t("progressText", { done: requiredDone, total: required.length })}</p>
                <p className="type-caption text-fg-muted">
                  {t("enrolledOn", { date: formatDate(enrollment.enrolled_at, uiLocale, undefined, tz) })}
                  {enrollment.completed_at ? ` · ${t("completedOn", { date: formatDate(enrollment.completed_at, uiLocale, undefined, tz) })}` : null}
                </p>
              </div>
              {favorite || canSaveToList || enrollment.status === "active" ? (
                <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                  {favorite ? <FavoriteButton kind="program" id={program.id} initial={favorite.favorite} path={path} /> : null}
                  {canSaveToList ? <AddToListButton kind="program" id={program.id} withLabel /> : null}
                  {enrollment.status === "active" && <AbandonButton enrollmentId={enrollment.id} path={path} />}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </header>

      {support.showActions ? (
        <ProgramActions
          start={startNode()}
          startHint={t(`actions.startHint.${start}`)}
          nativeApp={hireEnv.nativeApp}
          products={support.showProducts ? <ProgramProductRows products={programProducts} isLoggedIn={Boolean(user)} nextPath={path} /> : null}
          professionals={
            support.showProfessionals ? (
              <ProgramProfessionalRows professionals={professionals} env={{ ...hireEnv, inCart: servicesInCart }} creatorId={creatorId} nextPath={path} />
            ) : null
          }
        />
      ) : null}

      {cards.length > 0 ? (
        <section aria-labelledby="program-cards-title" className="flex flex-col gap-4" data-testid="program-cards-section">
          <div className="flex flex-col gap-0.5">
            <h2 id="program-cards-title" className="type-h2 text-fg">
              {t("cards.title")}
            </h2>
            <p className="type-body-sm text-fg-muted">{t("cards.description")}</p>
          </div>
          <ProgramCards cards={cards} />
        </section>
      ) : null}

      {/* Certificado simbólico */}
      {enrollment?.status === "completed" && certificate && (
        <section aria-labelledby="certificate-title" className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent-soft/40 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg">
              <Award className="size-6" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 id="certificate-title" className="type-h3 text-fg">
                {t("certificate.title")}
                {certificate.revoked_at && (
                  <Badge variant="danger" size="sm" className="ml-2 align-middle">
                    {t("certificate.revoked")}
                  </Badge>
                )}
              </h2>
              <p className="type-body-sm max-w-prose text-fg-muted">{t("certificate.description")}</p>
              <p className="type-caption text-fg-muted">
                {t("certificate.code")}: <span className="font-mono font-semibold text-fg">{certificate.code}</span> · {t("certificate.issued", { date: formatDate(certificate.issued_at, uiLocale, undefined, tz) })}
              </p>
              <p className="type-caption text-fg-muted">{t("certificate.verify", { url: `${siteUrl}/verify/${certificate.code}` })}</p>
            </div>
          </div>
          <Button asChild variant="primary" leadingIcon={<Download />}>
            <a href={`/api/certificates/${certificate.code}`} target="_blank" rel="noopener">
              {t("certificate.download")}
            </a>
          </Button>
        </section>
      )}

      <section aria-label={t("feedbackTitle")} className="pt-2">
        <FeedbackWidget context={`program:${program.id}`} />
      </section>
    </div>
  );
}
