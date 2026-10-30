import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { OrderDetail } from "@/components/professionals/portal/OrderDetail";
import { PageHeader } from "@/components/ui";
import { getMyProfessional, serviceOrderById } from "@/lib/professionals/queries";
import { isUuid } from "@/lib/professionals/rules";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

// Pedido no portal: só os do próprio profissional (RLS + conferência do id).
export default async function ProfessionalOrderPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { professional: pro } = await getMyProfessional();
  if (!pro) return null;
  const order = await serviceOrderById(id);
  if (!order || order.professionalId !== pro.id) notFound();
  const t = await getTranslations("professionals.portal");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={order.title} backHref="/profissional/pedidos" backLabel={t("orderBack")} />
      <OrderDetail order={order} actor="professional" />
    </div>
  );
}
