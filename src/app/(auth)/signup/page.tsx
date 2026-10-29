import { redirect } from "next/navigation";

type SearchParams = Promise<{ next?: string }>;

// O cadastro agora é o cadastro rápido da tela inicial (/login). Mantém o `next` (ex.: convite).
export default async function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams;
  redirect(typeof next === "string" && next ? `/login?next=${encodeURIComponent(next)}` : "/login");
}
