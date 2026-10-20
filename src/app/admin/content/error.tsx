"use client";

import { AdminError } from "@/components/admin-content";

export default function ContentAdminError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <AdminError {...props} backHref="/admin/content" />;
}
