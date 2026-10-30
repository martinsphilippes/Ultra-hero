import * as AppleAuthentication from "expo-apple-authentication";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";
import { NATIVE_EVENT, parseWebToNative, type NativeToWeb } from "../../src/lib/native-app/bridge-contract";
import { BEFORE_CONTENT_SCRIPT, dispatchToWeb } from "./injected";
import { decideNavigation, webUrlFromDeepLink } from "./navigation";
import { stringsFor } from "./strings";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const WEB_URL: string = Constants.expoConfig?.extra?.webUrl ?? "https://ultra-hero.vercel.app";
const ORIGIN = new URL(WEB_URL).origin;
const START_URL = `${ORIGIN}/personalities`;
const AUTH_RETURN = "gchero://auth/callback";
// Marcador que a web lê (src/lib/native-app/surface.ts) para esconder o que não existe nas lojas.
const USER_AGENT_SUFFIX = `GCHeroApp/${Constants.expoConfig?.version ?? "0.0.0"} (${Platform.OS})`;
// Splash não pode prender o app se a primeira carga demorar.
const SPLASH_TIMEOUT_MS = 8000;

const OBSIDIAN = "#0B0B0B";
const ORANGE = "#FF5A1F";

export default function App() {
  const webView = useRef<WebView>(null);
  const canGoBack = useRef(false);
  const authInFlight = useRef(false);
  const [source, setSource] = useState({ uri: START_URL });
  const [failed, setFailed] = useState(false);
  const strings = useMemo(() => stringsFor(Intl.DateTimeFormat().resolvedOptions().locale), []);

  const sendToWeb = useCallback((message: NativeToWeb) => {
    webView.current?.injectJavaScript(dispatchToWeb(NATIVE_EVENT, message));
  }, []);

  const open = useCallback((url: string) => {
    setFailed(false);
    // nova chave no source força a navegação mesmo quando o endereço se repete
    setSource({ uri: url });
  }, []);

  const hideSplash = useCallback(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = setTimeout(hideSplash, SPLASH_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hideSplash]);

  // gchero://… (link aberto de fora, ou a volta do login quando o sistema matou o app no meio dele)
  useEffect(() => {
    const handle = (link: string | null) => {
      if (!link || authInFlight.current) return;
      const target = webUrlFromDeepLink(link, ORIGIN);
      if (target) open(target);
    };
    Linking.getInitialURL().then(handle).catch(() => undefined);
    const subscription = Linking.addEventListener("url", ({ url }) => handle(url));
    return () => subscription.remove();
  }, [open]);

  // Android: o botão voltar navega no histórico do site antes de sair do app.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack.current) return false;
      webView.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, []);

  const signInWithOAuth = useCallback(
    async (url: string) => {
      authInFlight.current = true;
      try {
        // ASWebAuthenticationSession (iOS) / Custom Tab (Android): o Google aceita, a WebView não.
        const result = await WebBrowser.openAuthSessionAsync(url, AUTH_RETURN);
        const target = result.type === "success" ? webUrlFromDeepLink(result.url, ORIGIN) : null;
        if (target) open(target);
        else sendToWeb({ type: "oauth-result", ok: false, reason: result.type === "success" ? "error" : "canceled" });
      } catch {
        sendToWeb({ type: "oauth-result", ok: false, reason: "error" });
      } finally {
        authInFlight.current = false;
      }
    },
    [open, sendToWeb],
  );

  const signInWithApple = useCallback(async () => {
    if (Platform.OS !== "ios" || !(await AppleAuthentication.isAvailableAsync())) {
      sendToWeb({ type: "apple-result", ok: false, reason: "unavailable" });
      return;
    }
    try {
      // A Apple recebe o hash; o Supabase confere o nonce cru contra ele (signInWithIdToken).
      const nonce = Crypto.randomUUID();
      const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        nonce: hashed,
      });
      if (!credential.identityToken) {
        sendToWeb({ type: "apple-result", ok: false, reason: "error" });
        return;
      }
      sendToWeb({ type: "apple-result", ok: true, token: credential.identityToken, nonce });
    } catch (error) {
      const canceled = (error as { code?: string }).code === "ERR_REQUEST_CANCELED";
      sendToWeb({ type: "apple-result", ok: false, reason: canceled ? "canceled" : "error" });
    }
  }, [sendToWeb]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseWebToNative(event.nativeEvent.data);
      if (!message) return;
      if (message.type === "oauth") void signInWithOAuth(message.url);
      else if (message.type === "apple-signin") void signInWithApple();
      else if (message.type === "share") {
        const text = [message.text, message.url].filter(Boolean).join(" ");
        // no iOS o link vai em `url` (a folha mostra a prévia); no Android só existe `message`
        const content = Platform.OS === "ios" && message.url ? { url: message.url, message: message.text, title: message.title } : { message: text, title: message.title };
        Share.share(content).catch(() => undefined);
      }
    },
    [signInWithApple, signInWithOAuth],
  );

  const routeOutside = useCallback((url: string) => {
    const decision = decideNavigation(url, ORIGIN, true);
    if (decision === "browser") WebBrowser.openBrowserAsync(url).catch(() => undefined);
    else if (decision === "system") Linking.openURL(url).catch(() => undefined);
  }, []);

  const onShouldStartLoadWithRequest = useCallback(
    (request: ShouldStartLoadRequest) => {
      // isTopFrame só existe no iOS; no Android o callback é chamado apenas para o quadro principal.
      const decision = decideNavigation(request.url, ORIGIN, request.isTopFrame ?? true);
      if (decision === "load") return true;
      routeOutside(request.url);
      return false;
    },
    [routeOutside],
  );

  const onNavigationStateChange = useCallback((state: WebViewNavigation) => {
    canGoBack.current = state.canGoBack;
  }, []);

  const content = failed ? (
    <View style={styles.offline}>
      <Text style={styles.offlineTitle}>{strings.offlineTitle}</Text>
      <Text style={styles.offlineBody}>{strings.offlineBody}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setFailed(false);
          webView.current?.reload();
        }}
        style={({ pressed }) => [styles.retry, pressed && { opacity: 0.8 }]}
      >
        <Text style={styles.retryLabel}>{strings.retry}</Text>
      </Pressable>
    </View>
  ) : null;

  const web = (
    <WebView
      ref={webView}
      source={source}
      style={[styles.web, failed && styles.hidden]}
      applicationNameForUserAgent={USER_AGENT_SUFFIX}
      injectedJavaScriptBeforeContentLoaded={BEFORE_CONTENT_SCRIPT}
      onMessage={onMessage}
      onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
      onOpenWindow={(event) => routeOutside(event.nativeEvent.targetUrl)}
      onNavigationStateChange={onNavigationStateChange}
      onLoadEnd={hideSplash}
      onError={() => {
        setFailed(true);
        hideSplash();
      }}
      // a WebView foi encerrada pelo sistema (memória): recarrega em vez de ficar em branco
      onContentProcessDidTerminate={() => webView.current?.reload()}
      onRenderProcessGone={() => webView.current?.reload()}
      // sessão do Supabase em cookie: persiste entre aberturas do app
      sharedCookiesEnabled
      domStorageEnabled
      allowsBackForwardNavigationGestures
      pullToRefreshEnabled
      allowsInlineMediaPlayback
      allowsFullscreenVideo
      setSupportMultipleWindows={false}
      // iOS: a própria web aplica env(safe-area-inset-*) (viewport-fit=cover)
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
      decelerationRate="normal"
      webviewDebuggingEnabled={__DEV__}
      originWhitelist={["https://*", "http://*", "about:*"]}
    />
  );

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {Platform.OS === "android" ? (
        // A WebView do Android não repassa os recortes da tela ao CSS: a margem fica aqui.
        <SafeAreaView style={styles.root} edges={["top", "bottom", "left", "right"]}>
          {web}
          {content}
        </SafeAreaView>
      ) : (
        <View style={styles.root}>
          {web}
          {content}
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: OBSIDIAN },
  web: { flex: 1, backgroundColor: OBSIDIAN },
  hidden: { display: "none" },
  offline: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 12, padding: 32, backgroundColor: OBSIDIAN },
  offlineTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "700", textAlign: "center" },
  offlineBody: { color: "#BDBDBD", fontSize: 16, lineHeight: 22, textAlign: "center" },
  retry: { marginTop: 12, minHeight: 48, paddingHorizontal: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: ORANGE },
  retryLabel: { color: OBSIDIAN, fontSize: 16, fontWeight: "700" },
});
