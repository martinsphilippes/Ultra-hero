import { getTranslations } from "next-intl/server";
import { Button, Input } from "@/components/ui";

// Campo do código que libera o acesso rápido neste navegador (POST comum para /demo/unlock).
export async function DemoUnlockForm({ wrongCode }: { wrongCode?: boolean }) {
  const t = await getTranslations("demo");
  return (
    <form method="post" action="/demo/unlock" className="flex flex-col gap-2">
      <label htmlFor="demo-code" className="text-sm text-fg-muted">
        {t("codeLabel")}
      </label>
      <div className="flex gap-2">
        <Input
          id="demo-code"
          name="code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          aria-invalid={wrongCode || undefined}
          aria-describedby={wrongCode ? "demo-code-error" : undefined}
        />
        <Button type="submit" variant="primary">
          {t("unlock")}
        </Button>
      </div>
      {wrongCode ? (
        <p id="demo-code-error" role="alert" className="type-caption text-danger">
          {t("codeError")}
        </p>
      ) : null}
    </form>
  );
}
