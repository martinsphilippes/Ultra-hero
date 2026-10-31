"use client";

import { UserMinus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { removeBrandMemberAction } from "@/app/agencia/marcas/actions";
import { removeBrandStaffAction } from "@/app/marca/actions";
import { Button, useToast } from "@/components/ui";

// Remove alguém da equipe da marca (gestor+ da agência ou dono da marca; o último dono fica).
export function BrandMemberRemove({ brandId, userId, name, from }: { brandId: string; userId: string; name: string; from: "agency" | "brand" }) {
  const t = useTranslations("agency.brands");
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      leadingIcon={<UserMinus />}
      loading={pending}
      aria-label={t("removeMemberFor", { name })}
      onClick={() =>
        start(async () => {
          const result = from === "agency" ? await removeBrandMemberAction({ brandId, userId }) : await removeBrandStaffAction({ userId });
          toast({ title: result.ok ? result.message : result.error, variant: result.ok ? "success" : "error" });
        })
      }
    >
      {t("removeMember")}
    </Button>
  );
}
