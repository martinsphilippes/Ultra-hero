"use client";

import { AdminOpsError } from "@/components/admin-ops/AdminOpsError";

type Props = { error: Error & { digest?: string }; reset: () => void };

// Erro da rota (dentro da casca do portal admin).
export default function RouteError(props: Props) {
  return <AdminOpsError {...props} backHref="/admin/marcas" />;
}
