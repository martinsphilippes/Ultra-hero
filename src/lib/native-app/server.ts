import "server-only";
import { cookies, headers } from "next/headers";
import { NATIVE_CHANNEL_COOKIE, nativeAppFrom, type NativeApp } from "./surface";

/** A requisição veio do app das lojas? (user agent da WebView da casca ou, sem ele, o cookie do canal — 0141). */
export async function getNativeApp(): Promise<NativeApp | null> {
  const [h, c] = await Promise.all([headers(), cookies()]);
  return nativeAppFrom(h.get("user-agent"), c.get(NATIVE_CHANNEL_COOKIE)?.value);
}
