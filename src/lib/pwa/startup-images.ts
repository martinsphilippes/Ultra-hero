import devices from "./startup-devices.json";

// Telas de abertura do iPhone/iPad ao abrir o app pelo atalho da Tela de Início (sem elas o iOS
// mostra uma tela vazia até a página carregar). Imagens geradas por scripts/generate-splash.mjs.
export const STARTUP_IMAGES = devices.map(({ w, h, dpr }) => ({
  url: `/splash/groscove-${w * dpr}x${h * dpr}.png`,
  media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`,
}));
