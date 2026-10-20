import { getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/admin";
import type { Enums } from "@/lib/supabase/helpers";

type Props = { status: Enums<"content_status">; review: Enums<"review_status">; size?: "sm" | "md" };

// Par de etiquetas status + revisão, com texto traduzido (adminCommon.status).
export async function ContentStatusBadges({ status, review, size = "sm" }: Props) {
  const ts = await getTranslations("adminCommon.status");
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StatusBadge status={status} label={ts(status)} size={size} />
      {review !== "none" && <StatusBadge status={review} label={ts(review)} size={size} />}
    </span>
  );
}
