"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Button, FormField, IconButton, Input, Textarea } from "@/components/ui";
import { ListEditor, useValidationMessage } from "./fields";
import type { FieldErrors, VideoBody } from "./schema";

type Props = { value: VideoBody; onChange: (value: VideoBody) => void; errors: FieldErrors };

// Corpo de vídeo: introdução, pontos-chave e transcrição (segundo + texto) usada pelo player de demonstração.
export function VideoEditor({ value, onChange, errors }: Props) {
  const t = useTranslations("editors.body.video");
  const tv = useValidationMessage();
  const baseId = useId();

  function setLine(index: number, patch: Partial<VideoBody["transcript"][number]>) {
    onChange({ ...value, transcript: value.transcript.map((line, i) => (i === index ? { ...line, ...patch } : line)) });
  }

  return (
    <div className="flex flex-col gap-5">
      <FormField label={t("intro")} hint={t("introHint")} error={tv(errors["body.intro"])}>
        <Textarea rows={4} maxLength={2000} value={value.intro} onChange={(e) => onChange({ ...value, intro: e.target.value })} />
      </FormField>

      <ListEditor
        label={t("keyPoints")}
        hint={t("keyPointsHint")}
        items={value.key_points}
        onChange={(key_points) => onChange({ ...value, key_points })}
        errorPrefix="body.key_points"
        errors={errors}
        max={12}
        itemLabel={(n) => t("keyPoint", { n })}
      />

      <div className="flex flex-col gap-2" role="group" aria-labelledby={`${baseId}-transcript`}>
        <span id={`${baseId}-transcript`} className="text-sm font-semibold text-fg">
          {t("transcript")}
        </span>
        <p className="type-caption text-fg-muted">{t("transcriptHint")}</p>
        {value.transcript.length === 0 && <p className="type-caption text-fg-subtle">{t("transcriptEmpty")}</p>}
        <ol className="flex flex-col gap-2">
          {value.transcript.map((line, index) => {
            const tError = tv(errors[`body.transcript.${index}.t`]);
            const textError = tv(errors[`body.transcript.${index}.text`]);
            const id = `${baseId}-line-${index}`;
            return (
              <li key={index} className="flex items-start gap-2">
                <div className="w-24 shrink-0">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={86400}
                    aria-label={t("lineTime", { n: index + 1 })}
                    aria-invalid={tError ? true : undefined}
                    aria-describedby={tError ? `${id}-terr` : undefined}
                    value={Number.isFinite(line.t) ? line.t : ""}
                    onChange={(e) => setLine(index, { t: e.target.value === "" ? 0 : Math.max(0, Math.floor(Number(e.target.value))) })}
                  />
                  {tError && (
                    <p id={`${id}-terr`} role="alert" className="type-caption font-medium text-danger">
                      {tError}
                    </p>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Input
                    aria-label={t("lineText", { n: index + 1 })}
                    aria-invalid={textError ? true : undefined}
                    aria-describedby={textError ? `${id}-xerr` : undefined}
                    maxLength={500}
                    value={line.text}
                    onChange={(e) => setLine(index, { text: e.target.value })}
                  />
                  {textError && (
                    <p id={`${id}-xerr`} role="alert" className="type-caption font-medium text-danger">
                      {textError}
                    </p>
                  )}
                </div>
                <IconButton label={t("removeLine", { n: index + 1 })} icon={<X />} onClick={() => onChange({ ...value, transcript: value.transcript.filter((_, i) => i !== index) })} />
              </li>
            );
          })}
        </ol>
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leadingIcon={<Plus />}
            disabled={value.transcript.length >= 500}
            onClick={() => {
              const last = value.transcript[value.transcript.length - 1];
              onChange({ ...value, transcript: [...value.transcript, { t: last ? last.t + 20 : 0, text: "" }] });
            }}
          >
            {t("addLine")}
          </Button>
        </div>
      </div>
    </div>
  );
}
