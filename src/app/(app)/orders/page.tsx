import { redirect } from "next/navigation";

// A lista de pedidos mora em Minhas compras, dentro da aba Comprar (/shop/compras). O detalhe do
// pedido continua em /orders/[id]. Links antigos para /orders chegam lá.
export default function OrdersPage() {
  redirect("/shop/compras");
}
