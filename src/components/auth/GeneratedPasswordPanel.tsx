"use client";

import { ArrowRight, Check, Copy, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { finishQuickSignup } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { AuthAlert } from "./AuthAlert";

type Props = {
  /** null: a página foi recarregada; a senha não volta (está no Perfil, se o cofre estiver ligado). */
  password: string | null;
  stored: boolean;
  signedIn: boolean;
  next: string;
};

// "Sua senha": mostrada uma vez, grande e legível, para anotar ou copiar.
export function GeneratedPasswordPanel({ password, stored, signedIn, next }: Props) {
  const t = useTranslations("auth.quick.password");
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const headingRef = useRef<HTMLHeadingElement>(null);

  // leva o foco para o título: quem usa leitor de tela ouve que a conta foi criada
  useEffect(() => headingRef.current?.focus(), []);

  async function copy() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied("ok");
      window.setTimeout(() => setCopied("idle"), 2500);
    } catch {
      setCopied("fail");
    }
  }

  return (
    <div className="flex flex-col gap-5" data-testid="generated-password">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg">
          <KeyRound className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 ref={headingRef} tabIndex={-1} className="type-h3 text-fg outline-none">
            {password ? t("title") : t("resumeTitle")}
          </h2>
          <p className="type-body-sm text-fg-muted">{password ? t("intro") : t("resumeBody")}</p>
        </div>
      </div>

      {password ? (
        <>
          <p
            className="select-all break-all rounded-xl border-2 border-dashed border-accent/50 bg-surface-elevated px-4 py-5 text-center font-mono text-3xl font-bold tracking-wider text-fg sm:text-4xl"
            data-testid="generated-password-value"
            translate="no"
          >
            {password}
          </p>
          <Button type="button" variant="secondary" block onClick={copy} leadingIcon={copied === "ok" ? <Check /> : <Copy />}>
            {copied === "ok" ? t("copied") : t("copy")}
          </Button>
          <p role="status" className="sr-only">
            {copied === "ok" ? t("copied") : ""}
          </p>
          {copied === "fail" && <AuthAlert tone="info">{t("copyFailed")}</AuthAlert>}
          <AuthAlert tone={stored ? "info" : "error"}>{stored ? t("storedNote") : t("notStoredNote")}</AuthAlert>
        </>
      ) : null}

      {signedIn ? (
        <form action={finishQuickSignup}>
          <input type="hidden" name="next" value={next} />
          <Button type="submit" block size="lg" trailingIcon={<ArrowRight />}>
            {password ? t("done") : t("continue")}
          </Button>
        </form>
      ) : (
        <>
          <AuthAlert tone="info">{t("notSignedIn")}</AuthAlert>
          <Button asChild variant="secondary" block>
            <a href={`/login?next=${encodeURIComponent(next)}`}>{t("signInWithPassword")}</a>
          </Button>
        </>
      )}
    </div>
  );
}
