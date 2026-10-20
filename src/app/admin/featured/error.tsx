"use client";

import { AdminError } from "@/components/admin-content";

export default function FeaturedAdminError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <AdminError {...props} backHref="/admin" />;
}
