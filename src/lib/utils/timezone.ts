// Fuso do dispositivo, capturado no momento da atividade (o servidor calcula a data local).
export function getDeviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
