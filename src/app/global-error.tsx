"use client";

import { useEffect, useState } from "react";
import { recoverFromRootCrash } from "@/lib/stale-build";

type GlobalErrorProps = { error: Error & { digest?: string }; reset: () => void };

// Este limite fica acima do layout raiz: sem provedor de traduções nem estilos do app. Idioma pelo aparelho.
const TEXTS = {
  "pt-BR": {
    title: "Algo deu errado ao abrir esta tela",
    body: "O que você enviou pode já ter sido salvo. Recarregue para continuar.",
    reload: "Recarregar",
    detail: "Detalhe técnico",
  },
  en: {
    title: "Something went wrong opening this screen",
    body: "What you sent may already have been saved. Reload to continue.",
    reload: "Reload",
    detail: "Technical detail",
  },
  es: {
    title: "Algo salió mal al abrir esta pantalla",
    body: "Lo que enviaste puede que ya se haya guardado. Recarga para continuar.",
    reload: "Recargar",
    detail: "Detalle técnico",
  },
} as const;

function deviceLocale(): keyof typeof TEXTS {
  const lang = typeof navigator === "undefined" ? "" : (navigator.language ?? "").toLowerCase();
  if (lang.startsWith("es")) return "es";
  if (lang.startsWith("en")) return "en";
  return "pt-BR";
}

/**
 * Falha que escapa de todas as telas (ex.: app aberto numa versão anterior do site durante uma publicação: o cadastro
 * grava no servidor e a resposta quebra o JavaScript antigo). Sem este limite o Next mostra "Application error" em
 * inglês e, no app das lojas, a pessoa fica presa (não há barra para recarregar). Recarrega sozinho uma vez por minuto
 * (src/lib/stale-build.ts); se não der, mostra a tela com o botão e o detalhe técnico para o suporte.
 */
export default function GlobalError({ error }: GlobalErrorProps) {
  const [reloading, setReloading] = useState(true);

  useEffect(() => {
    console.error(error);
    if (!recoverFromRootCrash()) setReloading(false);
  }, [error]);

  const locale = deviceLocale();
  const t = TEXTS[locale];
  const detail = [error?.name && error.name !== "Error" ? error.name : null, error?.message?.slice(0, 200), error?.digest].filter(Boolean).join(" · ");

  return (
    <html lang={locale}>
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          boxSizing: "border-box",
          background: "#0B0B0B",
          color: "#F7F4EF",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        {reloading ? null : (
          <main role="alert" style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 16, textAlign: "center" }}>
            <h1 style={{ margin: 0, fontSize: 20, lineHeight: 1.3, fontWeight: 700 }}>{t.title}</h1>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, opacity: 0.8 }}>{t.body}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              data-testid="global-error-reload"
              style={{
                minHeight: 48,
                border: 0,
                borderRadius: 12,
                background: "#FF5A1F",
                color: "#0B0B0B",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {t.reload}
            </button>
            {detail ? (
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.4, opacity: 0.5, wordBreak: "break-word" }}>
                {t.detail}: {detail}
              </p>
            ) : null}
          </main>
        )}
      </body>
    </html>
  );
}
