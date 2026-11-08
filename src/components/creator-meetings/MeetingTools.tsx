"use client";

import { Copy, Download, Mail, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, useToast } from "@/components/ui";

// Ata de reunião (0138): formalização por e-mail, como no guia. Assunto "ATA | Reunião Creator | Nome | AAAA-MM-DD",
// arquivo "ATA_Creator_Nome_AAAA-MM-DD" (.txt ou PDF pela impressão, que já sugere esse nome) e o texto da ata.

/** mailto aceita pouco texto em alguns aplicativos: acima disso o corpo pede para colar a ata copiada. */
const MAILTO_BODY_MAX = 1800;

export function MeetingTools({ subject, fileName, text }: { subject: string; fileName: string; text: string }) {
  const t = useTranslations("creatorMeetings.tools");
  const { toast } = useToast();

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: t("copied"), variant: "success" });
    } catch {
      toast({ title: t("copyFailed"), variant: "error" });
    }
  }

  function download() {
    const blob = new Blob([`${subject}\n\n${text}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function print() {
    // o nome do PDF sugerido pelo navegador é o título da página
    const previous = document.title;
    document.title = fileName;
    window.print();
    setTimeout(() => {
      document.title = previous;
    }, 1000);
  }

  const body = text.length <= MAILTO_BODY_MAX ? text : t("pasteHint");
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 print:hidden" aria-labelledby="meeting-tools-title" data-testid="meeting-tools">
      <div className="flex flex-col gap-1">
        <h2 id="meeting-tools-title" className="text-base font-semibold text-fg">
          {t("title")}
        </h2>
        <p className="type-caption text-fg-muted">{t("lead")}</p>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className="type-caption font-semibold text-fg-muted">{t("subject")}</dt>
          <dd className="break-words font-mono text-sm text-fg" data-testid="meeting-subject">
            {subject}
          </dd>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className="type-caption font-semibold text-fg-muted">{t("file")}</dt>
          <dd className="break-all font-mono text-sm text-fg" data-testid="meeting-file">
            {fileName}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" leadingIcon={<Copy />} onClick={() => copy(subject)}>
          {t("copySubject")}
        </Button>
        <Button type="button" size="sm" variant="secondary" leadingIcon={<Copy />} onClick={() => copy(`${subject}\n\n${text}`)} data-testid="meeting-copy">
          {t("copyText")}
        </Button>
        <Button type="button" size="sm" variant="secondary" leadingIcon={<Download />} onClick={download}>
          {t("download")}
        </Button>
        <Button type="button" size="sm" variant="secondary" leadingIcon={<Printer />} onClick={print}>
          {t("print")}
        </Button>
        <Button asChild size="sm" variant="secondary" leadingIcon={<Mail />}>
          <a href={mailto}>{t("email")}</a>
        </Button>
      </div>
      <p className="type-caption text-fg-muted">{t("fromSaved")}</p>
    </section>
  );
}
