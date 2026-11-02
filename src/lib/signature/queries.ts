import "server-only";
import { isMissingSchema } from "@/lib/supabase/helpers";
import { createClient } from "@/lib/supabase/server";

// Comprovante da assinatura eletrônica (0084): o banco decide quem lê (quem assinou, a agência, a marca só a dela).

export type SignatureReceipt = {
  id: string;
  side: "agency" | "brand" | "talent";
  party: "brand" | "talent";
  termsId: string;
  termsVersion: number;
  termsStatus: string | null;
  dealId: string;
  deal: string;
  requestId: string | null;
  dealTalentId: string | null;
  brand: string;
  agency: string;
  talent: string | null;
  signerName: string;
  taxId: string;
  taxKind: "cpf" | "cnpj";
  email: string;
  ip: string | null;
  userAgent: string;
  signedAt: string;
  sha256: string;
  text: string;
  intact: boolean;
};

const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

export async function getSignatureReceipt(id: string): Promise<{ available: boolean; data: SignatureReceipt | null }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { available: true, data: null };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("terms_signature_receipt", { p_id: id });
  if (error) return { available: !isMissingSchema(error), data: null };
  if (!data || typeof data !== "object" || Array.isArray(data)) return { available: true, data: null };
  const r = data as Record<string, unknown>;
  return {
    available: true,
    data: {
      id: String(r.id),
      side: r.side as SignatureReceipt["side"],
      party: r.party as SignatureReceipt["party"],
      termsId: String(r.terms_id),
      termsVersion: Number(r.terms_version),
      termsStatus: str(r.terms_status),
      dealId: String(r.deal_id),
      deal: String(r.deal ?? ""),
      requestId: str(r.request_id),
      dealTalentId: str(r.deal_talent_id),
      brand: String(r.brand ?? ""),
      agency: String(r.agency ?? ""),
      talent: str(r.talent),
      signerName: String(r.signer_name ?? ""),
      taxId: String(r.tax_id ?? ""),
      taxKind: r.tax_kind === "cnpj" ? "cnpj" : "cpf",
      email: String(r.email ?? ""),
      ip: str(r.ip),
      userAgent: String(r.user_agent ?? ""),
      signedAt: String(r.signed_at),
      sha256: String(r.sha256 ?? ""),
      text: String(r.text ?? ""),
      intact: r.intact === true,
    },
  };
}
