"use server";

import { revalidatePath } from "next/cache";
import { parseCreatorProfile, type CreatorProfileInput } from "@/components/creator/profile-schema";
import type { ActionResult } from "@/components/editors/types";
import { getRoles, getUser } from "@/lib/auth/session";
import { heroProfileFor } from "@/components/creator/hero-access";
import { acceptsAvatarChoice, storedAvatarOwner, supabaseBaseUrl } from "@/lib/avatar/paths";
import { releaseStoredAvatar } from "@/lib/avatar/server";
import { createAdminClient, hasAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { failFrom } from "../_lib/action-utils";

// Atualiza só as colunas liberadas do perfil da personalidade (guard no banco bloqueia o resto).
// Capa não passa por aqui (só pelo envio de foto real, cover-actions). Um avatar só para o herói: um
// avatar que chegue aqui vale também no app (profiles.avatar_url), com a mesma regra do updateProfile
// (nenhum ou a foto atual e própria; foto nova só entra pelo envio, que já grava os dois lados;
// ilustração não é mais aceita). Tirar a foto (avatar vazio) a apaga do ar.
// Sem avatar_url (o que o formulário sempre manda) nenhum dos dois avatares é tocado: o formulário
// pode estar com um valor velho (foto enviada na mesma página) e não pode trocá-la nem apagá-la.
//
// Ordem das duas gravações: primeiro o perfil público (é a que o guard, o status e a RLS podem
// recusar, e leva o resto do formulário); depois o avatar do app. Se a segunda falhar, o avatar do
// perfil público volta ao valor anterior (os dois seguem iguais) e a tela avisa que o avatar não
// mudou. Só com as duas gravadas a foto antiga é apagada: assim nenhuma imagem fica quebrada.
export async function updateCreatorProfile(values: CreatorProfileInput): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: "unauthenticated" };
  // mesma regra da tela (herói ou admin): quem perdeu o papel não edita o perfil público por POST direto
  if (heroProfileFor((await getRoles()).map((r) => r.role), true) === null) return { ok: false, error: "forbidden" };
  const parsed = parseCreatorProfile(values);
  if (!parsed.ok) return { ok: false, error: "invalid_input" };
  const v = parsed.data;
  const base = supabaseBaseUrl();

  const supabase = await createClient();
  const { data: me } = await supabase.from("creator_profiles").select("id, slug, status, avatar_url").eq("user_id", user.id).maybeSingle();
  if (!me || me.status !== "active") return { ok: false, error: "creator_unavailable" };
  const avatarChanged = v.avatar_url !== undefined;
  const nextAvatar = avatarChanged ? v.avatar_url || null : me.avatar_url;
  // o mesmo valor vai para o app: só o que o updateProfile aceitaria (nada de caminho solto nem foto alheia)
  if (avatarChanged && !acceptsAvatarChoice(nextAvatar, me.avatar_url, user.id, base)) return { ok: false, error: "invalid_input" };

  // avatar atual do app: entra na lista de fotos próprias a apagar depois da troca
  let appAvatar: string | null = null;
  if (avatarChanged) {
    const { data: app } = await supabase.from("profiles").select("avatar_url").eq("id", user.id).maybeSingle();
    appAvatar = app?.avatar_url ?? null;
  }

  const { error } = await supabase
    .from("creator_profiles")
    .update({
      headline: v.headline || null,
      bio: v.bio || null,
      ...(avatarChanged ? { avatar_url: nextAvatar } : {}),
      socials: v.socials,
    })
    .eq("id", me.id);
  if (error) return failFrom(error);

  if (avatarChanged) {
    const { error: appError } = await supabase.from("profiles").update({ avatar_url: nextAvatar }).eq("id", user.id);
    if (appError) {
      // desfaz só o avatar do perfil público: os dois continuam com o valor de antes
      const { error: undoError } = await supabase.from("creator_profiles").update({ avatar_url: me.avatar_url }).eq("id", me.id);
      if (undoError) console.warn("[creator] avatar do perfil público não voltou ao anterior:", undoError.message);
      revalidateHero(me.slug);
      return { ok: false, error: "avatar_not_saved" };
    }
    // fotos próprias que saíram dos dois lados (uma vez só, mesmo se estavam nos dois)
    const released = Array.from(new Set([me.avatar_url, appAvatar])).filter((url): url is string => url !== nextAvatar && storedAvatarOwner(url, base) === user.id);
    if (base && released.length > 0 && hasAdminClient()) {
      const admin = createAdminClient();
      for (const url of released) await releaseStoredAvatar(admin, { url, baseUrl: base });
    }
    // o avatar do app aparece no cabeçalho de todas as telas
    revalidatePath("/", "layout");
  }

  revalidateHero(me.slug);
  return { ok: true };
}

// o formulário do herói mora no /profile (topo, "Editar perfil")
function revalidateHero(slug: string) {
  revalidatePath("/profile");
  revalidatePath("/creator");
  revalidatePath("/personalities");
  revalidatePath(`/personalities/${slug}`);
}
