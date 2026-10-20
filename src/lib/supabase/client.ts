import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

// Cliente Supabase para componentes que rodam no navegador (sempre sob RLS).
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
