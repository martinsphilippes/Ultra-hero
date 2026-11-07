import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

// Cartão da Onda Digital no início do portal da marca (0132), no visual da apresentação.
export async function OndaHomeCard() {
  const t = await getTranslations("ondaDigital.homeCard");
  return (
    <Link
      href="/marca/onda-digital"
      className="group relative flex flex-col gap-3 overflow-hidden rounded-3xl border-2 border-[#0c0c20] bg-[#0f9fc4] bg-[url('/onda-digital/vitral-azul.svg')] bg-cover bg-center p-5 pr-28 text-white shadow-[5px_5px_0_#0c0c20] transition-transform hover:-translate-y-0.5 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#0c0c20] sm:pr-40"
      data-testid="onda-home-card"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/onda-digital/sereia.webp" alt="" aria-hidden="true" className="pointer-events-none absolute -bottom-2 right-3 w-20 sm:w-28" />
      <span className="w-fit rounded-full border-2 border-[#0c0c20] bg-[#ffd84d] px-3 py-0.5 text-xs font-extrabold text-[#0c0c20]">{t("badge")}</span>
      <span className="sr-only">{t("title")}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/onda-digital/wordmark.webp" alt="" aria-hidden="true" className="w-48 sm:w-60" width={1400} height={849} />
      <span className="max-w-md text-base font-extrabold leading-snug [text-shadow:0_2px_0_#0c0c20]">{t("text")}</span>
      <span className="inline-flex w-fit items-center gap-2 rounded-full border-2 border-[#0c0c20] bg-[#ffd84d] px-4 py-2 text-sm font-extrabold text-[#0c0c20] shadow-[3px_3px_0_#0c0c20]">
        {t("cta")}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  );
}
