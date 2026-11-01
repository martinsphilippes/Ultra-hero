import { ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KpiCard } from "@/components/admin-ops/KpiCard";
import { InviteForm, StatusForm, SuggestionsEditor } from "@/components/professionals/admin/AdminControls";
import { OrderCardLink } from "@/components/professionals/portal/OrderCardLink";
import { OrderDetail } from "@/components/professionals/portal/OrderDetail";
import { ProfileForm } from "@/components/professionals/portal/ProfileForm";
import { ServiceEditor } from "@/components/professionals/portal/ServiceEditor";
import { RegistryLine, VerifiedBadge } from "@/components/professionals/ProfessionalBits";
import { Avatar, Badge, PageHeader } from "@/components/ui";
import { adminProfessionalOrders, getAdminProfessional, professionalSuggestions, suggestionOptions } from "@/lib/professionals/admin";
import { professionalServices } from "@/lib/professionals/queries";
import { durationParts, isUuid, responseStats } from "@/lib/professionals/rules";
import { cn } from "@/lib/utils";
import { saveProfessionalAdmin, saveProfessionalServiceAdmin } from "../actions";

export const dynamic = "force-dynamic";

const TABS = ["overview", "profile", "services", "suggestions", "orders"] as const;
type Tab = (typeof TABS)[number];
const TAB_PARAM: Record<Tab, string> = { overview: "", profile: "perfil", services: "servicos", suggestions: "sugeridos", orders: "pedidos" };
const STATUS_BADGE = { pending: "warning", approved: "success", suspended: "danger" } as const;

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

// Profissional no admin (0058): abas Visão geral (aprovação, conta), Perfil, Serviços (preços,
// desativar), Sugeridos (herói/receita/programa) e Pedidos (tempo de resposta, cancelar com recado).
export default async function AdminProfessionalPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const pro = await getAdminProfessional(id);
  if (!pro) notFound();
  const aba = one(query.aba);
  const tab: Tab = (Object.entries(TAB_PARAM).find(([, v]) => v && v === aba)?.[0] as Tab | undefined) ?? "overview";
  const [t, tp, tm] = await Promise.all([getTranslations("professionals.admin"), getTranslations("professionals.portal"), getTranslations("professionals")]);
  const base = `/admin/professionals/${pro.id}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            <Avatar src={pro.photoUrl} name={pro.name} size="md" alt="" />
            {pro.name}
          </span>
        }
        eyebrow={tm(`specialty.${pro.specialty}`)}
        backHref="/admin/professionals"
        backLabel={t("title")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_BADGE[pro.status]}>{tp(`status.${pro.status}`)}</Badge>
            {pro.registryVerified ? <VerifiedBadge /> : null}
            {pro.status === "approved" ? (
              <Link href={`/profissionais/${pro.slug}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-accent-text hover:underline">
                {tp("viewPublic")}
                <ExternalLink className="size-4" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        }
      >
        <nav aria-label={t("title")} className="-mx-gutter overflow-x-auto px-gutter md:mx-0 md:px-0">
          <ul className="flex gap-1 border-b border-border">
            {TABS.map((key) => (
              <li key={key}>
                <Link
                  href={TAB_PARAM[key] ? `${base}?aba=${TAB_PARAM[key]}` : base}
                  aria-current={tab === key ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm font-semibold",
                    tab === key ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg",
                  )}
                >
                  {t(`tabs.${key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </PageHeader>

      {tab === "overview" ? <Overview pro={pro} /> : null}
      {tab === "profile" ? (
        <ProfileForm
          mode="admin"
          initial={{
            name: pro.name,
            photoUrl: pro.photoUrl,
            bio: pro.bio,
            cities: pro.cities,
            online: pro.online,
            registryNumber: pro.registryNumber,
            registryUf: pro.registryUf,
            slug: pro.slug,
            specialty: pro.specialty,
            registryType: pro.registryType,
            sortOrder: pro.sortOrder,
          }}
          onSave={saveProfessionalAdmin.bind(null, pro.id)}
        />
      ) : null}
      {tab === "services" ? <ServiceEditor services={await professionalServices(pro.id)} onSave={saveProfessionalServiceAdmin.bind(null, pro.id)} admin /> : null}
      {tab === "suggestions" ? <Suggestions id={pro.id} /> : null}
      {tab === "orders" ? <Orders id={pro.id} base={base} orderId={one(query.pedido) ?? null} /> : null}
    </div>
  );
}

type AdminPro = NonNullable<Awaited<ReturnType<typeof getAdminProfessional>>>;

async function Overview({ pro: p }: { pro: AdminPro }) {
  const [t, tp, orders] = await Promise.all([getTranslations("professionals.admin"), getTranslations("professionals.portal"), adminProfessionalOrders(p.id)]);
  const stats = responseStats(orders.map((o) => ({ createdAt: o.createdAt, firstResponseAt: o.firstResponseAt })));
  const parts = stats.medianMinutes === null ? null : durationParts(stats.medianMinutes);
  const median = parts ? tp(`duration.${parts.unit}`, { value: parts.value }) : tp("kpi.none");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <RegistryLine pro={p} />
        <span className="type-caption text-fg-muted">· {p.userId ? t("account.linked") : t("account.none")}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={tp("kpi.pending")} value={orders.filter((o) => o.status === "pending").length} />
        <KpiCard label={tp("kpi.open")} value={orders.filter((o) => o.status === "accepted" || o.status === "scheduled").length} />
        <KpiCard label={tp("kpi.completed")} value={orders.filter((o) => o.status === "completed").length} />
        <KpiCard label={tp("kpi.median")} value={median} />
      </div>
      <StatusForm id={p.id} status={p.status} verified={p.registryVerified} note={p.verificationNote} />
      <InviteForm professionalId={p.id} linked={p.userId !== null} />
    </div>
  );
}

async function Suggestions({ id }: { id: string }) {
  const [current, options] = await Promise.all([professionalSuggestions(id), suggestionOptions()]);
  return <SuggestionsEditor professionalId={id} current={current} options={options} />;
}

async function Orders({ id, base, orderId }: { id: string; base: string; orderId: string | null }) {
  const [t, orders] = await Promise.all([getTranslations("professionals.admin"), adminProfessionalOrders(id)]);
  const selected = orderId && isUuid(orderId) ? orders.find((o) => o.id === orderId) : null;
  if (selected) return <OrderDetail order={selected} actor="admin" />;
  const stats = responseStats(orders.map((o) => ({ createdAt: o.createdAt, firstResponseAt: o.firstResponseAt })));
  return (
    <section aria-labelledby="admin-pro-orders" className="flex flex-col gap-3">
      <h2 id="admin-pro-orders" className="type-h3 text-fg">
        {t("orders.title")}
      </h2>
      <p className="type-caption text-fg-muted">{t("orders.stats", { answered: stats.answered, waiting: stats.waiting })}</p>
      {orders.length === 0 ? (
        <p className="type-body-sm text-fg-muted">{t("orders.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((o) => (
            <li key={o.id}>
              <OrderCardLink order={o} href={`${base}?aba=pedidos&pedido=${o.id}`} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
