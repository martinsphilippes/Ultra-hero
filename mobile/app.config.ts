import { existsSync } from "node:fs";
import path from "node:path";
import type { ConfigContext, ExpoConfig } from "expo/config";

// Casca das lojas do Groscove Ultra: a web de produção numa WebView, com login nativo (Google pelo navegador
// do sistema, Sign in with Apple), compartilhar do sistema e tela própria sem conexão.
// Decisões e lições do Quantso: ../docs/decisions/app-nas-lojas.md. Publicação: ../docs/lojas.md.

// Irreversível depois do primeiro envio a qualquer loja (Apple e Google não deixam trocar).
const APP_ID = "com.groscove.ultra";
// Endereço da web que a casca abre; muda com o domínio definitivo (EAS env por perfil).
const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? "https://ultra-hero.vercel.app";
// Organização Expo "groscove" (decisão do responsável, 31/10/2026); o projectId vem do `eas init` (não são segredo; ficam no código porque o
// EAS resolve esta config na máquina de quem roda `eas build`, antes de ler as variáveis da nuvem).
// (o `eas init` não escreve em app.config.ts dinâmico: o id é colado aqui à mão)
const EAS_PROJECT_ID: string | undefined = "f7e6b7e4-4434-434b-8e99-aad80ca00824";
const EXPO_OWNER: string | undefined = "groscove";

// mesmo fundo dos ícones da web (public/icons)
const OBSIDIAN = "#111111";
const ORANGE = "#FF5A1F";

// Push no Android passa pelo FCM: sem o google-services.json do projeto Firebase o build fica verde
// e o push não chega (lição do Quantso). Não é segredo (vai dentro do APK); a chave da conta de
// serviço do FCM é que sobe por `eas credentials`. Build de loja sem ele falha aqui, de propósito.
const GOOGLE_SERVICES = "./google-services.json";
const hasGoogleServices = existsSync(path.join(__dirname, GOOGLE_SERVICES));
if (process.env.EAS_BUILD_PROFILE === "production" && !hasGoogleServices) {
  throw new Error("mobile/google-services.json ausente: o push do Android não funcionaria (docs/lojas.md §2).");
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Groscove Ultra",
  slug: "groscove-ultra",
  ...(EXPO_OWNER ? { owner: EXPO_OWNER } : {}),
  scheme: "gchero",
  // versão que a pessoa vê; o número do build vem do EAS (appVersionSource remote)
  version: "1.0.0",
  // a web é responsiva: sem trava de orientação (a Play reclamou dela no Quantso; Android 16 ignora)
  orientation: "default",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  backgroundColor: OBSIDIAN,
  runtimeVersion: { policy: "fingerprint" },
  ...(EAS_PROJECT_ID ? { updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}`, fallbackToCacheTimeout: 0 } } : {}),
  ios: {
    bundleIdentifier: APP_ID,
    // só iPhone: iPad pediria capturas e revisão próprias
    supportsTablet: false,
    usesAppleSignIn: true,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      // o <input type="file"> da web (foto de perfil, post, receita) abre câmera e fotos
      NSCameraUsageDescription: "O Groscove Ultra usa a câmera quando você escolhe tirar uma foto para o perfil ou para um post.",
      NSPhotoLibraryUsageDescription: "O Groscove Ultra acessa suas fotos quando você escolhe uma imagem para o perfil ou para um post.",
      NSMicrophoneUsageDescription: "O Groscove Ultra usa o microfone quando você grava um vídeo para um post.",
    },
    // A casca não coleta dado próprio; os rótulos de privacidade da loja descrevem o que a web coleta.
    // Razões das APIs exigidas pela Apple desde 05/2024 (UserDefaults e data de arquivo, usadas pelo RN).
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults", NSPrivacyAccessedAPITypeReasons: ["CA92.1"] },
        { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp", NSPrivacyAccessedAPITypeReasons: ["C617.1"] },
        { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategorySystemBootTime", NSPrivacyAccessedAPITypeReasons: ["35F9.1"] },
        { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryDiskSpace", NSPrivacyAccessedAPITypeReasons: ["E174.1"] },
      ],
    },
  },
  android: {
    package: APP_ID,
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: OBSIDIAN },
    edgeToEdgeEnabled: true,
    ...(hasGoogleServices ? { googleServicesFile: GOOGLE_SERVICES } : {}),
    // Lição do Quantso: a Play cobra o que o app pede, não o que usa. A WebView não precisa de nada
    // além de internet; o seletor de arquivo do sistema não exige permissão de câmera nem de armazenamento.
    permissions: [],
    blockedPermissions: [
      "android.permission.CAMERA",
      "android.permission.RECORD_AUDIO",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.READ_MEDIA_VIDEO",
      "android.permission.SYSTEM_ALERT_WINDOW",
    ],
  },
  plugins: [
    "expo-apple-authentication",
    "expo-web-browser",
    ["expo-notifications", { icon: "./assets/notification-icon.png", color: ORANGE }],
    [
      "expo-splash-screen",
      { image: "./assets/splash-icon.png", imageWidth: 160, resizeMode: "contain", backgroundColor: OBSIDIAN },
    ],
    // Lição do Quantso (resposta da Play à versão 7): sem R8 a ofuscação fica em ~1%.
    ["expo-build-properties", { android: { enableMinifyInReleaseBuilds: true, enableShrinkResourcesInReleaseBuilds: true } }],
  ],
  extra: {
    webUrl: WEB_URL,
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
});
