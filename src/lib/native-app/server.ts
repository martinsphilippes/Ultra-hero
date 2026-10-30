import "server-only";
import { headers } from "next/headers";
import { parseNativeApp, type NativeApp } from "./surface";

/** A requisição veio do app das lojas? (user agent da WebView da casca). */
export async function getNativeApp(): Promise<NativeApp | null> {
  return parseNativeApp((await headers()).get("user-agent"));
}
