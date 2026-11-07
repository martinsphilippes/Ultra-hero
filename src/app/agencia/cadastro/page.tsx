import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { MemberProfileForm } from "@/components/team/MemberProfileForm";
import { requireAgency } from "@/lib/agency/server";
import { PersonalityCta } from "@/components/personality/PersonalityCta";
import { getUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("team.gate");
  return { title: t("editTitle") };
}

// Meu cadastro (0125): o colaborador revê e atualiza o próprio cadastro PJ (nome, CNPJ, cargo, nível) a qualquer hora.
export default async function MemberProfilePage() {
  const [ctx, t, user] = await Promise.all([requireAgency("staff"), getTranslations("team.gate"), getUser()]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("editTitle")} description={t("editBody")} />
      {user ? (
        <div className="max-w-xl">
          <PersonalityCta userId={user.id} />
        </div>
      ) : null}
      <section className="max-w-xl rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <MemberProfileForm mode="complete" doneHref="/agencia/cadastro" initial={{ fullName: ctx.memberName, cnpj: ctx.memberProfile?.cnpj, jobTitle: ctx.memberTitle, level: ctx.memberProfile?.level }} />
      </section>
    </div>
  );
}
