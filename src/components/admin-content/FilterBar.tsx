import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button, FormField, Input, Select } from "@/components/ui";

export type FilterOption = { value: string; label: string };

export type FilterField =
  | { name: string; label: string; type: "select"; options: FilterOption[]; value: string }
  | { name: string; label: string; type: "text"; value: string; placeholder?: string }
  | { name: string; label: string; type: "date"; value: string };

type Props = {
  /** Rota do formulário (GET). */
  action: string;
  fields: FilterField[];
  /** Há algum filtro aplicado? (mostra "limpar"). */
  active: boolean;
  /** Campos ocultos preservados (ex.: aba atual). */
  hidden?: Record<string, string>;
};

// Barra de filtros via GET: funciona sem JS, URLs compartilháveis, foco visível.
export async function FilterBar({ action, fields, active, hidden }: Props) {
  const t = await getTranslations("adminContent.common");
  return (
    <form method="get" action={action} role="search" aria-label={t("filters")} className="rounded-xl border border-border bg-surface p-3 md:p-4">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map((field) => (
          <FormField key={field.name} label={field.label} id={`filter-${field.name}`}>
            {field.type === "select" ? (
              <Select name={field.name} defaultValue={field.value} selectSize="sm">
                <option value="">{t("all")}</option>
                {field.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            ) : field.type === "date" ? (
              <Input type="date" name={field.name} defaultValue={field.value} inputSize="sm" />
            ) : (
              <Input type="search" name={field.name} defaultValue={field.value} placeholder={field.placeholder} inputSize="sm" leadingIcon={<Search />} maxLength={80} />
            )}
          </FormField>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="primary">
          {t("apply")}
        </Button>
        {active && (
          <Button asChild size="sm" variant="ghost">
            <Link href={action}>{t("clearFilters")}</Link>
          </Button>
        )}
      </div>
    </form>
  );
}
