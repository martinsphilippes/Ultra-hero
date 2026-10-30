// Push da casca (expo-notifications): permissão, token Expo e o caminho que o toque abre.
// A web pede pelo contrato da ponte (push-permission / push-sync) e grava o token na conta.
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { NativeToWeb } from "../../src/lib/native-app/bridge-contract";

// No primeiro plano a pessoa já está no app: post de herói aparece como banner; conquista e
// programa a web já mostrou na tela (toast), então não repete. Lance superado (0061) aparece: o pop-up
// da web não roda no app (os Colecionáveis não existem nas lojas).
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const kind = notification.request.content.data?.kind;
    const show = kind === "hero_post" || kind === "streak_reminder" || kind === "auction_outbid";
    return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: false, shouldSetBadge: false };
  },
});

let channelReady: Promise<void> | null = null;
function ensureAndroidChannel() {
  if (Platform.OS !== "android") return Promise.resolve();
  // o servidor manda channelId "default" (src/lib/push/dispatch.ts)
  channelReady ??= Notifications.setNotificationChannelAsync("default", {
    name: "Groscove Ultra",
    importance: Notifications.AndroidImportance.DEFAULT,
  }).then(() => undefined);
  return channelReady;
}

export async function pushToken(ask: boolean): Promise<NativeToWeb> {
  try {
    // simulador do iOS e emulador sem Play Services não recebem push
    if (!Device.isDevice) return { type: "push-result", ok: false, reason: "unavailable" };
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return { type: "push-result", ok: false, reason: "unavailable" };
    await ensureAndroidChannel();
    let { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status !== "granted" && ask && canAskAgain) ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return { type: "push-result", ok: false, reason: ask ? "denied" : "unavailable" };
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return { type: "push-token", token: data };
  } catch {
    return { type: "push-result", ok: false, reason: "error" };
  }
}

/** Caminho do site que o aviso tocado abre (vem do servidor em data.url). */
export function pathFromResponse(response: Notifications.NotificationResponse | null): string | null {
  const url = response?.notification.request.content.data?.url;
  return typeof url === "string" ? url : null;
}
