"use client";

import { ImageUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { uploadBrandLogoAction } from "@/lib/brand-universe/actions";
import { Button } from "@/components/ui";
import { BrandLogo } from "./BrandLogo";

// Trocar o logo (0131): a Groscove (gestor+) e a própria marca. O servidor confere o tipo pelos bytes.
export function BrandLogoUpload({ brandId, name, url }: { brandId: string; name: string; url: string | null }) {
  const t = useTranslations("brandUniverse.logo");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(url);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const inputId = `brand-logo-${brandId}`;

  return (
    <div className="flex items-center gap-4" data-testid="brand-logo-upload">
      <BrandLogo name={name} url={current} size="lg" />
      <div className="flex flex-col gap-1.5">
        <input
          ref={input}
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const fd = new FormData();
            fd.set("brandId", brandId);
            fd.set("file", file);
            start(async () => {
              setMsg(null);
              const r = await uploadBrandLogoAction(fd);
              if (input.current) input.current.value = "";
              if (!r.ok) return setMsg({ ok: false, text: r.error });
              setCurrent(r.url);
              setMsg({ ok: true, text: t("done") });
              router.refresh();
            });
          }}
        />
        <Button asChild size="sm" variant="secondary" leadingIcon={<ImageUp />} loading={pending}>
          <label htmlFor={inputId} className="cursor-pointer">
            {pending ? t("sending") : t("change")}
          </label>
        </Button>
        <p className="type-caption text-fg-muted">{t("hint")}</p>
        {msg ? (
          <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "type-caption text-success" : "type-caption text-danger"}>
            {msg.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
