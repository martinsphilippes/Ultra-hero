import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { error } = await supabase.auth.getSession();
  const connected = !error;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-4xl font-bold">Ultra Hero</h1>
      <p className="text-sm opacity-70">
        Supabase:{" "}
        <span className={connected ? "text-green-500" : "text-red-500"}>
          {connected ? "conectado" : "erro de conexão"}
        </span>
      </p>
    </main>
  );
}
