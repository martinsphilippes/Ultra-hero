import { NotConfiguredError, type EmbedInfo, type MediaRef, type PlaybackOptions, type PlaybackSource, type VideoProvider } from "../types";

// Stub do Mux. Falha de forma explícita enquanto não houver chaves; nunca finge reprodução.

const REQUIRED_ENV = ["MUX_TOKEN_ID", "MUX_TOKEN_SECRET"] as const;
const SIGNING_ENV = ["MUX_SIGNING_KEY_ID", "MUX_SIGNING_KEY_PRIVATE"] as const;

function missing(names: readonly string[]): string[] {
  return names.filter((name) => !process.env[name]);
}

export class MuxProvider implements VideoProvider {
  readonly kind = "mux" as const;

  private assertConfigured(signed = false) {
    const absent = [...missing(REQUIRED_ENV), ...(signed ? missing(SIGNING_ENV) : [])];
    if (absent.length > 0) throw new NotConfiguredError(this.kind, absent);
  }

  getEmbed(_ref: MediaRef): EmbedInfo {
    void _ref;
    this.assertConfigured();
    throw new NotConfiguredError(this.kind, ["(implementação pendente: mux-player)"]);
  }

  async getPlaybackSource(_ref: MediaRef, opts: PlaybackOptions): Promise<PlaybackSource> {
    void _ref;
    this.assertConfigured(opts.signed);
    throw new NotConfiguredError(this.kind, ["(implementação pendente: stream.mux.com + token assinado)"]);
  }
}
